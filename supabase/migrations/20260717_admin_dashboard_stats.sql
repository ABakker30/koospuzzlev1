-- 20260717_admin_dashboard_stats.sql
-- Admin dashboard: one SECURITY DEFINER RPC returning app-wide key stats.
--
-- Deliberately an RPC instead of admin SELECT policies on raw tables: the
-- client gets exactly the aggregates the dashboard shows (no bulk row access
-- through the public API), and the admin gate lives in one place. Follows the
-- same pattern as the moderation helper public.is_admin() (20260626) — which
-- must exist; run 20260716_lock_writes_to_owners.sql first (already applied).
--
-- Idempotent: CREATE OR REPLACE. Callable from the app via
--   supabase.rpc('admin_dashboard_stats')
-- Returns an error for non-admin callers.

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select jsonb_build_object(
    'users', jsonb_build_object(
      'total',      (select count(*) from users),
      'new_7d',     (select count(*) from users where registeredat > now() - interval '7 days'),
      'active_1d',  (select count(*) from users where lastactiveat > now() - interval '1 day'),
      'active_7d',  (select count(*) from users where lastactiveat > now() - interval '7 days')
    ),
    'puzzles', jsonb_build_object(
      'total',   (select count(*) from puzzles),
      'new_7d',  (select count(*) from puzzles where created_at > now() - interval '7 days')
    ),
    'solutions', jsonb_build_object(
      'total',   (select count(*) from solutions),
      'new_7d',  (select count(*) from solutions where created_at > now() - interval '7 days'),
      'likes',   (select count(*) from solution_likes)
    ),
    'games', jsonb_build_object(
      'total',        (select count(*) from game_sessions),
      'new_7d',       (select count(*) from game_sessions where created_at > now() - interval '7 days'),
      'active_now',   (select count(*) from game_sessions where status = 'active'),
      'completed',    (select count(*) from game_sessions where status = 'completed'),
      'abandoned',    (select count(*) from game_sessions where status = 'abandoned'),
      'vs_ai',        (select count(*) from game_sessions where is_simulated)
    ),
    'recent_users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'username', u.username,
        'registered_at', u.registeredat,
        'last_active_at', u.lastactiveat
      ) order by u.registeredat desc), '[]'::jsonb)
      from (select username, registeredat, lastactiveat
            from users order by registeredat desc limit 8) u
    ),
    'recent_solutions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'solver_name', s.solver_name,
        'puzzle_name', p.name,
        'created_at', s.created_at,
        'placements_by_you', s.placements_by_you,
        'total_pieces', s.total_pieces,
        'duration_ms', s.duration_ms
      ) order by s.created_at desc), '[]'::jsonb)
      from (select solver_name, puzzle_id, created_at, placements_by_you, total_pieces, duration_ms
            from solutions order by created_at desc limit 8) s
      left join puzzles p on p.id = s.puzzle_id
    ),
    'top_puzzles', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', t.name,
        'solutions', t.cnt
      ) order by t.cnt desc), '[]'::jsonb)
      from (select p.name, count(*) as cnt
            from solutions s join puzzles p on p.id = s.puzzle_id
            group by p.name order by cnt desc limit 5) t
    )
  ) into result;

  return result;
end;
$$;

-- The function runs as its owner (definer); callers only need EXECUTE.
grant execute on function public.admin_dashboard_stats() to authenticated;

-- Verify (as a signed-in admin in the app; raises 'admin only' otherwise):
--   select public.admin_dashboard_stats();
