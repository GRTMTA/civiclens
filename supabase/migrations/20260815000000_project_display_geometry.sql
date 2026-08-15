-- Store only reviewed geometry supplied by an official source. Existing point-only
-- records continue to use projects.coordinates as their authoritative location.
alter table public.projects
  add column official_geometry extensions.geometry(Geometry, 4326),
  add column geometry_source text,
  add column geometry_source_url text;

alter table public.projects
  add constraint projects_official_geometry_type_check check (
    official_geometry is null
    or extensions.geometrytype(official_geometry) in (
      'LINESTRING', 'MULTILINESTRING', 'POLYGON', 'MULTIPOLYGON'
    )
  ),
  add constraint projects_official_geometry_valid_check check (
    official_geometry is null
    or (
      extensions.st_srid(official_geometry) = 4326
      and extensions.st_isvalid(official_geometry)
    )
  ),
  add constraint projects_official_geometry_source_check check (
    official_geometry is null or nullif(btrim(geometry_source), '') is not null
  );

create index projects_official_geometry_idx
  on public.projects using gist (official_geometry)
  where official_geometry is not null;

comment on column public.projects.official_geometry is
  'Reviewed LineString/MultiLineString/Polygon/MultiPolygon from an official source; never inferred from the recorded point.';
comment on column public.projects.geometry_source is
  'Human-readable official source for official_geometry. Required when geometry is present.';
comment on column public.projects.geometry_source_url is
  'Optional public URL documenting the source of official_geometry.';

create or replace function public.projects_in_view(
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
      case
        when p.official_geometry is not null then p.official_geometry
        else extensions.st_buffer(p.coordinates, 50)::extensions.geometry
      end as display_geometry,
      case
        when p.official_geometry is not null then 'official'
        else 'estimated'
      end as geometry_kind,
      case
        when p.official_geometry is not null then p.geometry_source
        else '50 m estimate around recorded project location'
      end as geometry_source,
      case
        when p.official_geometry is not null then p.geometry_source_url
        else null
      end as geometry_source_url,
      row_number() over (order by p.id) as row_number
    from public.projects p
    where
      extensions.st_intersects(
        p.coordinates,
        extensions.st_makeenvelope(
          p_west, p_south, p_east, p_north, 4326
        )::extensions.geography
      )
      or (
        p.official_geometry is not null
        and extensions.st_intersects(
          p.official_geometry,
          extensions.st_makeenvelope(
            p_west, p_south, p_east, p_north, 4326
          )
        )
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
            'geometry', extensions.st_asgeojson(limited.display_geometry)::jsonb,
            'properties', jsonb_build_object(
              'id', limited.id,
              'name', limited.name,
              'category', limited.category,
              'source', limited.source,
              'status', limited.status,
              'recorded_coordinates', jsonb_build_array(
                limited.longitude, limited.latitude
              ),
              'geometry_kind', limited.geometry_kind,
              'geometry_source', limited.geometry_source,
              'geometry_source_url', limited.geometry_source_url
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

create or replace function public.project_detail(p_project_id text)
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
    'amount_paid', p.amount_paid,
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
    'source_of_funds', p.source_of_funds,
    'geometry_kind', case
      when p.official_geometry is not null then 'official'
      else 'estimated'
    end,
    'geometry_source', case
      when p.official_geometry is not null then p.geometry_source
      else '50 m estimate around recorded project location'
    end,
    'geometry_source_url', case
      when p.official_geometry is not null then p.geometry_source_url
      else null
    end
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
