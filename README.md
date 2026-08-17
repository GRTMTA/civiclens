# CivicLens

CivicLens is a Cebu City transparency PWA using Supabase Auth, Postgres/PostGIS, private Storage, Edge Functions, and Groq vision.

## Local setup

1. Install dependencies: `npm install`
2. Keep the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`; auth, community, storage, database RPCs, and moderation continue using that hosted Supabase project
3. Set `VITE_DPWH_API_URL=http://localhost:8000` in `.env.local`
4. Start only the DPWH API container with `docker compose up --build -d dpwh-api`
5. Run the web app with `npm run dev`

When the authenticated `scan-project` Edge Function is invoked without `GROQ_API_KEY`, it returns a safe demo analysis. Project records are loaded separately through the pinned DPWH importer described below. OpenFreeMap is the default 3D-capable basemap; set a domain-restricted MapTiler Free key in `VITE_MAPTILER_KEY` for the first fallback, while `VITE_MAP_STYLE_URL` remains a full style override.

## Architecture

- `src`: React and Vite client using Supabase Auth, database, Storage, and Functions
- `src/app-routes.ts`: paths the landing/auth bundle owns, plus the post-login destination
- `src/community`: the `/community`, `/community/post/:postId`, and `/community/profile/:username` surface
- `src/components/auth-menu.tsx`: the single persistent authentication control, used by both shells
- `src/map`: the official project map, including the CivicLens Intelligence, community context, and timeline sections
- `src/map/project-intelligence.ts`: the deterministic per-project evidence assessment
- `src/map/project-intelligence-panel.tsx`: the CivicLens Intelligence section of the project dialog
- `supabase/migrations`: PostGIS schema, profile provisioning, RLS policies, and database functions
- `supabase/functions/scan-project`: authenticated Groq image analysis and project matching
- `supabase/seed.sql`: local-only demo community content (see below)

Client routes are `/` (landing), `/login`, `/register`, `/map`, `/community`, `/community/post/:postId`, and `/community/profile/:username`; anything else renders the not-found screen. Authentication returns residents to `/community`.

Report photos are private and stored under the authenticated user's folder. Groq credentials are Edge Function secrets and must never use the `VITE_` prefix. Explore Map includes a clearly labeled, browser-only photo-scanning demonstration that simulates location metadata and always matches DPWH contract `17HH0130` in Brgy. Mambaling, Cebu City; it does not upload or store the image and does not call `scan-project`. The authenticated `scan-project` Edge Function remains deployed for future image analysis and project matching.

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

## CivicLens Intelligence

Each project dialog carries a **CivicLens Intelligence** section between the headline record figures and the geometry/community sections. It is an analytical layer over the published record, not a chat surface, and it identifies verification gaps rather than alleging wrongdoing.

`src/map/project-intelligence.ts` derives the reading; it is pure and deterministic, so identical inputs always yield identical confidence, wording, gaps, and evidence. Inputs are the DPWH record fields, the resident discussion explicitly linked to that project, the community pulse counts, and the stored geometry provenance. There is no model call: the reading is reproducible and auditable, and different projects genuinely produce different confidence and conclusions.

Sections render in scanning order: confidence, assessment, transparency gaps, community signals, evidence.

- **Confidence** is a weighted score over eight evidence factors (record completeness, internal consistency, recency, independent local observation, agreement among residents, record against resident accounts, geographic corroboration, external reference availability). It is bounded to 28–96% and banded high (≥78), moderate (≥58), or low. "How this was scored" discloses every factor's score and weight. Confidence describes evidence quality and agreement, never model certainty.
- **Assessment** is three sentences: what the record states, what residents reported, and how the two compare.
- **Transparency gaps** are severity-ranked and capped at five. A clean, corroborated record reports "No significant gaps detected".
- **Community signals** weight distinct residents, not post volume. One resident is a `single` account and is never presented as a community pattern; three or more residents raising the same theme is `recurring`. Theme labels are written as attributed reports ("Reported as incomplete on site"), so no theme can read as a CivicLens finding. Theme matching covers common Cebuano and Tagalog phrasing alongside English.
- **Evidence** lists each category as supporting, partial, or a gap, and every conclusion carries source chips that open the underlying facts.

Source chips link only to real, resolvable locations: the published record URL, the project's community feed, an OpenStreetMap reference for the recorded point, the imagery provider, and PhilGEPS for the unmatched procurement cross-check. Do not add fabricated citations. Procurement is deliberately reported as *not yet cross-referenced* rather than presented as checked.

Resident discussion is one evidence category. If it cannot be read, the panel degrades — confidence recomputes from record and geographic evidence only and says so — instead of hiding the section.

Two guardrails are enforced by `src/map/project-intelligence.test.ts` and must stay green:

1. No output may allege wrongdoing. The tests reject fraud, corruption, theft, falsification, and anomaly vocabulary across every generated string.
2. No output may expose the internals as unfinished. The tests reject mock, simulated, demo, placeholder, fake, and prototype vocabulary in user-visible strings.

Resident claims are always attributed ("Several residents report…") and never restated as established fact.

## Satellite map and project geometry

The project map uses MapLibre. At zoom levels below 15 it shows clustered project locations; at zoom 15 and above it switches to clickable red 50 m location indicators. Overlapping indicators open a compact centered chooser. A selected project opens a centered, viewport-constrained dialog with **Project details** and **Community posts** tabs instead of a frame-bound panel or near-full-screen sheet.

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
- Saved OSM routes are identified as **Reviewed OSM estimate** with OpenStreetMap attribution and an ODbL source link. They are never promoted to official geometry and may be replaced by an official source later.
- Automatic estimates are generated only during project import/coordinate/category changes or an operator refresh against `osm_estimate_features`; the browser never bulk-queries Overpass. `road`, `bridge`, and `drainage` categories match the nearest eligible OSM line within 50 m, while all other categories match the nearest building footprint. They are identified as **Estimated project route/building** and remain read-only/non-official.
- When no eligible OSM feature is within 50 m, the database creates a circular indicator centered on the recorded point with an estimated 50 m radius.
- Source geometry precedence remains official geometry, moderator-reviewed OSM estimate, automatic OSM estimate, then the fallback circle. The client preserves that provenance for project details but renders every project on the detailed map as the same red, display-only 50 m location circle centered on the recorded point. Stored geometry is not changed, and the circle is not a measured boundary. Do not populate `official_geometry` from any estimate. Apply `20260816000000_community_profiles_and_project_geometry.sql`, `20260816010000_osm_reviewed_estimate_geometry.sql`, and `20260816030000_automatic_project_estimates.sql` in order.

The public Overpass service is a best-effort community resource, not an unlimited production API. Candidate lookup is deliberately manual and on demand; do not bulk-query it. Set `VITE_OVERPASS_URL` to another policy-compatible mirror if needed, and retain `© OpenStreetMap contributors` attribution and ODbL compliance.

### Loading automatic OSM estimates

`osm_estimate_features` is an operator-only staging table, not a browser API. Load a Cebu OSM extract with an audited ETL process into the four allowed classes (`road`, `bridge`, `drainage`, `building_area`), retaining OSM tags, geometry, source URL, and extract timestamp. The table constraints enforce the approved tags (`highway=*`, `highway=*` plus `bridge!=no`, `waterway=drain|ditch|canal`, or `building!=no`). After replacing the extract, run `select public.refresh_all_project_automatic_estimates();` as the database owner. Regular project inserts and coordinate/category updates refresh only that project automatically. Do not grant either the staging table or refresh functions to browser roles.

Mandatory release QA: verify provider attribution is visible; OpenFreeMap is attempted first; failures advance to configured MapTiler and then EOX; the overview remains flat below zoom 15; and the camera pitches at zoom 15+. Verify clusters and individual overview markers are dark blue with white count text, then verify every project becomes a red 50 m location circle at zoom 15 regardless of underlying geometry provenance. Confirm the legend and project detail state that circles are display-only indicators rather than measured boundaries, while official, reviewed, automatic, and fallback provenance remains available in project details. Verify overlapping indicators open a centered, unclipped chooser no wider than 48rem and no taller than 70dvh. On desktop and mobile, verify the selected project opens one centered dialog; at desktop it uses the wider landscape layout (up to 72rem wide and 76dvh tall). Both tabs must support keyboard navigation, occupy equal full-width halves of the dialog, and keep long content independently scrollable. In **Community posts**, verify loading, error/retry, and “No community posts for this project yet.” states; verify every overview is explicitly linked to the selected project and ordered by score, then newest; and verify selecting an overview opens `/community/post/:postId` in the same tab with voting, comments, and sharing available. Finally, verify only moderators see review controls, keyboard and touch map selection work, and complete provider failure leaves the project list usable.

## DPWH archive feed

Only the DPWH archive API is local. The browser's `/map` data client calls the FastAPI service in `dpwh-api` directly through `VITE_DPWH_API_URL`; all auth, community, storage, database RPCs, and moderation continue using the existing hosted Supabase project. The first container start downloads roughly 115 MB and persists the indexed DuckDB database in the `dpwh-data` Docker volume; later starts reuse it.

Start the archive API:

```bash
docker compose up --build -d dpwh-api
docker compose ps
curl http://localhost:8000/health
```

The first health check can take a few minutes while the archive downloads and DuckDB is built. To rebuild from a fresh archive, run `docker compose down -v` before starting it again. Add this alongside the existing hosted Supabase values in `.env.local`:

```dotenv
VITE_DPWH_API_URL=http://localhost:8000
```

No local Supabase stack, Edge Function server, Supabase secret, or DPWH bearer token is required for the demo. The browser-facing endpoints are `GET /map/projects` and `GET /map/projects/{contractId}`; the API limits CORS to the Vite localhost origins. Project IDs remain `dpwh-<contractId>`.

## Local demo

```bash
docker compose up --build -d dpwh-api
npm run dev
```

Stop only the local DPWH service after the demo with `docker compose down`; the database volume is retained for the next run.

## Checks

```bash
npm run build
npm test
```
