create index projects_coordinates_idx on public.projects using gist (coordinates);
create index reports_created_at_idx on public.reports (created_at desc);
create index reports_author_id_idx on public.reports (author_id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'Citizen')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_moderator()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'moderator'
  );
$$;

revoke all on function public.is_moderator() from public;
grant execute on function public.is_moderator() to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_events enable row level security;
create policy "profiles are readable by authenticated users"
on public.profiles for select to authenticated using (true);

create policy "projects are publicly readable"
on public.projects for select to anon, authenticated using (true);
create policy "moderators manage projects"
on public.projects for all to authenticated
using ((select public.is_moderator())) with check ((select public.is_moderator()));

create policy "visible reports are readable"
on public.reports for select to authenticated
using (status <> 'hidden' or author_id = auth.uid() or (select public.is_moderator()));
create policy "users create their own reports"
on public.reports for insert to authenticated
with check (author_id = auth.uid() and status = 'unverified');
create policy "authors delete unverified reports"
on public.reports for delete to authenticated
using ((author_id = auth.uid() and status = 'unverified') or (select public.is_moderator()));
create policy "moderators update reports"
on public.reports for update to authenticated
using ((select public.is_moderator())) with check ((select public.is_moderator()));

create policy "moderators read moderation events"
on public.moderation_events for select to authenticated using ((select public.is_moderator()));
create policy "moderators create moderation events"
on public.moderation_events for insert to authenticated
with check (admin_id = auth.uid() and (select public.is_moderator()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public;

create policy "users upload report photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users read their report photos"
on storage.objects for select to authenticated
using (bucket_id = 'report-photos' and ((storage.foldername(name))[1] = auth.uid()::text or (select public.is_moderator())));
create policy "users delete their report photos"
on storage.objects for delete to authenticated
using (bucket_id = 'report-photos' and ((storage.foldername(name))[1] = auth.uid()::text or (select public.is_moderator())));
create function public.nearby_projects(p_latitude double precision, p_longitude double precision, p_radius_meters integer default 25000)
returns table (
  id text, source text, source_url text, name text, category public.infrastructure_category,
  description text, agency text, contractor text, budget numeric, status text,
  progress numeric, location text, latitude double precision, longitude double precision,
  last_checked timestamptz, documents jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.source, p.source_url, p.name, p.category, p.description, p.agency,
    p.contractor, p.budget, p.status, p.progress, p.location,
    extensions.st_y(p.coordinates::extensions.geometry),
    extensions.st_x(p.coordinates::extensions.geometry),
    p.last_checked, p.documents
  from public.projects p
  where extensions.st_dwithin(
    p.coordinates,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
    greatest(p_radius_meters, 0)
  )
  order by extensions.st_distance(
    p.coordinates,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
  )
  limit 50;
$$;

grant execute on function public.nearby_projects(double precision, double precision, integer) to authenticated;

create function public.create_report(
  p_project_id text,
  p_category text,
  p_note text,
  p_latitude double precision,
  p_longitude double precision,
  p_photo_path text default null
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.reports;
  display_name text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select p.display_name into display_name from public.profiles p where p.id = auth.uid();
  if display_name is null then raise exception 'profile not found'; end if;
  insert into public.reports (project_id, author_id, author_name, category, note, photo_path, coordinates)
  values (
    p_project_id, auth.uid(), display_name, p_category, p_note, p_photo_path,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
  ) returning * into result;
  return result;
end;
$$;

grant execute on function public.create_report(text, text, text, double precision, double precision, text) to authenticated;

create function public.moderate_report(p_report_id uuid, p_new_status public.report_status, p_reason text default null)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare result public.reports;
begin
  if not public.is_moderator() then raise exception 'moderator access required'; end if;
  update public.reports set status = p_new_status where id = p_report_id returning * into result;
  if result.id is null then raise exception 'report not found'; end if;
  insert into public.moderation_events (report_id, admin_id, action, reason)
  values (p_report_id, auth.uid(), p_new_status, p_reason);
  return result;
end;
$$;

grant execute on function public.moderate_report(uuid, public.report_status, text) to authenticated;
