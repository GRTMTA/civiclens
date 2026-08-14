import {createClient} from 'npm:@supabase/supabase-js@2.55.0';
import {corsHeaders, json} from '../_shared/cors.ts';
import {rankProjects, type Category, type Coordinates, type Project} from '../_shared/matching.ts';

const categories:Category[] = ['road','bridge','building','drainage','flood-control','facility','unknown'];

// Demo analysis used when no GROQ_API_KEY is configured.
// isDemo:true is forwarded to the client so the UI can display a clear
// "demo data" label — unsupported findings must never appear as real results.
const demoAnalysis = {
  category: 'facility' as Category,
  clues: ['public infrastructure'],
  identifiers: [],
  confidence: 0.65,
  isDemo: true,
};

async function analyzeImage(image: File): Promise<{
  category: Category;
  clues: string[];
  identifiers: string[];
  confidence: number;
  isDemo: boolean;
}> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) return demoAnalysis;

  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: Deno.env.get('GROQ_MODEL') ?? 'qwen/qwen3.6-27b',
      response_format: {type: 'json_object'},
      messages: [{role: 'user', content: [
        {
          type: 'text',
          // The prompt explicitly forbids the model from inventing project identities
          // or URLs. All citations are grounded in the database record, not the model.
          text: `Identify this public infrastructure image. Return JSON only:
{"category": one of [${categories.join(', ')}], "clues": string[], "identifiers": string[], "confidence": number 0-1}
Rules:
- clues: visible physical features only (material, shape, markings)
- identifiers: any text/numbers visible on signage — do NOT invent or assume project names
- Do NOT claim a specific government project identity
- Do NOT include any URLs`,
        },
        {type: 'image_url', image_url: {url: `data:${image.type};base64,${btoa(binary)}`}},
      ]}],
    }),
  });

  if (!response.ok) throw new Error(`Groq returned ${response.status}`);
  const payload = await response.json();
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? '{}');
  return {
    category: categories.includes(parsed.category) ? parsed.category as Category : 'unknown',
    clues: Array.isArray(parsed.clues) ? parsed.clues.slice(0, 8) : [],
    identifiers: Array.isArray(parsed.identifiers) ? parsed.identifiers.slice(0, 8) : [],
    confidence: Number(parsed.confidence) || 0,
    isDemo: false,
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (request.method !== 'POST') return json({error: 'method not allowed'}, 405);

  try {
    const auth = request.headers.get('Authorization');
    if (!auth) return json({error: 'authentication required'}, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {global: {headers: {Authorization: auth}}},
    );

    const {error: userError} = await supabase.auth.getUser(auth.replace('Bearer ', ''));
    if (userError) return json({error: 'invalid session'}, 401);

    const {data: withinQuota, error: quotaError} = await supabase.rpc('consume_scan_quota', {
      max_requests: 20,
      window_seconds: 60,
    });
    if (quotaError) throw quotaError;
    if (!withinQuota) return json({error: 'scan rate limit exceeded'}, 429);

    const form = await request.formData();
    const image = form.get('file');
    const coordinates: Coordinates = {
      latitude: Number(form.get('latitude')),
      longitude: Number(form.get('longitude')),
    };

    if (!(image instanceof File) || !image.type.startsWith('image/') || image.size > 10 * 1024 * 1024) {
      return json({error: 'an image up to 10 MB is required'}, 400);
    }
    if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
      return json({error: 'valid coordinates are required'}, 400);
    }

    const analysis = await analyzeImage(image);
    const {data, error} = await supabase.rpc('nearby_projects', {
      p_latitude: coordinates.latitude,
      p_longitude: coordinates.longitude,
      p_radius_meters: 25000,
      p_category: analysis.category === 'unknown' ? null : analysis.category,
    });
    if (error) throw error;

    const projects: Project[] = (data ?? []).map((row: any) => ({
      id: row.id, contractId: row.contract_id ?? undefined,
      source: row.source, sourceUrl: row.source_url, name: row.name,
      category: row.category, sourceCategory: row.source_category ?? undefined,
      componentCategories: Array.isArray(row.component_categories) ? row.component_categories : [],
      description: row.description, agency: row.agency,
      contractor: row.contractor ?? undefined,
      budget: row.budget == null ? undefined : Number(row.budget),
      amountPaid: row.amount_paid == null ? undefined : Number(row.amount_paid),
      status: row.status, progress: row.progress == null ? undefined : Number(row.progress),
      location: row.location, region: row.region ?? undefined,
      districtOffice: row.district_office ?? undefined,
      programName: row.program_name ?? undefined,
      infrastructureYear: row.infrastructure_year ?? undefined,
      startDate: row.start_date ?? undefined, completionDate: row.completion_date ?? undefined,
      sourceOfFunds: row.source_of_funds ?? undefined,
      livestreamUrl: row.livestream_url ?? undefined,
      hasSatelliteImage: Boolean(row.has_satellite_image),
      sourceRevision: row.source_revision ?? undefined,
      sourceImportedAt: row.source_imported_at ?? undefined,
      coordinates: {latitude: Number(row.latitude), longitude: Number(row.longitude)},
      lastChecked: row.last_checked,
      documents: Array.isArray(row.documents) ? row.documents : [],
    }));

    const clues = [...analysis.clues, ...analysis.identifiers];
    const matches = rankProjects(projects, coordinates, analysis.category, clues);

    if (matches[0]?.confidence >= 0.55) {
      return json({
        status: 'matched',
        isDemo: analysis.isDemo,
        analysis,
        matches,
      });
    }
    return json({
      status: 'needs_retake',
      isDemo: analysis.isDemo,
      analysis,
    });
  } catch (error) {
    console.error(error);
    return json({error: 'Vision or project lookup unavailable'}, 502);
  }
});
