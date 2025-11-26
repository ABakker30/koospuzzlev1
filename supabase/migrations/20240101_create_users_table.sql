-- Create users table for KOOS Puzzle v40.0.0
-- This table stores user account information and preferences

-- Users table
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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);
CREATE INDEX IF NOT EXISTS users_username_idx ON public.users(username);
CREATE INDEX IF NOT EXISTS users_lastActiveAt_idx ON public.users(lastActiveAt);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read their own data
CREATE POLICY "Users can view own profile"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own data
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own record (on signup)
CREATE POLICY "Users can create own profile"
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

-- Comment on table
COMMENT ON TABLE public.users IS 'User accounts and preferences for KOOS Puzzle';
