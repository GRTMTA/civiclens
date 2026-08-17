-- Forward-only repair for Community project links and post media.
-- Live DPWH records are served outside Supabase, so resident discussions keep
-- an ID/name snapshot without creating a synthetic Official project row.
--
-- The hosted migration history can contain the profile/media upgrade while its
-- schema is still legacy. Bootstrap every dependency this repair uses.

do $$
begin
  if not exists (
    select 1
    from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public' and type.typname = 'community_post_kind'
  ) then
    create type public.community_post_kind as enum ('discussion', 'observation');
  end if;
end;
$$;

alter table public.profiles
  add column if not exists username text,
  add column if not exists avatar_path text;

update public.profiles
set username = 'resident_' || left(replace(id::text, '-', ''), 8)
where username is null;

create unique index if not exists profiles_username_key
  on public.profiles (username)
  where username is not null;

alter table public.community_posts
  add column if not exists kind public.community_post_kind not null default 'discussion',
  add column if not exists area_label text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.community_posts
  drop constraint if exists community_posts_area_label_length;

alter table public.community_posts
  add constraint community_posts_area_label_length
  check (area_label is null or char_length(btrim(area_label)) between 2 and 120)
  not valid;

create index if not exists community_posts_kind_idx
  on public.community_posts (kind, created_at desc);

create or replace function public.community_author(p_author_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', profile.display_name,
    'username', profile.username,
    'avatar_path', profile.avatar_path
  )
  from public.profiles profile
  where profile.id = p_author_id;
$$;

create or replace function public.community_profile_id(p_username text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id
  from public.profiles profile
  where profile.username = lower(btrim(coalesce(p_username, '')));
$$;

do $$
begin
  if to_regprocedure('public.community_post_score(uuid)') is null then
    execute $function$
      create function public.community_post_score(p_post_id uuid)
      returns bigint
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select coalesce(sum(vote.value), 0)
        from public.community_post_votes vote
        where vote.post_id = p_post_id;
      $body$
    $function$;
  end if;
end;
$$;

create or replace function public.community_post_viewer_vote(p_post_id uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select vote.value
    from public.community_post_votes vote
    where vote.post_id = p_post_id and vote.user_id = auth.uid()
  ), 0)::smallint;
$$;

alter table public.community_posts
  drop constraint if exists community_posts_project_id_fkey;

alter table public.community_posts
  add column if not exists project_name text;

alter table public.community_posts
  drop constraint if exists community_posts_project_name_length;

alter table public.community_posts
  add constraint community_posts_project_name_length
  check (project_name is null or char_length(btrim(project_name)) between 1 and 300)
  not valid;

update public.community_posts post
set project_name = project.name
from public.projects project
where post.project_id = project.id
  and post.project_name is null;

create table if not exists public.community_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 3 and 400),
  position smallint not null default 0 check (position between 0 and 9),
  created_at timestamptz not null default now()
);

create index if not exists community_post_media_post_idx
  on public.community_post_media (post_id, position);

alter table public.community_post_media enable row level security;

drop policy if exists community_post_media_select_public on public.community_post_media;
create policy community_post_media_select_public
on public.community_post_media for select to anon
using (exists (
  select 1 from public.community_posts post
  where post.id = post_id and post.hidden = false
));

drop policy if exists community_post_media_select on public.community_post_media;
create policy community_post_media_select
on public.community_post_media for select to authenticated
using (exists (
  select 1 from public.community_posts post
  where post.id = post_id
    and (post.hidden = false or post.author_id = auth.uid() or (select public.is_moderator()))
));

drop policy if exists community_post_media_delete on public.community_post_media;
create policy community_post_media_delete
on public.community_post_media for delete to authenticated
using (exists (
  select 1 from public.community_posts post
  where post.id = post_id
    and (post.author_id = auth.uid() or (select public.is_moderator()))
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-post-media',
  'community-post-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "community post media is readable" on storage.objects;
create policy "community post media is readable"
on storage.objects for select to anon, authenticated
using (bucket_id = 'community-post-media');

drop policy if exists "authors upload community post media" on storage.objects;
create policy "authors upload community post media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'community-post-media'
  and exists (
    select 1 from public.community_posts post
    where post.id::text = (storage.foldername(name))[1]
      and post.author_id = auth.uid()
  )
);

drop policy if exists "authors delete community post media" on storage.objects;
create policy "authors delete community post media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'community-post-media'
  and (
    exists (
      select 1 from public.community_posts post
      where post.id::text = (storage.foldername(name))[1]
        and post.author_id = auth.uid()
    )
    or (select public.is_moderator())
  )
);

create or replace function public.community_post_media_paths(p_post_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', media.id, 'path', media.storage_path)
      order by media.position, media.created_at
    ),
    '[]'::jsonb
  )
  from public.community_post_media media
  where media.post_id = p_post_id;
$$;

create or replace function public.attach_community_post_media(
  p_post_id uuid,
  p_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := auth.uid();
  existing_count integer;
  media_path text;
  media_position smallint;
begin
  if user_id is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.community_posts post
    where post.id = p_post_id and post.author_id = user_id
  ) then raise exception 'discussion not found'; end if;

  select count(*) into existing_count
  from public.community_post_media where post_id = p_post_id;
  if existing_count + coalesce(array_length(p_paths, 1), 0) > 4 then
    raise exception 'a post may have at most 4 photos';
  end if;

  media_position := existing_count;
  foreach media_path in array coalesce(p_paths, array[]::text[]) loop
    if split_part(media_path, '/', 1) <> p_post_id::text then
      raise exception 'media path does not belong to this discussion';
    end if;
    insert into public.community_post_media (post_id, storage_path, position)
    values (p_post_id, media_path, media_position)
    on conflict (storage_path) do nothing;
    media_position := media_position + 1;
  end loop;

  return public.community_post_media_paths(p_post_id);
end;
$$;

-- Replace the six-argument writer with a seven-argument external-project-aware writer.
drop function if exists public.create_community_post(text, text, text, text, text, text);

create function public.create_community_post(
  p_title text,
  p_body text,
  p_topic text,
  p_project_id text,
  p_project_name text,
  p_kind text,
  p_area_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid := auth.uid();
  v_author_name text;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_project_id text := nullif(btrim(coalesce(p_project_id, '')), '');
  v_project_name text := nullif(btrim(coalesce(p_project_name, '')), '');
  v_area text := nullif(btrim(coalesce(p_area_label, '')), '');
  v_topic public.community_topic;
  v_kind public.community_post_kind;
  v_post_id uuid;
  v_within_quota boolean;
begin
  if v_author_id is null then raise exception 'authentication required'; end if;
  select profile.display_name into v_author_name
  from public.profiles profile where profile.id = v_author_id;
  if v_author_name is null then raise exception 'profile not found'; end if;
  if char_length(v_title) < 8 or char_length(v_title) > 160 then
    raise exception 'title must be between 8 and 160 characters';
  end if;
  if char_length(v_body) > 4000 then raise exception 'body must be 4000 characters or fewer'; end if;
  if v_area is not null and char_length(v_area) > 120 then
    raise exception 'area must be 120 characters or fewer';
  end if;

  begin v_topic := coalesce(p_topic, 'infrastructure')::public.community_topic;
  exception when invalid_text_representation then raise exception 'unknown topic'; end;
  begin v_kind := coalesce(p_kind, 'discussion')::public.community_post_kind;
  exception when invalid_text_representation then raise exception 'unknown post kind'; end;

  if v_project_id is not null and v_project_name is null then
    select project.name into v_project_name
    from public.projects project where project.id = v_project_id;
  end if;
  if v_project_id is not null
     and (v_project_name is null or char_length(v_project_name) > 300) then
    raise exception 'related project name is required and must be 300 characters or fewer';
  end if;

  select public.consume_community_quota(20, 3600) into v_within_quota;
  if not v_within_quota then
    raise exception 'community_rate_limit_exceeded: you have reached the posting limit. Please try again later.'
      using errcode = 'P0001';
  end if;

  insert into public.community_posts
    (author_id, author_name, title, body, topic, project_id, project_name, kind, area_label)
  values
    (v_author_id, v_author_name, v_title, v_body, v_topic, v_project_id,
     v_project_name, v_kind, v_area)
  returning id into v_post_id;

  insert into public.community_post_votes (post_id, user_id, value)
  values (v_post_id, v_author_id, 1);

  return public.community_post(v_post_id);
end;
$$;

drop function if exists public.community_post(uuid);
create function public.community_post(p_post_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', post.id,
    'kind', post.kind,
    'title', post.title,
    'body', post.body,
    'area_label', post.area_label,
    'author_name', post.author_name,
    'author', public.community_author(post.author_id),
    'created_at', post.created_at,
    'topic', post.topic,
    'project_id', post.project_id,
    'project_name', coalesce(post.project_name, public.community_project_name(post.project_id), post.project_id),
    'media', public.community_post_media_paths(post.id),
    'score', public.community_post_score(post.id),
    'comment_count', (
      select count(*) from public.community_comments comment
      where comment.post_id = post.id and comment.hidden = false
    ),
    'viewer_vote', public.community_post_viewer_vote(post.id)
  )
  from public.community_posts post
  where post.id = p_post_id;
$$;

drop function if exists public.community_feed(text, text, text, text, text, text, integer, integer);
create function public.community_feed(
  p_sort text default 'popular',
  p_topic text default null,
  p_search text default null,
  p_project_id text default null,
  p_kind text default null,
  p_author text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select
      post.id,
      post.kind,
      post.title,
      post.body,
      post.area_label,
      post.author_name,
      public.community_author(post.author_id) as author,
      post.created_at,
      post.topic,
      post.project_id,
      coalesce(post.project_name, public.community_project_name(post.project_id), post.project_id) as project_name,
      public.community_post_media_paths(post.id) as media,
      public.community_post_score(post.id) as score,
      (
        select count(*) from public.community_comments comment
        where comment.post_id = post.id and comment.hidden = false
      ) as comment_count,
      public.community_post_viewer_vote(post.id) as viewer_vote
    from public.community_posts post
    where (p_topic is null or post.topic = p_topic::public.community_topic)
      and (p_kind is null or post.kind = p_kind::public.community_post_kind)
      and (p_project_id is null or post.project_id = p_project_id)
      and (p_author is null or post.author_id = public.community_profile_id(p_author))
      and (
        p_search is null or btrim(p_search) = ''
        or post.title ilike '%' || btrim(p_search) || '%'
        or post.body ilike '%' || btrim(p_search) || '%'
        or coalesce(post.area_label, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(post.project_name, public.community_project_name(post.project_id), '')
          ilike '%' || btrim(p_search) || '%'
      )
  ), ranked as (
    select filtered.*,
      row_number() over (
        order by
          case when p_sort = 'new' then filtered.created_at end desc nulls last,
          case when p_sort = 'discussed' then filtered.comment_count end desc nulls last,
          case when p_sort not in ('new', 'discussed') then filtered.score end desc nulls last,
          filtered.created_at desc
      ) as rank
    from filtered
  )
  select coalesce(
    jsonb_agg(to_jsonb(page) order by page.rank),
    '[]'::jsonb
  )
  from (
    select * from ranked
    order by rank
    limit greatest(least(coalesce(p_limit, 50), 100), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  ) page;
$$;

create or replace function public.community_pulse(p_project_id text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with scoped as (
    select post.id, post.kind, post.topic, post.created_at
    from public.community_posts post
    where p_project_id is null or post.project_id = p_project_id
  )
  select jsonb_build_object(
    'discussions', (select count(*) from scoped where kind = 'discussion'),
    'observations', (select count(*) from scoped where kind = 'observation'),
    'photos', (
      select count(*) from public.community_post_media media
      where media.post_id in (select id from scoped)
    ),
    'comments', (
      select count(*) from public.community_comments comment
      where comment.post_id in (select id from scoped) and comment.hidden = false
    ),
    'last_activity_at', (
      select max(activity) from (
        select max(created_at) as activity from scoped
        union all
        select max(comment.created_at) from public.community_comments comment
        where comment.post_id in (select id from scoped) and comment.hidden = false
      ) latest
    ),
    'topics', coalesce((
      select jsonb_agg(
        jsonb_build_object('topic', totals.topic, 'count', totals.count)
        order by totals.count desc, totals.topic
      )
      from (select topic, count(*) as count from scoped group by topic) totals
    ), '[]'::jsonb)
  );
$$;

create or replace function public.community_project_activity(
  p_project_id text,
  p_limit integer default 5
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(activity order by activity->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'post_id', post.id,
      'kind', post.kind,
      'title', post.title,
      'body', left(post.body, 180),
      'author_name', post.author_name,
      'created_at', post.created_at,
      'photo_count', (
        select count(*) from public.community_post_media media where media.post_id = post.id
      )
    ) as activity
    from public.community_posts post
    where post.project_id = p_project_id
    order by post.created_at desc
    limit greatest(least(coalesce(p_limit, 5), 20), 1)
  ) recent;
$$;

grant select on table public.profiles to authenticated;
grant select on table public.community_posts to anon, authenticated;
grant insert, delete, update on table public.community_posts to authenticated;
grant select on table public.community_comments to anon, authenticated;
grant select, insert, update, delete on table public.community_post_votes to authenticated;

grant select on table public.community_post_media to anon, authenticated;
grant delete on table public.community_post_media to authenticated;

revoke all on function public.community_author(uuid) from public;
grant execute on function public.community_author(uuid) to anon, authenticated;

revoke all on function public.community_profile_id(text) from public;
grant execute on function public.community_profile_id(text) to anon, authenticated;

revoke all on function public.community_post_score(uuid) from public;
grant execute on function public.community_post_score(uuid) to anon, authenticated;

revoke all on function public.community_post_viewer_vote(uuid) from public;
grant execute on function public.community_post_viewer_vote(uuid) to anon, authenticated;

revoke all on function public.community_post_media_paths(uuid) from public;
grant execute on function public.community_post_media_paths(uuid) to anon, authenticated;

revoke all on function public.attach_community_post_media(uuid, text[]) from public, anon;
grant execute on function public.attach_community_post_media(uuid, text[]) to authenticated;

revoke all on function public.create_community_post(text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.create_community_post(text, text, text, text, text, text, text)
  to authenticated;

revoke all on function public.community_post(uuid) from public;
grant execute on function public.community_post(uuid) to anon, authenticated;

revoke all on function public.community_feed(text, text, text, text, text, text, integer, integer)
  from public;
grant execute on function public.community_feed(text, text, text, text, text, text, integer, integer)
  to anon, authenticated;

revoke all on function public.community_pulse(text) from public;
grant execute on function public.community_pulse(text) to anon, authenticated;

revoke all on function public.community_project_activity(text, integer) from public;
grant execute on function public.community_project_activity(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
