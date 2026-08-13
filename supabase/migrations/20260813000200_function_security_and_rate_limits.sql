revoke all on function public.nearby_projects(double precision, double precision, integer) from public, anon;
revoke all on function public.create_report(text, text, text, double precision, double precision, text) from public, anon;
revoke all on function public.moderate_report(uuid, public.report_status, text) from public, anon;

grant execute on function public.nearby_projects(double precision, double precision, integer) to authenticated;
grant execute on function public.create_report(text, text, text, double precision, double precision, text) to authenticated;
grant execute on function public.moderate_report(uuid, public.report_status, text) to authenticated;

create table public.scan_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.scan_rate_limits enable row level security;

create function public.consume_scan_quota(max_requests integer default 20, window_seconds integer default 60)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if auth.uid() is null then return false; end if;

  insert into public.scan_rate_limits (user_id, window_started_at, request_count)
  values (auth.uid(), now(), 1)
  on conflict (user_id) do update set
    window_started_at = case
      when public.scan_rate_limits.window_started_at <= now() - make_interval(secs => greatest(window_seconds, 1))
      then now() else public.scan_rate_limits.window_started_at end,
    request_count = case
      when public.scan_rate_limits.window_started_at <= now() - make_interval(secs => greatest(window_seconds, 1))
      then 1 else public.scan_rate_limits.request_count + 1 end
  returning request_count into current_count;

  return current_count <= greatest(max_requests, 1);
end;
$$;

revoke all on function public.consume_scan_quota(integer, integer) from public, anon;
grant execute on function public.consume_scan_quota(integer, integer) to authenticated;
