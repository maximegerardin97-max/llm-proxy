-- Create app_settings table for storing system prompts and configuration
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  system_prompt text,
  provider text,
  model text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert the design copilot system prompt
INSERT INTO public.app_settings (key, system_prompt, provider, model) 
VALUES (
  'default', 
  'You are a helpful AI assistant with access to a knowledge base. Use the provided documents to answer questions accurately and comprehensively. If you don''t know something, say so clearly.',
  'openai',
  'gpt-4o'
) ON CONFLICT (key) DO UPDATE SET 
  system_prompt = EXCLUDED.system_prompt,
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  updated_at = now();

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read settings
CREATE POLICY IF NOT EXISTS "app_settings_read" ON public.app_settings 
FOR SELECT USING (true);

-- Create policy to allow service role to manage settings
CREATE POLICY IF NOT EXISTS "app_settings_manage" ON public.app_settings 
FOR ALL USING (auth.role() = 'service_role');

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_settings_set_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
