-- Add missing columns to users table

-- Add allowNotifications column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='users' AND column_name='allowNotifications'
  ) THEN
    ALTER TABLE public.users ADD COLUMN allowNotifications boolean NOT NULL DEFAULT false;
    RAISE NOTICE '✅ Added allowNotifications column';
  ELSE
    RAISE NOTICE 'ℹ️ allowNotifications column already exists';
  END IF;
END $$;

-- Verify the columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
