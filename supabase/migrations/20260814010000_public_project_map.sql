-- Public map access is deliberately narrower than direct table access.
revoke select on table public.projects from anon;

create function public.projects_in_view(
  p_south double precision,
  p_west double precision,
  p_north double precision,
  p_east double precision
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  prototype_limit integer := 500;
begin
  if p_south is null or p_west is null or p_north is null or p_east is null
    or p_south < -90 or p_north > 90
    or p_west < -180 or p_east > 180
    or p_south >= p_north or p_west >= p_east
    or p_north - p_south > 10
    or p_east - p_west > 10 then
    raise exception 'invalid project viewport';
  end if;

  with bounded as (
    select
      p.id,
      p.name,
      p.category,
      p.source,
      p.status,
      extensions.st_x(p.coordinates::extensions.geometry) as longitude,
      extensions.st_y(p.coordinates::extensions.geometry) as latitude,
      row_number() over (order by p.id) as row_number
    from public.projects p
    where extensions.st_intersects(
      p.coordinates,
      extensions.st_makeenvelope(
        p_west, p_south, p_east, p_north, 4326
      )::extensions.geography
    )
  ), limited as (
    select * from bounded where row_number <= prototype_limit
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'truncated', exists (
      select 1 from bounded where row_number > prototype_limit
    ),
    'features', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'id', limited.id,
            'geometry', jsonb_build_object(
              'type', 'Point',
              'coordinates', jsonb_build_array(
                limited.longitude, limited.latitude
              )
            ),
            'properties', jsonb_build_object(
              'id', limited.id,
              'name', limited.name,
              'category', limited.category,
              'source', limited.source,
              'status', limited.status
            )
          ) order by limited.id
        ) from limited
      ),
      '[]'::jsonb
    )
  ) into result;

  return result;
end;
$$;

create function public.project_detail(p_project_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'source', p.source,
    'source_url', p.source_url,
    'name', p.name,
    'category', p.category,
    'description', p.description,
    'agency', p.agency,
    'contractor', p.contractor,
    'budget', p.budget,
    'status', p.status,
    'progress', p.progress,
    'location', p.location,
    'latitude', extensions.st_y(p.coordinates::extensions.geometry),
    'longitude', extensions.st_x(p.coordinates::extensions.geometry),
    'last_checked', p.last_checked,
    'contract_id', p.contract_id,
    'start_date', p.start_date,
    'completion_date', p.completion_date,
    'infrastructure_year', p.infrastructure_year,
    'program_name', p.program_name,
    'source_of_funds', p.source_of_funds
  )
  from public.projects p
  where p.id = p_project_id;
$$;

revoke all on function public.projects_in_view(
  double precision, double precision, double precision, double precision
) from public, anon;
grant execute on function public.projects_in_view(
  double precision, double precision, double precision, double precision
) to anon, authenticated;

revoke all on function public.project_detail(text) from public, anon;
grant execute on function public.project_detail(text) to anon, authenticated;
