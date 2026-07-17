-- Per-IP hourly counter for the ai-chat edge function (OpenAI spend guard).
-- Written only by the function via service role; no client access.

create table if not exists public.ai_chat_rate (
  ip_hash text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

alter table public.ai_chat_rate enable row level security;
-- No policies: service-role only.
