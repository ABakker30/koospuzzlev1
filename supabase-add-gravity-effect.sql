-- Migration: Add 'gravity' to effect_presets allowed types
-- Run this migration to allow saving Gravity effect presets

-- Drop the old constraint
ALTER TABLE public.effect_presets DROP CONSTRAINT IF EXISTS effect_presets_type_check;

-- Add the new constraint with 'gravity' included
ALTER TABLE public.effect_presets ADD CONSTRAINT effect_presets_type_check 
  CHECK (effect_type IN ('turntable', 'orbit', 'reveal', 'explosion', 'gravity'));

-- Verify the constraint was updated
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.effect_presets'::regclass 
AND conname = 'effect_presets_type_check';
