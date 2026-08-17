import { corsHeaders, json } from '../_shared/cors.ts';

const API_BASE = 'https://api.transparency.dpwh.gov.ph/projects';
const CACHE_TTL_MS = 5 * 60 * 1000;
const pageCache = new Map<string, { expiresAt: number; records: Record<string, unknown>[] }>();

type Bounds = { south: number; west: number; north: number; east: number };
type Point = { latitude: number; longitude: number };

const DEMO_PROJECTS: Record<string, unknown>[] = [
  {
    contractId: 'demo-cebu-road',
    description: 'Cebu South Coastal Road rehabilitation (hackathon demo)',
    category: 'Roads',
    status: 'Ongoing',
    budget: 185000000,
    progress: 62,
    contractor: 'Demo contractor',
    infraYear: '2026',
    programName: 'Hackathon demonstration',
    sourceOfFunds: 'Demo data only',
    location: {
      province: 'Cebu City',
      coordinates: { latitude: 10.2897, longitude: 123.8818 },
    },
    demo: true,
  },
  {
    contractId: 'demo-mandaue-flood',
    description: 'Mandaue flood-control improvement (hackathon demo)',
    category: 'Flood Control and Drainage',
    status: 'Under construction',
    budget: 92000000,
    progress: 41,
    contractor: 'Demo contractor',
    infraYear: '2026',
    programName: 'Hackathon demonstration',
    sourceOfFunds: 'Demo data only',
    location: {
      province: 'Mandaue City, Cebu',
      coordinates: { latitude: 10.3236, longitude: 123.9418 },
    },
    demo: true,
  },
];

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function point(project: Record<string, unknown>): Point | null {
  const location = record(project.location);
  const coordinates = record(location?.coordinates);
  const latitude = number(project.latitude) ?? number(coordinates?.latitude);
  const longitude = number(project.longitude) ?? number(coordinates?.longitude);
  if (latitude === undefined || longitude === undefined) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function contractId(project: Record<string, unknown>): string {
  return text(project.contractId ?? project.contract_id ?? project.id);
}

function unwrapProjects(payload: unknown): Record<string, unknown>[] {
  const outer = record(payload);
  const inner = record(outer?.data);
  const values = Array.isArray(inner?.data)
    ? inner.data
    : Array.isArray(outer?.data)
      ? outer.data
      : Array.isArray(payload)
        ? payload
        : [];
  return values.flatMap((value) => {
    const item = record(value);
    return item ? [item] : [];
  });
}

async function fetchDpwh(path: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://transparency.dpwh.gov.ph',
          Referer: 'https://transparency.dpwh.gov.ph/',
          'User-Agent': 'Mozilla/5.0 CivicLens-Hackathon-Demo/1.0',
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`DPWH returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  throw lastError;
}

async function pageRecords(page: number, limit: number) {
  const key = `${page}:${limit}`;
  const cached = pageCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.records;
  const records = unwrapProjects(await fetchDpwh(`?page=${page}&limit=${limit}`));
  if (records.length === 0) throw new Error('DPWH returned no project records');
  pageCache.set(key, { records, expiresAt: Date.now() + CACHE_TTL_MS });
  return records;
}

function estimatedArea({ latitude, longitude }: Point) {
  const radiusMeters = 50;
  const latitudeRadius = radiusMeters / 111_320;
  const longitudeRadius = radiusMeters / (111_320 * Math.cos(latitude * Math.PI / 180));
  const coordinates = Array.from({ length: 25 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2;
    return [
      longitude + Math.cos(angle) * longitudeRadius,
      latitude + Math.sin(angle) * latitudeRadius,
    ];
  });
  return { type: 'Polygon', coordinates: [coordinates] };
}

function projectSource(project: Record<string, unknown>): string {
  return project.demo === true ? 'CivicLens hackathon demo data' : 'DPWH Transparency Portal';
}

function asFeature(project: Record<string, unknown>) {
  const id = contractId(project);
  const coordinates = point(project);
  if (!id || !coordinates) return null;
  return {
    type: 'Feature',
    id: `dpwh-${id}`,
    geometry: estimatedArea(coordinates),
    properties: {
      id: `dpwh-${id}`,
      name: text(project.description, `DPWH contract ${id}`),
      category: text(project.category ?? project.infraType, 'unknown'),
      source: projectSource(project),
      status: text(project.status, 'Unknown'),
      recorded_coordinates: [coordinates.longitude, coordinates.latitude],
      geometry_kind: 'estimated',
    },
  };
}

function asDetail(payload: unknown, requestedId: string) {
  const outer = record(payload);
  const project = record(outer?.data) ?? outer;
  if (!project) return null;
  const id = contractId(project) || requestedId;
  const coordinates = point(project);
  if (!coordinates) return null;
  const location = record(project.location);
  return {
    id: `dpwh-${id}`,
    source: projectSource(project),
    source_url: project.demo === true
      ? 'https://github.com/csiiiv/dpwh-transparency-data-api-scraper'
      : `https://transparency.dpwh.gov.ph/projects/${encodeURIComponent(id)}`,
    name: text(project.description, `DPWH contract ${id}`),
    category: text(project.category ?? project.infraType, 'unknown'),
    description: text(project.description),
    agency: 'Department of Public Works and Highways',
    contractor: text(project.contractor) || undefined,
    budget: number(project.budget),
    amount_paid: number(project.amountPaid ?? project.amount_paid),
    status: text(project.status, 'Unknown'),
    progress: number(project.progress),
    location: text(location?.province ?? location?.region, 'Location not provided'),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    contract_id: id,
    start_date: text(project.startDate ?? project.start_date) || undefined,
    completion_date: text(project.completionDate ?? project.completion_date) || undefined,
    infrastructure_year: text(project.infraYear ?? project.infrastructure_year) || undefined,
    program_name: text(project.programName ?? project.program_name) || undefined,
    source_of_funds: text(project.sourceOfFunds ?? project.source_of_funds) || undefined,
    geometry_kind: 'estimated',
  };
}

function parseBounds(url: URL): Bounds | null {
  const bounds = {
    south: number(url.searchParams.get('south')),
    west: number(url.searchParams.get('west')),
    north: number(url.searchParams.get('north')),
    east: number(url.searchParams.get('east')),
  };
  if (Object.values(bounds).some((value) => value === undefined)) return null;
  if (bounds.south! >= bounds.north! || bounds.west! >= bounds.east!) return null;
  return bounds as Bounds;
}
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.replace(/^dpwh-/, '').trim();
    if (id) return json(asDetail(await fetchDpwh(`/${encodeURIComponent(id)}`), id));

    const bounds = parseBounds(url);
    if (!bounds) return json({ error: 'Valid map bounds are required.' }, 400);
    const configuredPage = Number(Deno.env.get('DPWH_DEMO_PAGE') ?? '1');
    const configuredLimit = Number(Deno.env.get('DPWH_DEMO_LIMIT') ?? '500');
    const page = Number.isInteger(configuredPage) && configuredPage > 0 ? configuredPage : 1;
    const limit = Number.isInteger(configuredLimit)
      ? Math.min(5000, Math.max(1, configuredLimit))
      : 5000;
    const records = await pageRecords(page, limit);
    const features = records.flatMap((project) => {
      const coordinates = point(project);
      if (!coordinates || coordinates.latitude < bounds.south || coordinates.latitude > bounds.north
        || coordinates.longitude < bounds.west || coordinates.longitude > bounds.east) return [];
      const feature = asFeature(project);
      return feature ? [feature] : [];
    }).slice(0, 500);

    return json({
      type: 'FeatureCollection',
      features,
      truncated: features.length === 500,
    });
  } catch (error) {
    console.error('DPWH proxy failed', error);
    return json({ error: 'The DPWH demo feed is temporarily unavailable.' }, 502);
  }
});
