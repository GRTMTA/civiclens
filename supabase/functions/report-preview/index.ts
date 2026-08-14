/**
 * report-preview — public Edge Function
 *
 * Returns a server-rendered HTML page with OpenGraph / Twitter Card meta tags
 * for a given report ID. Social crawlers (which don't execute JavaScript) hit
 * this endpoint and receive meaningful preview metadata.
 *
 * Human visitors are immediately redirected to the React SPA at /#/report/<id>.
 *
 * Visibility rules:
 *   - Hidden or deleted reports return a 404 page with no report data.
 *   - Coordinates are never included in preview text (privacy).
 *   - Author name is included (it is already public in the feed).
 *
 * JWT is NOT required — this endpoint must be reachable by unauthenticated
 * crawlers. The service role key is used server-side only to bypass RLS.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:5173';
const OG_DEFAULT_IMAGE = `${APP_ORIGIN}/og-default.png`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

function html(content: string, status = 200) {
  return new Response(content, {
    status,
    headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Truncate to maxLen chars, appending … if trimmed. */
function truncate(s: string, maxLen: number): string {
  const t = s.trim();
  return t.length <= maxLen ? t : t.slice(0, maxLen - 1) + '…';
}

function notFoundPage(redirectTo: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Report not found — CivicLens</title>
  <meta name="robots" content="noindex">
  <meta http-equiv="refresh" content="0; url=${escHtml(redirectTo)}">
</head>
<body>
  <p>Report not found. <a href="${escHtml(redirectTo)}">Go to CivicLens</a></p>
</body>
</html>`;
}

function previewPage(opts: {
  reportId: string;
  title: string;
  description: string;
  imageUrl: string;
  canonicalUrl: string;
  appUrl: string;
}): string {
  const t = escHtml(opts.title);
  const d = escHtml(opts.description);
  const img = escHtml(opts.imageUrl);
  const canonical = escHtml(opts.canonicalUrl);
  const app = escHtml(opts.appUrl);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${t}</title>
  <link rel="canonical" href="${canonical}">
  <meta name="description" content="${d}">
  <meta name="robots" content="index,follow">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="CivicLens">
  <meta property="og:title" content="${t}">
  <meta property="og:description" content="${d}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${img}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="en_PH">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${t}">
  <meta name="twitter:description" content="${d}">
  <meta name="twitter:image" content="${img}">

  <!-- Redirect humans to the SPA immediately -->
  <meta http-equiv="refresh" content="0; url=${app}">
</head>
<body>
  <p>${d} <a href="${app}">View on CivicLens</a></p>
</body>
</html>`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  const url = new URL(request.url);
  const reportId = url.searchParams.get('id')?.trim() ?? '';
  const appUrl = `${APP_ORIGIN}/#/report/${encodeURIComponent(reportId)}`;

  // Validate UUID format to avoid unnecessary DB calls
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(reportId)) {
    return html(notFoundPage(APP_ORIGIN), 404);
  }

  // Use service role key — this bypasses RLS so we can check hidden status
  // server-side without exposing it to clients.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: report, error } = await supabase
    .from('reports')
    .select('id, category, note, author_name, status, photo_path, created_at, project_id')
    .eq('id', reportId)
    .single();

  // Hidden, deleted, or not found → return generic 404, no report data leaked
  if (error || !report || report.status === 'hidden') {
    return html(notFoundPage(APP_ORIGIN), 404);
  }

  // Build preview text — note is public, but we truncate to keep it tidy
  const noteSnippet = truncate(report.note, 200);
  const dateStr = new Date(report.created_at).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const title = `${escHtml(report.category)} anomaly report — CivicLens`;
  const description = `${noteSnippet} — Reported by ${report.author_name} on ${dateStr}.`;

  // Prefer the report's own photo if it exists; fall back to default OG image.
  // Photos are in a private bucket, so we generate a short-lived signed URL.
  let imageUrl = OG_DEFAULT_IMAGE;
  if (report.photo_path) {
    const { data: signed } = await supabase.storage
      .from('report-photos')
      .createSignedUrl(report.photo_path, 3600); // 1-hour TTL
    if (signed?.signedUrl) imageUrl = signed.signedUrl;
  }

  const canonicalUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/report-preview?id=${encodeURIComponent(reportId)}`;

  return html(previewPage({
    reportId,
    title,
    description,
    imageUrl,
    canonicalUrl,
    appUrl,
  }));
});
