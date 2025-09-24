-- Allow null username/email to support pre-claim rows
alter table if exists public.growth_design_ratings
  alter column username drop not null,
  alter column email drop not null;

alter table if exists public.growth_design_images
  alter column username drop not null,
  alter column email drop not null;

-- Optional: a partial index to help leaderboard exclude null emails quickly
create index if not exists idx_growth_ratings_email_notnull_grade
  on public.growth_design_ratings(email, grade desc)
  where email is not null;

-- Ensure RPC get_growth_leaderboard ignores unclaimed rows (email null)
create or replace function public.get_growth_leaderboard(limit_rows integer default 50)
returns table (
  username text,
  best_grade integer,
  best_at timestamptz
) language sql
security definer
set search_path = public as $$
  with ranked as (
    select
      email,
      username,
      grade,
      created_at,
      row_number() over (partition by email order by grade desc, created_at asc) as rn
    from public.growth_design_ratings
    where email is not null
  )
  select r.username, r.grade as best_grade, r.created_at as best_at
  from ranked r
  where r.rn = 1
  order by best_grade desc, best_at asc
  limit greatest(1, coalesce(limit_rows, 50));
$$;
grant execute on function public.get_growth_leaderboard(integer) to anon, authenticated;


