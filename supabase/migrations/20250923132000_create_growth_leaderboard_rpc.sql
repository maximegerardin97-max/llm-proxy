-- RPC to expose leaderboard without leaking emails
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
  )
  select r.username, r.grade as best_grade, r.created_at as best_at
  from ranked r
  where r.rn = 1
  order by r.best_grade desc, r.best_at asc
  limit greatest(1, coalesce(limit_rows, 50));
$$;

grant execute on function public.get_growth_leaderboard(integer) to anon, authenticated; 


