-- Leaderboard with counts per designer
create or replace function public.get_growth_leaderboard_v2(limit_rows integer default 50)
returns table (
  username text,
  best_grade integer,
  best_at timestamptz,
  designs_count bigint
) language sql
security definer
set search_path = public as $$
  with best as (
    select email, username, grade, created_at,
           row_number() over (partition by email order by grade desc, created_at asc) as rn
    from public.growth_design_ratings
    where email is not null
  ), counts as (
    select email, count(*) as designs_count
    from public.growth_design_ratings
    where email is not null
    group by email
  )
  select b.username, b.grade as best_grade, b.created_at as best_at, coalesce(c.designs_count,0) as designs_count
  from best b
  left join counts c using (email)
  where b.rn = 1
  order by best_grade desc, best_at asc
  limit greatest(1, coalesce(limit_rows, 50));
$$;
grant execute on function public.get_growth_leaderboard_v2(integer) to anon, authenticated;


