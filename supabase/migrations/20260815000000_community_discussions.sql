-- ─────────────────────────────────────────────────────────────────────────────
-- Community discussions
--
-- Resident-generated discussion about public infrastructure. This is distinct
-- from `reports` (a Community observation about one specific Project) and from
-- `projects` (Official-source records):
--
--   projects          → official government record
--   reports           → a resident's dated account of something observed
--   community_posts   → open resident discussion, optionally *referencing* a
--                       project, and never an official finding
--
-- A post's optional project_id is a reference for context only. Nothing here
-- alters an Official-source record or asserts a verified finding.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.community_topic AS ENUM (
  'infrastructure',
  'roads',
  'bridges',
  'flood-control',
  'transportation',
  'public-buildings',
  'local-government',
  'other'
);

CREATE TABLE public.community_posts (
  id          uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid                   NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text                   NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 80),
  title       text                   NOT NULL CHECK (char_length(trim(title)) BETWEEN 8 AND 160),
  body        text                   NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  topic       public.community_topic NOT NULL DEFAULT 'infrastructure',
  -- Optional reference to an Official-source record. ON DELETE SET NULL keeps
  -- the discussion when a project record is removed; the discussion was never
  -- part of that record.
  project_id  text                   REFERENCES public.projects(id) ON DELETE SET NULL,
  hidden      boolean                NOT NULL DEFAULT false,
  created_at  timestamptz            NOT NULL DEFAULT now()
);

CREATE TABLE public.community_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid        NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  -- Null for a top-level comment; otherwise the parent comment.
  parent_id   uuid        REFERENCES public.community_comments(id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text        NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 80),
  body        text        NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1000),
  hidden      boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One vote per resident per post / per comment. The unique constraint is the
-- primary key, so a repeated vote updates rather than duplicating.
CREATE TABLE public.community_post_votes (
  post_id    uuid        NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  value      smallint    NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE public.community_comment_votes (
  comment_id uuid        NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  value      smallint    NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX community_posts_created_at_idx ON public.community_posts (created_at DESC);
CREATE INDEX community_posts_topic_idx      ON public.community_posts (topic, created_at DESC);
CREATE INDEX community_posts_author_id_idx  ON public.community_posts (author_id);
CREATE INDEX community_posts_project_id_idx ON public.community_posts (project_id);
CREATE INDEX community_comments_post_id_idx ON public.community_comments (post_id, created_at);
CREATE INDEX community_comments_parent_idx  ON public.community_comments (parent_id);
CREATE INDEX community_comments_author_idx  ON public.community_comments (author_id);
CREATE INDEX community_post_votes_user_idx    ON public.community_post_votes (user_id);
CREATE INDEX community_comment_votes_user_idx ON public.community_comment_votes (user_id);

ALTER TABLE public.community_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_votes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comment_votes  ENABLE ROW LEVEL SECURITY;

-- ── Posts ────────────────────────────────────────────────────────────────────
-- Discussion is readable without an account so residents can browse before
-- signing up. Hidden posts stay visible to their author and to moderators.
CREATE POLICY "community_posts_select_public"
ON public.community_posts FOR SELECT TO anon
USING (hidden = false);

CREATE POLICY "community_posts_select"
ON public.community_posts FOR SELECT TO authenticated
USING (hidden = false OR author_id = auth.uid() OR (SELECT public.is_moderator()));

CREATE POLICY "community_posts_insert"
ON public.community_posts FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid() AND hidden = false);

CREATE POLICY "community_posts_delete"
ON public.community_posts FOR DELETE TO authenticated
USING (author_id = auth.uid() OR (SELECT public.is_moderator()));

CREATE POLICY "community_posts_update"
ON public.community_posts FOR UPDATE TO authenticated
USING ((SELECT public.is_moderator()))
WITH CHECK ((SELECT public.is_moderator()));

-- ── Comments ─────────────────────────────────────────────────────────────────
CREATE POLICY "community_comments_select_public"
ON public.community_comments FOR SELECT TO anon
USING (
  hidden = false
  AND EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = post_id AND p.hidden = false
  )
);

CREATE POLICY "community_comments_select"
ON public.community_comments FOR SELECT TO authenticated
USING (
  (hidden = false OR author_id = auth.uid() OR (SELECT public.is_moderator()))
  AND EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = post_id
      AND (p.hidden = false OR p.author_id = auth.uid() OR (SELECT public.is_moderator()))
  )
);

CREATE POLICY "community_comments_insert"
ON public.community_comments FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid() AND hidden = false);

CREATE POLICY "community_comments_delete"
ON public.community_comments FOR DELETE TO authenticated
USING (author_id = auth.uid() OR (SELECT public.is_moderator()));

CREATE POLICY "community_comments_update"
ON public.community_comments FOR UPDATE TO authenticated
USING ((SELECT public.is_moderator()))
WITH CHECK ((SELECT public.is_moderator()));

-- ── Votes ────────────────────────────────────────────────────────────────────
-- Scores are public, but who voted is not: residents read only their own rows.
CREATE POLICY "community_post_votes_select_own"
ON public.community_post_votes FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "community_post_votes_insert"
ON public.community_post_votes FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_post_votes_update"
ON public.community_post_votes FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_post_votes_delete"
ON public.community_post_votes FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "community_comment_votes_select_own"
ON public.community_comment_votes FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "community_comment_votes_insert"
ON public.community_comment_votes FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_comment_votes_update"
ON public.community_comment_votes FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_comment_votes_delete"
ON public.community_comment_votes FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Read API
--
-- Scores and comment counts are aggregated server-side so the client never has
-- to read the vote tables (which would leak who voted). `viewer_vote` reports
-- only the caller's own vote.
--
-- SECURITY INVOKER: the RLS policies above remain the single source of truth
-- for what a caller may see.
-- ─────────────────────────────────────────────────────────────────────────────

-- Resolves a referenced project's name for display.
--
-- SECURITY DEFINER because `20260814010000_public_project_map.sql` revokes
-- anon's SELECT on public.projects. The reader functions below must not join
-- that table directly or anonymous browsing breaks. This exposes strictly less
-- than public.project_detail(), which anon may already call.
CREATE FUNCTION public.community_project_name(p_project_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.name FROM public.projects p WHERE p.id = p_project_id;
$$;

CREATE FUNCTION public.community_feed(
  p_sort   text DEFAULT 'popular',
  p_topic  text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH filtered AS (
    SELECT
      p.id,
      p.title,
      p.body,
      p.author_name,
      p.created_at,
      p.topic,
      p.project_id,
      public.community_project_name(p.project_id) AS project_name,
      coalesce((SELECT sum(v.value) FROM public.community_post_votes v WHERE v.post_id = p.id), 0) AS score,
      (SELECT count(*) FROM public.community_comments c WHERE c.post_id = p.id AND c.hidden = false) AS comment_count,
      coalesce((
        SELECT v.value FROM public.community_post_votes v
        WHERE v.post_id = p.id AND v.user_id = auth.uid()
      ), 0) AS viewer_vote
    FROM public.community_posts p
    WHERE
      (p_topic IS NULL OR p.topic = p_topic::public.community_topic)
      AND (
        p_search IS NULL OR trim(p_search) = ''
        OR p.title ILIKE '%' || trim(p_search) || '%'
        OR p.body  ILIKE '%' || trim(p_search) || '%'
        OR coalesce(public.community_project_name(p.project_id), '') ILIKE '%' || trim(p_search) || '%'
      )
  )
  SELECT coalesce(
    jsonb_agg(row_to_json(ordered)::jsonb ORDER BY ordered.rank),
    '[]'::jsonb
  )
  FROM (
    SELECT
      f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN p_sort = 'new'       THEN f.created_at    END DESC NULLS LAST,
          CASE WHEN p_sort = 'discussed' THEN f.comment_count END DESC NULLS LAST,
          CASE WHEN p_sort NOT IN ('new', 'discussed') THEN f.score END DESC NULLS LAST,
          f.created_at DESC
      ) AS rank
    FROM filtered f
    ORDER BY rank
    LIMIT greatest(least(coalesce(p_limit, 50), 100), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  ) ordered;
$$;

CREATE FUNCTION public.community_post(p_post_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'body', p.body,
    'author_name', p.author_name,
    'created_at', p.created_at,
    'topic', p.topic,
    'project_id', p.project_id,
    'project_name', public.community_project_name(p.project_id),
    'score', coalesce((SELECT sum(v.value) FROM public.community_post_votes v WHERE v.post_id = p.id), 0),
    'comment_count', (SELECT count(*) FROM public.community_comments c WHERE c.post_id = p.id AND c.hidden = false),
    'viewer_vote', coalesce((
      SELECT v.value FROM public.community_post_votes v
      WHERE v.post_id = p.id AND v.user_id = auth.uid()
    ), 0)
  )
  FROM public.community_posts p
  WHERE p.id = p_post_id;
$$;

CREATE FUNCTION public.community_comments_for_post(p_post_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'post_id', c.post_id,
        'parent_id', c.parent_id,
        'author_name', c.author_name,
        'body', c.body,
        'created_at', c.created_at,
        'score', coalesce((
          SELECT sum(v.value) FROM public.community_comment_votes v WHERE v.comment_id = c.id
        ), 0),
        'viewer_vote', coalesce((
          SELECT v.value FROM public.community_comment_votes v
          WHERE v.comment_id = c.id AND v.user_id = auth.uid()
        ), 0)
      ) ORDER BY c.created_at
    ),
    '[]'::jsonb
  )
  FROM public.community_comments c
  WHERE c.post_id = p_post_id;
$$;

-- Projects a resident can relate a discussion to.
CREATE FUNCTION public.community_project_options(p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.name),
    '[]'::jsonb
  )
  FROM (
    SELECT p.id, p.name
    FROM public.projects p
    WHERE p_search IS NULL OR trim(p_search) = ''
       OR p.name ILIKE '%' || trim(p_search) || '%'
    ORDER BY p.name
    LIMIT 20
  ) o;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Write API
--
-- Rate limits mirror the report/scan pattern in earlier migrations: an atomic
-- upsert against a dedicated state table, consumed only after validation so
-- rejected input is free, with moderators exempt.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.community_rate_limits (
  user_id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count     integer     NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE public.community_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: reached only through the SECURITY DEFINER functions below.

CREATE FUNCTION public.consume_community_quota(
  max_requests   integer DEFAULT 20,
  window_seconds integer DEFAULT 3600
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_moderator() THEN
    RETURN true;
  END IF;

  INSERT INTO public.community_rate_limits (user_id, window_started_at, request_count)
  VALUES (auth.uid(), now(), 1)
  ON CONFLICT (user_id) DO UPDATE SET
    window_started_at = CASE
      WHEN public.community_rate_limits.window_started_at
           <= now() - make_interval(secs => greatest(window_seconds, 1))
      THEN now()
      ELSE public.community_rate_limits.window_started_at
    END,
    request_count = CASE
      WHEN public.community_rate_limits.window_started_at
           <= now() - make_interval(secs => greatest(window_seconds, 1))
      THEN 1
      ELSE public.community_rate_limits.request_count + 1
    END
  RETURNING request_count INTO current_count;

  RETURN current_count <= greatest(max_requests, 1);
END;
$$;

CREATE FUNCTION public.create_community_post(
  p_title      text,
  p_body       text DEFAULT '',
  p_topic      text DEFAULT 'infrastructure',
  p_project_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author_id   uuid := auth.uid();
  v_author_name text;
  v_title       text := trim(coalesce(p_title, ''));
  v_body        text := trim(coalesce(p_body, ''));
  v_topic       public.community_topic;
  v_project_id  text := nullif(trim(coalesce(p_project_id, '')), '');
  v_post_id     uuid;
  v_within      boolean;
BEGIN
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT display_name INTO v_author_name
  FROM public.profiles WHERE id = v_author_id;

  IF v_author_name IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF char_length(v_title) < 8 OR char_length(v_title) > 160 THEN
    RAISE EXCEPTION 'title must be between 8 and 160 characters';
  END IF;

  IF char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'body must be 4000 characters or fewer';
  END IF;

  BEGIN
    v_topic := coalesce(p_topic, 'infrastructure')::public.community_topic;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'unknown topic';
  END;

  IF v_project_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id) THEN
    RAISE EXCEPTION 'related project not found';
  END IF;

  SELECT public.consume_community_quota(20, 3600) INTO v_within;
  IF NOT v_within THEN
    RAISE EXCEPTION 'community_rate_limit_exceeded: you have reached the posting limit. Please try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.community_posts (author_id, author_name, title, body, topic, project_id)
  VALUES (v_author_id, v_author_name, v_title, v_body, v_topic, v_project_id)
  RETURNING id INTO v_post_id;

  -- A resident's own post starts as their upvote, matching the vote they would
  -- otherwise cast on it themselves.
  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post_id, v_author_id, 1);

  RETURN public.community_post(v_post_id);
END;
$$;

CREATE FUNCTION public.create_community_comment(
  p_post_id   uuid,
  p_body      text,
  p_parent_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author_id   uuid := auth.uid();
  v_author_name text;
  v_body        text := trim(coalesce(p_body, ''));
  v_comment_id  uuid;
  v_within      boolean;
  v_result      jsonb;
BEGIN
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT display_name INTO v_author_name
  FROM public.profiles WHERE id = v_author_id;

  IF v_author_name IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF char_length(v_body) < 1 THEN
    RAISE EXCEPTION 'comment cannot be empty';
  END IF;
  IF char_length(v_body) > 1000 THEN
    RAISE EXCEPTION 'comment exceeds 1000 characters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = p_post_id
      AND (p.hidden = false OR p.author_id = v_author_id OR public.is_moderator())
  ) THEN
    RAISE EXCEPTION 'discussion not found or not accessible';
  END IF;

  -- A reply must belong to the same discussion as its parent.
  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.community_comments c
    WHERE c.id = p_parent_id AND c.post_id = p_post_id
  ) THEN
    RAISE EXCEPTION 'parent comment not found in this discussion';
  END IF;

  SELECT public.consume_community_quota(20, 3600) INTO v_within;
  IF NOT v_within THEN
    RAISE EXCEPTION 'community_rate_limit_exceeded: you have reached the posting limit. Please try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.community_comments (post_id, parent_id, author_id, author_name, body)
  VALUES (p_post_id, p_parent_id, v_author_id, v_author_name, v_body)
  RETURNING id INTO v_comment_id;

  INSERT INTO public.community_comment_votes (comment_id, user_id, value)
  VALUES (v_comment_id, v_author_id, 1);

  SELECT jsonb_build_object(
    'id', c.id,
    'post_id', c.post_id,
    'parent_id', c.parent_id,
    'author_name', c.author_name,
    'body', c.body,
    'created_at', c.created_at,
    'score', 1,
    'viewer_vote', 1
  ) INTO v_result
  FROM public.community_comments c WHERE c.id = v_comment_id;

  RETURN v_result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Voting
--
-- Pressing the active direction clears the vote; pressing the other direction
-- replaces it. The new score and the caller's vote are returned together so the
-- client can reconcile its optimistic update in one round trip.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.vote_community_post(
  p_post_id   uuid,
  p_direction smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current smallint;
  v_next    smallint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'vote direction must be -1 or 1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE id = p_post_id) THEN
    RAISE EXCEPTION 'discussion not found';
  END IF;

  SELECT value INTO v_current
  FROM public.community_post_votes
  WHERE post_id = p_post_id AND user_id = v_user_id;

  v_next := CASE WHEN coalesce(v_current, 0) = p_direction THEN 0 ELSE p_direction END;

  IF v_next = 0 THEN
    DELETE FROM public.community_post_votes
    WHERE post_id = p_post_id AND user_id = v_user_id;
  ELSE
    INSERT INTO public.community_post_votes (post_id, user_id, value)
    VALUES (p_post_id, v_user_id, v_next)
    ON CONFLICT (post_id, user_id) DO UPDATE SET value = excluded.value;
  END IF;

  RETURN jsonb_build_object(
    'score', coalesce((
      SELECT sum(value) FROM public.community_post_votes WHERE post_id = p_post_id
    ), 0),
    'viewer_vote', v_next
  );
END;
$$;

CREATE FUNCTION public.vote_community_comment(
  p_comment_id uuid,
  p_direction  smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current smallint;
  v_next    smallint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'vote direction must be -1 or 1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.community_comments WHERE id = p_comment_id) THEN
    RAISE EXCEPTION 'comment not found';
  END IF;

  SELECT value INTO v_current
  FROM public.community_comment_votes
  WHERE comment_id = p_comment_id AND user_id = v_user_id;

  v_next := CASE WHEN coalesce(v_current, 0) = p_direction THEN 0 ELSE p_direction END;

  IF v_next = 0 THEN
    DELETE FROM public.community_comment_votes
    WHERE comment_id = p_comment_id AND user_id = v_user_id;
  ELSE
    INSERT INTO public.community_comment_votes (comment_id, user_id, value)
    VALUES (p_comment_id, v_user_id, v_next)
    ON CONFLICT (comment_id, user_id) DO UPDATE SET value = excluded.value;
  END IF;

  RETURN jsonb_build_object(
    'score', coalesce((
      SELECT sum(value) FROM public.community_comment_votes WHERE comment_id = p_comment_id
    ), 0),
    'viewer_vote', v_next
  );
END;
$$;

-- Moderation: hide or restore a discussion or comment.
CREATE FUNCTION public.hide_community_post(p_post_id uuid, p_hidden boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'moderator access required';
  END IF;

  UPDATE public.community_posts SET hidden = p_hidden WHERE id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'discussion not found';
  END IF;
END;
$$;

CREATE FUNCTION public.hide_community_comment(p_comment_id uuid, p_hidden boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'moderator access required';
  END IF;

  UPDATE public.community_comments SET hidden = p_hidden WHERE id = p_comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment not found';
  END IF;
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Reading discussion is open to anonymous visitors; writing requires an account.

REVOKE ALL ON FUNCTION public.community_project_name(text) FROM public;
GRANT EXECUTE ON FUNCTION public.community_project_name(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_feed(text, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.community_feed(text, text, text, integer, integer) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_post(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_post(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_comments_for_post(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_comments_for_post(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_project_options(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.community_project_options(text) TO authenticated;

REVOKE ALL ON FUNCTION public.consume_community_quota(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_community_quota(integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.create_community_post(text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_community_post(text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_community_comment(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_community_comment(uuid, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.vote_community_post(uuid, smallint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vote_community_post(uuid, smallint) TO authenticated;

REVOKE ALL ON FUNCTION public.vote_community_comment(uuid, smallint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vote_community_comment(uuid, smallint) TO authenticated;

REVOKE ALL ON FUNCTION public.hide_community_post(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hide_community_post(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.hide_community_comment(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hide_community_comment(uuid, boolean) TO authenticated;
