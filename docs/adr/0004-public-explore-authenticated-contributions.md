# Public Explore with authenticated contributions

**Status: accepted.** CivicLens will allow visitors to browse official records and privacy-limited observation summaries without signing in, while requiring authentication for scanning, submitting observations, saving future user-owned content, and viewing personal history. Original photos, exact capture coordinates, and identifying metadata remain private by default.

**Consequences:** Public-read access must be designed explicitly in Supabase RLS and query APIs; an observation may be publicly visible while its private evidence remains restricted; the UI must explain the sign-in boundary at the moment a protected action is attempted.
