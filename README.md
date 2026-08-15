# CivicLens

CivicLens is a Cebu City transparency PWA using Supabase Auth, Postgres/PostGIS, private Storage, Edge Functions, and Groq vision.

## Local setup

1. Install dependencies: `npm install`
2. Install the Supabase CLI, then run `supabase start`
3. Copy `.env.example` to `.env.local` and add the local project URL and publishable key from `supabase status`
4. Add server secrets with `supabase secrets set GROQ_API_KEY=... GROQ_MODEL=qwen/qwen3.6-27b`
5. Run the web app with `npm run dev`

Without `GROQ_API_KEY`, scans use a safe demo analysis. Project records are loaded separately through the pinned DPWH importer described below. For sharper close-zoom imagery, set a domain-restricted MapTiler Free key in `VITE_MAPTILER_KEY`; `VITE_MAP_STYLE_URL` remains available as a full style override.

## Architecture

- `src`: React and Vite client using Supabase Auth, database, Storage, and Functions
- `src/app-routes.ts`: paths the landing/auth bundle owns, plus the post-login destination
- `src/community`: the `/community`, `/community/post/:postId`, and `/community/profile/:username` surface
- `src/components/auth-menu.tsx`: the single persistent authentication control, used by both shells
- `src/map`: the official project map, including the community context and timeline sections
- `supabase/migrations`: PostGIS schema, profile provisioning, RLS policies, and database functions
- `supabase/functions/scan-project`: authenticated Groq image analysis and project matching
- `supabase/seed.sql`: local-only demo community content (see below)

Client routes are `/` (landing), `/login`, `/register`, `/map`, `/community`, `/community/post/:postId`, and `/community/profile/:username`; anything else renders the not-found screen. Authentication returns residents to `/community`.

Report photos are private and stored under the authenticated user's folder. Groq credentials are Edge Function secrets and must never use the `VITE_` prefix. The `scan-project` Edge Function remains deployed for image analysis, but no client screen calls it at present.

## Community context layer

Community is a context layer around official-source project records, not a standalone discussion board. The distinction is enforced in both the schema and the UI:

| Concept | Source | Where it lives |
| --- | --- | --- |
| Official-source record | Government data (DPWH snapshot) | `public.projects`, the map |
| Community discussion | Resident content | `community_posts` |
| Supporting photos | Resident-supplied | `community_post_media`, `community_comment_media` |

Resident content may *reference* a project, but it never verifies, amends, or invalidates the official record. Community activity is always labeled separately from official project information. A post's project chip opens `/map?project=<id>`; explicitly linked posts also appear in the selected project's **Community posts** map-dialog tab.

Community media buckets (`avatars`, `community-post-media`, `community-comment-media`) are public so guests can see photos in the discussion they browse; writes are owner-only through storage policies. The `report-photos` bucket stays private.

### Demo content

`supabase/seed.sql` seeds fictional residents and discussion so `/community` is evaluable before a DPWH import. It runs on `supabase db reset` and skips itself if any community content already exists. It is local-only: it creates auth users at `example.invalid`. Do not apply it to a shared project.

### Verifying against a local database

```bash
supabase start
supabase db reset
node --experimental-strip-types scripts/verify-community.ts       # anonymous browsing + guest guards
node --experimental-strip-types scripts/verify-community-auth.ts  # posting, media, profiles, voting
```

Both scripts need a running local stack and exit non-zero on failure. They are excluded from `npm test`, which stays offline.

## Satellite map and project geometry

The project map uses MapLibre. At zoom levels below 15 it shows clustered project locations; at zoom 15 and above it switches to clickable project lines and areas. Overlapping areas open a compact centered chooser. A selected project opens a centered, viewport-constrained dialog with **Project details** and **Community posts** tabs instead of a frame-bound panel or near-full-screen sheet.

The Community tab reads only discussions whose `community_posts.project_id` explicitly matches the selected project. Posts are ranked by score and then recency, rendered with the existing overview cards, and link to `/community/post/:postId` for voting, comments, and sharing. Resident discussion is always labeled separately from official project information. Apply `20260816020000_project_community_posts.sql` to enable this scoped feed.

Map style selection uses this order:

1. `VITE_MAP_STYLE_URL`, when supplied, is the complete approved MapLibre style override.
2. `VITE_MAPTILER_KEY` selects MapTiler Satellite Hybrid for higher-resolution imagery with road labels. Create a free non-commercial account at [MapTiler Cloud](https://cloud.maptiler.com/), restrict the browser key to the development and deployed domains, and monitor the account quota. The key is public by design and must never have unrelated account privileges.
3. With neither value, CivicLens falls back to the no-key EOX Sentinel-2 Cloudless 2020 raster mosaic and displays its required attribution.

The EOX imagery is approximately 10 m native resolution and is overzoomed above its native zoom, so it provides aerial context but not building-level detail. Its annual mosaic is licensed under Creative Commons Attribution-NonCommercial-ShareAlike; confirm that the deployment qualifies and review the current [EOX terms and attribution](https://www.s2maps.eu/?downloadservice) before release. MapTiler availability, imagery resolution, commercial eligibility, quota, logo, and attribution remain governed by the selected MapTiler plan.

Every imported DPWH record has an authoritative recorded point. The map does not present that point as an exact boundary:

- `official_geometry` may contain only a reviewed LineString, MultiLineString, Polygon, or MultiPolygon supplied by an official source. `geometry_source` is required and `geometry_source_url` should be supplied when available.
- A signed-in moderator may request nearby road candidates from the configured Overpass endpoint. The browser sends only the selected DPWH coordinate, clips each OSM way to approximately 300 m, and requires a review note before the moderator can save it. The database independently enforces moderator access, a maximum 150 m distance from the DPWH point, a maximum 750 m line length, and an audit record.
- Saved OSM routes display as **Reviewed OSM estimate** with OpenStreetMap attribution and an ODbL source link. They are never promoted to official geometry and may be replaced by an official source later.
- Records with neither official nor reviewed geometry display a dashed, translucent 50 m buffer labeled **Estimated project area**. It is a selection aid, not an official project footprint.
- Do not populate `official_geometry` from guessed routes, geocoding, OpenStreetMap matching, or a generic buffer. Apply `20260816000000_project_display_geometry.sql` and `20260816010000_osm_reviewed_estimate_geometry.sql` in order.

The public Overpass service is a best-effort community resource, not an unlimited production API. Candidate lookup is deliberately manual and on demand; do not bulk-query it. Set `VITE_OVERPASS_URL` to another policy-compatible mirror if needed, and retain `© OpenStreetMap contributors` attribution and ODbL compliance.

Mandatory release QA: verify satellite attribution is visible; markers change to areas at zoom 15; official, reviewed-estimate, and point-estimate styles are distinguishable; and all non-official details contain disclaimers. Verify overlapping areas open a centered, unclipped chooser no wider than 48rem and no taller than 70dvh. On desktop and mobile, verify the selected project opens one centered dialog; at desktop it uses the wider landscape layout (up to 72rem wide and 76dvh tall). Both tabs must support keyboard navigation, occupy equal full-width halves of the dialog, and keep long content independently scrollable. In **Community posts**, verify loading, error/retry, and “No community posts for this project yet.” states; verify every overview is explicitly linked to the selected project and ordered by score, then newest; and verify selecting an overview opens `/community/post/:postId` in the same tab with voting, comments, and sharing available. Finally, verify only moderators see review controls, keyboard and touch map selection work, and provider failures leave the project list usable.

## DPWH dataset import

Project data comes from the CC0-licensed [BetterGov.PH DPWH Transparency dataset](https://huggingface.co/datasets/bettergovph/dpwh-transparency-data), sourced from the official DPWH Transparency Portal. The importer pins revision `648ea96af4f7625d606fda0b78803917913a26b7` and verifies the Parquet SHA-256 before processing.

The snapshot contains 248,220 rows. The validated dry run accepts 214,747 geocoded projects and rejects 33,473 records with missing or invalid Philippine coordinates. Raw Parquet and generated reports are gitignored.

Set up and validate without writing to Supabase:

```bash
python -m venv .venv-dpwh
.venv-dpwh/bin/python -m pip install -r scripts/requirements-dpwh.txt
.venv-dpwh/bin/python scripts/import_dpwh.py
```

Review `data/generated/dpwh-import-summary.json` and `data/generated/dpwh-rejected.jsonl`. Apply any pending schema migrations before importing records:

```bash
npx supabase db push --dry-run
npx supabase db push
SUPABASE_DB_URL='postgresql://...' .venv-dpwh/bin/python scripts/import_dpwh.py --apply
npx supabase functions deploy scan-project
```

`SUPABASE_DB_URL` must be a server-side direct or session-pooler connection with permission to write `public.projects`; never expose it with a `VITE_` prefix. The importer streams the source, writes in 500-row transactions, and upserts stable `dpwh-<contractId>` IDs. On the current snapshot, plan for hundreds of megabytes to low single-digit gigabytes of Postgres storage after indexes and metadata, then verify actual project and index sizes after import.

## Deploy

Link the CLI to a development project before applying changes:

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy scan-project
supabase secrets set GROQ_API_KEY=... GROQ_MODEL=qwen/qwen3.6-27b
```

## Checks

```bash
npm run build
npm test
```
