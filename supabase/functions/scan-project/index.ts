import {createClient} from 'npm:@supabase/supabase-js@2.55.0';
import {corsHeaders, json} from '../_shared/cors.ts';
import {rankProjects, type Category, type Coordinates, type Project} from '../_shared/matching.ts';

const categories:Category[] = ['road','bridge','building','drainage','flood-control','facility','unknown'];
const demoAnalysis = {category:'facility' as Category, clues:['public infrastructure'], identifiers:[], confidence:0.65};

async function analyzeImage(image:File) {
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
      response_format: {type:'json_object'},
      messages: [{role:'user', content: [
        {type:'text', text:`Identify this public infrastructure. Return JSON only: {"category": one of ${categories.join(',')}, "clues": string[], "identifiers": string[], "confidence": number 0-1}. Do not claim a government project identity.`},
        {type:'image_url', image_url:{url:`data:${image.type};base64,${btoa(binary)}`}},
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
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers:corsHeaders});
  if (request.method !== 'POST') return json({error:'method not allowed'}, 405);
  try {
    const auth = request.headers.get('Authorization');
    if (!auth) return json({error:'authentication required'}, 401);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {global:{headers:{Authorization:auth}}},
    );
    const {error:userError} = await supabase.auth.getUser(auth.replace('Bearer ', ''));
    if (userError) return json({error:'invalid session'}, 401);
    const {data:withinQuota, error:quotaError} = await supabase.rpc('consume_scan_quota', {
      max_requests: 20,
      window_seconds: 60,
    });
    if (quotaError) throw quotaError;
    if (!withinQuota) return json({error:'scan rate limit exceeded'}, 429);

    const form = await request.formData();
    const image = form.get('file');
    const coordinates:Coordinates = {
      latitude: Number(form.get('latitude')),
      longitude: Number(form.get('longitude')),
    };
    if (!(image instanceof File) || !image.type.startsWith('image/') || image.size > 10 * 1024 * 1024) {
      return json({error:'an image up to 10 MB is required'}, 400);
    }
    if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
      return json({error:'valid coordinates are required'}, 400);
    }

    const analysis = await analyzeImage(image);
    const {data, error} = await supabase.rpc('nearby_projects', {
      p_latitude: coordinates.latitude,
      p_longitude: coordinates.longitude,
      p_radius_meters: 25000,
    });
    if (error) throw error;
    const projects:Project[] = (data ?? []).map((row:any) => ({
      id:row.id, source:row.source, sourceUrl:row.source_url, name:row.name,
      category:row.category, description:row.description, agency:row.agency,
      contractor:row.contractor ?? undefined, budget:row.budget == null ? undefined : Number(row.budget),
      status:row.status, progress:row.progress == null ? undefined : Number(row.progress),
      location:row.location, coordinates:{latitude:Number(row.latitude), longitude:Number(row.longitude)},
      lastChecked:row.last_checked, documents:Array.isArray(row.documents) ? row.documents : [],
    }));
    const clues = [...analysis.clues, ...analysis.identifiers];
    const matches = rankProjects(projects, coordinates, analysis.category, clues);
    return matches[0]?.confidence >= 0.55
      ? json({status:'matched', analysis, matches})
      : json({status:'needs_retake', analysis});
  } catch (error) {
    console.error(error);
    return json({error:'Vision or project lookup unavailable'}, 502);
  }
});
