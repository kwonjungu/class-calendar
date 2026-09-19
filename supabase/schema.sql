-- 우리 반 공용 캘린더 — 표 만들기
-- Supabase > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run 을 누릅니다.
-- 한 번만 하면 됩니다.

create table public.events (
  id         bigint generated always as identity primary key,
  room       text        not null default '1111',
  day        date        not null,
  title      text        not null,
  author     text        not null,
  owner      text        not null,
  created_at timestamptz not null default now()
);

-- room 은 '어느 달력이냐' 입니다. 환경변수 ROOM_CODE 값이 그대로 들어갑니다.
-- 반 전체가 같은 코드를 쓰면 한 달력을 같이 쓰고,
-- 사람마다 다른 코드를 쓰면 같은 서버 안에서 달력만 갈라집니다.
create index events_room_day_idx on public.events (room, day);

-- ── 여기서부터가 진짜 자물쇠입니다 ────────────────────────────
-- anon 키는 브라우저에 그대로 드러나는 공개 값입니다.
-- 키를 숨겨서 지키는 것이 아니라, 아래 규칙으로 지킵니다.
-- 이 줄을 빼먹으면 링크를 아는 누구나 표를 통째로 지울 수 있습니다.

alter table public.events enable row level security;

create policy "누구나 본다"
  on public.events for select to anon
  using (true);

create policy "짧은 글만 쓴다"
  on public.events for insert to anon
  with check (
    char_length(room)   between 1 and 16
    and char_length(title)  between 1 and 40
    and char_length(author) between 1 and 12
    and char_length(owner)  between 1 and 64
  );

-- 내가 쓴 것만 지우는 판단은 화면에서 합니다(브라우저에 저장한 owner 값 비교).
-- 서버는 시간만 봅니다. 지난 글은 아무도 못 지웁니다.
create policy "30분 안에만 지운다"
  on public.events for delete to anon
  using (created_at > now() - interval '30 minutes');
