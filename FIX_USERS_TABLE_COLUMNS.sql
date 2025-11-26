-- Fix users table to use snake_case column names (PostgreSQL standard)

-- Rename columns to snake_case
ALTER TABLE public.users RENAME COLUMN preferredlanguage TO preferred_language;
ALTER TABLE public.users RENAME COLUMN termsaccepted TO terms_accepted;
ALTER TABLE public.users RENAME COLUMN allownotifications TO allow_notifications;
ALTER TABLE public.users RENAME COLUMN usertype TO user_type;
ALTER TABLE public.users RENAME COLUMN registeredat TO registered_at;
ALTER TABLE public.users RENAME COLUMN lastactiveat TO last_active_at;

-- Verify the new column names
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
