-- v40.0.0 Users Table Setup
-- Run this in Supabase SQL Editor

-- Drop existing users table if it has issues
-- DROP TABLE IF EXISTS public.users CASCADE;

-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  username text NOT NULL,
  preferredLanguage text NOT NULL DEFAULT 'English',
  region text,
  termsAccepted boolean NOT NULL DEFAULT true,
  allowNotifications boolean NOT NULL DEFAULT false,
  userType text CHECK (userType IN ('regular', 'beta', 'developer')) DEFAULT 'regular',
  registeredAt timestamp with time zone DEFAULT now(),
  lastActiveAt timestamp with time zone DEFAULT now(),
  
  -- Constraints
  CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT users_username_length CHECK (length(username) >= 2 AND length(username) <= 50)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);
CREATE INDEX IF NOT EXISTS users_username_idx ON public.users(username);
CREATE INDEX IF NOT EXISTS users_lastActiveAt_idx ON public.users(lastActiveAt);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can create own profile" ON public.users;
DROP POLICY IF EXISTS "Service role can manage all users" ON public.users;
DROP POLICY IF EXISTS "Anyone can insert user on signup" ON public.users;

-- RLS Policies

-- Allow users to read their own profile
CREATE POLICY "Users can view own profile"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id);

-- Allow authenticated users to insert their own record
-- This is critical for the AuthContext to create user records!
CREATE POLICY "Anyone can insert user on signup"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow service role to manage all users (for admin operations)
CREATE POLICY "Service role can manage all users"
  ON public.users
  FOR ALL
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT ON public.users TO anon;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Users table created successfully!';
  RAISE NOTICE '✅ RLS policies configured';
  RAISE NOTICE '✅ Permissions granted';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Test login flow in app';
  RAISE NOTICE '2. Check if user records are created';
  RAISE NOTICE '3. If issues persist, check browser console for errors';
END $$;
