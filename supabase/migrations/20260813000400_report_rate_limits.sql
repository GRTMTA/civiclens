-- ─────────────────────────────────────────────────────────────────────────────
-- Report submission rate limiting
--
-- Limits: 10 reports per 3 600 seconds (1 hour) per authenticated user.
-- Moderators are exempt — their workflow (e.g. bulk moderation testing) must
-- not be blocked by the same quota applied to public submissions.
--
-- The quota is consumed inside create_report(), AFTER input validation, so
-- that rejected submissions (bad coordinates, missing fields, etc.) do not
-- count against the user's allowance.
--
-- The atomic upsert pattern is identical to consume_scan_quota() in
-- 20260813000200_function_security_and_rate_limits.sql so the two limits
-- remain independent and can be tuned separately.
-- ─────────────────────────────────────────────────────────────────────────────

-- Rate-limit state table for report submissions
CREATE TABLE public.report_rate_limits (
  user_id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count    integer     NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE public.report_rate_limits ENABLE ROW LEVEL SECURITY;
-- No RLS policies needed — only accessed via SECURITY DEFINER functions.

-- ─────────────────────────────────────────────────────────────────────────────
-- consume_report_quota(max_requests, window_seconds)
--
-- Atomically increments the counter for auth.uid() inside the current window.
-- Resets the window when it has expired.
-- Returns TRUE when the submission is within quota, FALSE when exceeded.
--
-- Defaults:
--   max_requests   = 10   (reports per window)
--   window_seconds = 3600 (1 hour)
--
-- To change limits without a migration, pass different arguments when calling
-- from create_report() — or update the defaults below.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_report_quota(
  max_requests   integer DEFAULT 10,
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
  -- Unauthenticated callers are always denied
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Moderators are exempt from report-submission rate limits
  IF public.is_moderator() THEN
    RETURN true;
  END IF;

  INSERT INTO public.report_rate_limits (user_id, window_started_at, request_count)
  VALUES (auth.uid(), now(), 1)
  ON CONFLICT (user_id) DO UPDATE SET
    window_started_at = CASE
      WHEN public.report_rate_limits.window_started_at
           <= now() - make_interval(secs => greatest(window_seconds, 1))
      THEN now()
      ELSE public.report_rate_limits.window_started_at
    END,
    request_count = CASE
      WHEN public.report_rate_limits.window_started_at
           <= now() - make_interval(secs => greatest(window_seconds, 1))
      THEN 1
      ELSE public.report_rate_limits.request_count + 1
    END
  RETURNING request_count INTO current_count;

  RETURN current_count <= greatest(max_requests, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_report_quota(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_report_quota(integer, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Replace create_report() to enforce the rate limit.
--
-- Order of operations inside the function:
--   1. Auth check            — must be signed in
--   2. Profile lookup        — must have a profile (display_name)
--   3. Input validation      — category / note length, coordinate range
--      ↑ No quota consumed above this line — invalid submissions are free
--   4. consume_report_quota  — atomic increment; raises on limit exceeded
--   5. INSERT                — write the report
--
-- This ensures quota is only consumed for submissions that would otherwise
-- succeed, and the entire operation is inside one transaction.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_report(
  p_project_id  text,
  p_category    text,
  p_note        text,
  p_latitude    double precision,
  p_longitude   double precision,
  p_photo_path  text DEFAULT NULL
)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result       public.reports;
  display_name text;
  within_quota boolean;
BEGIN
  -- 1. Auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 2. Profile lookup
  SELECT p.display_name INTO display_name
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF display_name IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  -- 3. Input validation (quota NOT consumed on these failures)
  IF p_project_id IS NULL OR char_length(trim(p_project_id)) = 0 THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;

  IF p_category IS NULL OR char_length(trim(p_category)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'category must be between 1 and 80 characters';
  END IF;

  IF p_note IS NULL OR char_length(trim(p_note)) NOT BETWEEN 5 AND 2000 THEN
    RAISE EXCEPTION 'note must be between 5 and 2000 characters';
  END IF;

  IF p_latitude IS NULL  OR p_latitude  NOT BETWEEN -90  AND 90 OR
     p_longitude IS NULL OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'valid coordinates are required';
  END IF;

  -- 4. Rate limit check (atomic; moderators are exempt inside the function)
  --    Defaults: 10 reports per hour. Adjust arguments here to reconfigure.
  SELECT public.consume_report_quota(10, 3600) INTO within_quota;

  IF NOT within_quota THEN
    RAISE EXCEPTION 'report_rate_limit_exceeded: you have reached the report limit. Please try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Insert
  INSERT INTO public.reports (
    project_id, author_id, author_name, category, note, photo_path, coordinates
  )
  VALUES (
    p_project_id,
    auth.uid(),
    display_name,
    trim(p_category),
    trim(p_note),
    p_photo_path,
    extensions.st_setsrid(
      extensions.st_makepoint(p_longitude, p_latitude), 4326
    )::extensions.geography
  )
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Re-apply grants (CREATE OR REPLACE does not change existing grants,
-- but being explicit keeps the security posture clear)
REVOKE ALL ON FUNCTION public.create_report(text, text, text, double precision, double precision, text)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_report(text, text, text, double precision, double precision, text)
  TO authenticated;
