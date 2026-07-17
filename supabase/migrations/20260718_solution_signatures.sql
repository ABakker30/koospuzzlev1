-- Canonical solution identity.
--
-- signature = sha256 hex of the canonical string:
--   per piece:  '<pieceId>:' || cells sorted numerically by (i,j,k),
--               each written 'i,j,k', joined by ';'
--   pieces sorted lexically (byte order / COLLATE "C"), joined by '|'
--
-- MUST stay byte-identical to src/utils/solutionSignature.ts
-- (canonicalSolutionString + computeSolutionSignature). Change both or none.
--
-- Same signature = same solution (same piece types on the same container
-- cells). Mirrors/rotations are DISTINCT solutions by design.

create extension if not exists pgcrypto;

alter table public.solutions add column if not exists signature text;

-- Backfill existing solutions from placed_pieces.
with canon as (
  select
    s.id,
    encode(digest(
      string_agg(piece_str, '|' order by piece_str collate "C"),
      'sha256'), 'hex') as sig
  from (
    select
      s.id,
      (p->>'pieceId') || ':' || (
        select string_agg(
          (c->>'i') || ',' || (c->>'j') || ',' || (c->>'k'),
          ';'
          order by (c->>'i')::int, (c->>'j')::int, (c->>'k')::int)
        from jsonb_array_elements(p->'cells') c
        where (c->>'i') is not null
      ) as piece_str
    from public.solutions s,
         jsonb_array_elements(s.placed_pieces) p
    where jsonb_typeof(s.placed_pieces) = 'array'
      and s.signature is null
  ) s
  where s.piece_str is not null
  group by s.id
)
update public.solutions s
set signature = canon.sig
from canon
where s.id = canon.id;

-- Fast lookups: "has this exact solution been found for this puzzle before,
-- and by whom first?"
create index if not exists solutions_puzzle_signature_idx
  on public.solutions (puzzle_id, signature, created_at);

-- Distinct-solution stats per puzzle (for discovery challenges / prize
-- verification). SECURITY DEFINER so it works for everyone even though
-- row-level reads may be restricted; returns only aggregate + first-finder
-- info, no private data.
create or replace function public.solution_discovery_stats(target_puzzle_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'total_solutions', count(*),
    'distinct_solutions', count(distinct signature)
  )
  from public.solutions
  where puzzle_id = target_puzzle_id
    and signature is not null
    and solution_type = 'manual';
$$;

grant execute on function public.solution_discovery_stats(uuid) to anon, authenticated;
