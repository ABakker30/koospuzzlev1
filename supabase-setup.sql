-- Supabase Database Setup for Koospuzzle
-- Run this in your Supabase SQL Editor (https://app.supabase.com/project/YOUR_PROJECT/sql)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================================
-- PROFILES TABLE (Optional - for user display names)
-- ============================================================================
create table if not exists profiles(
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;

-- Policies: Users can read/write their own profile
create policy "own profile read" on profiles 
  for select using (id = auth.uid());

create policy "own profile write" on profiles 
  for update using (id = auth.uid());

-- ============================================================================
-- SHAPES TABLE (Format-agnostic container storage)
-- ============================================================================
create table if not exists shapes(
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  file_url text not null,         -- storage path: {userId}/{fileId}-{filename}
  format text not null default 'legacy',
  size_bytes int,
  checksum text,
  metadata jsonb,                  -- flexible metadata storage
  version int,
  converted_to jsonb,              -- {format, file_url, version} for conversions
  created_at timestamptz default now()
);

-- Row Level Security
alter table shapes enable row level security;

-- Policies: Users can only access their own shapes
create policy "own shapes" on shapes
  for all using (user_id = auth.uid()) 
  with check (user_id = auth.uid());

-- ============================================================================
-- SOLUTIONS TABLE (Solver outputs: zips, videos, metadata)
-- ============================================================================
create table if not exists solutions(
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users on delete cascade,
  shape_id uuid references shapes on delete cascade,
  name text,
  file_url text not null,         -- storage path: {userId}/{shapeId}/{timestamp}-{filename}
  format text not null default 'legacy-solution',
  size_bytes int,
  checksum text,
  metrics jsonb,                   -- solver metrics, piece counts, etc.
  version int,
  converted_to jsonb,              -- {format, file_url, version}
  created_at timestamptz default now()
);

-- Row Level Security
alter table solutions enable row level security;

-- DEV MODE: Allow all operations without authentication
-- Comment out these policies and uncomment the production policies below when ready

-- Shapes policies (DEV - allow all)
CREATE POLICY "Dev: Allow all shapes operations"
  ON shapes FOR ALL
  USING (true)
  WITH CHECK (true);

-- Solutions policies (DEV - allow all)
CREATE POLICY "Dev: Allow all solutions operations"
  ON solutions FOR ALL
  USING (true)
  WITH CHECK (true);

-- PRODUCTION POLICIES (currently disabled - remove DEV policies above and uncomment these):
/*
-- Shapes policies
CREATE POLICY "Users can view own shapes"
  ON shapes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shapes"
  ON shapes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shapes"
  ON shapes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shapes"
  ON shapes FOR DELETE
  USING (auth.uid() = user_id);

-- Solutions policies
CREATE POLICY "Users can view own solutions"
  ON solutions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own solutions"
  ON solutions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own solutions"
  ON solutions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own solutions"
  ON solutions FOR DELETE
  USING (auth.uid() = user_id);
*/

-- ============================================================================
-- STORAGE BUCKETS (Create these in Storage UI first!)
-- ============================================================================
-- 1. Go to Storage → Create bucket → "shapes" (public or private)
-- 2. Go to Storage → Create bucket → "solutions" (public or private)

-- Storage Policies
-- Drop existing policies if they exist (to make script re-runnable)
drop policy if exists "shapes owner rw" on storage.objects;
drop policy if exists "solutions owner rw" on storage.objects;
drop policy if exists "Dev: Allow all shapes storage" on storage.objects;
drop policy if exists "Dev: Allow all solutions storage" on storage.objects;

-- DEV MODE: Allow public access to storage
create policy "Dev: Allow all shapes storage"
  on storage.objects for all
  using (bucket_id = 'shapes')
  with check (bucket_id = 'shapes');

create policy "Dev: Allow all solutions storage"
  on storage.objects for all
  using (bucket_id = 'solutions')
  with check (bucket_id = 'solutions');

-- PRODUCTION: User-specific storage policies (currently disabled)
/*
create policy "shapes owner rw"
  on storage.objects for all
  using  (bucket_id='shapes' and auth.uid()::text = split_part(name,'/',1))
  with check (bucket_id='shapes' and auth.uid()::text = split_part(name,'/',1));

create policy "solutions owner rw"
  on storage.objects for all
  using  (bucket_id='solutions' and auth.uid()::text = split_part(name,'/',1))
  with check (bucket_id='solutions' and auth.uid()::text = split_part(name,'/',1));
*/

-- ============================================================================
-- INDEXES (for performance)
-- ============================================================================
create index if not exists shapes_user_id_idx on shapes(user_id);
create index if not exists shapes_created_at_idx on shapes(created_at desc);
create index if not exists solutions_user_id_idx on solutions(user_id);
create index if not exists solutions_shape_id_idx on solutions(shape_id);
create index if not exists solutions_created_at_idx on solutions(created_at desc);

-- ============================================================================
-- SUCCESS!
-- ============================================================================
-- Your database is now ready. Next steps:
-- 1. Create "shapes" and "solutions" storage buckets in the UI
-- 2. Add your Supabase credentials to .env.local
-- 3. npm install @supabase/supabase-js uuid
-- 4. Enable Email auth in Authentication → Providers
