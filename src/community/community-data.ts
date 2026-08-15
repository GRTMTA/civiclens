/**
 * Community data access.
 *
 * Backed by the community tables and RPCs added in
 * `supabase/migrations/20260815000000_community_discussions.sql`. Scores,
 * comment counts, and the caller's own vote are aggregated server-side, so this
 * module only parses and shapes what the RPCs return.
 *
 * Reading is available without an account; writing and voting require a signed
 * in resident, which the RPC grants enforce.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import {
  buildCommentTree,
  COMMUNITY_TOPICS,
  type CommentNode,
  type CommunityComment,
  type CommunityPost,
  type FeedQuery,
  type NewCommentInput,
  type NewPostInput,
  type ProjectReference,
  type TopicId,
  type VoteState,
} from "./community-contract"

export class CommunityConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CommunityConfigurationError"
  }
}

export function isCommunityConfigurationError(
  error: unknown,
): error is CommunityConfigurationError {
  return error instanceof CommunityConfigurationError
}

/** Raised when an action requires a signed-in resident. */
export class CommunityAuthRequiredError extends Error {
  constructor(message = "Sign in to take part in community discussion.") {
    super(message)
    this.name = "CommunityAuthRequiredError"
  }
}

export function isCommunityAuthRequiredError(
  error: unknown,
): error is CommunityAuthRequiredError {
  return error instanceof CommunityAuthRequiredError
}

export type CommunitySource = {
  listPosts(query: FeedQuery): Promise<CommunityPost[]>
  getPost(postId: string): Promise<CommunityPost | null>
  listComments(postId: string): Promise<CommentNode[]>
  createPost(input: NewPostInput): Promise<CommunityPost>
  createComment(input: NewCommentInput): Promise<CommunityComment>
  votePost(postId: string, direction: 1 | -1): Promise<{ score: number; viewerVote: VoteState }>
  voteComment(
    commentId: string,
    direction: 1 | -1,
  ): Promise<{ score: number; viewerVote: VoteState }>
  /** Projects a resident can optionally relate a discussion to. */
  searchProjects(term: string): Promise<ProjectReference[]>
  /** Resolves the signed-in resident, or null when browsing anonymously. */
  getViewer(): Promise<{ id: string; name: string } | null>
}

// ── Parsing ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function asRecord(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  // Postgres sum()/count() arrive as strings over PostgREST.
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asTopic(value: unknown): TopicId {
  const topic = asString(value)
  return COMMUNITY_TOPICS.includes(topic as TopicId) ? (topic as TopicId) : "other"
}

function asVote(value: unknown): VoteState {
  const vote = asNumber(value)
  return vote === 1 ? 1 : vote === -1 ? -1 : 0
}

function parsePost(value: unknown): CommunityPost | null {
  const row = asRecord(value)
  const id = asString(row?.id)
  const title = asString(row?.title)
  if (!row || !id || !title) return null

  const projectId = asString(row.project_id)
  const projectName = asString(row.project_name)

  return {
    id,
    title,
    body: asString(row.body),
    authorName: asString(row.author_name, "Resident"),
    createdAt: asString(row.created_at),
    topic: asTopic(row.topic),
    score: asNumber(row.score),
    commentCount: asNumber(row.comment_count),
    viewerVote: asVote(row.viewer_vote),
    // Without a resolvable name there is nothing meaningful to show, so the
    // reference is dropped rather than rendering an empty chip.
    project: projectId && projectName ? { id: projectId, name: projectName } : null,
  }
}

function parseComment(value: unknown): CommunityComment | null {
  const row = asRecord(value)
  const id = asString(row?.id)
  if (!row || !id) return null

  const parentId = asString(row.parent_id)
  return {
    id,
    postId: asString(row.post_id),
    parentId: parentId || null,
    authorName: asString(row.author_name, "Resident"),
    body: asString(row.body),
    createdAt: asString(row.created_at),
    score: asNumber(row.score),
    viewerVote: asVote(row.viewer_vote),
  }
}

function parseVote(value: unknown): { score: number; viewerVote: VoteState } {
  const row = asRecord(value)
  return { score: asNumber(row?.score), viewerVote: asVote(row?.viewer_vote) }
}

function parseProjects(value: unknown): ProjectReference[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const row = asRecord(entry)
    const id = asString(row?.id)
    const name = asString(row?.name)
    return id && name ? [{ id, name }] : []
  })
}

/** Raised when the community tables and RPCs are not present in the database. */
export class CommunitySchemaMissingError extends Error {
  constructor() {
    super(
      "Community discussion is not set up on this database yet. Apply the community migration to enable it.",
    )
    this.name = "CommunitySchemaMissingError"
  }
}

export function isCommunitySchemaMissingError(
  error: unknown,
): error is CommunitySchemaMissingError {
  return error instanceof CommunitySchemaMissingError
}

/** Turns a Postgres error into something worth showing a resident. */
function toFriendlyError(message: string): Error {
  if (message.includes("community_rate_limit_exceeded")) {
    return new Error("You have reached the posting limit. Please try again later.")
  }
  if (message.includes("authentication required") || message.includes("permission denied")) {
    return new CommunityAuthRequiredError()
  }
  // PostgREST reports an unmigrated database as a missing function/relation.
  // Surfacing the raw message would read as a bug rather than pending setup.
  if (
    message.includes("Could not find the function") ||
    message.includes("Could not find the table") ||
    message.includes("schema cache")
  ) {
    return new CommunitySchemaMissingError()
  }
  return new Error(message)
}

// ── Supabase-backed source ───────────────────────────────────────────────────

function createSupabaseSource(client: SupabaseClient): CommunitySource {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args)
    if (error) throw toFriendlyError(error.message || `Unable to complete ${name}.`)
    return data
  }

  /** Fails fast for actions the RPC grants would reject anyway. */
  async function requireViewer(): Promise<void> {
    const { data } = await client.auth.getSession()
    if (!data.session) throw new CommunityAuthRequiredError()
  }

  return {
    async listPosts(query) {
      const data = await rpc("community_feed", {
        p_sort: query.sort,
        p_topic: query.topic,
        p_search: query.search.trim() || null,
      })
      return Array.isArray(data) ? data.flatMap((row) => parsePost(row) ?? []) : []
    },

    async getPost(postId) {
      return parsePost(await rpc("community_post", { p_post_id: postId }))
    },

    async listComments(postId) {
      const data = await rpc("community_comments_for_post", { p_post_id: postId })
      const comments = Array.isArray(data)
        ? data.flatMap((row) => parseComment(row) ?? [])
        : []
      return buildCommentTree(comments)
    },

    async createPost(input) {
      await requireViewer()
      const created = parsePost(
        await rpc("create_community_post", {
          p_title: input.title.trim(),
          p_body: input.body.trim(),
          p_topic: input.topic,
          p_project_id: input.projectId,
        }),
      )
      if (!created) throw new Error("Your post was saved but could not be displayed.")
      return created
    },

    async createComment(input) {
      await requireViewer()
      const created = parseComment(
        await rpc("create_community_comment", {
          p_post_id: input.postId,
          p_body: input.body.trim(),
          p_parent_id: input.parentId,
        }),
      )
      if (!created) throw new Error("Your comment was saved but could not be displayed.")
      return created
    },

    async votePost(postId, direction) {
      await requireViewer()
      return parseVote(
        await rpc("vote_community_post", { p_post_id: postId, p_direction: direction }),
      )
    },

    async voteComment(commentId, direction) {
      await requireViewer()
      return parseVote(
        await rpc("vote_community_comment", {
          p_comment_id: commentId,
          p_direction: direction,
        }),
      )
    },

    async searchProjects(term) {
      const trimmed = term.trim()
      return parseProjects(
        await rpc("community_project_options", { p_search: trimmed || null }),
      )
    },

    async getViewer() {
      const { data } = await client.auth.getUser()
      const user = data.user
      if (!user) return null
      const { data: profile } = await client
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle()
      return {
        id: user.id,
        name: asString(profile?.display_name) || user.email?.split("@")[0] || "You",
      }
    },
  }
}

let source: CommunitySource | null = null

/**
 * Returns the process-wide community source, creating it on first use.
 *
 * Throws `CommunityConfigurationError` when the Supabase environment is not
 * configured, which the UI surfaces as a setup message rather than a crash.
 */
export function getCommunitySource(): CommunitySource {
  if (source) return source

  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new CommunityConfigurationError(
      "Community discussion requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    )
  }

  source = createSupabaseSource(createClient(url, key))
  return source
}
