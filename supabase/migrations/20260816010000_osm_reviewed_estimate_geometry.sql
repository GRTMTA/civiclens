-- Add a third, explicitly non-official geometry tier for road segments selected
-- from OpenStreetMap by an authenticated CivicLens moderator. The DPWH point
-- remains authoritative; OSM geometry is only a reviewed estimate.
alter table public.projects
  add column reviewed_estimate_geometry extensions.geometry(Geometry, 4326),
  add column reviewed_estimate_osm_way_id bigint,
  add column reviewed_estimate_reviewed_by uuid references auth.users(id),
  add column reviewed_estimate_reviewed_at timestamptz,
  add column reviewed_estimate_note text;

alter table public.projects
  add constraint projects_reviewed_estimate_type_check check (
    reviewed_estimate_geometry is null
    or extensions.geometrytype(reviewed_estimate_geometry) in (
      'LINESTRING', 'MULTILINESTRING'
    )
  ),
  add constraint projects_reviewed_estimate_valid_check check (
    reviewed_estimate_geometry is null
    or (
      extensions.st_srid(reviewed_estimate_geometry) = 4326
      and extensions.st_isvalid(reviewed_estimate_geometry)
    )
  ),
  add constraint projects_reviewed_estimate_metadata_check check (
    (
      reviewed_estimate_geometry is null
      and reviewed_estimate_osm_way_id is null
      and reviewed_estimate_reviewed_by is null
      and reviewed_estimate_reviewed_at is null
      and reviewed_estimate_note is null
    )
    or (
      reviewed_estimate_geometry is not null
      and reviewed_estimate_osm_way_id > 0
      and reviewed_estimate_reviewed_by is not null
      and reviewed_estimate_reviewed_at is not null
      and char_length(reviewed_estimate_note) between 5 and 500
    )
  );

create index projects_reviewed_estimate_geometry_idx
  on public.projects using gist (reviewed_estimate_geometry)
  where reviewed_estimate_geometry is not null;

comment on column public.projects.reviewed_estimate_geometry is
  'Non-official OSM road segment selected by a moderator; never presented as official project geometry.';
comment on column public.projects.reviewed_estimate_osm_way_id is
  'OpenStreetMap way ID used for the reviewed estimate.';

create table public.project_geometry_reviews (
  id bigint generated always as identity primary key,
  project_id text not null references public.projects(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id),
  action text not null check (action in ('approve_osm_estimate')),
  osm_way_id bigint not null check (osm_way_id > 0),
  geometry extensions.geometry(Geometry, 4326) not null,
  note text not null check (char_length(note) between 5 and 500),
  created_at timestamptz not null default now(),
  constraint project_geometry_reviews_type_check check (
    extensions.geometrytype(geometry) in ('LINESTRING', 'MULTILINESTRING')
  ),
  constraint project_geometry_reviews_valid_check check (
    extensions.st_srid(geometry) = 4326 and extensions.st_isvalid(geometry)
  )
);

create index project_geometry_reviews_project_created_idx
  on public.project_geometry_reviews (project_id, created_at desc);

alter table public.project_geometry_reviews enable row level security;

create policy "moderators read project geometry reviews"
on public.project_geometry_reviews for select to authenticated
using ((select public.is_moderator()));

create function public.review_project_osm_geometry(
  p_project_id text,
  p_osm_way_id bigint,
  p_geometry jsonb,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer uuid := auth.uid();
  project_point extensions.geography(Point, 4326);
  official extensions.geometry(Geometry, 4326);
  candidate extensions.geometry(Geometry, 4326);
  clean_note text := btrim(coalesce(p_note, ''));
begin
  if reviewer is null or not public.is_moderator() then
    raise exception 'moderator_required' using errcode = '42501';
  end if;

  if p_project_id is null or p_osm_way_id is null or p_osm_way_id <= 0 then
    raise exception 'invalid_osm_review';
  end if;

  if char_length(clean_note) not between 5 and 500 then
    raise exception 'review_note_must_be_5_to_500_characters';
  end if;

  begin
    candidate := extensions.st_setsrid(
      extensions.st_geomfromgeojson(p_geometry::text),
      4326
    );
  exception when others then
    raise exception 'invalid_osm_geometry';
  end;

  if candidate is null
    or extensions.geometrytype(candidate) not in ('LINESTRING', 'MULTILINESTRING')
    or not extensions.st_isvalid(candidate) then
    raise exception 'invalid_osm_geometry';
  end if;

  select p.coordinates, p.official_geometry
  into project_point, official
  from public.projects p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'project_not_found';
  end if;

  if official is not null then
    raise exception 'official_geometry_already_exists';
  end if;

  if not extensions.st_dwithin(
    candidate::extensions.geography,
    project_point,
    150
  ) then
    raise exception 'osm_geometry_too_far_from_project';
  end if;

  if extensions.st_length(candidate::extensions.geography) > 750 then
    raise exception 'osm_geometry_too_long';
  end if;

  update public.projects
  set reviewed_estimate_geometry = candidate,
      reviewed_estimate_osm_way_id = p_osm_way_id,
      reviewed_estimate_reviewed_by = reviewer,
      reviewed_estimate_reviewed_at = now(),
      reviewed_estimate_note = clean_note
  where id = p_project_id;

  insert into public.project_geometry_reviews (
    project_id,
    reviewer_id,
    action,
    osm_way_id,
    geometry,
    note
  ) values (
    p_project_id,
    reviewer,
    'approve_osm_estimate',
    p_osm_way_id,
    candidate,
    clean_note
  );
end;
$$;

revoke all on function public.review_project_osm_geometry(
  text, bigint, jsonb, text
) from public, anon;
grant execute on function public.review_project_osm_geometry(
  text, bigint, jsonb, text
) to authenticated;

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
        when p.reviewed_estimate_geometry is not null then p.reviewed_estimate_geometry
        else extensions.st_buffer(p.coordinates, 50)::extensions.geometry
      end as display_geometry,
      case
        when p.official_geometry is not null then 'official'
        when p.reviewed_estimate_geometry is not null then 'reviewed_estimate'
        else 'estimated'
      end as geometry_kind,
      case
        when p.official_geometry is not null then p.geometry_source
        when p.reviewed_estimate_geometry is not null then
          'OpenStreetMap contributors (moderator-reviewed estimate)'
        else '50 m estimate around recorded project location'
      end as geometry_source,
      case
        when p.official_geometry is not null then p.geometry_source_url
        when p.reviewed_estimate_geometry is not null then
          'https://www.openstreetmap.org/way/' || p.reviewed_estimate_osm_way_id::text
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
          extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)
        )
      )
      or (
        p.reviewed_estimate_geometry is not null
        and extensions.st_intersects(
          p.reviewed_estimate_geometry,
          extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)
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
      when p.reviewed_estimate_geometry is not null then 'reviewed_estimate'
      else 'estimated'
    end,
    'geometry_source', case
      when p.official_geometry is not null then p.geometry_source
      when p.reviewed_estimate_geometry is not null then
        'OpenStreetMap contributors (moderator-reviewed estimate)'
      else '50 m estimate around recorded project location'
    end,
    'geometry_source_url', case
      when p.official_geometry is not null then p.geometry_source_url
      when p.reviewed_estimate_geometry is not null then
        'https://www.openstreetmap.org/way/' || p.reviewed_estimate_osm_way_id::text
      else null
    end,
    'geometry_reviewed_at', p.reviewed_estimate_reviewed_at,
    'geometry_review_note', p.reviewed_estimate_note
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
