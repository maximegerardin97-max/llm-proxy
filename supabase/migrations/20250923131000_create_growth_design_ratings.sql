-- Create growth_design_ratings to store public ratings
create table if not exists public.growth_design_ratings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  username text not null,
  email text not null,
  design_storage_path text not null,
  input_context text,
  provider text,
  model text,
  grade integer not null check (grade >= 0 and grade <= 100),
  justification text not null,
  improvements jsonb not null,
  latency_ms integer,
  request_id uuid not null default gen_random_uuid(),
  ip_hash text
);

create index if not exists idx_growth_ratings_created_at on public.growth_design_ratings(created_at desc);
create index if not exists idx_growth_ratings_email_grade on public.growth_design_ratings(email, grade desc);

alter table public.growth_design_ratings enable row level security;

-- Inserts only by service role (edge function)
create policy growth_design_ratings_insert on public.growth_design_ratings
  for insert
  to public
  with check (auth.role() = 'service_role');

-- Select restricted; public will use a SECURITY DEFINER RPC for leaderboard
create policy growth_design_ratings_select_sr_only on public.growth_design_ratings
  for select
  using (auth.role() = 'service_role');


