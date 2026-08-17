# CivicLens

CivicLens is a Cebu City transparency PWA using Supabase Auth, Postgres/PostGIS, private Storage, Edge Functions, and Groq vision.

## Local setup

1. Install dependencies: `npm install`
2. Install the Supabase CLI, then run `supabase start`
3. Copy `.env.example` to `.env.local` and add the local project URL and publishable key from `supabase status`
4. Add server secrets with `supabase secrets set GROQ_API_KEY=... GROQ_MODEL=qwen/qwen3.6-27b`
5. Run the web app with `npm run dev`

Without `GROQ_API_KEY`, scans use a safe demo analysis. Project records are loaded separately through the pinned DPWH importer described below. OpenFreeMap is the default 3D-capable basemap; set a domain-restricted MapTiler Free key in `VITE_MAPTILER_KEY` for the first fallback, while `VITE_MAP_STYLE_URL` remains a full style override.

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
| Official-source record | Government data (DPWH API) | On-demand map feed |
| Community discussion | Resident content | `community_posts` |
| Supporting photos | Resident-supplied | `community_post_media`, `community_comment_media` |

Resident content may *reference* a project, but it never verifies, amends, or invalidates the official record. Community activity is always labeled separately from official project information. A post's project chip opens `/map?project=<id>`; explicitly linked posts also appear in the selected project's **Community posts** map-dialog tab.

Community media buckets (`avatars`, `community-post-media`, `community-comment-media`) are public so guests can see photos in the discussion they browse; writes are owner-only through storage policies. The `report-photos` bucket stays private.

### Demo content

`supabase/seed.sql` seeds fictional residents, discussion, and two clearly marked demo project references so `/community` remains evaluable independently of the DPWH feed. It runs on `supabase db reset` and skips itself if any community content already exists. It is local-only: it creates auth users at `example.invalid`. Do not apply it to a shared project.

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

The Community tab reads only discussions whose `community_posts.project_id` explicitly matches the selected project. Posts are ranked by score and then recency, rendered with the existing overview cards, and link to `/community/post/:postId` for comments and sharing. Signed-in residents can also create and vote directly in this tab; guests remain read-only and are sent through the existing sign-in flow for write actions. The full Community composer starts with the selected project visible, but the resident may change or remove that contextual link before publishing. A post that remains linked is inserted into the open project tab immediately and is also available through the broader Community feed; changing or clearing the link leaves the resident in the current tab with an explanatory confirmation.

Project links remain contextual foreign keys only: publishing never updates or verifies `public.projects`. The existing Community RPCs validate project IDs, enforce one current vote per resident/post with upvote, downvote, and clear behavior, and apply the shared 20 post/comment actions per hour quota to non-moderators. Moderators can hide or restore Community content. CivicLens does not currently provide a resident-facing Community-post flag/report flow; do not route discussion moderation into official project `reports`.

Resident discussion is always labeled separately from official project information. Project-scoped views use the existing `community_feed` API. Databases with the extended feed signature filter by `project_id` server-side; databases with only the original Community discussion API require no additional migration because the client filters its RLS-protected rows by the same explicit `project_id`. The original API returns at most 100 rows per request, which is the compatibility limit for project-scoped views on that legacy schema.

Map style selection and runtime fallback use this order:

1. `VITE_MAP_STYLE_URL`, when supplied, is the complete approved MapLibre style override.
2. OpenFreeMap Fiord is the no-key default and supplies vector-map/3D context. The map stays flat below zoom 15 and pitches automatically at zoom 15 and above. OpenFreeMap is an as-is hosted service, so required attribution must remain visible and production must retain fallbacks.
3. `VITE_MAPTILER_KEY`, when configured, provides the first fallback through MapTiler Satellite Hybrid. Create a free non-commercial account at [MapTiler Cloud](https://cloud.maptiler.com/), restrict the browser key to the development and deployed domains, and monitor the account quota.
4. EOX Sentinel-2 Cloudless 2020 is the final no-key raster fallback.

The EOX imagery is approximately 10 m native resolution and is overzoomed above its native zoom, so it provides aerial context but not building-level detail. Its annual mosaic is licensed under Creative Commons Attribution-NonCommercial-ShareAlike; confirm that the deployment qualifies and review the current [EOX terms and attribution](https://www.s2maps.eu/?downloadservice) before release. OpenFreeMap, MapTiler, and EOX availability and terms remain governed by their respective providers.

Every imported DPWH record has an authoritative recorded point. The map does not present that point as an exact boundary:

- `official_geometry` may contain only a reviewed LineString, MultiLineString, Polygon, or MultiPolygon supplied by an official source. `geometry_source` is required and `geometry_source_url` should be supplied when available.
- A signed-in moderator may request nearby road candidates from the configured Overpass endpoint. The browser sends only the selected DPWH coordinate, clips each OSM way to approximately 300 m, and requires a review note before the moderator can save it. The database independently enforces moderator access, a maximum 150 m distance from the DPWH point, a maximum 750 m line length, and an audit record.
- Saved OSM routes display as **Reviewed OSM estimate** with OpenStreetMap attribution and an ODbL source link. They are never promoted to official geometry and may be replaced by an official source later.
- Automatic estimates are generated only during project import/coordinate/category changes or an operator refresh against `osm_estimate_features`; the browser never bulk-queries Overpass. `road`, `bridge`, and `drainage` categories match the nearest eligible OSM line within 50 m, while all other categories match the nearest building footprint. They display as **Estimated project route/building** and remain read-only/non-official.
- When no eligible OSM feature is within 50 m, the database creates a circular indicator centered on the recorded point with an estimated 50 m radius.
- Display precedence is official geometry, moderator-reviewed OSM estimate, automatic OSM estimate, then the 50 m radius fallback circle. Do not populate `official_geometry` from any estimate. Apply `20260816000000_community_profiles_and_project_geometry.sql`, `20260816010000_osm_reviewed_estimate_geometry.sql`, and `20260816030000_automatic_project_estimates.sql` in order.

The public Overpass service is a best-effort community resource, not an unlimited production API. Candidate lookup is deliberately manual and on demand; do not bulk-query it. Set `VITE_OVERPASS_URL` to another policy-compatible mirror if needed, and retain `© OpenStreetMap contributors` attribution and ODbL compliance.

### Loading automatic OSM estimates

`osm_estimate_features` is an operator-only staging table, not a browser API. Load a Cebu OSM extract with an audited ETL process into the four allowed classes (`road`, `bridge`, `drainage`, `building_area`), retaining OSM tags, geometry, source URL, and extract timestamp. The table constraints enforce the approved tags (`highway=*`, `highway=*` plus `bridge!=no`, `waterway=drain|ditch|canal`, or `building!=no`). After replacing the extract, run `select public.refresh_all_project_automatic_estimates();` as the database owner. Regular project inserts and coordinate/category updates refresh only that project automatically. Do not grant either the staging table or refresh functions to browser roles.

Mandatory release QA: verify provider attribution is visible; OpenFreeMap is attempted first; failures advance to configured MapTiler and then EOX; the overview remains flat below zoom 15; and the camera pitches at zoom 15+. Verify markers change to project shapes at zoom 15 and official, moderator-reviewed, automatic OSM, and category-rectangle styles are distinguishable; every non-official detail must contain a disclaimer. Verify overlapping areas open a centered, unclipped chooser no wider than 48rem and no taller than 70dvh. On desktop and mobile, verify the selected project opens one centered dialog; at desktop it uses the wider landscape layout (up to 72rem wide and 76dvh tall). Both tabs must support keyboard navigation, occupy equal full-width halves of the dialog, and keep long content independently scrollable. In **Community posts**, verify loading, error/retry, and “No community posts for this project yet.” states; verify every overview is explicitly linked to the selected project and ordered by score, then newest; and verify selecting an overview opens `/community/post/:postId` in the same tab with voting, comments, and sharing available. Finally, verify only moderators see review controls, keyboard and touch map selection work, and complete provider failure leaves the project list usable.

## DPWH hackathon feed

Map data is requested through the public `dpwh-projects` Edge Function, which proxies the official DPWH Transparency API used by the [reference scraper](https://github.com/csiiiv/dpwh-transparency-data-api-scraper). This avoids storing the full dataset in Supabase.

The demo fetches one configurable source page, caches it in the warm function instance for five minutes, filters valid coordinates to the current map bounds, and returns at most 500 markers. Selecting a marker loads its contract details on demand. Configure the page and size with `DPWH_DEMO_PAGE` and `DPWH_DEMO_LIMIT`; the default size is 500 to reduce upstream timeouts, while the API documents a maximum of 5,000.

This is intentionally a hackathon integration. The upstream service can rate-limit or block automated requests, and one page is not a complete geographic index. Choose a page containing the projects you plan to demonstrate, keep refreshes modest, and retain visible DPWH attribution.

Deploy the feed with:

```bash
supabase functions deploy dpwh-projects --no-verify-jwt
supabase secrets set DPWH_DEMO_PAGE=1 DPWH_DEMO_LIMIT=5000
```

Project IDs remain `dpwh-<contractId>`. Community posts created against removed imported rows are not automatically recreated; the local seed's two fictional project references remain available for community-flow demonstrations.

## Deploy

Link the CLI to a development project before applying changes:

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy scan-project
supabase functions deploy dpwh-projects --no-verify-jwt
supabase secrets set GROQ_API_KEY=... GROQ_MODEL=qwen/qwen3.6-27b
supabase secrets set DPWH_DEMO_PAGE=1 DPWH_DEMO_LIMIT=5000
```

## Checks

```bash
npm run build
npm test
```
