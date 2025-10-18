-- Effect Presets Table
-- Allows users to save and load effect configurations (Turntable, Orbit, Reveal, Explosion)
-- Single table with effect_type discriminator for all effect types

CREATE TABLE IF NOT EXISTS public.effect_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Nullable for development mode
  effect_type TEXT NOT NULL, -- 'turntable', 'orbit', 'reveal', 'explosion'
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL, -- Stores the effect configuration object
  is_public BOOLEAN DEFAULT false,
  CONSTRAINT effect_presets_name_type_unique UNIQUE (user_id, effect_type, name),
  CONSTRAINT effect_presets_type_check CHECK (effect_type IN ('turntable', 'orbit', 'reveal', 'explosion'))
);

-- Enable RLS
ALTER TABLE public.effect_presets ENABLE ROW LEVEL SECURITY;

-- Policies (DEV MODE: Allow operations without authentication)
-- Users can view their own presets, public presets, and anonymous presets
CREATE POLICY "Allow viewing effect presets"
  ON public.effect_presets
  FOR SELECT
  USING (
    auth.uid() = user_id OR 
    is_public = true OR 
    user_id IS NULL
  );

-- Allow inserting presets (authenticated or anonymous)
CREATE POLICY "Allow inserting effect presets"
  ON public.effect_presets
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR 
    user_id IS NULL
  );

-- Allow updating own presets or anonymous presets
CREATE POLICY "Allow updating effect presets"
  ON public.effect_presets
  FOR UPDATE
  USING (
    auth.uid() = user_id OR 
    user_id IS NULL
  );

-- Allow deleting own presets or anonymous presets
CREATE POLICY "Allow deleting effect presets"
  ON public.effect_presets
  FOR DELETE
  USING (
    auth.uid() = user_id OR 
    user_id IS NULL
  );

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS effect_presets_user_id_idx ON public.effect_presets(user_id);
CREATE INDEX IF NOT EXISTS effect_presets_effect_type_idx ON public.effect_presets(effect_type);
CREATE INDEX IF NOT EXISTS effect_presets_is_public_idx ON public.effect_presets(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS effect_presets_user_type_idx ON public.effect_presets(user_id, effect_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_effect_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER effect_presets_updated_at
  BEFORE UPDATE ON public.effect_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_effect_presets_updated_at();
