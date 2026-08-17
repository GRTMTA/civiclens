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
 * How a resident framed their post.
 *
 * `discussion` is open conversation. `observation` is a resident's dated
 * account of something they personally saw — supporting material, never a
 * verified finding about an Official-source record.
 */
export const POST_KINDS = ["discussion", "observation"] as const

export type PostKind = (typeof POST_KINDS)[number]

export const POST_KIND_LABELS: Record<PostKind, string> = {
  discussion: "Discussion",
  observation: "Resident observation",
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

/** Public identity of a resident, as other residents see them. */
export type Author = {
  name: string
  /** Handle for `/community/profile/:username`. Absent on legacy content. */
  username: string | null
  /** Storage path; kept for reference alongside the resolved URL. */
  avatarPath: string | null
  /** Resolved public URL, or null when the resident has no avatar. */
  avatarUrl: string | null
}

/** Resident-supplied supporting photo. */
export type MediaItem = {
  id: string
  /** Storage object path. */
  path: string
  /** Resolved public URL for rendering. */
  url: string
}

export type CommunityPost = {
  id: string
  kind: PostKind
  title: string
  /** Optional discussion body. Plain text; rendered as text, never as HTML. */
  body: string
  authorName: string
  author: Author
  createdAt: string
  topic: TopicId
  /** Net score from resident votes. */
  score: number
  commentCount: number
  /** The signed-in resident's current vote, when known. */
  viewerVote: VoteState
  /** Present when the resident chose to relate the discussion to a project. */
  project: ProjectReference | null
  /**
   * Approximate area a resident gave for an observation (e.g. a barangay).
   * Never a precise capture point — exact locations are not published.
   */
  areaLabel: string | null
  media: MediaItem[]
}

export type CommunityComment = {
  id: string
  postId: string
  /** Null for a top-level comment, otherwise the parent comment id. */
  parentId: string | null
  authorName: string
  author: Author
  body: string
  createdAt: string
  score: number
  viewerVote: VoteState
  media: MediaItem[]
}

/** A comment plus its nested replies, ready for threaded rendering. */
export type CommentNode = CommunityComment & {
  replies: CommentNode[]
}

export type NewPostInput = {
  kind: PostKind
  title: string
  body: string
  topic: TopicId
  projectId: string | null
  /** Display name snapshot for projects served outside Supabase. */
  projectName?: string | null
  /** Approximate area for an observation; ignored for a discussion. */
  areaLabel: string | null
  /** Photos chosen in the composer, uploaded after the post row exists. */
  photos: File[]
}

export type NewCommentInput = {
  postId: string
  parentId: string | null
  body: string
  photo?: File | null
}

/** Aggregate community activity. Describes discussion, never project condition. */
export type CommunityPulse = {
  discussions: number
  observations: number
  photos: number
  comments: number
  lastActivityAt: string | null
  topics: { topic: TopicId; count: number }[]
}

/** One recent piece of community activity about a project. */
export type ProjectActivityItem = {
  postId: string
  kind: PostKind
  title: string
  excerpt: string
  authorName: string
  createdAt: string
  photoCount: number
}

/** A resident's public profile and their community activity counts. */
export type CommunityProfile = {
  username: string
  displayName: string
  bio: string
  avatarPath: string | null
  avatarUrl: string | null
  joinedAt: string
  postCount: number
  observationCount: number
  commentCount: number
}

export type ProfileEdit = {
  displayName: string
  username: string
  bio: string
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
  /** Restricts the feed to discussion about one Official-source record. */
  projectId: string | null
  /** Restricts the feed to one post kind. */
  kind: PostKind | null
  /** Restricts the feed to one resident's content, by handle. */
  author: string | null
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
  field: "title" | "body" | "area" | "photos"
  message: string
}

export const POST_TITLE_MAX = 160
export const POST_BODY_MAX = 4000
export const COMMENT_BODY_MAX = 1000
export const AREA_LABEL_MAX = 120

/** Kept in step with the storage bucket limits in the community migration. */
export const POST_PHOTO_MAX = 4
export const COMMENT_PHOTO_MAX = 1
export const PHOTO_BYTES_MAX = 5 * 1024 * 1024
export const AVATAR_BYTES_MAX = 2 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

/** Validates one chosen image against the bucket's type and size rules. */
export function validateImage(file: File, maxBytes = PHOTO_BYTES_MAX): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return `${file.name} is not a JPEG, PNG, or WebP image.`
  }
  if (file.size > maxBytes) {
    return `${file.name} is larger than ${Math.round(maxBytes / (1024 * 1024))}MB.`
  }
  return null
}

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
  if ((input.areaLabel ?? "").trim().length > AREA_LABEL_MAX) {
    return { field: "area", message: `Area is limited to ${AREA_LABEL_MAX} characters.` }
  }
  if (input.photos.length > POST_PHOTO_MAX) {
    return { field: "photos", message: `You can attach up to ${POST_PHOTO_MAX} photos.` }
  }
  for (const photo of input.photos) {
    const invalid = validateImage(photo)
    if (invalid) return { field: "photos", message: invalid }
  }
  return null
}

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

/** Mirrors the `profiles_username_format` constraint in the database. */
export function validateProfile(edit: ProfileEdit): { field: keyof ProfileEdit; message: string } | null {
  const displayName = edit.displayName.trim()
  if (displayName.length < 1 || displayName.length > 80) {
    return { field: "displayName", message: "Display name must be between 1 and 80 characters." }
  }
  if (!USERNAME_PATTERN.test(edit.username.trim().toLowerCase())) {
    return {
      field: "username",
      message: "Username must be 3-20 characters using lowercase letters, numbers, or underscore.",
    }
  }
  if (edit.bio.trim().length > 280) {
    return { field: "bio", message: "Bio is limited to 280 characters." }
  }
  return null
}

/** Absolute date for a profile join line, e.g. "August 2026". */
export function joinedLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.valueOf())) return ""
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "long" })
}

/** Initials fallback for an avatar with no uploaded image. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "R"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
