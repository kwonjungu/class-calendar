// 환경변수를 화면으로 내려 주는 자리.
//
// 이 파일은 Vercel 서버에서 돕니다. 브라우저에서 도는 코드가 아닙니다.
// 그래서 process.env 를 읽을 수 있습니다. index.html 안에서는 못 읽습니다.
//
// 내려보내는 anon 키는 원래 공개되는 값입니다. 숨기는 것이 아니라
// supabase/schema.sql 의 RLS 규칙으로 막습니다.
// 숨겨야 하는 열쇠(GROQ_API_KEY)는 여기서 절대 내려보내지 않습니다.
// 있는지 없는지(hasAi)만 알려 줍니다.

module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || '';

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    supabaseUrl: url,
    supabaseAnonKey: key,
    roomCode: process.env.ROOM_CODE || '1111',
    ready: Boolean(url && key),
    hasAi: Boolean(process.env.GROQ_API_KEY)
  });
};
