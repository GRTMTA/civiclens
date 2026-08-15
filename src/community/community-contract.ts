/**
 * Community discussion contract.
 *
 * Community content is Resident-generated discussion. It is deliberately kept
 * separate from Official-source records: a post may *reference* a Project, but
 * the reference never turns the discussion into an official finding.
 *
 * These types describe the shape the UI consumes. The data source behind them
 * is swappable (see ./community-data.ts) so a Supabase-backed implementation
 * can replace the seeded source without touching the UI.
 */

export type VoteState = -1 | 0 | 1

/** Topics residents can file a discussion under. */
export const COMMUNITY_TOPICS = [
  "infrastructure",
  "roads",
  "bridges",
  "flood-control",
  "transportation",
  "public-buildings",
  "local-government",
  "other",
] as const

export type TopicId = (typeof COMMUNITY_TOPICS)[number]

export type Topic = {
  id: TopicId
  label: string
}

export const TOPIC_LABELS: Record<TopicId, string> = {
  infrastructure: "Infrastructure",
  roads: "Roads",
  bridges: "Bridges",
  "flood-control": "Flood Control",
  transportation: "Transportation",
  "public-buildings": "Public Buildings",
  "local-government": "Local Government",
  other: "Other",
}

export function topicLabel(id: TopicId): string {
  return TOPIC_LABELS[id] ?? TOPIC_LABELS.other
}

export function listTopics(): Topic[] {
  return COMMUNITY_TOPICS.map((id) => ({ id, label: TOPIC_LABELS[id] }))
}

/**
 * A minimal, display-only pointer to an Official-source record.
 *
 * It carries just enough to render a project context chip and link into the
 * existing map surface. It is not a Project detail and asserts nothing about
 * the project's physical condition.
 */
export type ProjectReference = {
  id: string
  name: string
}

export type CommunityPost = {
  id: string
  title: string
  /** Optional discussion body. Plain text; rendered as text, never as HTML. */
  body: string
  authorName: string
  createdAt: string
  topic: TopicId
  /** Net score from resident votes. */
  score: number
  commentCount: number
  /** The signed-in resident's current vote, when known. */
  viewerVote: VoteState
  /** Present when the resident chose to relate the discussion to a project. */
  project: ProjectReference | null
}

export type CommunityComment = {
  id: string
  postId: string
  /** Null for a top-level comment, otherwise the parent comment id. */
  parentId: string | null
  authorName: string
  body: string
  createdAt: string
  score: number
  viewerVote: VoteState
}

/** A comment plus its nested replies, ready for threaded rendering. */
export type CommentNode = CommunityComment & {
  replies: CommentNode[]
}

export type NewPostInput = {
  title: string
  body: string
  topic: TopicId
  projectId: string | null
}

export type NewCommentInput = {
  postId: string
  parentId: string | null
  body: string
}

export const SORT_OPTIONS = ["popular", "new", "discussed"] as const

export type SortOption = (typeof SORT_OPTIONS)[number]

export const SORT_LABELS: Record<SortOption, string> = {
  popular: "Popular",
  new: "New",
  discussed: "Most Discussed",
}

export type FeedQuery = {
  sort: SortOption
  search: string
  topic: TopicId | null
}

/**
 * Applies the next vote for a resident, mirroring familiar voting behaviour:
 * pressing the active direction clears the vote, pressing the other direction
 * moves the score by two.
 */
export function applyVote(
  current: { score: number; viewerVote: VoteState },
  direction: 1 | -1,
): { score: number; viewerVote: VoteState } {
  const nextVote: VoteState = current.viewerVote === direction ? 0 : direction
  return {
    viewerVote: nextVote,
    score: current.score - current.viewerVote + nextVote,
  }
}

/** Builds a threaded tree from a flat comment list, preserving order. */
export function buildCommentTree(comments: CommunityComment[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>()
  for (const comment of comments) {
    nodes.set(comment.id, { ...comment, replies: [] })
  }
  const roots: CommentNode[] = []
  for (const comment of comments) {
    const node = nodes.get(comment.id)
    if (!node) continue
    const parent = comment.parentId ? nodes.get(comment.parentId) : undefined
    if (parent) parent.replies.push(node)
    else roots.push(node)
  }
  return roots
}

/** Total comments in a thread, including every nested reply. */
export function countComments(nodes: CommentNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countComments(node.replies), 0)
}

/** Compact relative time, e.g. "3h" or "2d". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.valueOf())) return ""
  const seconds = Math.max(0, Math.floor((now.valueOf() - then.valueOf()) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}y`
}

/** Compact score display so long feeds stay scannable. */
export function formatScore(score: number): string {
  const magnitude = Math.abs(score)
  if (magnitude < 1000) return String(score)
  const value = (score / 1000).toFixed(magnitude < 10000 ? 1 : 0)
  return `${value.replace(/\.0$/, "")}k`
}

// Sorting, searching, and topic filtering are performed by the
// `community_feed` RPC so a growing feed is not fetched in full and paged
// client-side. `FeedQuery` above is the shape passed through to it.

export type PostValidationError = {
  field: "title" | "body"
  message: string
}

export const POST_TITLE_MAX = 160
export const POST_BODY_MAX = 4000
export const COMMENT_BODY_MAX = 1000

export function validateNewPost(input: NewPostInput): PostValidationError | null {
  const title = input.title.trim()
  if (title.length < 8) {
    return { field: "title", message: "Give your discussion a title of at least 8 characters." }
  }
  if (title.length > POST_TITLE_MAX) {
    return { field: "title", message: `Titles are limited to ${POST_TITLE_MAX} characters.` }
  }
  if (input.body.trim().length > POST_BODY_MAX) {
    return { field: "body", message: `Posts are limited to ${POST_BODY_MAX} characters.` }
  }
  return null
}
