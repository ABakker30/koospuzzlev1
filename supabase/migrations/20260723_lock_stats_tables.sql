-- Lock down puzzle_stats + solver_runs (security advisor: RLS disabled in
-- public — both tables were readable AND writable with the anon key).
--
-- Usage in the app:
--   puzzle_stats — client only READS (aggregates written by triggers on
--                  solutions / solver_runs inserts)
--   solver_runs  — client only INSERTS (auto-solver telemetry; the page is
--                  admin-gated, but old telemetry rows may be anonymous)
--
-- CRITICAL companion step: the trigger functions that maintain puzzle_stats
-- run with the CALLER's privileges by default. Once RLS is on with no write
-- policies, those triggers would fail and break every solution save. So all
-- user triggers on solutions and solver_runs are switched to SECURITY
-- DEFINER (run as owner, bypassing RLS) before RLS is enabled.

do $$
declare fn regprocedure;
begin
  for fn in
    select distinct t.tgfoid::regprocedure
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('solutions', 'solver_runs')
      and not t.tgisinternal
  loop
    execute format('alter function %s security definer', fn);
    execute format('alter function %s set search_path = public', fn);
  end loop;
end $$;

-- puzzle_stats: world-readable, nobody writes directly (triggers only).
alter table public.puzzle_stats enable row level security;
drop policy if exists "Anyone can read puzzle stats" on public.puzzle_stats;
create policy "Anyone can read puzzle stats"
  on public.puzzle_stats for select using (true);

-- solver_runs: write-only telemetry; only admins read it back.
alter table public.solver_runs enable row level security;
drop policy if exists "Anyone can log solver runs" on public.solver_runs;
create policy "Anyone can log solver runs"
  on public.solver_runs for insert with check (true);
drop policy if exists "Admins read solver runs" on public.solver_runs;
create policy "Admins read solver runs"
  on public.solver_runs for select using (public.is_admin());
