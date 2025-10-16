-- Supabase Contracts Migration
-- Creates new tables for the deterministic ID-based contract system
-- Run this in your Supabase SQL Editor after the initial setup

-- ============================================================================
-- CONTRACTS_SHAPES TABLE (Content-addressed shapes)
-- ============================================================================
create table if not exists contracts_shapes(
  id text primary key,              -- "sha256:<hash>" - deterministic content hash
  lattice text not null,            -- "fcc", "bcc", etc.
  cells jsonb not null,             -- [[i,j,k], ...] sorted lexicographically
  size int not null,                -- number of cells (for quick filtering)
  created_at timestamptz default now()
);

-- Row Level Security - allow read/write via service role
alter table contracts_shapes enable row level security;

-- Dev mode: Allow all operations (adjust for production)
create policy "Dev: Allow all contracts_shapes operations"
  on contracts_shapes for all
  using (true)
  with check (true);

-- Index for quick lookups and duplicates check
create index if not exists contracts_shapes_id_idx on contracts_shapes(id);
create index if not exists contracts_shapes_size_idx on contracts_shapes(size);
create index if not exists contracts_shapes_created_at_idx on contracts_shapes(created_at desc);

-- ============================================================================
-- CONTRACTS_SOLUTIONS TABLE (Content-addressed solutions/states)
-- ============================================================================
create table if not exists contracts_solutions(
  id text primary key,              -- "sha256:<hash>" - deterministic content hash
  shape_id text not null,           -- references the shape (shapeRef in JSON)
  placements jsonb not null,        -- [{pieceId, anchorIJK, orientationIndex}, ...]
  is_full boolean not null,         -- true if all pieces placed
  created_at timestamptz default now()
);

-- Row Level Security
alter table contracts_solutions enable row level security;

-- Dev mode: Allow all operations
create policy "Dev: Allow all contracts_solutions operations"
  on contracts_solutions for all
  using (true)
  with check (true);

-- Indexes
create index if not exists contracts_solutions_id_idx on contracts_solutions(id);
create index if not exists contracts_solutions_shape_id_idx on contracts_solutions(shape_id);
create index if not exists contracts_solutions_is_full_idx on contracts_solutions(is_full);
create index if not exists contracts_solutions_created_at_idx on contracts_solutions(created_at desc);

-- ============================================================================
-- CONTRACTS_CONVERT_REPORTS TABLE (Conversion audit trail)
-- ============================================================================
create table if not exists contracts_convert_reports(
  run_id uuid primary key default gen_random_uuid(),
  summary jsonb not null,           -- {shapesIn, shapesOut, solutionsIn, solutionsOut, duplicatesCollapsed}
  shapes jsonb not null,            -- array of shape conversion records
  solutions jsonb not null,         -- array of solution conversion records
  errors jsonb not null,            -- array of error records
  hash_check jsonb not null,        -- {rehashPasses, rehashFailures}
  created_at timestamptz default now()
);

-- Row Level Security
alter table contracts_convert_reports enable row level security;

-- Dev mode: Allow all operations
create policy "Dev: Allow all contracts_convert_reports operations"
  on contracts_convert_reports for all
  using (true)
  with check (true);

-- Index
create index if not exists contracts_convert_reports_created_at_idx 
  on contracts_convert_reports(created_at desc);

-- ============================================================================
-- SUCCESS!
-- ============================================================================
-- New contract tables are ready for the converter script.
-- Tables:
--   - contracts_shapes: Content-addressed shapes with deterministic IDs
--   - contracts_solutions: Content-addressed solutions/states
--   - contracts_convert_reports: Conversion audit logs
