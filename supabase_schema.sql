-- Enable extensions (optional)
create extension if not exists pgcrypto;

-- profiles mirrors auth.users
create table if not exists public.profiles (
  id uuid primary key default auth.uid(),
  email text unique,
  created_at timestamptz default now()
);

-- conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  page_name text,
  archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- messages
create table if not exists public.messages (
  id bigserial primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content jsonb not null,
  chunk_index int,
  is_final boolean default false,
  source text check (source in ('web','mac','agent')),
  created_at timestamptz default now()
);

-- triggers to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- profiles policies
create policy if not exists "profiles_self_select" on public.profiles for select using (id = auth.uid());
create policy if not exists "profiles_self_upsert" on public.profiles for insert with check (id = auth.uid());
create policy if not exists "profiles_self_update" on public.profiles for update using (id = auth.uid());

-- conversations policies
create policy if not exists "conversations_select_own" on public.conversations for select using (user_id = auth.uid());
create policy if not exists "conversations_insert_own" on public.conversations for insert with check (user_id = auth.uid());
create policy if not exists "conversations_update_own" on public.conversations for update using (user_id = auth.uid());
create policy if not exists "conversations_delete_own" on public.conversations for delete using (user_id = auth.uid());

-- messages policies
create policy if not exists "messages_select_own" on public.messages for select using (
  user_id = auth.uid()
);
create policy if not exists "messages_insert_own" on public.messages for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()
  )
);

-- Realtime
-- In Supabase dashboard, enable Realtime for tables conversations and messages





