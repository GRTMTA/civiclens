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

/**
 * Returns the canonical shareable URL for a report.
 * Points to the Edge Function which serves crawler-readable OG meta tags
 * and redirects human visitors to the SPA.
 */
export function getReportShareUrl(reportId: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-preview?id=${encodeURIComponent(reportId)}`;
}

/**
 * Share a report using the Web Share API when available,
 * falling back to copying the URL to the clipboard.
 * Returns 'shared' | 'copied' | 'error'.
 */
export async function shareReport(report: ReportItem): Promise<'shared' | 'copied' | 'error'> {
  const url = getReportShareUrl(report.id);
  const title = `${report.category} anomaly — CivicLens`;
  const text = `${report.note.slice(0, 120)}${report.note.length > 120 ? '…' : ''}`;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      // User cancelled (AbortError) — not an error worth reporting
      if (e instanceof DOMException && e.name === 'AbortError') return 'error';
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'error';
  }
}

// ── Comment threads ───────────────────────────────────────────────────────────

export type CommentItem = {
  id: string;
  reportId: string;
  authorId: string;
  authorName: string;
  body: string;
  hidden: boolean;
  createdAt: string;
};

/** Fetch all visible comments for a report (RLS filters hidden ones for non-mods). */
export async function listComments(reportId: string): Promise<CommentItem[]> {
  const {data, error} = await supabase
    .from('report_comments')
    .select('id, report_id, author_id, author_name, body, hidden, created_at')
    .eq('report_id', reportId)
    .order('created_at', {ascending: true});
  if (error) throw error;
  return (data ?? []).map(c => ({
    id: c.id,
    reportId: c.report_id,
    authorId: c.author_id,
    authorName: c.author_name,
    body: c.body,
    hidden: c.hidden,
    createdAt: c.created_at,
  }));
}

/** Post a comment via the server-side function (validates & stamps author name). */
export async function postComment(reportId: string, body: string): Promise<string> {
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new Error('Comment cannot be empty.');
  if (trimmed.length > 1000) throw new Error('Comment exceeds 1000 characters.');
  const {data, error} = await supabase.rpc('post_comment', {
    p_report_id: reportId,
    p_body: trimmed,
  });
  if (error) {
    // Surface the real DB message (e.g. function not found, validation errors)
    throw new Error(error.message || error.details || 'Failed to post comment.');
  }
  return data as string;
}

/** Delete a comment. Authors can delete their own; moderators can delete any. */
export async function deleteComment(commentId: string): Promise<void> {
  const {error} = await supabase
    .from('report_comments')
    .delete()
    .eq('id', commentId);
  if (error) throw error;
}

/** Toggle the hidden flag on a comment (moderator only). */
export async function setCommentHidden(commentId: string, hidden: boolean): Promise<void> {
  const {error} = await supabase.rpc('hide_comment', {
    p_comment_id: commentId,
    p_hidden: hidden,
  });
  if (error) throw error;
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
    // Translate the rate-limit sentinel into a user-friendly message
    if (error.message?.includes('report_rate_limit_exceeded')) {
      throw new Error('You have reached the report limit. Please wait before submitting again.');
    }
    throw error;
  }
}
