-- Create growth_product_settings table (separate from app_settings)
create table if not exists public.growth_product_settings (
  key text primary key default 'growth_default',
  system_prompt text not null,
  provider text not null default 'openai',
  model text not null default 'gpt-4o',
  temperature numeric not null default 0.7,
  max_tokens integer not null default 2000,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.growth_product_settings enable row level security;

-- Allow anyone to read settings (used by public test UI)
create policy growth_product_settings_select on public.growth_product_settings
  for select
  using (true);

-- Only service role may modify
create policy growth_product_settings_write on public.growth_product_settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Seed default settings (idempotent upsert by key)
insert into public.growth_product_settings as s (key, system_prompt, provider, model, temperature, max_tokens, enabled)
values (
  'growth_default',
  'You are a focused Product Design Rater. Given a single screen (image) and optional context, return strictly:\n- Grade: an integer 0–100 (higher is better)\n- Justification: 2–4 concise sentences grounded in UX heuristics and platform conventions\n- Improvements: exactly 2 specific, high‑impact changes\nRules:\n- Use handbook knowledge as reasoning; do not cite unless it strengthens clarity.\n- Use flows_index as inspiration to anchor patterns, but DO NOT output any COMMAND lines.\n- Be concrete, avoid vague adjectives.\n- Never include anything except the three fields above.',
  'openai',
  'gpt-4o',
  0.4,
  1200,
  true
)
on conflict (key) do update set
  system_prompt = excluded.system_prompt,
  provider = excluded.provider,
  model = excluded.model,
  temperature = excluded.temperature,
  max_tokens = excluded.max_tokens,
  enabled = excluded.enabled,
  updated_at = now();


