-- ─────────────────────────────────────────────────────────────────────────────
-- Local demonstration content for the Community context layer.
--
-- Project records are imported from the pinned BetterGov.PH DPWH snapshot; see
-- scripts/import_dpwh.py and the README for the dry-run-first workflow. This
-- file adds only *Community* content so `/community` can be evaluated locally
-- without waiting on an import.
--
-- Scope and safety:
--   • Runs on `supabase db reset` (local) only. Do not apply to a shared or
--     production project: it creates auth users with known-fake addresses.
--   • Residents, discussion, and observations here are fictional.
--   • Content is deliberately mundane — questions and neutral accounts of what
--     someone saw. It contains no accusation, no corruption claim, and no
--     assertion about any real official, contractor, or agency.
--   • Where a post references a project, it attaches to a demo project record
--     created here, not to real imported DPWH data.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_maria   uuid := '00000000-0000-4000-8000-000000000001';
  v_vincent uuid := '00000000-0000-4000-8000-000000000002';
  v_ana     uuid := '00000000-0000-4000-8000-000000000003';
  v_project_road  text := 'demo-road-pajac';
  v_project_flood text := 'demo-flood-mabolo';
  v_post   uuid;
  v_parent uuid;
BEGIN
  -- Only seed an empty community, so a reset never duplicates demo content and
  -- real content is never joined by fictional neighbours.
  IF EXISTS (SELECT 1 FROM public.community_posts) THEN
    RAISE NOTICE 'Community content already present; skipping demo seed.';
    RETURN;
  END IF;

  -- ── Demo project records ───────────────────────────────────────────────────
  -- Clearly-marked demo rows. Real records arrive through the DPWH importer.
  INSERT INTO public.projects
    (id, source, source_url, name, category, description, agency, contractor,
     budget, status, progress, location, coordinates)
  VALUES
    (v_project_road, 'Demo data', 'https://example.invalid/demo/road',
     'Cebu Road Improvement — Barangay Pajac (demo record)', 'road',
     'Demonstration record used to exercise the community context layer locally.',
     'Demo agency', 'Demo contractor', 48000000, 'Ongoing', 55, 'Lapu-Lapu City, Cebu',
     extensions.st_setsrid(extensions.st_makepoint(123.9800, 10.3100), 4326)::extensions.geography),
    (v_project_flood, 'Demo data', 'https://example.invalid/demo/flood',
     'Cebu Flood Control Improvement — Mabolo (demo record)', 'flood-control',
     'Demonstration record used to exercise the community context layer locally.',
     'Demo agency', 'Demo contractor', 91000000, 'Ongoing', 30, 'Cebu City, Cebu',
     extensions.st_setsrid(extensions.st_makepoint(123.9120, 10.3200), 4326)::extensions.geography)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.projects
  SET start_date = '2026-02-02', completion_date = '2026-11-30'
  WHERE id = v_project_road;

  UPDATE public.projects
  SET start_date = '2026-04-15', completion_date = '2027-03-31'
  WHERE id = v_project_flood;

  -- ── Demo residents ─────────────────────────────────────────────────────────
  -- `.invalid` is reserved by RFC 2606 and can never be a real address.
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at)
  VALUES
    (v_maria,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'maria.demo@example.invalid',   '{"display_name":"Maria Santos"}',       now() - interval '40 days'),
    (v_vincent, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'vincent.demo@example.invalid', '{"display_name":"Vincent Dela Torre"}', now() - interval '25 days'),
    (v_ana,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ana.demo@example.invalid',     '{"display_name":"Ana Reyes"}',          now() - interval '12 days')
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET
    username = 'maria',
    bio = 'Lapu-Lapu resident. Interested in how road projects near our barangay progress.',
    created_at = now() - interval '40 days'
  WHERE id = v_maria;

  UPDATE public.profiles SET
    username = 'vincent',
    bio = 'Interested in public infrastructure and local development.',
    created_at = now() - interval '25 days'
  WHERE id = v_vincent;

  UPDATE public.profiles SET
    username = 'ana',
    bio = 'Cebu City. I walk this route daily.',
    created_at = now() - interval '12 days'
  WHERE id = v_ana;

  -- ── Community content ──────────────────────────────────────────────────────
  -- Inserted directly rather than through create_community_post() so timestamps
  -- can be backdated into a believable spread of activity.

  -- Observation: neutral account of something seen, with an approximate area.
  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_maria, 'Maria Santos',
    'Construction appears to have stopped near the eastern section',
    'I passed by this morning and the work area near the eastern section was still closed off, with no crew on site. Has anyone else noticed this, or heard when work is scheduled to resume?',
    'roads', v_project_road, 'observation', 'Barangay Pajac',
    now() - interval '3 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value) VALUES
    (v_post, v_maria, 1), (v_post, v_vincent, 1), (v_post, v_ana, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_ana, 'Ana Reyes',
    'I saw the same thing yesterday afternoon. The barriers were still up on that side.',
    now() - interval '2 hours'
  ) RETURNING id INTO v_parent;

  INSERT INTO public.community_comment_votes (comment_id, user_id, value)
  VALUES (v_parent, v_ana, 1), (v_parent, v_maria, 1);

  INSERT INTO public.community_comments
    (post_id, parent_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_parent, v_vincent, 'Vincent Dela Torre',
    'Worth checking the official record for the recorded completion date before assuming anything about the schedule.',
    now() - interval '90 minutes'
  );

  -- Discussion: a question about where to find official information.
  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, created_at)
  VALUES (
    v_vincent, 'Vincent Dela Torre',
    'Where can I find the official budget for this project?',
    'I would like to read the source record for this one rather than rely on what people remember. Is the contract amount published anywhere I can link to?',
    'roads', v_project_road, 'discussion',
    now() - interval '1 day'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_vincent, 1), (v_post, v_maria, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_maria, 'Maria Santos',
    'The project record on the map shows a contract amount and a source link. That is the one to cite.',
    now() - interval '20 hours'
  );

  -- Observation on a second project, so the pulse is not single-project.
  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_ana, 'Ana Reyes',
    'Drainage work near the corner looked incomplete this morning',
    'The trench along the corner was open and partially covered with boards when I walked past. Sharing what I saw in case others are tracking this one.',
    'flood-control', v_project_flood, 'observation', 'Barangay Mabolo',
    now() - interval '2 days'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_ana, 1), (v_post, v_vincent, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_vincent, 'Vincent Dela Torre',
    'Thanks for noting the date. Useful to know what it looked like this week.',
    now() - interval '2 days' + interval '3 hours'
  );

  -- Observation: traffic diversion, still neutral.
  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_maria, 'Maria Santos',
    'Traffic is still being diverted near the eastern section',
    'The diversion signs were still in place this week. Posting so people planning their route know what to expect.',
    'transportation', v_project_road, 'observation', 'Barangay Pajac',
    now() - interval '4 days'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_maria, 1);

  -- Discussion by the same resident, so a profile shows both kinds of activity.
  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, created_at)
  VALUES (
    v_maria, 'Maria Santos',
    'Has anyone attended a barangay briefing about this road project?',
    'Wondering whether there has been a public briefing on the schedule, and where notes from it would be posted.',
    'local-government', v_project_road, 'discussion',
    now() - interval '5 days'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_maria, 1), (v_post, v_ana, 1);

  -- Discussion with no project reference: not everything is about one record.
  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, kind, created_at)
  VALUES (
    v_vincent, 'Vincent Dela Torre',
    'How do you read a recorded completion date on these records?',
    'A recorded completion date seems to describe the source record rather than the state of the site. Is that how others read it too?',
    'infrastructure', 'discussion',
    now() - interval '6 days'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_vincent, 1), (v_post, v_ana, 1);

  RAISE NOTICE 'Seeded demo community content for local evaluation.';
END;
$$;
