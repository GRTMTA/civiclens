# CivicLens

CivicLens is a Cebu City transparency PWA prototype. It uses a phone camera, location evidence, official project records, and Groq vision to help residents identify public infrastructure and publish clearly labelled community reports.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/health

Without `GROQ_API_KEY`, scans use a safe demo analysis and the seeded DPWH-shaped fixture so the camera flow can be demonstrated. With a key, the API sends images to Groq server-side; never put that key in Vite environment variables.

## Current integration boundaries

The source adapter interface is in `apps/api/src/providers.ts`. It currently contains a Cebu demo record and empty official fallbacks because the DPWH/Open Data portals do not expose a stable common API. Replace those adapter methods with approved fetch/parsing implementations before production use.

The report route currently uses an in-memory store for the hackathon demo. `apps/api/schema.sql` defines the PostGIS-backed persistence model for wiring to PostgreSQL. Google sign-in UI is represented by the sign-in entry point; verify Google ID tokens and attach roles before exposing this beyond a demo.

## Checks

```bash
npm run build
npm test -w @civiclens/api
```
