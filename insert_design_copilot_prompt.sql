-- Insert design copilot system prompt into existing app_settings table
INSERT INTO public.app_settings (key, system_prompt, provider, model) 
VALUES (
  'design_copilot', 
  'You are a design copilot. Analyze the provided design and give specific, actionable feedback. Focus on visual hierarchy, color usage, typography, spacing, and overall user experience. Be concise but thorough in your analysis.',
  'openai',
  'gpt-4o'
) ON CONFLICT (key) DO UPDATE SET 
  system_prompt = EXCLUDED.system_prompt,
  provider = EXCLUDED.provider,
  model = EXCLUDED.model;
