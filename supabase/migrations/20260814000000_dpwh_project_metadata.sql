alter table public.projects
  add column contract_id text,
  add column source_category text,
  add column component_categories text[] not null default '{}',
  add column amount_paid numeric check (amount_paid >= 0),
  add column start_date date,
  add column completion_date date,
  add column infrastructure_year text,
  add column program_name text,
  add column source_of_funds text,
  add column region text,
  add column district_office text,
  add column is_live boolean not null default false,
  add column livestream_url text,
  add column livestream_video_id text,
  add column livestream_detected_at timestamptz,
  add column source_report_count integer check (source_report_count >= 0),
  add column has_satellite_image boolean not null default false,
  add column source_revision text,
  add column source_imported_at timestamptz,
  add column source_metadata jsonb not null default '{}'::jsonb;

create unique index projects_contract_id_idx
  on public.projects (contract_id)
  where contract_id is not null;
create index projects_region_idx on public.projects (region);
create index projects_infrastructure_year_idx on public.projects (infrastructure_year);
create index projects_category_idx on public.projects (category);

drop function public.nearby_projects(double precision, double precision, integer);

create function public.nearby_projects(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer default 25000,
  p_category public.infrastructure_category default null
)
returns table (
  id text, source text, source_url text, name text,
  category public.infrastructure_category, description text, agency text,
  contractor text, budget numeric, status text, progress numeric, location text,
  latitude double precision, longitude double precision, last_checked timestamptz,
  documents jsonb, contract_id text, source_category text,
  component_categories text[], amount_paid numeric, start_date date,
  completion_date date, infrastructure_year text, program_name text,
  source_of_funds text, region text, district_office text, is_live boolean,
  livestream_url text, has_satellite_image boolean, source_revision text,
  source_imported_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.source, p.source_url, p.name, p.category, p.description,
    p.agency, p.contractor, p.budget, p.status, p.progress, p.location,
    extensions.st_y(p.coordinates::extensions.geometry),
    extensions.st_x(p.coordinates::extensions.geometry),
    p.last_checked, p.documents, p.contract_id, p.source_category,
    p.component_categories, p.amount_paid, p.start_date, p.completion_date,
    p.infrastructure_year, p.program_name, p.source_of_funds, p.region,
    p.district_office, p.is_live, p.livestream_url, p.has_satellite_image,
    p.source_revision, p.source_imported_at
  from public.projects p
  where (p_category is null or p.category = p_category)
    and extensions.st_dwithin(
      p.coordinates,
      extensions.st_setsrid(
        extensions.st_makepoint(p_longitude, p_latitude), 4326
      )::extensions.geography,
      greatest(p_radius_meters, 0)
    )
  order by extensions.st_distance(
    p.coordinates,
    extensions.st_setsrid(
      extensions.st_makepoint(p_longitude, p_latitude), 4326
    )::extensions.geography
  )
  limit 200;
$$;

revoke all on function public.nearby_projects(
  double precision, double precision, integer, public.infrastructure_category
) from public, anon;
grant execute on function public.nearby_projects(
  double precision, double precision, integer, public.infrastructure_category
) to authenticated;
