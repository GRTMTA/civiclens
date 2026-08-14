export type Category = 'road'|'bridge'|'building'|'drainage'|'flood-control'|'facility'|'unknown';
export type Coordinates = {latitude:number; longitude:number};
export type Project = {
  id:string; contractId?:string; source:string; sourceUrl:string; name:string; category:Category;
  sourceCategory?:string; componentCategories:string[]; description:string; agency:string;
  contractor?:string; budget?:number; amountPaid?:number; status:string; progress?:number;
  location:string; region?:string; districtOffice?:string; programName?:string;
  infrastructureYear?:string; startDate?:string; completionDate?:string;
  sourceOfFunds?:string; livestreamUrl?:string; hasSatelliteImage:boolean;
  sourceRevision?:string; sourceImportedAt?:string; coordinates:Coordinates;
  lastChecked:string; documents:unknown[];
};

/**
 * A structured citation grounded in database project records or source documents.
 * URLs are never invented by the AI model — they come exclusively from the
 * project's own sourceUrl or its documents array.
 *
 * Fields:
 *   title      — human-readable name of the source (project name or document title)
 *   publisher  — the publishing authority (agency or dataset name)
 *   url        — verified URL from the database record; null if not available
 *   accessDate — ISO date the record was last checked / imported
 *   trusted    — true when the URL passes the trusted-domain allowlist
 */
export type Citation = {
  title: string;
  publisher: string;
  url: string | null;
  accessDate: string;
  trusted: boolean;
};

/**
 * Trusted source domains. Only URLs whose hostname ends with one of these
 * are marked trusted. All others are rendered with an "unverified source"
 * warning rather than rejected entirely (the DB record may still be valid).
 */
const TRUSTED_DOMAINS = [
  'dpwh.gov.ph',
  'bettergovph.org',
  'bettergov.ph',
  'huggingface.co',
  'opendata.gov.ph',
  'philgeps.gov.ph',
  'foi.gov.ph',
];

function isTrustedUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const {hostname, protocol} = new URL(raw);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return TRUSTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Build structured citations for a project.
 * Citations are grounded exclusively in the project's database record and
 * its attached documents — the AI model cannot add or invent URLs.
 */
export function buildCitations(project: Project): Citation[] {
  const citations: Citation[] = [];
  const accessDate = project.sourceImportedAt
    ? project.sourceImportedAt.slice(0, 10)
    : project.lastChecked.slice(0, 10);

  // Primary citation: the official DPWH / source record
  // Label reflects the dataset source, not a guarantee of a live government page.
  citations.push({
    title: `${project.name} — source record`,
    publisher: project.source ?? project.agency ?? 'Unknown publisher',
    url: project.sourceUrl ?? null,
    accessDate,
    trusted: isTrustedUrl(project.sourceUrl),
  });

  // Secondary citations: attached document links (stored in projects.documents jsonb)
  const docs = Array.isArray(project.documents) ? project.documents : [];
  for (const doc of docs.slice(0, 4)) {
    if (typeof doc !== 'object' || doc === null) continue;
    const d = doc as Record<string, unknown>;
    const docUrl = typeof d.url === 'string' ? d.url : undefined;
    const docTitle = typeof d.title === 'string' ? d.title : 'Attached document';
    const docPublisher = typeof d.publisher === 'string'
      ? d.publisher
      : (project.agency ?? project.source ?? 'Unknown publisher');
    if (!docUrl) continue;
    citations.push({
      title: docTitle,
      publisher: docPublisher,
      url: docUrl,
      accessDate,
      trusted: isTrustedUrl(docUrl),
    });
  }

  return citations;
}

const distanceKm = (a:Coordinates, b:Coordinates) => {
  const radians = Math.PI / 180;
  const x = (b.latitude - a.latitude) * radians;
  const y = (b.longitude - a.longitude) * radians;
  return 6371 * 2 * Math.asin(Math.sqrt(
    Math.sin(x / 2) ** 2 + Math.cos(a.latitude * radians) *
    Math.cos(b.latitude * radians) * Math.sin(y / 2) ** 2,
  ));
};

export function rankProjects(projects:Project[], coordinates:Coordinates, category:Category, clues:string[]) {
  return projects.map(project => {
    const distance = distanceKm(coordinates, project.coordinates);
    const text = [project.contractId, project.name, project.description, project.contractor,
      project.location, project.region, project.districtOffice, project.programName,
      project.sourceCategory, ...project.componentCategories]
      .filter(Boolean).join(' ').toLowerCase();
    const matchingClues = clues.filter(clue => text.includes(clue.toLowerCase()));
    const exactIdentifier = clues.some(clue => project.contractId && clue.trim().toLowerCase() === project.contractId.toLowerCase());
    const confidence = Math.max(0, Math.min(0.99,
      0.68 + matchingClues.length * 0.08 + (exactIdentifier ? 0.35 : 0) - Math.min(distance / 25, 0.5) +
      (project.category === category ? 0.15 : 0),
    ));
    const citations = buildCitations(project);
    return {
      project,
      confidence,
      citations,
      // Evidence strings represent AI visual inference only — not official facts.
      // They are displayed separately from the database-sourced project record.
      evidence: [
        `${distance.toFixed(1)} km from capture`,
        project.category === category ? 'Infrastructure type matches' : 'Nearby official record',
        ...(exactIdentifier ? [`Contract ID matches: ${project.contractId}`] : []),
        ...matchingClues.map(clue => `Visual clue: ${clue}`),
      ],
    };
  }).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
