# CivicLens map style and local setup guide

This guide describes the visual and runtime contract for the official-project map. The map renderer is MapLibre; the configured style URL supplies the basemap style and its source layers. CivicLens does not hard-code a public tile endpoint or silently switch providers.

## Required browser configuration

Set these values in an uncommitted `.env.local` file:

```dotenv
VITE_MAP_STYLE_URL=https://your-approved-provider.example/style.json
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-browser-safe-key
```

`VITE_MAP_STYLE_URL` must point to a MapLibre-compatible Style JSON document. A raw tile URL, a dashboard URL, or a private server-side credential is not a substitute for a style URL. Keep browser-safe values only in variables prefixed with `VITE_`; never put a database password, service-role key, or provider secret in a Vite-exposed variable.

The application intentionally shows an explicit configuration state when the style URL is missing. If the configured style fails to load, the UI offers a retry against that same provider. It does not fabricate a basemap.

## Local Supabase data

The official project layer is loaded through the bounded public RPCs created by:

```text
supabase/migrations/20260814010000_public_project_map.sql
```

For a local database, start the local Supabase stack and apply migrations:

```powershell
npx supabase start
npx supabase status
npx supabase db push --local
```

Use the browser-safe URL and publishable/anon key reported by `supabase status` in `.env.local`. Do not expose the direct database URL to the browser.

The client calls `projects_in_view` with the current map bounds and `project_detail` only after a project is selected. It must not fall back to unrestricted anonymous reads from `public.projects`.

## Remote deployment checklist

The connected Supabase project must have the public-project-map migration applied. If the browser reports that `public.projects_in_view(...)` is missing from the schema cache, the frontend contract is not the problem: the connected project is missing that migration, or the browser is pointed at a different Supabase project.

An authorized Supabase project owner should verify the link and apply the migration:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

After deployment, retry the map query. The migration uses a bounded, public-safe function and does not grant anonymous table-level reads.

## Style design rules

- Keep the basemap visually quiet so official project markers remain the strongest geographic signal.
- Keep marker status semantics factual: ongoing, completed, planned/not started, and unknown status.
- Preserve the source status in project details even when the map uses a normalized display status.
- Use the right drawer for source-record details; do not restore a second project list beside the map.
- Keep warnings factual. “Results are incomplete; zoom in” describes truncation. It does not imply wrongdoing.
- Keep official-source records, AI interpretation, and citizen observations visually and semantically separate when later layers are added.
- Preserve provider attribution required by the selected style/provider.

## Troubleshooting

### The map says that the style is unavailable

Confirm that `VITE_MAP_STYLE_URL` is present, reachable from the browser, and returns valid Style JSON. Check browser network errors, provider key restrictions, and the provider’s required attribution. Retry after correcting the provider configuration; do not replace it with an unofficial fallback.

### The map says that the data migration is required

Confirm that `.env.local` points at the intended Supabase project, then have an authorized project owner apply `20260814010000_public_project_map.sql`. The UI intentionally hides the raw PostgREST schema-cache message and provides a retry action instead.

### No markers appear after the map loads

Check the browser network request for `projects_in_view`, confirm the current bounds are valid, and verify that the selected database contains public-safe project records. A successful empty response means there are no records in the current view; pan or zoom to inspect another area.
