create table if not exists public.handbooks (
  id bigint generated always as identity primary key,
  handbook_title text not null,
  content text not null,
  when_to_use text,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists handbooks_set_updated_at on public.handbooks;
create trigger handbooks_set_updated_at
before update on public.handbooks
for each row execute function public.set_updated_at();

-- Helpful indexes
create index if not exists handbooks_title_idx on public.handbooks using gin (handbook_title gin_trgm_ops);
create index if not exists handbooks_content_idx on public.handbooks using gin (content gin_trgm_ops);
create index if not exists handbooks_when_to_use_idx on public.handbooks using gin (when_to_use gin_trgm_ops);

