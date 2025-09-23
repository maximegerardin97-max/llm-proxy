create table if not exists public.growth_design_images (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rating_id uuid references public.growth_design_ratings(id) on delete set null,
  username text not null,
  email text not null,
  image_data text not null
);

alter table public.growth_design_images enable row level security;

create policy growth_design_images_insert on public.growth_design_images
  for insert
  to public
  with check (auth.role() = 'service_role');

create policy growth_design_images_select_public on public.growth_design_images
  for select
  using (true);


