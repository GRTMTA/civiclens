import {createClient} from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required');
}

export const supabase = createClient(url, publishableKey);

export type ReportItem = {
  id:string;
  projectId:string;
  authorName:string;
  category:string;
  note:string;
  status:'unverified'|'resolved'|'hidden';
  createdAt:string;
};

export async function listReports():Promise<ReportItem[]> {
  const {data, error} = await supabase
    .from('reports')
    .select('id, project_id, author_name, category, note, status, created_at')
    .neq('status', 'hidden')
    .order('created_at', {ascending: false});
  if (error) throw error;
  return (data ?? []).map(report => ({
    id: report.id,
    projectId: report.project_id,
    authorName: report.author_name,
    category: report.category,
    note: report.note,
    status: report.status,
    createdAt: report.created_at,
  }));
}

// ── Share links ───────────────────────────────────────────────────────────────

export function getReportShareUrl(reportId: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-preview?id=${encodeURIComponent(reportId)}`;
}

export async function shareReport(report: ReportItem): Promise<'shared' | 'copied' | 'error'> {
  const url = getReportShareUrl(report.id);
  const title = `${report.category} anomaly — CivicLens`;
  const text = `${report.note.slice(0, 120)}${report.note.length > 120 ? '…' : ''}`;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'error';
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'error';
  }
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function createReport(input:{projectId:string;category:string;note:string;latitude:number;longitude:number;photo?:File}) {
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to publish a report.');
  let photoPath:string|undefined;
  if (input.photo) {
    photoPath = `${user.id}/${crypto.randomUUID()}`;
    const {error} = await supabase.storage.from('report-photos').upload(photoPath, input.photo, {
      contentType: input.photo.type,
      upsert: false,
    });
    if (error) throw error;
  }
  const {error} = await supabase.rpc('create_report', {
    p_project_id: input.projectId,
    p_category: input.category,
    p_note: input.note,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_photo_path: photoPath ?? null,
  });
  if (error) {
    if (photoPath) await supabase.storage.from('report-photos').remove([photoPath]);
    throw error;
  }
}
