-- report_comments: threaded plain-text comments attached to community reports
CREATE TABLE public.report_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text        NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 80),
  body        text        NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1000),
  hidden      boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX report_comments_report_id_idx ON public.report_comments (report_id, created_at);
CREATE INDEX report_comments_author_id_idx ON public.report_comments (author_id);

ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read non-hidden comments on visible reports.
-- Authors can always see their own comments regardless of hidden flag.
CREATE POLICY "comments_select" ON public.report_comments
  FOR SELECT TO authenticated
  USING (
    (hidden = false OR author_id = auth.uid() OR is_moderator())
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_id
        AND (r.status <> 'hidden' OR r.author_id = auth.uid() OR is_moderator())
    )
  );

-- Authenticated users can insert their own comments (author_id enforced).
CREATE POLICY "comments_insert" ON public.report_comments
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Authors can delete their own comments; moderators can delete any.
CREATE POLICY "comments_delete" ON public.report_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR is_moderator());

-- Only moderators can update (hide) comments.
CREATE POLICY "comments_update" ON public.report_comments
  FOR UPDATE TO authenticated
  USING (is_moderator())
  WITH CHECK (is_moderator());

-- DB function: post a comment (validates and stamps author_name from profile)
CREATE OR REPLACE FUNCTION public.post_comment(
  p_report_id uuid,
  p_body      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id   uuid := auth.uid();
  v_author_name text;
  v_report_ok   boolean;
  v_comment_id  uuid;
  v_trimmed     text := trim(p_body);
BEGIN
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate body length (1–1000 chars after trim)
  IF char_length(v_trimmed) < 1 THEN
    RAISE EXCEPTION 'Comment cannot be empty';
  END IF;
  IF char_length(v_trimmed) > 1000 THEN
    RAISE EXCEPTION 'Comment exceeds 1000 characters';
  END IF;

  -- Verify report is visible to this user
  SELECT EXISTS (
    SELECT 1 FROM reports r
    WHERE r.id = p_report_id
      AND (r.status <> 'hidden' OR r.author_id = v_author_id)
  ) INTO v_report_ok;

  IF NOT v_report_ok THEN
    RAISE EXCEPTION 'Report not found or not accessible';
  END IF;

  -- Resolve display name from profile
  SELECT display_name INTO v_author_name
  FROM profiles WHERE id = v_author_id;

  IF v_author_name IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  INSERT INTO report_comments (report_id, author_id, author_name, body)
  VALUES (p_report_id, v_author_id, v_author_name, v_trimmed)
  RETURNING id INTO v_comment_id;

  RETURN v_comment_id;
END;
$$;

-- DB function: hide a comment (moderator only)
CREATE OR REPLACE FUNCTION public.hide_comment(
  p_comment_id uuid,
  p_hidden     boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_moderator() THEN
    RAISE EXCEPTION 'Moderator access required';
  END IF;

  UPDATE report_comments SET hidden = p_hidden WHERE id = p_comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_comment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_comment(uuid, boolean) TO authenticated;
