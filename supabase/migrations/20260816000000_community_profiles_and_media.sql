-- ─────────────────────────────────────────────────────────────────────────────
-- Community context layer: resident profiles, post kinds, and media
--
-- Extends the community discussion tables into the CivicLens community context
-- layer. The terminology boundary established in
-- `20260815000000_community_discussions.sql` is preserved and sharpened:
--
--   projects                  → Official-source record (government data)
--   community_posts           → Resident content, optionally *referencing* a project
--     kind = 'discussion'     → open resident discussion
--     kind = 'observation'    → a resident's dated account of something seen
--   community_post_media      → resident-supplied supporting photos
--
-- Nothing here verifies, invalidates, or amends an Official-source record. A
-- post's project_id is a contextual reference only. Aggregates exposed by
-- `community_pulse` describe *discussion activity*, never project condition.
--
-- Observations carry an optional free-text `area_label` (e.g. a barangay) and
-- deliberately store no coordinates: approximate area only, so a resident's
-- exact capture point is never published.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Profiles ─────────────────────────────────────────────────────────────────
-- `profiles` already exists (id, display_name, role, created_at). Community
-- profiles add a public handle, a short bio, and an avatar pointer.

ALTER TABLE public.profiles
  ADD COLUMN username    text,
  ADD COLUMN bio         text        NOT NULL DEFAULT '' CHECK (char_length(bio) <= 280),
  ADD COLUMN avatar_path text,
  ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now();

-- Handles are lowercase, URL-safe, and reserved case-insensitively.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');

/**
 * Derives a free handle from an arbitrary seed.
 *
 * Used to backfill existing residents and to give new accounts a usable handle
 * immediately, so the profile route works before anyone edits their profile.
 */
CREATE FUNCTION public.generate_community_username(p_seed text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base      text;
  v_candidate text;
  v_suffix    integer := 0;
BEGIN
  -- Strip anything outside the handle alphabet, then pad short results so the
  -- 3-character minimum always holds.
  v_base := lower(regexp_replace(coalesce(p_seed, ''), '[^a-zA-Z0-9_]+', '', 'g'));
  v_base := left(v_base, 16);
  IF char_length(v_base) < 3 THEN
    v_base := 'resident';
  END IF;

  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_candidate) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := left(v_base, 16) || v_suffix::text;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- Backfill every existing resident before the column becomes required.
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN SELECT id, display_name FROM public.profiles WHERE username IS NULL ORDER BY created_at LOOP
    UPDATE public.profiles
    SET username = public.generate_community_username(v_row.display_name)
    WHERE id = v_row.id;
  END LOOP;
END;
$$;

ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX profiles_username_key ON public.profiles (username);

-- New accounts get a display name and a handle in the same transaction.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_name text;
BEGIN
  v_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    split_part(new.email, '@', 1),
    'Resident'
  );

  INSERT INTO public.profiles (id, display_name, username)
  VALUES (new.id, v_display_name, public.generate_community_username(v_display_name));

  RETURN new;
END;
$$;

-- Residents maintain their own profile. `role` stays out of reach: the policy
-- cannot restrict columns, so the update path is the RPC below and this policy
-- exists for the owner-only guarantee.
CREATE POLICY "residents read their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

-- ── Post kinds and observation context ───────────────────────────────────────

CREATE TYPE public.community_post_kind AS ENUM ('discussion', 'observation');

ALTER TABLE public.community_posts
  ADD COLUMN kind        public.community_post_kind NOT NULL DEFAULT 'discussion',
  -- Approximate area only (e.g. "Barangay Pajac"). Never a precise point.
  ADD COLUMN area_label  text CHECK (area_label IS NULL OR char_length(trim(area_label)) BETWEEN 2 AND 120),
  ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.community_comments
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX community_posts_kind_idx ON public.community_posts (kind, created_at DESC);

-- ── Media ────────────────────────────────────────────────────────────────────
-- Rows point at Storage objects; no binary data is stored in these columns.

CREATE TABLE public.community_post_media (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid        NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  storage_path text        NOT NULL UNIQUE CHECK (char_length(storage_path) BETWEEN 3 AND 400),
  position     smallint    NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 9),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.community_comment_media (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id   uuid        NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  storage_path text        NOT NULL UNIQUE CHECK (char_length(storage_path) BETWEEN 3 AND 400),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_post_media_post_idx       ON public.community_post_media (post_id, position);
CREATE INDEX community_comment_media_comment_idx ON public.community_comment_media (comment_id);

ALTER TABLE public.community_post_media    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comment_media ENABLE ROW LEVEL SECURITY;

-- Media visibility follows its parent exactly: attached to a readable post, it
-- is readable; attached to a hidden one, it is not.
CREATE POLICY "community_post_media_select_public"
ON public.community_post_media FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM public.community_posts p WHERE p.id = post_id AND p.hidden = false
));

CREATE POLICY "community_post_media_select"
ON public.community_post_media FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.community_posts p
  WHERE p.id = post_id
    AND (p.hidden = false OR p.author_id = auth.uid() OR (SELECT public.is_moderator()))
));

CREATE POLICY "community_post_media_delete"
ON public.community_post_media FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.community_posts p
  WHERE p.id = post_id AND (p.author_id = auth.uid() OR (SELECT public.is_moderator()))
));

CREATE POLICY "community_comment_media_select_public"
ON public.community_comment_media FOR SELECT TO anon
USING (EXISTS (
  SELECT 1
  FROM public.community_comments c
  JOIN public.community_posts p ON p.id = c.post_id
  WHERE c.id = comment_id AND c.hidden = false AND p.hidden = false
));

CREATE POLICY "community_comment_media_select"
ON public.community_comment_media FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.community_comments c
  JOIN public.community_posts p ON p.id = c.post_id
  WHERE c.id = comment_id
    AND (c.hidden = false OR c.author_id = auth.uid() OR (SELECT public.is_moderator()))
    AND (p.hidden = false OR p.author_id = auth.uid() OR (SELECT public.is_moderator()))
));

CREATE POLICY "community_comment_media_delete"
ON public.community_comment_media FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.community_comments c
  WHERE c.id = comment_id AND (c.author_id = auth.uid() OR (SELECT public.is_moderator()))
));

-- ── Storage buckets ──────────────────────────────────────────────────────────
-- Community media and avatars are intentionally public: guests browse
-- discussion, so the images in it must render without a session. Report photos
-- (`report-photos`, created in the initial schema) stay private and are
-- unaffected. Object paths are uuid-derived, and write access is owner-only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars',                'avatars',                true, 2097152, ARRAY['image/jpeg','image/png','image/webp']),
  ('community-post-media',   'community-post-media',   true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('community-comment-media','community-comment-media',true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Avatars live under the owner's folder: avatars/<user-id>/<file>
CREATE POLICY "residents upload their avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- A SELECT policy is required for more than reading: the Storage API checks for
-- an existing object when a client uploads with `upsert`, and without this an
-- avatar replacement fails as an RLS violation. These three buckets are public,
-- so this exposes nothing that the public URL does not already serve. The
-- private `report-photos` bucket keeps its owner-only SELECT policy.
CREATE POLICY "community media is readable"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id IN ('avatars', 'community-post-media', 'community-comment-media'));

CREATE POLICY "residents replace their avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "residents delete their avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR (SELECT public.is_moderator()))
);

-- Post media lives under its post: community-post-media/<post-id>/<file>
CREATE POLICY "authors upload community post media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'community-post-media'
  AND EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id::text = (storage.foldername(name))[1] AND p.author_id = auth.uid()
  )
);

CREATE POLICY "authors delete community post media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'community-post-media'
  AND (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id::text = (storage.foldername(name))[1] AND p.author_id = auth.uid()
    )
    OR (SELECT public.is_moderator())
  )
);

CREATE POLICY "authors upload community comment media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'community-comment-media'
  AND EXISTS (
    SELECT 1 FROM public.community_comments c
    WHERE c.id::text = (storage.foldername(name))[1] AND c.author_id = auth.uid()
  )
);

CREATE POLICY "authors delete community comment media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'community-comment-media'
  AND (
    EXISTS (
      SELECT 1 FROM public.community_comments c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.author_id = auth.uid()
    )
    OR (SELECT public.is_moderator())
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Read API
--
-- The reader functions stay SECURITY INVOKER so the RLS policies above remain
-- the single source of truth. Two SECURITY DEFINER helpers exist because anon
-- has no SELECT on `projects` (revoked in 20260814010000) or on `profiles`:
-- readers must not join those tables directly or anonymous browsing breaks.
-- ─────────────────────────────────────────────────────────────────────────────

/** Public-facing author identity for a resident. Exposes no role or email. */
CREATE FUNCTION public.community_author(p_author_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'name', pr.display_name,
    'username', pr.username,
    'avatar_path', pr.avatar_path
  )
  FROM public.profiles pr
  WHERE pr.id = p_author_id;
$$;

/** Resolves a handle to a resident id. Definer: anon cannot read `profiles`. */
CREATE FUNCTION public.community_profile_id(p_username text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pr.id FROM public.profiles pr
  WHERE pr.username = lower(trim(coalesce(p_username, '')));
$$;

-- ── Vote aggregates ──────────────────────────────────────────────────────────
-- Vote rows are readable only by their owner, so a SECURITY INVOKER reader can
-- only ever sum the caller's own vote — scores would read as 0 for guests and
-- as ±1 for residents. These SECURITY DEFINER helpers return the total without
-- revealing who voted, and resolve the caller's own vote via auth.uid() only.

CREATE FUNCTION public.community_post_score(p_post_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(v.value), 0)::integer
  FROM public.community_post_votes v
  WHERE v.post_id = p_post_id;
$$;

CREATE FUNCTION public.community_post_viewer_vote(p_post_id uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT v.value FROM public.community_post_votes v
    WHERE v.post_id = p_post_id AND v.user_id = auth.uid()
  ), 0)::smallint;
$$;

CREATE FUNCTION public.community_comment_score(p_comment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(v.value), 0)::integer
  FROM public.community_comment_votes v
  WHERE v.comment_id = p_comment_id;
$$;

CREATE FUNCTION public.community_comment_viewer_vote(p_comment_id uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT v.value FROM public.community_comment_votes v
    WHERE v.comment_id = p_comment_id AND v.user_id = auth.uid()
  ), 0)::smallint;
$$;

/** Ordered media paths for a post. */
CREATE FUNCTION public.community_post_media_paths(p_post_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('id', m.id, 'path', m.storage_path)
              ORDER BY m.position, m.created_at),
    '[]'::jsonb
  )
  FROM public.community_post_media m
  WHERE m.post_id = p_post_id;
$$;

CREATE FUNCTION public.community_comment_media_paths(p_comment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('id', m.id, 'path', m.storage_path) ORDER BY m.created_at),
    '[]'::jsonb
  )
  FROM public.community_comment_media m
  WHERE m.comment_id = p_comment_id;
$$;

-- The feed, post, and comment readers gain author identity, kind, area, and
-- media. Their signatures change, so the previous versions are dropped rather
-- than overloaded: PostgREST resolves RPCs by argument name and would find two
-- candidates ambiguous.
DROP FUNCTION public.create_community_post(text, text, text, text);
DROP FUNCTION public.community_feed(text, text, text, integer, integer);
DROP FUNCTION public.community_post(uuid);
DROP FUNCTION public.community_comments_for_post(uuid);

CREATE FUNCTION public.community_post(p_post_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'kind', p.kind,
    'title', p.title,
    'body', p.body,
    'area_label', p.area_label,
    'author_name', p.author_name,
    'author', public.community_author(p.author_id),
    'created_at', p.created_at,
    'topic', p.topic,
    'project_id', p.project_id,
    'project_name', public.community_project_name(p.project_id),
    'media', public.community_post_media_paths(p.id),
    'score', public.community_post_score(p.id),
    'comment_count', (SELECT count(*) FROM public.community_comments c WHERE c.post_id = p.id AND c.hidden = false),
    'viewer_vote', public.community_post_viewer_vote(p.id)
  )
  FROM public.community_posts p
  WHERE p.id = p_post_id;
$$;

CREATE FUNCTION public.community_feed(
  p_sort       text    DEFAULT 'popular',
  p_topic      text    DEFAULT NULL,
  p_search     text    DEFAULT NULL,
  p_project_id text    DEFAULT NULL,
  p_kind       text    DEFAULT NULL,
  p_author     text    DEFAULT NULL,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
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
      p.kind,
      p.title,
      p.body,
      p.area_label,
      p.author_name,
      public.community_author(p.author_id) AS author,
      p.created_at,
      p.topic,
      p.project_id,
      public.community_project_name(p.project_id) AS project_name,
      public.community_post_media_paths(p.id) AS media,
      public.community_post_score(p.id) AS score,
      (SELECT count(*) FROM public.community_comments c WHERE c.post_id = p.id AND c.hidden = false) AS comment_count,
      public.community_post_viewer_vote(p.id) AS viewer_vote
    FROM public.community_posts p
    WHERE
      (p_topic IS NULL OR p.topic = p_topic::public.community_topic)
      AND (p_kind IS NULL OR p.kind = p_kind::public.community_post_kind)
      AND (p_project_id IS NULL OR p.project_id = p_project_id)
      AND (
        p_author IS NULL
        OR p.author_id = public.community_profile_id(p_author)
      )
      AND (
        p_search IS NULL OR trim(p_search) = ''
        OR p.title ILIKE '%' || trim(p_search) || '%'
        OR p.body  ILIKE '%' || trim(p_search) || '%'
        OR coalesce(p.area_label, '') ILIKE '%' || trim(p_search) || '%'
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
        'author', public.community_author(c.author_id),
        'body', c.body,
        'created_at', c.created_at,
        'media', public.community_comment_media_paths(c.id),
        'score', public.community_comment_score(c.id),
        'viewer_vote', public.community_comment_viewer_vote(c.id)
      ) ORDER BY c.created_at
    ),
    '[]'::jsonb
  )
  FROM public.community_comments c
  WHERE c.post_id = p_post_id;
$$;

/**
 * A resident's public profile plus their community activity counts.
 *
 * SECURITY DEFINER so guests can view a public profile without SELECT on
 * `profiles`. Only the fields a resident chose to publish are returned.
 */
CREATE FUNCTION public.community_profile(p_username text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'username', pr.username,
    'display_name', pr.display_name,
    'bio', pr.bio,
    'avatar_path', pr.avatar_path,
    'joined_at', pr.created_at,
    'post_count', (
      SELECT count(*) FROM public.community_posts p
      WHERE p.author_id = pr.id AND p.hidden = false AND p.kind = 'discussion'
    ),
    'observation_count', (
      SELECT count(*) FROM public.community_posts p
      WHERE p.author_id = pr.id AND p.hidden = false AND p.kind = 'observation'
    ),
    'comment_count', (
      SELECT count(*) FROM public.community_comments c
      WHERE c.author_id = pr.id AND c.hidden = false
    )
  )
  FROM public.profiles pr
  WHERE pr.username = lower(trim(p_username));
$$;

/** True when a handle is free (or already belongs to the caller). */
CREATE FUNCTION public.community_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT lower(trim(coalesce(p_username, ''))) ~ '^[a-z0-9_]{3,20}$'
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles pr
       WHERE pr.username = lower(trim(p_username)) AND pr.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     );
$$;

/**
 * Aggregate community activity, optionally scoped to one Official-source record.
 *
 * These are counts of *resident discussion*, not findings about a project. The
 * UI is required to label them as discussion activity.
 */
CREATE FUNCTION public.community_pulse(p_project_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH scoped AS (
    SELECT p.id, p.kind, p.topic, p.created_at
    FROM public.community_posts p
    WHERE p_project_id IS NULL OR p.project_id = p_project_id
  )
  SELECT jsonb_build_object(
    'discussions', (SELECT count(*) FROM scoped WHERE kind = 'discussion'),
    'observations', (SELECT count(*) FROM scoped WHERE kind = 'observation'),
    'photos', (
      SELECT count(*) FROM public.community_post_media m
      WHERE m.post_id IN (SELECT id FROM scoped)
    ),
    'comments', (
      SELECT count(*) FROM public.community_comments c
      WHERE c.post_id IN (SELECT id FROM scoped) AND c.hidden = false
    ),
    'last_activity_at', (
      SELECT max(activity) FROM (
        SELECT max(created_at) AS activity FROM scoped
        UNION ALL
        SELECT max(c.created_at) FROM public.community_comments c
        WHERE c.post_id IN (SELECT id FROM scoped) AND c.hidden = false
      ) latest
    ),
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object('topic', t.topic, 'count', t.count)
                       ORDER BY t.count DESC, t.topic)
      FROM (
        SELECT topic, count(*) AS count FROM scoped GROUP BY topic
      ) t
    ), '[]'::jsonb)
  );
$$;

/**
 * Recent community activity for one project, newest first.
 *
 * Powers the community context shown alongside an Official-source record.
 */
CREATE FUNCTION public.community_project_activity(
  p_project_id text,
  p_limit      integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(a ORDER BY a->>'created_at' DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'post_id', p.id,
      'kind', p.kind,
      'title', p.title,
      'body', left(p.body, 180),
      'author_name', p.author_name,
      'created_at', p.created_at,
      'photo_count', (
        SELECT count(*) FROM public.community_post_media m WHERE m.post_id = p.id
      )
    ) AS a
    FROM public.community_posts p
    WHERE p.project_id = p_project_id
    ORDER BY p.created_at DESC
    LIMIT greatest(least(coalesce(p_limit, 5), 20), 1)
  ) recent;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Write API
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.create_community_post(
  p_title      text,
  p_body       text DEFAULT '',
  p_topic      text DEFAULT 'infrastructure',
  p_project_id text DEFAULT NULL,
  p_kind       text DEFAULT 'discussion',
  p_area_label text DEFAULT NULL
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
  v_kind        public.community_post_kind;
  v_project_id  text := nullif(trim(coalesce(p_project_id, '')), '');
  v_area        text := nullif(trim(coalesce(p_area_label, '')), '');
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

  BEGIN
    v_kind := coalesce(p_kind, 'discussion')::public.community_post_kind;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'unknown post kind';
  END;

  IF v_area IS NOT NULL AND char_length(v_area) > 120 THEN
    RAISE EXCEPTION 'area must be 120 characters or fewer';
  END IF;

  IF v_project_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id) THEN
    RAISE EXCEPTION 'related project not found';
  END IF;

  SELECT public.consume_community_quota(20, 3600) INTO v_within;
  IF NOT v_within THEN
    RAISE EXCEPTION 'community_rate_limit_exceeded: you have reached the posting limit. Please try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label)
  VALUES
    (v_author_id, v_author_name, v_title, v_body, v_topic, v_project_id, v_kind, v_area)
  RETURNING id INTO v_post_id;

  -- A resident's own post starts as their upvote, matching the vote they would
  -- otherwise cast on it themselves.
  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post_id, v_author_id, 1);

  RETURN public.community_post(v_post_id);
END;
$$;

/**
 * Records already-uploaded post photos.
 *
 * Storage upload happens client-side under `community-post-media/<post-id>/`,
 * which the storage policy restricts to the post's author. This registers the
 * resulting paths so readers can find them, and is idempotent per path.
 */
CREATE FUNCTION public.attach_community_post_media(
  p_post_id uuid,
  p_paths   text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_existing integer;
  v_path     text;
  v_index    smallint := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = p_post_id AND p.author_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'discussion not found';
  END IF;

  SELECT count(*) INTO v_existing
  FROM public.community_post_media WHERE post_id = p_post_id;

  IF v_existing + coalesce(array_length(p_paths, 1), 0) > 4 THEN
    RAISE EXCEPTION 'a post may have at most 4 photos';
  END IF;

  v_index := v_existing;
  FOREACH v_path IN ARRAY coalesce(p_paths, ARRAY[]::text[]) LOOP
    -- The path must sit under this post's folder, so a caller cannot register
    -- an object belonging to someone else's post.
    IF split_part(v_path, '/', 1) <> p_post_id::text THEN
      RAISE EXCEPTION 'media path does not belong to this discussion';
    END IF;

    INSERT INTO public.community_post_media (post_id, storage_path, position)
    VALUES (p_post_id, v_path, v_index)
    ON CONFLICT (storage_path) DO NOTHING;

    v_index := v_index + 1;
  END LOOP;

  RETURN public.community_post_media_paths(p_post_id);
END;
$$;

CREATE FUNCTION public.attach_community_comment_media(
  p_comment_id uuid,
  p_paths      text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_path    text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_comments c
    WHERE c.id = p_comment_id AND c.author_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'comment not found';
  END IF;

  IF (SELECT count(*) FROM public.community_comment_media WHERE comment_id = p_comment_id)
     + coalesce(array_length(p_paths, 1), 0) > 1 THEN
    RAISE EXCEPTION 'a comment may have at most 1 photo';
  END IF;

  FOREACH v_path IN ARRAY coalesce(p_paths, ARRAY[]::text[]) LOOP
    IF split_part(v_path, '/', 1) <> p_comment_id::text THEN
      RAISE EXCEPTION 'media path does not belong to this comment';
    END IF;

    INSERT INTO public.community_comment_media (comment_id, storage_path)
    VALUES (p_comment_id, v_path)
    ON CONFLICT (storage_path) DO NOTHING;
  END LOOP;

  RETURN public.community_comment_media_paths(p_comment_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Voting
--
-- The vote functions returned a score summed under SECURITY INVOKER, which
-- could only see the caller's own vote row. They are replaced here to return
-- the aggregate helper's total instead, so the optimistic client update
-- reconciles against the real score.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.vote_community_post(
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
    'score', public.community_post_score(p_post_id),
    'viewer_vote', v_next
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.vote_community_comment(
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
    'score', public.community_comment_score(p_comment_id),
    'viewer_vote', v_next
  );
END;
$$;

/**
 * Updates the caller's own profile.
 *
 * SECURITY DEFINER with an explicit column list so `role` can never be changed
 * through this path, whatever the caller sends.
 */
CREATE FUNCTION public.update_community_profile(
  p_display_name text DEFAULT NULL,
  p_username     text DEFAULT NULL,
  p_bio          text DEFAULT NULL,
  p_avatar_path  text DEFAULT NULL,
  p_clear_avatar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_name     text := nullif(trim(coalesce(p_display_name, '')), '');
  v_username text := nullif(lower(trim(coalesce(p_username, ''))), '');
  v_bio      text := trim(coalesce(p_bio, ''));
  v_avatar   text := nullif(trim(coalesce(p_avatar_path, '')), '');
  v_result   text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF v_name IS NOT NULL AND char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'display name must be 80 characters or fewer';
  END IF;

  IF char_length(v_bio) > 280 THEN
    RAISE EXCEPTION 'bio must be 280 characters or fewer';
  END IF;

  IF v_username IS NOT NULL THEN
    IF v_username !~ '^[a-z0-9_]{3,20}$' THEN
      RAISE EXCEPTION 'username must be 3-20 characters using letters, numbers, or underscore';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.profiles WHERE username = v_username AND id <> v_user_id
    ) THEN
      RAISE EXCEPTION 'username_taken: that username is already in use.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_avatar IS NOT NULL AND split_part(v_avatar, '/', 1) <> v_user_id::text THEN
    RAISE EXCEPTION 'avatar path does not belong to this resident';
  END IF;

  UPDATE public.profiles SET
    display_name = coalesce(v_name, display_name),
    username     = coalesce(v_username, username),
    bio          = CASE WHEN p_bio IS NULL THEN bio ELSE v_bio END,
    avatar_path  = CASE
                     WHEN p_clear_avatar THEN NULL
                     WHEN v_avatar IS NOT NULL THEN v_avatar
                     ELSE avatar_path
                   END,
    updated_at   = now()
  WHERE id = v_user_id
  RETURNING username INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  -- Keep the denormalised author name on existing content in step with the
  -- profile, so a rename is reflected across the resident's discussion history.
  IF v_name IS NOT NULL THEN
    UPDATE public.community_posts    SET author_name = v_name WHERE author_id = v_user_id;
    UPDATE public.community_comments SET author_name = v_name WHERE author_id = v_user_id;
  END IF;

  RETURN public.community_profile(v_result);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Table privileges
--
-- `20260815000000_community_discussions.sql` and the initial schema defined RLS
-- policies for these tables but never granted table-level privileges. The two
-- are independent: a GRANT authorises access to the table at all, while RLS
-- filters which rows that access returns. Without the GRANT, every
-- SECURITY INVOKER reader (community_feed, community_post, the vote functions)
-- fails with "permission denied for table", which the client surfaces as an
-- authentication error and renders as an empty feed.
--
-- Privileges are kept deliberately narrow, and RLS remains the row-level
-- authority: anon reads only, authenticated writes only what its policies allow.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON TABLE public.profiles TO authenticated;

GRANT SELECT                         ON TABLE public.community_posts    TO anon, authenticated;
GRANT INSERT, DELETE                 ON TABLE public.community_posts    TO authenticated;
GRANT UPDATE                         ON TABLE public.community_posts    TO authenticated;

GRANT SELECT                         ON TABLE public.community_comments TO anon, authenticated;
GRANT INSERT, DELETE, UPDATE         ON TABLE public.community_comments TO authenticated;

-- Vote rows are readable only by their owner (see the policies in the previous
-- migration); scores reach the client through the aggregate readers instead.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_post_votes    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_comment_votes TO authenticated;

GRANT SELECT         ON TABLE public.community_post_media    TO anon, authenticated;
GRANT DELETE         ON TABLE public.community_post_media    TO authenticated;
GRANT SELECT         ON TABLE public.community_comment_media TO anon, authenticated;
GRANT DELETE         ON TABLE public.community_comment_media TO authenticated;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Reading community content and public profiles is open; writing needs an account.

REVOKE ALL ON FUNCTION public.generate_community_username(text) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.community_author(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_author(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_profile_id(text) FROM public;
GRANT EXECUTE ON FUNCTION public.community_profile_id(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_post_score(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_post_score(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_post_viewer_vote(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_post_viewer_vote(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_comment_score(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_comment_score(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_comment_viewer_vote(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_comment_viewer_vote(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_post_media_paths(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_post_media_paths(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_comment_media_paths(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_comment_media_paths(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_feed(text, text, text, text, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.community_feed(text, text, text, text, text, text, integer, integer) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_post(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_post(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_comments_for_post(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_comments_for_post(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_profile(text) FROM public;
GRANT EXECUTE ON FUNCTION public.community_profile(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_pulse(text) FROM public;
GRANT EXECUTE ON FUNCTION public.community_pulse(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_project_activity(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.community_project_activity(text, integer) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.community_username_available(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.community_username_available(text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_community_post(text, text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_community_post(text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.attach_community_post_media(uuid, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attach_community_post_media(uuid, text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.attach_community_comment_media(uuid, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attach_community_comment_media(uuid, text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.update_community_profile(text, text, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_community_profile(text, text, text, text, boolean) TO authenticated;
