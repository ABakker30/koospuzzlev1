-- 20260717_solution_share_codes.sql
-- Short shareable codes for challenge links: koospuzzle.com/c/<code>.
--
-- Design (docs/share-and-challenge-design.md): 5 chars, consonant+digit
-- alphabet (no vowels -> no words -> profanity-proof; no 0/O/1/I/l
-- look-alikes), case-insensitive (stored lowercase), ~17M combinations.
-- Codes are minted lazily by ensure_share_code() the first time the owner
-- shares a solution; resolution is a public SELECT on share_code (covered by
-- the existing public-read policy).
--
-- Idempotent: safe to re-run.

alter table public.solutions
  add column if not exists share_code text unique;

create index if not exists idx_solutions_share_code on public.solutions(share_code);

create or replace function public.ensure_share_code(sid uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'bcdfghjkmnpqrstvwxyz23456789';
  code text;
  existing text;
  owner uuid;
  i int;
begin
  select share_code, created_by into existing, owner
  from solutions where id = sid;
  if not found then
    raise exception 'solution not found';
  end if;
  if existing is not null then
    return existing;
  end if;
  -- Only the owner (or admin) mints a code for a solution.
  if not (owner = auth.uid() or public.is_admin()) then
    raise exception 'not the owner of this solution';
  end if;

  for i in 1..25 loop
    code := '';
    for i in 1..5 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      update solutions set share_code = code where id = sid;
      return code;
    exception when unique_violation then
      -- collision (~1 in 17M per try) — regenerate
    end;
  end loop;
  raise exception 'could not allocate a share code';
end;
$$;

grant execute on function public.ensure_share_code(uuid) to authenticated;
