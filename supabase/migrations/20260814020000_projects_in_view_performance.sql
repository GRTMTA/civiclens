-- ─────────────────────────────────────────────────────────────────────────────
-- projects_in_view performance fix
--
-- This migration reconciles local history with the linked project: the change
-- below was applied directly to the remote database (recorded in the migration
-- ledger as 20260814020000) but never committed, so `supabase db push` reported
-- "remote migration history does not match local files".
--
-- Recovered verbatim from the remote ledger's recorded statements.
--
-- What it changes versus 20260814010000:
--   * `bounded` becomes a MATERIALIZED CTE, so the expensive PostGIS scan runs
--     once instead of being re-evaluated for the features aggregate and the
--     truncation check.
--   * Truncation is detected with `limit prototype_limit + 1` plus a count,
--     replacing `row_number() over (order by p.id)` which had to number every
--     matching row before filtering.
--
-- The returned shape is unchanged, so `parseViewportPayload` in
-- `src/map/map-contract.ts` continues to apply.
-- ─────────────────────────────────────────────────────────────────────────────

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

  with bounded as materialized (
    select
      p.id,
      p.name,
      p.category,
      p.source,
      p.status,
      extensions.st_x(p.coordinates::extensions.geometry) as longitude,
      extensions.st_y(p.coordinates::extensions.geometry) as latitude
    from public.projects p
    where extensions.st_intersects(
      p.coordinates,
      extensions.st_makeenvelope(
        p_west, p_south, p_east, p_north, 4326
      )::extensions.geography
    )
    order by p.id
    limit prototype_limit + 1
  ), limited as (
    select * from bounded limit prototype_limit
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'truncated', (select count(*) > prototype_limit from bounded),
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

grant execute on function public.projects_in_view(
  double precision, double precision, double precision, double precision
) to anon, authenticated;
