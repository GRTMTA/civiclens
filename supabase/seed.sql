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
  v_jun     uuid := '00000000-0000-4000-8000-000000000004';
  v_liza    uuid := '00000000-0000-4000-8000-000000000005';
  v_carlo   uuid := '00000000-0000-4000-8000-000000000006';
  v_project_road   text := 'demo-road-pajac';
  v_project_flood  text := 'demo-flood-mabolo';
  v_project_bridge text := 'demo-bridge-talamban';
  v_project_market text := 'demo-market-carbon';
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
     extensions.st_setsrid(extensions.st_makepoint(123.9120, 10.3200), 4326)::extensions.geography),
    (v_project_bridge, 'Demo data', 'https://example.invalid/demo/bridge',
     'Talamban Bridge Widening (demo record)', 'bridge',
     'Demonstration record used to exercise the community context layer locally.',
     'Demo agency', 'Demo contractor', 63000000, 'Ongoing', 42, 'Cebu City, Cebu',
     extensions.st_setsrid(extensions.st_makepoint(123.9070, 10.3550), 4326)::extensions.geography),
    (v_project_market, 'Demo data', 'https://example.invalid/demo/market',
     'Carbon Market Public Building Rehabilitation (demo record)', 'building',
     'Demonstration record used to exercise the community context layer locally.',
     'Demo agency', 'Demo contractor', 37000000, 'Ongoing', 18, 'Cebu City, Cebu',
     extensions.st_setsrid(extensions.st_makepoint(123.9010, 10.2960), 4326)::extensions.geography)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.projects
  SET start_date = '2026-02-02', completion_date = '2026-11-30'
  WHERE id = v_project_road;

  UPDATE public.projects
  SET start_date = '2026-04-15', completion_date = '2027-03-31'
  WHERE id = v_project_flood;

  UPDATE public.projects
  SET start_date = '2026-01-10', completion_date = '2026-10-15'
  WHERE id = v_project_bridge;

  UPDATE public.projects
  SET start_date = '2026-06-01', completion_date = '2027-05-30'
  WHERE id = v_project_market;

  -- ── Demo residents ─────────────────────────────────────────────────────────
  -- `.invalid` is reserved by RFC 2606 and can never be a real address.
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at)
  VALUES
    (v_maria,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'maria.demo@example.invalid',   '{"display_name":"Maria Santos"}',       now() - interval '40 days'),
    (v_vincent, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'vincent.demo@example.invalid', '{"display_name":"Vincent Dela Torre"}', now() - interval '25 days'),
    (v_ana,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ana.demo@example.invalid',     '{"display_name":"Ana Reyes"}',          now() - interval '12 days'),
    (v_jun,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'jun.demo@example.invalid',     '{"display_name":"Jun Aboitiz"}',        now() - interval '33 days'),
    (v_liza,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'liza.demo@example.invalid',    '{"display_name":"Liza Cabahug"}',       now() - interval '20 days'),
    (v_carlo,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'carlo.demo@example.invalid',   '{"display_name":"Carlo Yap"}',          now() - interval '9 days')
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

  UPDATE public.profiles SET
    username = 'junab',
    bio = 'Talamban. Nagbisikleta padulong sa work, hilig mag-report sa mga baho nga karsada.',
    created_at = now() - interval '33 days'
  WHERE id = v_jun;

  UPDATE public.profiles SET
    username = 'liza_c',
    bio = 'Tricycle driver, Carbon area. Dito araw-araw ang laba at sakay.',
    created_at = now() - interval '20 days'
  WHERE id = v_liza;

  UPDATE public.profiles SET
    username = 'carloyap',
    bio = 'Nagtitinda malapit sa Carbon Market. Sana matapos na ito.',
    created_at = now() - interval '9 days'
  WHERE id = v_carlo;

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

  -- ── More Pajac road chatter ─────────────────────────────────────────────────

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_jun, 'Jun Aboitiz',
    'May crew na ulit this morning sa Pajac road',
    'Nakita ko sila mga 7am, nagset-up ng cones sa side na dati sarado. Parang may ginagalaw na finally. Sino nadaanan din dito?',
    'roads', v_project_road, 'observation', 'Barangay Pajac',
    now() - interval '10 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value) VALUES
    (v_post, v_jun, 1), (v_post, v_maria, 1), (v_post, v_ana, 1), (v_post, v_carlo, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_maria, 'Maria Santos',
    'Oo nakita ko rin! Mabilis lang ako dumaan pero may 3-4 workers na nagbabaklas ng dating barrier.',
    now() - interval '9 hours'
  ) RETURNING id INTO v_parent;

  INSERT INTO public.community_comment_votes (comment_id, user_id, value)
  VALUES (v_parent, v_jun, 1), (v_parent, v_carlo, 1);

  INSERT INTO public.community_comments
    (post_id, parent_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_parent, v_jun, 'Jun Aboitiz',
    'Sana ma-finish na before rainy season talaga, grabe kadumi pag umuulan dito.',
    now() - interval '8 hours'
  );

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_vincent, 'Vincent Dela Torre',
    'Progress noted sa map is 55%. Kung tuloy-tuloy sila ngayon dapat aligned na sa completion date.',
    now() - interval '7 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_carlo, 'Carlo Yap',
    'Sobrang alikabok tuwing tanghali sa Pajac, may nagwaterspray ba?',
    'Bawat araw pag lunch time super alikabok, halos di na makita yung tapat ng tindahan namin. May crew ba na nagbabasa ng kalsada dati? Parang tumigil na.',
    'roads', v_project_road, 'observation', 'Barangay Pajac',
    now() - interval '1 day' - interval '5 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_carlo, 1), (v_post, v_jun, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_liza, 'Liza Cabahug',
    'Same dito sa area namin, pati mata ko nasaktan minsan sa alikabok. Sobra talaga pag walang preno.',
    now() - interval '1 day' - interval '3 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, created_at)
  VALUES (
    v_ana, 'Ana Reyes',
    'Bakit parang iba-iba ang schedule ng mga worker dito?',
    'Minsan umaga sila, minsan gabi na. Curious lang kung normal ba ito sa road projects o may specific shift talaga sila.',
    'roads', v_project_road, 'discussion',
    now() - interval '2 days' - interval '6 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_ana, 1), (v_post, v_maria, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_vincent, 'Vincent Dela Torre',
    'Common yan para maiwasan ang traffic sa peak hours, pero wala talagang posted schedule dito sa record.',
    now() - interval '2 days' - interval '4 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_maria, 'Maria Santos',
    'Bagong steel plates na natakip sa may open trench',
    'Mukhang mas ligtas na ngayon dumaan, may steel plates na sa parte na dati bukas lang lupa. Malaking improvement compared last week.',
    'roads', v_project_road, 'observation', 'Barangay Pajac',
    now() - interval '3 days' - interval '2 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_maria, 1), (v_post, v_jun, 1), (v_post, v_carlo, 1);

  -- ── Mabolo flood control chatter ────────────────────────────────────────────

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_liza, 'Liza Cabahug',
    'Sana matapos na bago pumasok ang tag-ulan, grabe baha dati dito',
    'Taga-Mabolo ako, tuwing malakas ang ulan umaapaw talaga yung kanal dito. Excited ako sa project pero parang mabagal pa yung progress. May updates ba kayo?',
    'flood-control', v_project_flood, 'discussion', 'Barangay Mabolo',
    now() - interval '14 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value) VALUES
    (v_post, v_liza, 1), (v_post, v_ana, 1), (v_post, v_vincent, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_ana, 'Ana Reyes',
    'Same worry ko dati sa may corner, pero mas mabagal talaga ang flood control kesa road kasi mas malalim ang excavation.',
    now() - interval '13 hours'
  ) RETURNING id INTO v_parent;

  INSERT INTO public.community_comments
    (post_id, parent_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_parent, v_liza, 'Liza Cabahug',
    'Ay ganon ba pala, akala ko tinatamad lang sila. Salamat sa info!',
    now() - interval '12 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_ana, 'Ana Reyes',
    'May bagong concrete culvert na nailagay sa may sari-sari store corner',
    'Nakita ko kanina papasok ng barangay hall, may malaking culvert pipe na naka-lay down na. Parang next step ay ilibing na siguro yun.',
    'flood-control', v_project_flood, 'observation', 'Barangay Mabolo',
    now() - interval '1 day' - interval '8 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_ana, 1), (v_post, v_liza, 1), (v_post, v_carlo, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_vincent, 'Vincent Dela Torre',
    'Progress sa record is 30% lang pero at least may visible material na nagdededeliver, hindi lang planning stage.',
    now() - interval '1 day' - interval '6 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, created_at)
  VALUES (
    v_liza, 'Liza Cabahug',
    'Anyone know kung may temporary drainage habang ongoing pa itong project?',
    'Baka pag umulan bigla, wala man lang temporary channel, mas lala pa yung baha kesa dati. May nakausap na ba sa barangay tungkol dito?',
    'flood-control', v_project_flood, 'discussion',
    now() - interval '3 days' - interval '10 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_liza, 1), (v_post, v_ana, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_maria, 'Maria Santos',
    'Good question ito, worth ibalita sa susunod na barangay assembly kung meron.',
    now() - interval '3 days' - interval '8 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_carlo, 'Carlo Yap',
    'Naabot na yung kalsada namin ng excavation, konting warning na lang',
    'Dati malayo pa yung ginagawa nila, ngayon parating na sa aming block. Sana lang bigyan kami ng heads up bago sarado yung daan namin.',
    'flood-control', v_project_flood, 'observation', 'Barangay Mabolo',
    now() - interval '4 days' - interval '5 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_carlo, 1), (v_post, v_liza, 1);

  -- ── Talamban bridge chatter ──────────────────────────────────────────────────

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_jun, 'Jun Aboitiz',
    'One lane na lang bukas sa Talamban bridge, plan your commute',
    'Bike commuter ako dito, ngayong araw isang lane lang open dahil sa widening work. Traffic medyo mabagal around 5-6pm. Share ko lang para may paunang alam.',
    'bridges', v_project_bridge, 'observation', 'Talamban',
    now() - interval '18 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value) VALUES
    (v_post, v_jun, 1), (v_post, v_carlo, 1), (v_post, v_vincent, 1), (v_post, v_maria, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_carlo, 'Carlo Yap',
    'Salamat sa heads up! Mag-iiba na route ko this week para maiwasan.',
    now() - interval '17 hours'
  ) RETURNING id INTO v_parent;

  INSERT INTO public.community_comment_votes (comment_id, user_id, value)
  VALUES (v_parent, v_jun, 1);

  INSERT INTO public.community_comments
    (post_id, parent_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_parent, v_jun, 'Jun Aboitiz',
    'Grabe rider din, mag-ingat lang sa steel plates malapot pag umuulan.',
    now() - interval '16 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, created_at)
  VALUES (
    v_vincent, 'Vincent Dela Torre',
    'Ano ba talaga ang widening scope dito, dalawang lane papuntang apat?',
    'Nabasa ko sa record na widening project pero hindi nakalagay kung ilang lanes ang idadagdag. May nakita ba ng mas detailed na plano?',
    'bridges', v_project_bridge, 'discussion',
    now() - interval '2 days' - interval '9 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_vincent, 1), (v_post, v_jun, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_maria, 'Maria Santos',
    'Wala akong nakita dito sa app, pero baka nasa physical signboard sa site meron detailed plan.',
    now() - interval '2 days' - interval '7 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_carlo, 'Carlo Yap',
    'May naka-poste nang bagong steel girder sa gilid ng bridge',
    'Kanina lang nakita ko, malaking girder na naka-crane sa side. Mukhang malapit na yatang ilagay ang widening structure.',
    'bridges', v_project_bridge, 'observation', 'Talamban',
    now() - interval '5 days' - interval '4 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_carlo, 1), (v_post, v_jun, 1), (v_post, v_vincent, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_jun, 'Jun Aboitiz',
    'Oo nakita ko rin yun last week, malaki talaga. Sana maigi ang installation, walang sudden closure.',
    now() - interval '5 days' - interval '2 hours'
  );

  -- ── Carbon Market rehabilitation chatter ─────────────────────────────────────

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_carlo, 'Carlo Yap',
    'Nagsimula na ang demolition sa old section ng Carbon Market',
    'Bilang tindero dito, nakita kong may mga backhoe na nagbuwag ng lumang istruktura this week. Excited pero medyo nakakaligalig din sa mga umiikot na negosyo.',
    'public-buildings', v_project_market, 'observation', 'Carbon, Cebu City',
    now() - interval '20 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value) VALUES
    (v_post, v_carlo, 1), (v_post, v_liza, 1), (v_post, v_maria, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_liza, 'Liza Cabahug',
    'Kabalo ko na feeling, dito ako naka-park madalas, medyo nauto ako sa dami ng dumi ngayon. Pero sige, para naman sa mas maayos in the end.',
    now() - interval '19 hours'
  ) RETURNING id INTO v_parent;

  INSERT INTO public.community_comments
    (post_id, parent_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_parent, v_carlo, 'Carlo Yap',
    'Tama, konting sakit ng ulo lang muna. Sana lang bigyan kami ng designated temporary stalls habang ongoing.',
    now() - interval '18 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, created_at)
  VALUES (
    v_liza, 'Liza Cabahug',
    'Saan ba dapat mag-relocate ang mga vendors habang construction?',
    'May naospital na kaibigan ko na tindera dito, hirap na hirap sila humanap ng lugar habang ongoing ang rehab. May official relocation plan po ba nito?',
    'public-buildings', v_project_market, 'discussion',
    now() - interval '2 days' - interval '3 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_liza, 1), (v_post, v_carlo, 1), (v_post, v_ana, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_vincent, 'Vincent Dela Torre',
    'Hindi ko rin makita dito sa record, pero relocation logistics parang usually barangay o city market office ang humahandle nito, hindi laman ng project record.',
    now() - interval '2 days' - interval '1 hour'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_maria, 'Maria Santos',
    'Traffic sa Carbon area medyo lumala dahil sa mga delivery trucks ng materials',
    'Pumunta ako dito last week para bumili ng gulay, halos hindi na makadaan ang mga jeep dahil sa mga trak na nagdedeliver ng construction materials. Baka pag-isipan din ang schedule ng delivery.',
    'public-buildings', v_project_market, 'observation', 'Carbon, Cebu City',
    now() - interval '4 days' - interval '7 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_maria, 1), (v_post, v_carlo, 1);

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, created_at)
  VALUES (
    v_ana, 'Ana Reyes',
    'Budget dito is 37M pesos, tama po ba yan sa nakikita niyo rin?',
    'Sa map record nabasa ko 37,000,000 ang budget para dito. Curious lang kung tugma sa naririnig ninyo sa barangay o naiba na updated figure.',
    'public-buildings', v_project_market, 'discussion',
    now() - interval '6 days' - interval '2 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_ana, 1), (v_post, v_vincent, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_vincent, 'Vincent Dela Torre',
    'Iyan din ang nakikita ko sa official record, walang ibang published figure na nakita ako kahit saan pa.',
    now() - interval '6 days' - interval '1 hour'
  );

  -- ── General discussion, no project reference ─────────────────────────────────

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, kind, created_at)
  VALUES (
    v_liza, 'Liza Cabahug',
    'Paano ba pinaka-tamang paraan i-report ang nakita sa isang project?',
    'First time ko lang gamit ang app, gusto ko lang malinaw kung dapat ba specific area lang ilagay o okay na general description. Newbie lang, pasensya sa tanong.',
    'infrastructure', 'discussion',
    now() - interval '7 days'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_liza, 1), (v_post, v_maria, 1), (v_post, v_carlo, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_maria, 'Maria Santos',
    'General area label na lang gamitin mo, para hindi masyadong specific ang exact location mo. Ganon ako gumagawa.',
    now() - interval '6 days' - interval '20 hours'
  );

  -- ── A few more, spread across projects, to keep the feed lively ─────────────

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_vincent, 'Vincent Dela Torre',
    'Warning signs na blinking light nasira sa Pajac work zone',
    'Nung dumaan ako gabi, patay yung mga blinking warning lights sa gilid ng barrier. Delikado sa mga motorista pag dilim na. Baka may pwedeng mag-report sa barangay tanod.',
    'roads', v_project_road, 'observation', 'Barangay Pajac',
    now() - interval '6 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value) VALUES
    (v_post, v_vincent, 1), (v_post, v_jun, 1), (v_post, v_maria, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_jun, 'Jun Aboitiz',
    'Grabe oo, muntik na ko madapa dun kagabi pauwi. Ingat mag-drive dyan sa gabi.',
    now() - interval '5 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, created_at)
  VALUES (
    v_carlo, 'Carlo Yap',
    'Meron ba kayong alam kung sino contact person sa Mabolo flood project?',
    'Gusto ko lang malinaw magtanong tungkol sa timeline, pero wala akong makitang contact info dito. May alam ba kayong barangay official na madalas nagbibigay update?',
    'flood-control', v_project_flood, 'discussion',
    now() - interval '5 days' - interval '11 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_carlo, 1), (v_post, v_liza, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_liza, 'Liza Cabahug',
    'Try mo tanong sa barangay hall mismo, dun madalas may posted schedule sa bulletin board nila.',
    now() - interval '5 days' - interval '9 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_jun, 'Jun Aboitiz',
    'Pedestrian lane na paved na sa isang side ng Talamban bridge',
    'Good news, may bago nang sidewalk sa isang side, mas ligtas na maglakad papuntang parokya. Sana yung kabilang side sundan din agad.',
    'bridges', v_project_bridge, 'observation', 'Talamban',
    now() - interval '7 days' - interval '3 hours'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_jun, 1), (v_post, v_vincent, 1), (v_post, v_carlo, 1);

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, created_at)
  VALUES (
    v_maria, 'Maria Santos',
    'Sino pa may na-notice na parating tapos na yung Carbon Market phase 1?',
    'Sa dinaanan ko lang, mukhang malapit na matapos yung unang phase base sa dami ng structure na tapos. Anyone with a more accurate update dito?',
    'public-buildings', v_project_market, 'discussion',
    now() - interval '8 days'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_maria, 1), (v_post, v_carlo, 1);

  INSERT INTO public.community_comments (post_id, author_id, author_name, body, created_at)
  VALUES (
    v_post, v_carlo, 'Carlo Yap',
    'Progress record pa rin naman is 18%, mukhang mahaba pa ang buong project kaysa isang phase palang natapos.',
    now() - interval '7 days' - interval '22 hours'
  );

  INSERT INTO public.community_posts
    (author_id, author_name, title, body, topic, project_id, kind, area_label, created_at)
  VALUES (
    v_ana, 'Ana Reyes',
    'Barangay clean-up drive kasabay ng ongoing Mabolo flood work',
    'May naka-organize ng brigada eskoba kanina malapit sa site, tulong-tulong maglinis habang naghihintay sa flood control. Nice na proactive ang mga kapitbahay dito.',
    'flood-control', v_project_flood, 'observation', 'Barangay Mabolo',
    now() - interval '9 days'
  ) RETURNING id INTO v_post;

  INSERT INTO public.community_post_votes (post_id, user_id, value)
  VALUES (v_post, v_ana, 1), (v_post, v_liza, 1), (v_post, v_maria, 1);

  RAISE NOTICE 'Seeded demo community content for local evaluation.';
END;
$$;
