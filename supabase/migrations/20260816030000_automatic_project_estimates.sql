-- Automatic, explicitly non-official project estimates derived from a locally
-- staged OSM extract. This migration performs no network requests. Operators
-- load a policy-compatible extract, then refresh estimates in controlled jobs.

create table public.osm_estimate_features (
  element_type text not null check (element_type in ('way', 'relation')),
  osm_id bigint not null check (osm_id > 0),
  feature_class text not null check (feature_class in ('road', 'bridge', 'drainage', 'building_area')),
  tags jsonb not null default '{}'::jsonb,
  geometry extensions.geometry(Geometry, 4326) not null,
  source_url text not null,
  extract_timestamp timestamptz not null,
  loaded_at timestamptz not null default now(),
  primary key (element_type, osm_id, feature_class),
  constraint osm_estimate_features_tags_check check (
    (feature_class = 'road' and tags ? 'highway')
    or (feature_class = 'bridge' and tags ? 'highway' and tags ? 'bridge' and tags->>'bridge' <> 'no')
    or (feature_class = 'drainage' and tags->>'waterway' in ('drain', 'ditch', 'canal'))
    or (feature_class = 'building_area' and tags ? 'building' and tags->>'building' <> 'no')
  ),
  constraint osm_estimate_features_geometry_check check (
    extensions.st_srid(geometry) = 4326
    and extensions.st_isvalid(geometry)
    and (
      (feature_class in ('road', 'bridge', 'drainage') and extensions.geometrytype(geometry) in ('LINESTRING', 'MULTILINESTRING'))
      or
      (feature_class = 'building_area' and extensions.geometrytype(geometry) in ('POLYGON', 'MULTIPOLYGON'))
    )
  )
);

create index osm_estimate_features_geometry_idx
  on public.osm_estimate_features using gist (geometry);
create index osm_estimate_features_class_idx
  on public.osm_estimate_features (feature_class);
create index osm_estimate_features_tags_idx
  on public.osm_estimate_features using gin (tags);

alter table public.osm_estimate_features enable row level security;
revoke all on table public.osm_estimate_features from public, anon, authenticated;

comment on table public.osm_estimate_features is
  'Operator-loaded OSM subset used only to derive non-official project estimates; never queried directly by browser clients.';

alter table public.projects
  add column automatic_estimate_geometry extensions.geometry(Geometry, 4326),
  add column automatic_estimate_method text,
  add column automatic_estimate_class text,
  add column automatic_estimate_osm_type text,
  add column automatic_estimate_osm_id bigint,
  add column automatic_estimate_source_url text,
  add column automatic_estimate_refreshed_at timestamptz;

alter table public.projects
  add constraint projects_automatic_estimate_type_check check (
    automatic_estimate_geometry is null
    or extensions.geometrytype(automatic_estimate_geometry) in (
      'LINESTRING', 'MULTILINESTRING', 'POLYGON', 'MULTIPOLYGON'
    )
  ),
  add constraint projects_automatic_estimate_valid_check check (
    automatic_estimate_geometry is null
    or (
      extensions.st_srid(automatic_estimate_geometry) = 4326
      and extensions.st_isvalid(automatic_estimate_geometry)
    )
  ),
  add constraint projects_automatic_estimate_metadata_check check (
    (
      automatic_estimate_geometry is null
      and automatic_estimate_method is null
      and automatic_estimate_class is null
      and automatic_estimate_osm_type is null
      and automatic_estimate_osm_id is null
      and automatic_estimate_source_url is null
      and automatic_estimate_refreshed_at is null
    )
    or (
      automatic_estimate_geometry is not null
      and automatic_estimate_method in ('osm_nearest', 'radius_circle')
      and automatic_estimate_class in ('road', 'bridge', 'drainage', 'building_area')
      and automatic_estimate_refreshed_at is not null
      and (
        (
          automatic_estimate_method = 'osm_nearest'
          and automatic_estimate_osm_type in ('way', 'relation')
          and automatic_estimate_osm_id > 0
          and nullif(btrim(automatic_estimate_source_url), '') is not null
        )
        or (
          automatic_estimate_method = 'radius_circle'
          and automatic_estimate_osm_type is null
          and automatic_estimate_osm_id is null
          and automatic_estimate_source_url is null
        )
      )
    )
  );

create index projects_automatic_estimate_geometry_idx
  on public.projects using gist (automatic_estimate_geometry)
  where automatic_estimate_geometry is not null;

comment on column public.projects.automatic_estimate_geometry is
  'Read-only non-official nearest-OSM estimate or deterministic 50 m radius circle; replaced by reviewed or official geometry in display precedence.';
comment on column public.projects.automatic_estimate_method is
  'osm_nearest or radius_circle; neither value represents official measurement.';

create function public.project_estimate_class(p_category text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_category, '')) ~ '\mbridge\M' then 'bridge'
    when lower(coalesce(p_category, '')) ~ '\m(drainage|drain|ditch|canal)\M' then 'drainage'
    when lower(coalesce(p_category, '')) ~ '\m(road|street|highway|carriageway)\M' then 'road'
    else 'building_area'
  end;
$$;

create function public.project_estimate_circle(
  p_point extensions.geography,
  p_class text
)
returns extensions.geometry
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_class not in ('road', 'bridge', 'drainage', 'building_area') then
    raise exception 'invalid_project_estimate_class';
  end if;

  return extensions.st_buffer(p_point, 50)::extensions.geometry;
end;
$$;


-- Persist deterministic 50 m radius circles for existing point-only projects. A later
-- operator refresh replaces these with nearest OSM matches after staging data
-- is loaded. Higher-precedence official/reviewed projects remain untouched.
update public.projects p
set automatic_estimate_geometry = public.project_estimate_circle(
      p.coordinates,
      public.project_estimate_class(p.category::text)
    ),
    automatic_estimate_method = 'radius_circle',
    automatic_estimate_class = public.project_estimate_class(p.category::text),
    automatic_estimate_refreshed_at = now()
where p.official_geometry is null
  and p.reviewed_estimate_geometry is null
  and p.automatic_estimate_geometry is null;
create function public.refresh_project_automatic_estimate(p_project_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_point extensions.geography(Point, 4326);
  project_category text;
  estimate_class text;
  candidate public.osm_estimate_features%rowtype;
  estimate_geometry extensions.geometry(Geometry, 4326);
  line_part extensions.geometry(LineString, 4326);
  line_3857 extensions.geometry(LineString, 3857);
  center_3857 extensions.geometry(Point, 3857);
  line_length double precision;
  target_length double precision;
  location_fraction double precision;
  half_fraction double precision;
begin
  select p.coordinates, p.category::text
  into project_point, project_category
  from public.projects p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'project_not_found';
  end if;

  estimate_class := public.project_estimate_class(project_category);

  select feature.*
  into candidate
  from public.osm_estimate_features feature
  where feature.feature_class = estimate_class
    and extensions.st_dwithin(feature.geometry::extensions.geography, project_point, 50)
  order by extensions.st_distance(feature.geometry::extensions.geography, project_point),
           feature.osm_id
  limit 1;

  if found then
    if estimate_class = 'building_area' then
      estimate_geometry := candidate.geometry;
    else
      select dumped.geom::extensions.geometry(LineString, 4326)
      into line_part
      from extensions.st_dump(candidate.geometry) dumped
      order by extensions.st_distance(dumped.geom::extensions.geography, project_point)
      limit 1;

      line_3857 := extensions.st_transform(line_part, 3857);
      center_3857 := extensions.st_transform(project_point::extensions.geometry, 3857);
      line_length := extensions.st_length(line_3857);
      target_length := case when estimate_class = 'bridge' then 50.0 else 60.0 end;

      if line_length > target_length and line_length > 0 then
        location_fraction := extensions.st_linelocatepoint(line_3857, center_3857);
        half_fraction := (target_length / 2) / line_length;
        estimate_geometry := extensions.st_transform(
          extensions.st_linesubstring(
            line_3857,
            greatest(0, location_fraction - half_fraction),
            least(1, location_fraction + half_fraction)
          ),
          4326
        );
      else
        estimate_geometry := line_part;
      end if;
    end if;

    update public.projects
    set automatic_estimate_geometry = estimate_geometry,
        automatic_estimate_method = 'osm_nearest',
        automatic_estimate_class = estimate_class,
        automatic_estimate_osm_type = candidate.element_type,
        automatic_estimate_osm_id = candidate.osm_id,
        automatic_estimate_source_url = candidate.source_url,
        automatic_estimate_refreshed_at = now()
    where id = p_project_id;
  else
    update public.projects
    set automatic_estimate_geometry = public.project_estimate_circle(project_point, estimate_class),
        automatic_estimate_method = 'radius_circle',
        automatic_estimate_class = estimate_class,
        automatic_estimate_osm_type = null,
        automatic_estimate_osm_id = null,
        automatic_estimate_source_url = null,
        automatic_estimate_refreshed_at = now()
    where id = p_project_id;
  end if;
end;
$$;

-- Broad moderator project policies must not permit forged automatic provenance.
-- Trigger execution keeps the invoking role: owner refresh functions are
-- allowed, while direct browser-role inserts/updates are rejected.
create function public.guard_automatic_project_estimate_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  projects_owner text;
  automatic_values_present boolean;
  automatic_values_changed boolean;
begin
  select roles.rolname
  into projects_owner
  from pg_catalog.pg_class relations
  join pg_catalog.pg_namespace namespaces on namespaces.oid = relations.relnamespace
  join pg_catalog.pg_roles roles on roles.oid = relations.relowner
  where namespaces.nspname = 'public' and relations.relname = 'projects';

  automatic_values_present := new.automatic_estimate_geometry is not null
    or new.automatic_estimate_method is not null
    or new.automatic_estimate_class is not null
    or new.automatic_estimate_osm_type is not null
    or new.automatic_estimate_osm_id is not null
    or new.automatic_estimate_source_url is not null
    or new.automatic_estimate_refreshed_at is not null;

  if tg_op = 'UPDATE' then
    automatic_values_changed :=
      extensions.st_asbinary(new.automatic_estimate_geometry) is distinct from extensions.st_asbinary(old.automatic_estimate_geometry)
      or new.automatic_estimate_method is distinct from old.automatic_estimate_method
      or new.automatic_estimate_class is distinct from old.automatic_estimate_class
      or new.automatic_estimate_osm_type is distinct from old.automatic_estimate_osm_type
      or new.automatic_estimate_osm_id is distinct from old.automatic_estimate_osm_id
      or new.automatic_estimate_source_url is distinct from old.automatic_estimate_source_url
      or new.automatic_estimate_refreshed_at is distinct from old.automatic_estimate_refreshed_at;
  else
    automatic_values_changed := false;
  end if;

  if current_user is distinct from projects_owner
    and ((tg_op = 'INSERT' and automatic_values_present) or automatic_values_changed) then
    raise exception 'automatic_project_estimate_is_operator_managed' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_automatic_project_estimate_write() from public, anon, authenticated;

create trigger guard_automatic_project_estimate_insert
before insert on public.projects
for each row execute function public.guard_automatic_project_estimate_write();

create trigger guard_automatic_project_estimate_update
before update of automatic_estimate_geometry,
  automatic_estimate_method,
  automatic_estimate_class,
  automatic_estimate_osm_type,
  automatic_estimate_osm_id,
  automatic_estimate_source_url,
  automatic_estimate_refreshed_at
on public.projects
for each row execute function public.guard_automatic_project_estimate_write();

revoke all on function public.project_estimate_class(text) from public, anon, authenticated;
revoke all on function public.project_estimate_circle(extensions.geography, text) from public, anon, authenticated;
revoke all on function public.refresh_project_automatic_estimate(text) from public, anon, authenticated;

create function public.refresh_project_automatic_estimate_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.coordinates is not distinct from old.coordinates
    and new.category is not distinct from old.category then
    return new;
  end if;

  perform public.refresh_project_automatic_estimate(new.id);
  return new;
end;
$$;

revoke all on function public.refresh_project_automatic_estimate_trigger() from public, anon, authenticated;

create trigger refresh_project_automatic_estimate_after_change
after insert or update of coordinates, category on public.projects
for each row execute function public.refresh_project_automatic_estimate_trigger();

-- Operator-only bulk refresh after replacing the local OSM extract. Deliberately
-- ungranted to browser roles.
create function public.refresh_all_project_automatic_estimates()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  project record;
  refreshed bigint := 0;
begin
  for project in select id from public.projects order by id loop
    perform public.refresh_project_automatic_estimate(project.id);
    refreshed := refreshed + 1;
  end loop;
  return refreshed;
end;
$$;

revoke all on function public.refresh_all_project_automatic_estimates() from public, anon, authenticated;

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
        when p.automatic_estimate_geometry is not null then p.automatic_estimate_geometry
        else public.project_estimate_circle(
          p.coordinates,
          public.project_estimate_class(p.category::text)
        )
      end as display_geometry,
      case
        when p.official_geometry is not null then 'official'
        when p.reviewed_estimate_geometry is not null then 'reviewed_estimate'
        when p.automatic_estimate_method = 'osm_nearest' then 'automatic_estimate'
        else 'estimated'
      end as geometry_kind,
      case
        when p.official_geometry is not null then p.geometry_source
        when p.reviewed_estimate_geometry is not null then 'OpenStreetMap contributors (moderator-reviewed estimate)'
        when p.automatic_estimate_method = 'osm_nearest' then 'OpenStreetMap contributors (automatic estimate)'
        else '50 m radius circle around recorded project location'
      end as geometry_source,
      case
        when p.official_geometry is not null then p.geometry_source_url
        when p.reviewed_estimate_geometry is not null then 'https://www.openstreetmap.org/way/' || p.reviewed_estimate_osm_way_id::text
        when p.automatic_estimate_method = 'osm_nearest' then p.automatic_estimate_source_url
        else null
      end as geometry_source_url,
      case
        when p.official_geometry is not null or p.reviewed_estimate_geometry is not null then null
        else coalesce(p.automatic_estimate_method, 'radius_circle')
      end as geometry_estimate_method,
      case
        when p.official_geometry is not null or p.reviewed_estimate_geometry is not null then null
        else coalesce(p.automatic_estimate_class, public.project_estimate_class(p.category::text))
      end as geometry_estimate_class,
      row_number() over (order by p.id) as row_number
    from public.projects p
    where extensions.st_intersects(
      p.coordinates,
      extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::extensions.geography
    )
      or (p.official_geometry is not null and extensions.st_intersects(p.official_geometry, extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)))
      or (p.reviewed_estimate_geometry is not null and extensions.st_intersects(p.reviewed_estimate_geometry, extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)))
      or (p.automatic_estimate_geometry is not null and extensions.st_intersects(p.automatic_estimate_geometry, extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)))
  ), limited as (
    select * from bounded where row_number <= prototype_limit
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'truncated', exists (select 1 from bounded where row_number > prototype_limit),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', 'Feature',
        'id', limited.id,
        'geometry', extensions.st_asgeojson(limited.display_geometry)::jsonb,
        'properties', jsonb_build_object(
          'id', limited.id,
          'name', limited.name,
          'category', limited.category,
          'source', limited.source,
          'status', limited.status,
          'recorded_coordinates', jsonb_build_array(limited.longitude, limited.latitude),
          'geometry_kind', limited.geometry_kind,
          'geometry_source', limited.geometry_source,
          'geometry_source_url', limited.geometry_source_url,
          'geometry_estimate_method', limited.geometry_estimate_method,
          'geometry_estimate_class', limited.geometry_estimate_class
        )
      ) order by limited.id) from limited
    ), '[]'::jsonb)
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
      when p.automatic_estimate_method = 'osm_nearest' then 'automatic_estimate'
      else 'estimated'
    end,
    'geometry_source', case
      when p.official_geometry is not null then p.geometry_source
      when p.reviewed_estimate_geometry is not null then 'OpenStreetMap contributors (moderator-reviewed estimate)'
      when p.automatic_estimate_method = 'osm_nearest' then 'OpenStreetMap contributors (automatic estimate)'
      else '50 m radius circle around recorded project location'
    end,
    'geometry_source_url', case
      when p.official_geometry is not null then p.geometry_source_url
      when p.reviewed_estimate_geometry is not null then 'https://www.openstreetmap.org/way/' || p.reviewed_estimate_osm_way_id::text
      when p.automatic_estimate_method = 'osm_nearest' then p.automatic_estimate_source_url
      else null
    end,
    'geometry_estimate_method', case
      when p.official_geometry is not null or p.reviewed_estimate_geometry is not null then null
      else coalesce(p.automatic_estimate_method, 'radius_circle')
    end,
    'geometry_estimate_class', case
      when p.official_geometry is not null or p.reviewed_estimate_geometry is not null then null
      else coalesce(p.automatic_estimate_class, public.project_estimate_class(p.category::text))
    end,
    'geometry_reviewed_at', p.reviewed_estimate_reviewed_at,
    'geometry_review_note', p.reviewed_estimate_note
  )
  from public.projects p
  where p.id = p_project_id;
$$;

revoke all on function public.projects_in_view(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.projects_in_view(double precision, double precision, double precision, double precision) to anon, authenticated;
revoke all on function public.project_detail(text) from public, anon;
grant execute on function public.project_detail(text) to anon, authenticated;
