-- Update grade scale to 0–1000 in growth_design_ratings
alter table public.growth_design_ratings alter column grade type integer;

do $$
declare
  r record;
begin
  for r in (
    select conname
    from pg_constraint
    where conrelid = 'public.growth_design_ratings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%grade%'
  ) loop
    execute format('alter table public.growth_design_ratings drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.growth_design_ratings
  add constraint growth_design_ratings_grade_check
  check (grade >= 0 and grade <= 1000);


