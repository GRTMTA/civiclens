# CivicLens

CivicLens is a Cebu City transparency PWA using Supabase Auth, Postgres/PostGIS, private Storage, Edge Functions, and Groq vision.

## Local setup

1. Install dependencies: `npm install`
2. Install the Supabase CLI, then run `supabase start`
3. Copy `.env.example` to `.env.local` and add the local project URL and publishable key from `supabase status`
4. Add server secrets with `supabase secrets set GROQ_API_KEY=... GROQ_MODEL=qwen/qwen3.6-27b`
5. Run the web app with `npm run dev`

Without `GROQ_API_KEY`, scans use a safe demo analysis. Project records are loaded separately through the pinned DPWH importer described below.

## Architecture

- `src`: React and Vite client using Supabase Auth, database, Storage, and Functions
- `src/app-routes.ts`: paths the landing/auth bundle owns, plus the post-login destination
- `src/community`: the `/community` and `/community/post/:postId` discussion surface
- `supabase/migrations`: PostGIS schema, profile provisioning, RLS policies, and database functions
- `supabase/functions/scan-project`: authenticated Groq image analysis and project matching
- `supabase/seed.sql`: documents the external project-data import boundary

Client routes are `/` (landing), `/login`, `/register`, `/map`, `/community`, and `/community/post/:postId`; anything else renders the not-found screen. Authentication returns residents to `/community`.

Report photos are private and stored under the authenticated user's folder. Groq credentials are Edge Function secrets and must never use the `VITE_` prefix. The `scan-project` Edge Function remains deployed for image analysis, but no client screen calls it at present.

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
