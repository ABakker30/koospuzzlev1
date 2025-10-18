-- Studio Settings Presets Table
-- Allows users to save and load studio settings (lighting, materials, camera)

CREATE TABLE IF NOT EXISTS public.studio_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Nullable for development mode
  name TEXT NOT NULL,
  description TEXT,
  settings JSONB NOT NULL,
  is_public BOOLEAN DEFAULT false,
  CONSTRAINT studio_presets_name_unique UNIQUE (user_id, name)
);

-- Enable RLS
ALTER TABLE public.studio_presets ENABLE ROW LEVEL SECURITY;

-- Policies (DEV MODE: Allow operations without authentication)
-- Users can view their own presets, public presets, and anonymous presets
CREATE POLICY "Allow viewing presets"
  ON public.studio_presets
  FOR SELECT
  USING (
    auth.uid() = user_id OR 
    is_public = true OR 
    user_id IS NULL
  );

-- Allow inserting presets (authenticated or anonymous)
CREATE POLICY "Allow inserting presets"
  ON public.studio_presets
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR 
    user_id IS NULL
  );

-- Allow updating own presets or anonymous presets
CREATE POLICY "Allow updating presets"
  ON public.studio_presets
  FOR UPDATE
  USING (
    auth.uid() = user_id OR 
    user_id IS NULL
  );

-- Allow deleting own presets or anonymous presets
CREATE POLICY "Allow deleting presets"
  ON public.studio_presets
  FOR DELETE
  USING (
    auth.uid() = user_id OR 
    user_id IS NULL
  );

-- Index for faster queries
CREATE INDEX IF NOT EXISTS studio_presets_user_id_idx ON public.studio_presets(user_id);
CREATE INDEX IF NOT EXISTS studio_presets_is_public_idx ON public.studio_presets(is_public) WHERE is_public = true;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_studio_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER studio_presets_updated_at
  BEFORE UPDATE ON public.studio_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_studio_presets_updated_at();
