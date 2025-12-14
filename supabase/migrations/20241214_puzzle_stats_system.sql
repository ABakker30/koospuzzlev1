-- Migration: Puzzle Stats Aggregation System
-- Date: 2024-12-14
-- Description: Creates puzzle_stats table with aggregation triggers for auto-solve runs and manual solutions
-- Tasks: 1-5 from comprehensive puzzle stats plan

-- ============================================================================
-- TASK 1: Create puzzle_stats aggregate table
-- ============================================================================
create table puzzle_stats (
  puzzle_id uuid primary key references puzzles(id) on delete cascade,

  -- Auto-solve attempt aggregates
  auto_runs_count bigint not null default 0,
  auto_success_count bigint not null default 0,
  auto_solutions_found bigint not null default 0,

  auto_nodes_total bigint not null default 0,
  auto_elapsed_ms_total bigint not null default 0,
  auto_time_to_solution_ms_total bigint not null default 0,

  auto_nodes_to_solution_total bigint not null default 0,
  auto_best_placed_max integer not null default 0,

  -- Manual aggregates (based on existing solutions table only)
  manual_solutions_count bigint not null default 0,
  manual_solve_time_ms_total bigint not null default 0,
  manual_move_count_total bigint not null default 0,

  -- Overall aggregates
  solutions_total bigint not null default 0,

  -- Metadata
  updated_at timestamptz not null default now()
);

create index idx_puzzle_stats_updated_at on puzzle_stats(updated_at desc);

-- ============================================================================
-- TASK 2: Add aggregation triggers for auto-solve runs
-- ============================================================================

-- Helper function to ensure a puzzle_stats row exists
create or replace function ensure_puzzle_stats_row(pid uuid)
returns void language plpgsql as $$
begin
  insert into puzzle_stats(puzzle_id)
  values (pid)
  on conflict (puzzle_id) do nothing;
end; $$;

-- Trigger function to apply deltas from solver_runs
create or replace function puzzle_stats_apply_solver_run()
returns trigger language plpgsql as $$
begin
  perform ensure_puzzle_stats_row(new.puzzle_id);

  update puzzle_stats
  set
    auto_runs_count = auto_runs_count + 1,
    auto_success_count = auto_success_count + (case when new.success then 1 else 0 end),
    auto_solutions_found = auto_solutions_found + coalesce(new.solutions_found, 0),

    auto_nodes_total = auto_nodes_total + coalesce(new.nodes_total, 0),
    auto_elapsed_ms_total = auto_elapsed_ms_total + coalesce(new.elapsed_ms, 0),
    auto_time_to_solution_ms_total = auto_time_to_solution_ms_total + coalesce(new.time_to_solution_ms, 0),

    auto_nodes_to_solution_total = auto_nodes_to_solution_total + coalesce(new.nodes_to_solution, 0),
    auto_best_placed_max = greatest(auto_best_placed_max, coalesce(new.best_placed, 0)),

    solutions_total = solutions_total + coalesce(new.solutions_found, 0),

    updated_at = now()
  where puzzle_id = new.puzzle_id;

  return new;
end; $$;

-- Add trigger on solver_runs
drop trigger if exists trg_solver_runs_stats on solver_runs;

create trigger trg_solver_runs_stats
after insert on solver_runs
for each row execute function puzzle_stats_apply_solver_run();

-- ============================================================================
-- TASK 3: Add aggregation triggers for manual solutions
-- ============================================================================

-- Trigger function to apply deltas from solutions table
create or replace function puzzle_stats_apply_solution()
returns trigger language plpgsql as $$
begin
  perform ensure_puzzle_stats_row(new.puzzle_id);

  update puzzle_stats
  set
    manual_solutions_count = manual_solutions_count + (case when new.solution_type = 'manual' then 1 else 0 end),
    manual_solve_time_ms_total = manual_solve_time_ms_total + (case when new.solution_type = 'manual' then coalesce(new.solve_time_ms, 0) else 0 end),
    manual_move_count_total = manual_move_count_total + (case when new.solution_type = 'manual' then coalesce(new.move_count, 0) else 0 end),

    solutions_total = solutions_total + 1,
    updated_at = now()
  where puzzle_id = new.puzzle_id;

  return new;
end; $$;

-- Add trigger on solutions
drop trigger if exists trg_solutions_stats on solutions;

create trigger trg_solutions_stats
after insert on solutions
for each row execute function puzzle_stats_apply_solution();

-- ============================================================================
-- TASK 4: Backfill puzzle_stats for existing data
-- ============================================================================

-- Ensure rows exist for all puzzles
insert into puzzle_stats(puzzle_id)
select id from puzzles
on conflict (puzzle_id) do nothing;

-- Backfill from solver_runs
update puzzle_stats ps
set
  auto_runs_count = x.auto_runs_count,
  auto_success_count = x.auto_success_count,
  auto_solutions_found = x.auto_solutions_found,
  auto_nodes_total = x.auto_nodes_total,
  auto_elapsed_ms_total = x.auto_elapsed_ms_total,
  auto_time_to_solution_ms_total = x.auto_time_to_solution_ms_total,
  auto_nodes_to_solution_total = x.auto_nodes_to_solution_total,
  auto_best_placed_max = x.auto_best_placed_max,
  solutions_total = ps.solutions_total + x.auto_solutions_found,
  updated_at = now()
from (
  select
    puzzle_id,
    count(*)::bigint as auto_runs_count,
    sum(case when success then 1 else 0 end)::bigint as auto_success_count,
    sum(coalesce(solutions_found,0))::bigint as auto_solutions_found,
    sum(coalesce(nodes_total,0))::bigint as auto_nodes_total,
    sum(coalesce(elapsed_ms,0))::bigint as auto_elapsed_ms_total,
    sum(coalesce(time_to_solution_ms,0))::bigint as auto_time_to_solution_ms_total,
    sum(coalesce(nodes_to_solution,0))::bigint as auto_nodes_to_solution_total,
    max(coalesce(best_placed,0))::int as auto_best_placed_max
  from solver_runs
  group by puzzle_id
) x
where ps.puzzle_id = x.puzzle_id;

-- Backfill from solutions
update puzzle_stats ps
set
  manual_solutions_count = x.manual_solutions_count,
  manual_solve_time_ms_total = x.manual_solve_time_ms_total,
  manual_move_count_total = x.manual_move_count_total,
  solutions_total = x.solutions_total,
  updated_at = now()
from (
  select
    puzzle_id,
    sum(case when solution_type='manual' then 1 else 0 end)::bigint as manual_solutions_count,
    sum(case when solution_type='manual' then coalesce(solve_time_ms,0) else 0 end)::bigint as manual_solve_time_ms_total,
    sum(case when solution_type='manual' then coalesce(move_count,0) else 0 end)::bigint as manual_move_count_total,
    count(*)::bigint as solutions_total
  from solutions
  group by puzzle_id
) x
where ps.puzzle_id = x.puzzle_id;

-- ============================================================================
-- TASK 5: RLS policies for puzzle_stats
-- ============================================================================

-- Enable RLS
alter table puzzle_stats enable row level security;

-- Allow public reads (anyone can view aggregate stats)
create policy "puzzle_stats_select_public"
on puzzle_stats for select
using (true);

-- No insert/update/delete policies (managed by triggers only)
-- Users cannot directly modify puzzle_stats

-- ============================================================================
-- End of migration
-- ============================================================================
