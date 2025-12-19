-- Add preferred_language column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT;

-- Add comment
COMMENT ON COLUMN profiles.preferred_language IS 'User preferred language (BCP-47 tag: en, nl, fr, es, etc.)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_preferred_language ON profiles(preferred_language);
