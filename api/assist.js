// 메모를 날짜와 내용으로 갈라 주는 자리. 바깥 인공지능(Groq)을 부릅니다.
//
// 이 파일도 Vercel 서버에서 돕니다.
// GROQ_API_KEY 는 여기서만 쓰이고 브라우저로 한 글자도 나가지 않습니다.
// 브라우저는 "이 문장 좀 정리해 줘" 하고 부탁만 보냅니다.
//
// 배포한 뒤 페이지에서 Ctrl+U 를 눌러 소스를 열고 gsk_ 를 검색해 보세요.
// 아무것도 안 나오면 제대로 한 것입니다.

const MAX_CHARS = 300;
const MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(v, max) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
}

// 모델에게 날짜를 직접 세게 하면 생각하는 데만 토큰을 다 쓰고 답이 비어서 옵니다.
// 오늘부터 35일의 날짜와 요일을 표로 줘서 고르기만 하게 합니다.
function dateTable(todayStr, days) {
  const a = todayStr.split('-').map(Number);
  const base = new Date(a[0], a[1] - 1, a[2]);
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    out.push(ymd(d) + ' ' + WEEK[d.getDay()] + (i === 0 ? ' (오늘)' : ''));
  }
  return out.join(', ');
}

// 모델이 코드블록이나 군말을 붙여 보내도 JSON 만 뽑아냅니다.
function parseJson(text) {
  const raw = String(text || '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('JSON 없음');
  return JSON.parse(body.slice(start, end + 1));
}

async function callGroq(apiKey, payload) {
  let last = { error: 'AI 호출 실패' };
  for (const model of MODELS) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ ...payload, model })
    });
    const data = await r.json();
    if (r.ok) return data;
    last = data;
    // 한도 초과나 없어진 모델이면 다음 모델로, 그 밖의 잘못은 바로 멈춥니다.
    const msg = ((data.error && data.error.message) || '').toLowerCase();
    const retry = r.status === 429 || msg.includes('rate limit')
      || msg.includes('quota') || msg.includes('decommissioned')
      || msg.includes('does not exist');
    if (!retry) break;
  }
  throw new Error((last.error && (last.error.message || last.error)) || 'AI 호출 실패');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 로 불러 주세요.' });
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'GROQ_API_KEY 가 없습니다. Vercel 환경변수에 넣고 다시 배포하세요.' });
  }

  const body = req.body || {};
  const text = clean(body.text, MAX_CHARS);
  const today = DAY_RE.test(String(body.today || '')) ? body.today : ymd(new Date());
  if (!text) return res.status(400).json({ error: '무엇을 넣을지 적어 주세요.' });

  const system = [
    '너는 초등학교 선생님이 아무렇게나 적은 메모를 학급 달력에 넣을 줄로 바꿔 주는 도우미다.',
    'JSON 만 답한다. 형식은 {"items":[{"day":"YYYY-MM-DD","title":"..."}]} 이다.',
    'title 은 한국어로 40자 안쪽. 무엇을 하는지만 적고 군더더기를 넣지 않는다.',
    'items 는 최대 6개다. 날짜를 알 수 없는 항목은 아예 빼라.',
    '사람 이름, 전화번호, 주소 같은 개인정보는 넣지 않는다.',
    '날짜는 아래 표에서만 고른다. 직접 계산하지 마라.',
    dateTable(today, 35)
  ].join('\n');

  try {
    const data = await callGroq(apiKey, {
      temperature: 0.2,
      max_tokens: 800,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text }
      ]
    });

    const items = parseJson(data.choices[0].message.content).items;

    // AI 가 준 값도 남이 보낸 값과 똑같이 검사합니다. 그대로 믿지 않습니다.
    const clean_items = (Array.isArray(items) ? items : [])
      .map((it) => ({ day: clean(it && it.day, 10), title: clean(it && it.title, 40) }))
      .filter((it) => DAY_RE.test(it.day) && !Number.isNaN(Date.parse(it.day)) && it.title)
      .slice(0, 6);

    if (!clean_items.length) {
      return res.status(422).json({ error: '날짜를 못 찾았습니다. 몇 월 며칠인지 넣어 다시 적어 보세요.' });
    }
    res.status(200).json({ items: clean_items });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
};
