# CivicLens dashboard and mapping research

**Date:** 2026-08-13  
**Scope:** product critique, dashboard architecture, mapping stack, UI component reuse, and open-source civic/GIS references.  
**Evidence rule:** external technical claims below use first-party documentation or the source repository. Product recommendations are explicitly marked as recommendations or inferences.

## Executive decision

Ship CivicLens as a **map-led civic explorer with one dominant task: connect a photographed place to the most likely official record**. Do not ship a conventional analytics dashboard, a citizen-facing “issue score,” or a full GIS filter console.

The best hackathon architecture is:

- a public Explore map of Cebu City with two clearly separated data families: **Official projects** and **Community observations**;
- a compact desktop context rail and a mobile bottom drawer for the selected project or observation;
- a persistent **Scan infrastructure** action that opens the capture flow;
- a scan result that presents ranked candidates as **record matches**, with evidence and uncertainty rather than an unexplained probability;
- a separate moderator queue with a table as the primary work surface and a map as supporting context;
- a small, server-driven viewport query rather than downloading the full DPWH snapshot to the browser.

This is a product recommendation based on the current implementation and the capabilities of the evaluated libraries. The current app has a single live entry point in [`src/main.tsx`](../../src/main.tsx), while [`src/router.tsx`](../../src/router.tsx) is a separate routing scaffold; the package manifest has no map library and the public map query needed for Explore does not yet exist in the migrations. The repository already includes local shadcn-style primitives such as [`sidebar.tsx`](../../src/components/ui/sidebar.tsx), [`sheet.tsx`](../../src/components/ui/sheet.tsx), [`drawer.tsx`](../../src/components/ui/drawer.tsx), and [`resizable.tsx`](../../src/components/ui/resizable.tsx), but the current `package.json` does not list the packages those files import. These are implementation facts, not assumptions about the desired final design.

## The hard product critique

### Map-first is right for Explore, wrong as the only entry point

The map is CivicLens’s differentiator: it makes government records local, visible, and explorable without requiring a resident to understand an enterprise navigation model. It is not, however, self-explanatory. A resident landing on hundreds of unfamiliar points needs a question and a next action, not a blank GIS canvas.

Use a map-first **Explore** screen with a short task prompt above or over the map:

> “What is documented near you?”

Offer three actions: **Use my location**, **Browse a barangay**, and **Scan infrastructure**. The map should be usable without signing in; require authentication when a user scans, saves, or submits an observation. The current app requires a session before the user can see the authenticated experience and its scan endpoint explicitly requires authentication, so this recommendation would require a deliberate public-read boundary rather than a cosmetic navigation change ([`src/main.tsx`](../../src/main.tsx), [`supabase/functions/scan-project/index.ts`](../../supabase/functions/scan-project/index.ts)).

The conventional dashboard assumption is the wrong mental model. “1,284 projects / 327 reports / 128 issues” is an internal-operations summary, not a resident task. Put small counts in the map legend or barangay summary, where they answer a local question.

### The marker model can easily imply more than the data proves

Residents will not automatically know that a marker means “a record exists at this coordinate” rather than “this project is currently happening here.” The UI must state that distinction in the legend and in every detail view:

- **Official project:** “Government record” with source, snapshot date, and official status.
- **Community observation:** “Resident-submitted observation” with submission date and moderation state.
- **Nearby, not linked:** an observation that is geographically close but has not been attached to a project.

Use shape and structure as well as color: a solid circle for an official record, a diamond or outlined pin for an observation, and a combined symbol only when the relationship is explicit. Do not use red for every unverified observation; red will read as “danger” or “corruption.” Use neutral status badges such as “Unverified,” “Resolved,” and “Hidden,” matching the database enum ([`20260813000000_initial_schema.sql`](../../supabase/migrations/20260813000000_initial_schema.sql)).

Separate official and observation clusters only if the cluster itself explains the split, for example “12 projects · 3 observations.” A cluster that merely says “15” hides the most important provenance distinction. A separate “observations” layer toggle is useful; separate interaction models for the two object types are not.

### The current match percentage is not safe to expose as a probability

The current UI renders `Math.round(m.confidence * 100)` as “% match,” while the server-side ranking starts from a fixed base and adds distance, category, and clue bonuses. The ranking function caps the value at `0.99`, and its score does not use the vision model’s reported confidence except indirectly through extracted category and clues ([`src/main.tsx`](../../src/main.tsx), [`supabase/functions/_shared/matching.ts`](../../supabase/functions/_shared/matching.ts), [`supabase/functions/scan-project/index.ts`](../../supabase/functions/scan-project/index.ts)). That is a ranking heuristic, not a calibrated probability that the project is the one in the photo.

Rename the result to **Likely record matches** and show three evidence rows:

1. “Same infrastructure category”;
2. “34 m from the capture location”;
3. “Contract identifier detected” or “name/location clue found.”

Use qualitative bands only if they are empirically validated: “strong candidate,” “possible candidate,” and “not enough evidence.” Otherwise, show the ordered candidates and say “CivicLens ranks records using these clues; it does not verify project identity.” This wording is also consistent with the scan prompt, which already instructs the model not to claim a government project identity ([`supabase/functions/scan-project/index.ts`](../../supabase/functions/scan-project/index.ts)).

### Location is evidence, not ground truth

The browser location API can return a point that is inaccurate, stale, or located near a long road project. The current flow stores only latitude and longitude in React state and does not retain `accuracy`, let the user move a capture pin, or show the distance uncertainty ([`src/main.tsx`](../../src/main.tsx)). The database also stores projects and reports as points, not footprints or line geometries ([`20260813000000_initial_schema.sql`](../../supabase/migrations/20260813000000_initial_schema.sql)).

The capture flow should therefore:

- show an accuracy radius when the browser provides one;
- let the user confirm or adjust the observation point on the map;
- say “distance from reported capture point,” not “the project is 34 m away”;
- lower the strength of distance evidence when the accuracy radius is large;
- allow “I do not know the exact project” and “show nearby records” as valid outcomes.

Do not silently convert a coarse location into a confident match.

### “Things Worth Checking” is still an accusation-shaped surface

Even factual signals can become an accusation when presented as a red list beneath a project. “Recent photos after completion,” “multiple reports,” and “unusual metadata” are observations only when their provenance, dates, and limitations are visible. They are not evidence of wrongdoing and should not be summarized into one score.

For the prototype, cut the section or rename it **Evidence to review**. Each item should be a source-linked fact: “Official record lists completion date: 2025-11-30”; “A resident photo was submitted on 2026-08-05”; “Report status: unverified.” Avoid model-generated labels such as “unusual,” “suspicious,” or “anomaly.” The system’s own source boundary is important here: the README describes a pinned BetterGov.PH/DPWH snapshot, while reports are separate user-generated records ([`README.md`](../../README.md), [`20260813000000_initial_schema.sql`](../../supabase/migrations/20260813000000_initial_schema.sql)).

### The drawer currently wants to be a data export

A project detail panel that shows every field at once will be unreadable on a phone and will make missing values look like defects. Use progressive disclosure:

**First view:** project name, official status, category, approximate map location, source freshness, contract ID if available, and community-observation count.  
**Evidence section:** source link, source revision/import date, official dates, and observation list.  
**Metadata section:** agency, contractor, value, funding, program, and district office.  
**Actions:** view official record, scan this place, submit observation.

Do not call a timeline “contract awarded / started / target completion / completed” until the source provides those as separate events. The current schema has `start_date` and `completion_date`, but not a distinct award date, target completion date, or official completion event ([`20260814000000_dpwh_project_metadata.sql`](../../supabase/migrations/20260814000000_dpwh_project_metadata.sql)). A timeline can be a high-value later feature, but the prototype should show a two-date “official record dates” block.

### Navigation should be smaller than the proposed list

Ship **Explore**, **Reports**, **Scan**, and **Profile**. Put “About the data” and “How CivicLens works” in an About/Help surface, not the primary navigation. Cut **My Scans** until scan history is persisted; the current scan result exists only in component state and there is no scan-history table ([`src/main.tsx`](../../src/main.tsx), [`supabase/migrations/20260813000000_initial_schema.sql`](../../supabase/migrations/20260813000000_initial_schema.sql)). Cut **Saved Projects** until saved-project persistence and a clear return use case exist. A “save” button without durable retrieval creates false affordance.

### Barangay Lens deserves priority, but not a separate dashboard

Barangay Lens is more broadly useful than AI scanning because it answers a resident’s basic question without requiring a photo, good lighting, accurate GPS, or an AI call. It should be a map mode or search action: choose a barangay, fit the map to its boundary, and show a compact summary of documented projects, categories, official statuses, documented contract value, and observations.

Do not build a full barangay analytics dashboard for the prototype. The high-impact slice is a barangay selector, boundary highlight, summary strip, and filtered project list. The current schema has region and project metadata indexes but no barangay field or boundary table, so the boundary/data work is not free ([`20260814000000_dpwh_project_metadata.sql`](../../supabase/migrations/20260814000000_dpwh_project_metadata.sql)). Treat it as a small follow-up only if a Cebu barangay boundary source and a defensible project-to-barangay assignment are available.

### Moderation should be queue-first, map-assisted

Moderators are not exploring a city for curiosity; they are processing evidence, comparing records, and making state changes. A map-centric moderation UI would make them repeatedly hunt for the same report. Use a split workspace:

- left: a sortable/filterable queue of unverified reports;
- right: selected report, map location, official project record, evidence photo if authorized, author note, related observations, and moderation history;
- actions: keep unverified, resolve, hide, and record a reason.

The map should support “fly to report,” show the associated project, and reveal nearby observations, but it should not be the primary index. This matches the existing backend concepts: report status, moderator-only private-photo access, and append-only moderation events ([`20260813000000_initial_schema.sql`](../../supabase/migrations/20260813000000_initial_schema.sql)).

## Recommended experience architecture

### Desktop

Use a full-height map with a narrow top bar and a contextual rail that occupies roughly 360–440 px when open. A resizable split is optional; constrain it so the map never becomes a thumbnail. The desktop navigation should be a small collapsible rail containing Explore, Reports, and Profile, with Scan as a visually dominant action in the top bar or rail.

The selected project rail should not force a route change. Selecting a marker updates a URL-addressable selection and opens the rail; closing it leaves the map position intact. A cluster click expands the cluster or opens a short list; it must not guess which project the user meant.

### Mobile

Use a near-full-screen map with a bottom navigation bar: Explore, Reports, Scan, Saved only if implemented, and Profile. Project and observation details belong in a vertical drawer with snap points. The current shadcn Drawer documentation explicitly supports vertical sizing, scrollable content, swipe handles, snap points, and responsive Dialog/Drawer composition ([shadcn Drawer](https://ui.shadcn.com/docs/components/base/drawer)).

Keep filters in a compact bottom sheet/drawer, not a permanently visible left panel. Keep the scan action reachable with one thumb, but do not let a floating button cover the attribution, user location control, or the selected marker.

### First-time user

1. Show Explore with a short explanation that the map contains official records and resident observations.
2. Start on Cebu City or the user’s chosen location; do not request location until the user taps “Use my location.”
3. Offer “Browse a barangay” and “Scan infrastructure” as the two clear paths.
4. Let visitors inspect official records without an account.
5. Ask for sign-in only at the moment a scan request or observation submission needs it, with a clear explanation of why attribution and private evidence require an account.

The current Supabase flow already uses email/password sign-in and sign-up. Supabase documents email/password and magic-link/OTP flows for React, and its current React quickstart points developers to drop-in UI components while showing the client-side SDK integration ([Supabase password auth](https://supabase.com/docs/guides/auth/passwords), [Supabase React quickstart](https://supabase.com/docs/guides/auth/quickstarts/react)). Use a shadcn login block as the visual starting point, but keep the auth behavior and email-confirmation states owned by CivicLens.

### Returning user

Return to the last map viewport only if it does not obscure the current-city orientation. Put recent scans and authored reports under Profile or Reports, not as a dashboard wall. A future “recently viewed” list is more useful than an empty Saved Projects section.

### Scan flow

The scan flow should be a focused sequence, not a dashboard modal stack:

1. Capture or upload an image.
2. Show location accuracy and let the user confirm the point.
3. Ask for a wider image or signboard if the image is not useful.
4. Show detected category/clues as AI-generated observations, not identity claims.
5. Query a bounded set of nearby official records.
6. Show three ranked **likely record matches** with distance, category, identifier/text clues, and source freshness.
7. Let the citizen inspect the record or submit an observation against a selected record.

The current Edge Function already has useful safety boundaries: authentication, scan quota, image type/size checks, a model prompt that forbids claiming project identity, nearby PostGIS lookup, and a “needs_retake” result ([`supabase/functions/scan-project/index.ts`](../../supabase/functions/scan-project/index.ts)). Preserve those boundaries while making the user-facing terminology match them.

### Project detail

The primary call to action should be **View official record**, not “Report anomaly.” A report is a secondary action labelled **Submit an observation**. The form should ask “What did you observe?” and offer neutral categories such as surface damage, obstruction, construction activity, access/safety, or other. It should explain that submission does not establish a finding and may be moderated.

Public report cards should show status and date, but avoid publishing exact author identity or photo location precision unless the user has explicitly opted in and the privacy review supports it. The National Privacy Commission states that photos and videos containing personal information require a lawful basis and must follow transparency, legitimate-purpose, and proportionality principles ([NPC reminder on sharing photos/videos](https://privacy.gov.ph/reminder-on-sharing-photos-and-videos-containing-personal-data/), [Republic Act 10173](https://privacy.gov.ph/data-privacy-act/)). This is a design risk to manage, not a legal conclusion about CivicLens’s compliance.

### Barangay exploration

Use a single “Browse area” control. After a barangay is selected, show:

- documented project count;
- documented contract value only when the source field is present and the currency/coverage is clear;
- category chips;
- official status chips;
- observation count with a separate “unverified” label.

Do not call the total “money spent” if the source field is contract amount or budget. Do not aggregate incomplete/mixed-currency source rows without an explicit data note.

### Report submission

Treat the report as a structured observation with an optional private evidence photo. The submit screen should show the selected project, capture location, category, note, privacy reminder, and “publish observation” action. Do not reuse the scanned image as an automatically public report photo; the current implementation passes the same selected file to report creation, which risks publishing a photo the user intended only for matching ([`src/main.tsx`](../../src/main.tsx), [`src/supabase.ts`](../../src/supabase.ts)). Make the user choose whether to attach a photo and tell them where it will be visible.

### Moderator experience

Build the smallest reliable review queue:

- status tabs: Unverified, Resolved, Hidden;
- filters: category, date, linked project, and “has photo”;
- table columns: date, category, project, distance/area, photo indicator, status;
- selected report pane: map, public note, authorized private photo, official record, nearby/related reports, and moderation history;
- explicit reason field on resolve/hide.

Do not build moderation analytics, heatmaps, or bulk actions for the prototype. Bulk state changes are especially risky when report status is part of the public trust model.

## Mapping stack comparison

### Recommendation: MapLibre GL JS plus `react-map-gl/maplibre`

Choose **MapLibre GL JS** as the renderer and **`react-map-gl/maplibre`** as the React integration. MapLibre is an open-source TypeScript web-map library, and the official source repository is BSD-licensed; the vis.gl wrapper provides React components for MapLibre, controlled camera state, `Source`/`Layer` components, and access to native map methods when needed ([MapLibre GL JS repository](https://github.com/maplibre/maplibre-gl-js), [MapLibre license](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt), [react-map-gl introduction](https://visgl.github.io/react-map-gl/docs), [react-map-gl state management](https://visgl.github.io/react-map-gl/docs/get-started/state-management)).

For v8, use the MapLibre endpoint with a supported MapLibre version; the vis.gl release notes say `react-map-gl/maplibre` is for `maplibre-gl >=4` ([react-map-gl v8 notes](https://visgl.github.io/react-map-gl/docs/whats-new)). The separate `@vis.gl/react-maplibre` package has a similar API and official documentation, but do not mix both wrappers in one app. Pick one package and pin compatible versions.

Why this fits CivicLens:

- MapLibre renders sources and layers in the map renderer rather than requiring a React DOM node for every project.
- GeoJSON sources support clustering; MapLibre exposes cluster expansion, leaves, and child retrieval ([GeoJSONSource API](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/)).
- `queryRenderedFeatures` supports click/box queries for visible rendered features, and `querySourceFeatures` queries currently loaded source features, which supports marker selection and cluster inspection ([Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/)).
- The React wrapper supports controlled map state and `Source`/`Layer` composition, which is useful for synchronizing the URL, selection drawer, filters, and map camera ([controlled state](https://visgl.github.io/react-map-gl/docs/get-started/state-management), [custom data](https://visgl.github.io/react-map-gl/docs/get-started/adding-custom-data)).

This is not a claim that MapLibre supplies tiles for free. The renderer, style, basemap, and tile hosting are separate choices. The react-map-gl documentation distinguishes the open-source wrapper/renderer from Mapbox’s billable data service ([react-map-gl token guidance](https://visgl.github.io/react-map-gl/docs/get-started/mapbox-tokens)). If CivicLens uses OpenStreetMap’s public raster tile server, the OSM Foundation requires visible attribution, correct identification, caching, and no bulk/prefetch use; it also states that the service is best-effort and may block harmful usage ([OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/)). For a real deployment, select a permitted vector-tile provider or self-hosted/managed tiles and keep the provider switchable.

### OpenLayers

**OpenLayers is the stronger GIS engine, but not the best first choice for this React prototype.** Its official repository describes a high-performance, feature-packed web mapping library with tile, vector, and marker support and a BSD-2-Clause license ([OpenLayers repository](https://github.com/openlayers/openlayers), [OpenLayers documentation](https://openlayers.org/doc/)). Its clustering source supports point features, configurable pixel distance/minimum distance, custom geometry functions, and custom cluster creation ([Cluster API](https://openlayers.org/en/latest/apidoc/module-ol_source_Cluster-Cluster.html)). Its vector source uses an R-tree spatial index by default and exposes extent and closest-feature queries ([VectorSource API](https://openlayers.org/en/latest/apidoc/module-ol_source_Vector-VectorSource.html)).

OpenLayers should win if CivicLens becomes a professional GIS product with WMS/WFS, multiple projections, editing/drawing, complex line/polygon geometries, or specialized vector/WebGL layers. The official examples cover WMS/WFS, vector tiles, WebGL points, URL permalink state, clustering, and feature selection ([OpenLayers examples](https://openlayers.org/en/latest/examples/)). For the current point-heavy, React-first, mobile drawer experience, it adds more imperative map lifecycle work and has no first-party React wrapper comparable to the vis.gl integration. A third-party wrapper exists, but it is not the OpenLayers project itself and should not be treated as an official dependency ([third-party react-openlayers repository](https://github.com/allenhwkim/react-openlayers)).

### Decision table

| Choice | Best fit | CivicLens verdict |
|---|---|---|
| MapLibre GL JS + `react-map-gl/maplibre` | React application with interactive vector layers, clusters, controlled camera, and mobile/desktop overlays | **Ship this** for the prototype. |
| OpenLayers | GIS-heavy system with OGC services, projection work, editing, and complex geometry | Keep as the fallback if the domain expands into a real GIS. |
| Raw MapLibre imperative API | Small map-only page with no React-controlled selection/state | Do not use as the main integration; it will make URL/drawer/filter synchronization harder. |
| Kepler.gl/deck.gl | General-purpose large-data exploration and analytical visualization | Use as research/inspiration, not as the CivicLens shell. |

## Data and rendering architecture

### Do not load the whole DPWH snapshot into the browser

The README documents a 248,220-row snapshot, with 214,747 geocoded rows accepted by the validation dry run ([`README.md`](../../README.md)). MapLibre’s own large-GeoJSON guidance recommends reducing data, chunking, streaming, clustering, and eventually vector tiles/server tiling for large datasets ([MapLibre large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/)).

For the hackathon, implement a public `projects_in_view(min_lat, min_lng, max_lat, max_lng, filters...)` RPC that returns a deliberately small feature projection. Supabase’s PostGIS guide describes exactly this viewport bounding-box pattern and recommends a spatial index on the geography column ([Supabase PostGIS guide](https://supabase.com/docs/guides/database/extensions/postgis)). The same guide documents nearest-neighbor ordering and indexed distance queries, which can remain the scan path rather than being duplicated in the browser.

Use a debounced viewport query with a small padding margin, abort stale requests, and keep the selected project in state even while the viewport changes. Query official projects and observations separately so layer toggles and provenance remain explicit. For the current dataset, a bbox RPC is the lowest-maintenance solution. Move to server-generated vector tiles or a tile server only after measured viewport payloads or query latency justify it; MapLibre’s documentation lists vector tiles and server tiling as the scale-up path ([large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/)).

### Render most objects as sources/layers, not React markers

Use these MapLibre sources/layers:

- `official-projects`: GeoJSON source with circle/symbol layers and clustering;
- `community-observations`: separate GeoJSON source with a different shape and cluster styling;
- `selected-project`: one small source or a single HTML marker for the selected object;
- `capture-point`: a temporary user-location/accuracy visualization;
- optional `barangay-boundary`: line/fill source only when authoritative boundary geometry exists.

Use a React `Marker`/HTML overlay only for the selected project, capture point, or a handful of scan candidates. Do not create hundreds of React markers when MapLibre source layers can render the collection. The wrapper’s official custom-data example shows the intended `Source` plus `Layer` approach ([react-map-gl custom data](https://visgl.github.io/react-map-gl/docs/get-started/adding-custom-data)).

Use `queryRenderedFeatures` on the specific project/observation layer IDs for click selection. On a cluster click, read the cluster ID, call the source’s expansion-zoom method, and show leaves only when a list is useful ([MapLibre GeoJSONSource cluster API](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/), [MapLibre query API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/)).

### Points versus lines/polygons

Do not draw a road project as a line or a building project as a polygon merely because the category suggests it. The current database schema stores `geography(point, 4326)` for both projects and reports ([`20260813000000_initial_schema.sql`](../../supabase/migrations/20260813000000_initial_schema.sql)). Keep the symbol labelled “recorded project location” until the source dataset supplies geometry and the importer preserves its provenance. If future source geometry exists, render it as a separate “official footprint/route” layer and keep the point as the record’s canonical location only when the source semantics justify that distinction.

### URL-addressable state

Encode at least `lat`, `lng`, `zoom`, active layer toggles, basic filters, and `project` or `report` selection in the URL. The controlled-map model in react-map-gl is intended for applications where other components must synchronize with map state ([react-map-gl state management](https://visgl.github.io/react-map-gl/docs/get-started/state-management)). MapLibre also has an official hash-routing example ([MapLibre hash routing](https://maplibre.org/maplibre-gl-js/docs/examples/hash-routing/)). URL state makes a project record shareable and makes “View this official record” a real product surface rather than a transient drawer.

## Filters: resident mode versus investigation mode

### Initial resident mode

Show no more than:

- project type: roads, drainage/flood control, bridges, buildings/facilities;
- official status: ongoing, completed, other/not reported;
- community observations: show/hide;
- “near me” or “this barangay.”

Add a text search for project name, contract ID, or location only if it is reliable. Do not expose contractor, contract value, agency, year, report status, and every source field as a row of controls on first load.

### Advanced investigation mode

Put year, implementing agency, contractor, contract value range, source status, report status, barangay, distance, and “has evidence photo” in a filter drawer or moderator/project-search surface. This serves journalists, researchers, moderators, and engaged residents without making casual exploration feel like a government procurement database.

The project detail still exposes all available official metadata through progressive disclosure. Search/filter controls and record transparency are different problems.

## shadcn/ui and Supabase UI assessment

### Reuse from shadcn

Use shadcn as a component source and accessibility baseline, not as a visual identity. The shadcn repository describes its components as open source, customizable, and MIT-licensed ([shadcn/ui repository](https://github.com/shadcn-ui/ui)).

- **Sidebar:** reuse the primitives for the small desktop navigation rail and responsive mobile navigation. The official docs describe a composable sidebar with controlled state, mobile behavior, menu groups, and a rail ([Sidebar docs](https://ui.shadcn.com/docs/components/radix/sidebar)). Do not import the entire dashboard block as the CivicLens information architecture.
- **Sheet:** use for desktop filters, help/about, or a side detail surface. The docs support top/right/bottom/left placement and standard Dialog-like composition ([Sheet docs](https://ui.shadcn.com/docs/components/base/sheet)).
- **Drawer:** use for mobile project details and scan results. Snap points, swipe handles, scrollable content, and responsive Drawer/Dialog composition are directly relevant ([Drawer docs](https://ui.shadcn.com/docs/components/base/drawer)).
- **Resizable:** use only for the desktop map/context split if testing proves users benefit from resizing. The component is a wrapper around `react-resizable-panels`; it is a layout primitive, not a map architecture ([Resizable docs](https://ui.shadcn.com/docs/components/base/resizable)).
- **Data Table + TanStack Table:** reuse for moderation and advanced search. The official guide intentionally treats the table as a configurable composition with sorting, filtering, pagination, visibility, row selection, and actions rather than one universal component ([Data Table docs](https://ui.shadcn.com/docs/components/base/data-table)).
- **Login blocks:** use the structure and form styling from the login blocks, then wire it to the existing Supabase flow. The blocks are intended as copyable building blocks, not a mandated application shell ([shadcn login blocks](https://ui.shadcn.com/blocks/login)).

The official `dashboard-01`/sidebar block is a useful layout reference, but copying its cards, charts, activity lists, and enterprise navigation would pull CivicLens back toward the product model this review rejects ([shadcn blocks](https://ui.shadcn.com/blocks)).

### Supabase UI/auth caution

Supabase’s current React quickstart points to drop-in UI components and its 2025 Supabase UI announcement says the library is built on shadcn/ui and intended to be installed through the component registry ([Supabase React quickstart](https://supabase.com/docs/guides/auth/quickstarts/react), [Supabase UI announcement](https://supabase.com/blog/supabase-ui-library)). Do not start from the old `supabase-community/auth-ui` repository without checking the maintenance state: its repository says it was archived in October 2025 and is in maintenance mode ([auth-ui repository](https://github.com/supabase-community/auth-ui)). For CivicLens, shadcn form primitives plus the existing `@supabase/supabase-js` calls are the least risky path.

## Reusable open-source references

These are intentionally separated into **code candidates** and **pattern references**. None should be copied wholesale into CivicLens.

### FixMyStreet — pattern reference, not a direct code transplant

[FixMyStreet Platform](https://fixmystreet.org/overview/) is a real open-source geographic problem-reporting platform designed for residents to report street problems to an appropriate authority. Its documentation covers customization, map/report flows, administration, and international deployment; the source is hosted at [mysociety/fixmystreet](https://github.com/mysociety/fixmystreet). It is under the AGPL license ([FixMyStreet community/licensing page](https://fixmystreet.org/community/)).

Borrow these patterns: location-first reporting, category-based observation forms, duplicate/similar nearby problem prompts, report state and moderation history, mobile map behavior, and URL-addressable map views. Do not transplant the Perl/Catalyst application into this React/Vite repo. Its domain is municipal problem routing, while CivicLens adds an official-record matching layer.

### MapStore — pattern reference and possible long-term GIS foundation

[MapStore2](https://github.com/geosolutions-it/MapStore2) is an open-source React-based web mapping framework that integrates OpenLayers, Leaflet, and Cesium, supports OGC services, and provides maps, dashboards, and geostories. Its documentation describes a modular WebGIS with map querying, timelines, dashboards, and multiple remote data sources ([MapStore docs](https://docs.mapstore.geosolutionsgroup.com/en/v2025.01.02/)).

MapStore is useful inspiration for layer management, professional map tools, and richer moderator/researcher workspaces. It is not a good hackathon dependency for CivicLens: it introduces a full WebGIS product architecture and is much broader than the citizen scan-to-record path. Reuse its interaction ideas, not its application shell.

### Kepler.gl — code candidate only for a future analysis surface

[Kepler.gl](https://github.com/keplergl/kepler.gl) is an embeddable React component for high-performance geospatial exploration, built on MapLibre GL and deck.gl, with Redux-managed state. Its repository explicitly supports embedding modules into React-Redux applications and describes large-scale point rendering and spatial aggregation.

It could power a future researcher-only analysis view, but it is the wrong citizen shell: its abstraction is a data-exploration workbench, not a provenance-first record drawer. It also brings a larger state and visualization stack than the prototype needs. Use its MapLibre/deck.gl architecture as a scale reference, not as the default dependency.

### TerriaJS/TerriaMap — inspiration for public data catalogs

[TerriaJS](https://github.com/TerriaJS/terriajs) and its [TerriaMap starting point](https://github.com/TerriaJS/TerriaMap) demonstrate a mature catalog-based geospatial explorer with shareable map links, many data connectors, time dimensions, and 2D/3D modes. The repositories are valuable references for source catalogs, layer provenance, shareable views, and public-sector data exploration.

They are not reusable CivicLens code for the prototype: they are a full geospatial platform with Cesium/Leaflet-oriented architecture and a much larger operational surface. Reuse the provenance and catalog concepts only if CivicLens later becomes a multi-source public-data portal.

## Prototype cut line

### Build now

1. Public Cebu Explore map with official-project and community-observation layers.
2. Bounded viewport query with server-side PostGIS filtering.
3. Clustered layers with explicit project/observation counts and a legend.
4. Project/observation drawer with provenance-first content and a few core actions.
5. Scan Infrastructure flow with capture accuracy, candidate ranking, evidence explanations, and neutral terminology.
6. Observation submission with separate photo opt-in and clear moderation language.
7. Minimal moderator queue: table, map context, evidence review, state change, reason.

### Cut from the hackathon prototype

- analytics dashboard cards and charts;
- anomaly or corruption scores;
- a full timeline with unsupported event semantics;
- heatmaps;
- saved investigations and saved projects before persistence exists;
- My Scans before a scan-history model exists;
- contractor/value/agency/year filter overload in resident mode;
- 3D, satellite, route geometry, or polygon footprints without source geometry;
- bulk moderation actions;
- AI-generated “things worth checking” summaries;
- full MapStore/Kepler/Terria adoption.

### Strongest demonstration of unique value

The best demo is not a dense map. It is one credible journey:

1. A resident opens CivicLens and sees official projects around a barangay.
2. They take a photo of a real-looking infrastructure site.
3. CivicLens shows the capture point, category, three candidate official records, distances, and matching clues.
4. The resident opens the authoritative source record and can see the community observation layer separately.
5. They submit a factual observation with an optional photo.
6. A moderator later sees the item in a queue, compares the evidence, and changes the status with a reason.

That journey demonstrates local usefulness, responsible AI, data provenance, and accountable human review in one flow. It is also close to what the current repository already implements, while making the UI honest about what the backend does and does not prove ([`src/main.tsx`](../../src/main.tsx), [`supabase/functions/scan-project/index.ts`](../../supabase/functions/scan-project/index.ts), [`supabase/migrations/20260813000000_initial_schema.sql`](../../supabase/migrations/20260813000000_initial_schema.sql)).

## Acceptance checklist for the dashboard decision

- [ ] A first-time visitor can browse official records without seeing an unexplained sign-in wall.
- [ ] Every official record and community observation has visible provenance and distinct semantics.
- [ ] No UI label implies that a report proves corruption or that a match percentage is a probability.
- [ ] Capture accuracy and user-adjustable location are visible in the scan/report flow.
- [ ] The map loads only the current viewport or a bounded Cebu subset, not the full dataset.
- [ ] Clusters expose whether their counts are projects, observations, or both.
- [ ] Project details use progressive disclosure and do not invent timeline events.
- [ ] Resident filters are small; advanced filters are separated.
- [ ] Moderation is a queue with map context, not a second citizen map dashboard.
- [ ] The report-photo choice is explicit and private/public behavior is understandable.
- [ ] Basemap attribution and tile-provider terms are implemented before public deployment.
- [ ] URL state can reopen a project or report at a stable map view.

## Source index

The report links sources inline. The principal first-party sources consulted were:

- [MapLibre GL JS API and performance guidance](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/), [GeoJSONSource](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/), [large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/), and [license](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt).
- [react-map-gl documentation](https://visgl.github.io/react-map-gl/docs), [controlled state](https://visgl.github.io/react-map-gl/docs/get-started/state-management), [custom data](https://visgl.github.io/react-map-gl/docs/get-started/adding-custom-data), and [MapLibre version notes](https://visgl.github.io/react-map-gl/docs/whats-new).
- [OpenLayers repository](https://github.com/openlayers/openlayers), [cluster API](https://openlayers.org/en/latest/apidoc/module-ol_source_Cluster-Cluster.html), [vector source API](https://openlayers.org/en/latest/apidoc/module-ol_source_Vector-VectorSource.html), and [official examples](https://openlayers.org/en/latest/examples/).
- [shadcn/ui repository](https://github.com/shadcn-ui/ui), [Sidebar](https://ui.shadcn.com/docs/components/radix/sidebar), [Sheet](https://ui.shadcn.com/docs/components/base/sheet), [Drawer](https://ui.shadcn.com/docs/components/base/drawer), [Resizable](https://ui.shadcn.com/docs/components/base/resizable), [Data Table](https://ui.shadcn.com/docs/components/base/data-table), [login blocks](https://ui.shadcn.com/blocks/login), and [dashboard blocks](https://ui.shadcn.com/blocks).
- [Supabase React auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react), [password auth](https://supabase.com/docs/guides/auth/passwords), [Supabase UI announcement](https://supabase.com/blog/supabase-ui-library), [Supabase PostGIS guide](https://supabase.com/docs/guides/database/extensions/postgis), and [archived auth-ui repository](https://github.com/supabase-community/auth-ui).
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- [FixMyStreet Platform](https://fixmystreet.org/overview/), [source repository](https://github.com/mysociety/fixmystreet), and [licensing/community page](https://fixmystreet.org/community/).
- [MapStore2](https://github.com/geosolutions-it/MapStore2) and [MapStore documentation](https://docs.mapstore.geosolutionsgroup.com/en/v2025.01.02/).
- [Kepler.gl](https://github.com/keplergl/kepler.gl), [TerriaJS](https://github.com/TerriaJS/terriajs), and [TerriaMap](https://github.com/TerriaJS/TerriaMap).
- [Philippine Data Privacy Act](https://privacy.gov.ph/data-privacy-act/) and [NPC photo/video reminder](https://privacy.gov.ph/reminder-on-sharing-photos-and-videos-containing-personal-data/).
