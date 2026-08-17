-- Narrow public read seam for discussions explicitly linked to one project.
-- Keeps the general community feed contract stable and preserves post RLS.
create index community_posts_project_created_idx
  on public.community_posts (project_id, created_at desc)
  where project_id is not null;

-- Aggregate only the numeric score. This bypasses vote-row RLS without exposing
-- voter identities; the outer SECURITY INVOKER query still applies post RLS.
create or replace function public.community_post_score(p_post_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(v.value), 0)::integer
  from public.community_post_votes v
  where v.post_id = p_post_id;
$$;

revoke all on function public.community_post_score(uuid) from public;
grant execute on function public.community_post_score(uuid) to anon, authenticated;

create function public.community_posts_for_project(
  p_project_id text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  clean_project_id text := nullif(btrim(coalesce(p_project_id, '')), '');
  result jsonb;
begin
  if clean_project_id is null then
    raise exception 'project_id is required';
  end if;

  with scored as (
    select
      p.id,
      p.title,
      p.body,
      p.author_name,
      p.created_at,
      p.topic,
      p.project_id,
      public.community_project_name(p.project_id) as project_name,
      public.community_post_score(p.id) as score,
      (
        select count(*)
        from public.community_comments c
        where c.post_id = p.id and c.hidden = false
      ) as comment_count,
      coalesce((
        select v.value
        from public.community_post_votes v
        where v.post_id = p.id and v.user_id = auth.uid()
      ), 0) as viewer_vote
    from public.community_posts p
    where p.project_id = clean_project_id
  ), paged as (
    select *
    from scored
    order by score desc, created_at desc, id
    limit greatest(least(coalesce(p_limit, 50), 100), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(
    jsonb_agg(row_to_json(paged)::jsonb order by score desc, created_at desc, id),
    '[]'::jsonb
  )
  into result
  from paged;

  return result;
end;
$$;

revoke all on function public.community_posts_for_project(text, integer, integer)
  from public;
grant execute on function public.community_posts_for_project(text, integer, integer)
  to anon, authenticated;
