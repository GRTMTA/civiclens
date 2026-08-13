# CivicLens

CivicLens is a Cebu City transparency PWA using Supabase Auth, Postgres/PostGIS, private Storage, Edge Functions, and Groq vision.

## Local setup

1. Install dependencies: `npm install`
2. Install the Supabase CLI, then run `supabase start`
3. Copy `.env.example` to `.env.local` and add the local project URL and publishable key from `supabase status`
4. Add server secrets with `supabase secrets set GROQ_API_KEY=... GROQ_MODEL=qwen/qwen3.6-27b`
5. Run the web app with `npm run dev`

Without `GROQ_API_KEY`, scans use a safe demo analysis. The local seed includes one DPWH-shaped project fixture.

## Architecture

- `src`: React and Vite client using Supabase Auth, database, Storage, and Functions
- `supabase/migrations`: PostGIS schema, profile provisioning, RLS policies, and database functions
- `supabase/functions/scan-project`: authenticated Groq image analysis and project matching
- `supabase/seed.sql`: local demonstration data

Report photos are private and stored under the authenticated user's folder. Groq credentials are Edge Function secrets and must never use the `VITE_` prefix.

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
