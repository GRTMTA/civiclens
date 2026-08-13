# CivicLens MVP Plan

## Summary

Build an English-first React PWA and Node.js API for Cebu City that lets authenticated residents photograph public infrastructure, identify likely official projects with Groq vision plus location evidence, and view traceable government-project details. Include a public, community-reported anomaly feed.

## Implementation Changes

- Create a TypeScript workspace with:
  - React/Vite PWA frontend: Google sign-in, camera capture, GPS permission, scan results, project detail pages, map, report submission, and anomaly feed.
  - Fastify Node.js API: Google ID-token verification, scan orchestration, source adapters, matching, reports, moderation, and rate limiting.
  - PostgreSQL with PostGIS for project geometry, source snapshots/cache, scans, reports, users, and moderation history; object storage for public report photos.

- Integrate Groq’s Responses API using a configurable vision-capable model (default `qwen/qwen3.6-27b`). Send a compressed scan image and structured prompt; require JSON containing infrastructure category, visible text/signboard clues, extracted identifiers, and confidence. Groq is a candidate-ranking aid—not the authority for project facts. [Groq vision docs](https://console.groq.com/docs/vision?source=post_page-----c0638d38e38c--------------------------------)

- Implement matching flow:
  1. Capture photo, current coordinates, timestamp, and available EXIF metadata.
  2. Call Groq to classify the infrastructure and extract visual clues.
  3. Query the DPWH Transparency Portal first, then official Open Data Philippines and Cebu government sources for Cebu City records; use server-side provider adapters and short-lived caches because public portals may not provide stable APIs. Show each source URL and “last checked” timestamp. [DPWH Transparency Portal](https://transparency.dpwh.gov.ph/) [Open Data Philippines](https://data.gov.ph/)
  4. Score official candidates using geographic proximity, infrastructure type, extracted project ID/text, and source-record status.
  5. Display up to three ranked verified matches with confidence and let the user select one. If none meets the threshold, ask for a clearer photo/project billboard rather than inventing a result.

- Project detail pages show official project name/ID, description, implementing agency, contractor, budget, timeline, completion/progress status, location, supporting documents/photos when available, source links, and last-updated information.

- Add publicly visible anomaly reports linked to a verified project:
  - Signed-in users submit category, note, photo, and current location.
  - Publish immediately with the reporter’s Google profile name, a rounded map location, “Community report—unverified” label, and timestamp.
  - Run automated profanity/PII checks, provide report/appeal controls, and give administrators tools to hide, correct, resolve, or remove reports while retaining an audit trail.
  - Never display exact capture coordinates or EXIF data publicly.

- Treat scan data as ephemeral: discard the image, EXIF, and exact scan location after matching unless the user explicitly attaches a photo to an anomaly report. Explain camera, location, AI, and data-retention behavior before first use.

## Public Interfaces

- `POST /api/scans`: authenticated image upload plus client coordinates/timestamp; returns `needs_retake` or ranked verified project candidates with confidence and evidence.
- `GET /api/projects/:id`: normalized official project details, source provenance, and linked public reports.
- `POST /api/reports`: authenticated report for an existing verified project; returns published report status.
- `GET /api/reports`: paginated public feed with project, rounded location, and lifecycle status.
- Admin-only moderation endpoints update report visibility/status and record the acting administrator and reason.

## Test Plan

- Unit-test metadata extraction, source normalization, geospatial filtering, candidate scoring, confidence thresholds, and coordinate rounding.
- Mock Groq and each source adapter to test valid, malformed, slow, unavailable, and contradictory responses.
- End-to-end test Google-authenticated camera scan, ranked match selection, low-confidence re-photo flow, source attribution, report publication, abuse reporting, and admin takedown.
- Verify PWA installability, offline shell behavior, responsive mobile camera flow, permission denial handling, accessibility, and no persistence/public exposure of ephemeral scan coordinates or images.

## Assumptions

- The pilot is limited to Cebu City and prioritizes DPWH records; only official fallback records geographically relevant to Cebu City are eligible.
- Required login uses Google; anonymous scanning and account-based saved history are out of scope.
- Public reports are immediate but explicitly unverified, and administrator moderation is available for the hackathon deployment.
- Government-source adapters comply with each portal’s access terms; unavailable live records result in a retry/error state rather than fabricated data.
