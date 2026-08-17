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

import type { SupabaseClient } from "@supabase/supabase-js"

import { supabase } from "@/supabase"

import {
  buildCommentTree,
  COMMUNITY_TOPICS,
  POST_KINDS,
  type Author,
  type CommentNode,
  type CommunityComment,
  type CommunityPost,
  type CommunityProfile,
  type CommunityPulse,
  type FeedQuery,
  type MediaItem,
  type NewCommentInput,
  type NewPostInput,
  type PostKind,
  type ProfileEdit,
  type ProjectActivityItem,
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

/**
 * Raised when text was saved but its photos were not.
 *
 * Distinct from a plain failure: the post or comment exists, so the UI reports
 * a partial success rather than inviting the resident to write it again.
 */
export class CommunityMediaError extends Error {
  readonly publishedPost: CommunityPost | null

  constructor(message: string, publishedPost: CommunityPost | null = null) {
    super(message)
    this.name = "CommunityMediaError"
    this.publishedPost = publishedPost
  }
}

export function isCommunityMediaError(error: unknown): error is CommunityMediaError {
  return error instanceof CommunityMediaError
}

export type CommunitySource = {
  listPosts(query: FeedQuery): Promise<CommunityPost[]>
  listPostsForProject(projectId: string): Promise<CommunityPost[]>
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
  getViewer(): Promise<Viewer | null>
  /** Aggregate community activity, optionally scoped to one project. */
  getPulse(projectId?: string | null): Promise<CommunityPulse>
  /** Recent community activity about one project, newest first. */
  getProjectActivity(projectId: string, limit?: number): Promise<ProjectActivityItem[]>
  getProfile(username: string): Promise<CommunityProfile | null>
  updateProfile(edit: ProfileEdit): Promise<CommunityProfile>
  uploadAvatar(file: File): Promise<CommunityProfile>
  removeAvatar(): Promise<CommunityProfile>
  signOut(): Promise<void>
}

/** The signed-in resident, as the UI needs them. */
export type Viewer = {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  bio: string
}

// ── Storage ──────────────────────────────────────────────────────────────────
// Bucket ids match `20260816000000_community_profiles_and_project_geometry.sql`. These
// buckets are public so guests can see the photos in discussion they browse;
// write access is owner-only through storage policies.

export const AVATAR_BUCKET = "avatars"
export const POST_MEDIA_BUCKET = "community-post-media"
export const COMMENT_MEDIA_BUCKET = "community-comment-media"

/** Keeps uploaded object names predictable and free of user-supplied text. */
function mediaObjectName(file: File): string {
  const extension =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
  return `${crypto.randomUUID()}.${extension}`
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

function asKind(value: unknown): PostKind {
  const kind = asString(value)
  return POST_KINDS.includes(kind as PostKind) ? (kind as PostKind) : "discussion"
}

function asVote(value: unknown): VoteState {
  const vote = asNumber(value)
  return vote === 1 ? 1 : vote === -1 ? -1 : 0
}

/** Resolves a storage path in a public bucket to a renderable URL. */
type UrlResolver = (bucket: string, path: string) => string

function parseAuthor(value: unknown, fallbackName: string, publicUrl: UrlResolver): Author {
  const row = asRecord(value)
  const username = asString(row?.username)
  const avatarPath = asString(row?.avatar_path)
  return {
    name: asString(row?.name, fallbackName) || fallbackName,
    username: username || null,
    avatarPath: avatarPath || null,
    avatarUrl: avatarPath ? publicUrl(AVATAR_BUCKET, avatarPath) : null,
  }
}

function parseMedia(value: unknown, bucket: string, publicUrl: UrlResolver): MediaItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const row = asRecord(entry)
    const id = asString(row?.id)
    const path = asString(row?.path)
    return id && path ? [{ id, path, url: publicUrl(bucket, path) }] : []
  })
}

function parsePost(value: unknown, publicUrl: UrlResolver): CommunityPost | null {
  const row = asRecord(value)
  const id = asString(row?.id)
  const title = asString(row?.title)
  if (!row || !id || !title) return null

  const projectId = asString(row.project_id)
  const projectName = asString(row.project_name)
  const authorName = asString(row.author_name, "Resident")
  const areaLabel = asString(row.area_label)

  return {
    id,
    kind: asKind(row.kind),
    title,
    body: asString(row.body),
    authorName,
    author: parseAuthor(row.author, authorName, publicUrl),
    createdAt: asString(row.created_at),
    topic: asTopic(row.topic),
    score: asNumber(row.score),
    commentCount: asNumber(row.comment_count),
    viewerVote: asVote(row.viewer_vote),
    // Without a resolvable name there is nothing meaningful to show, so the
    // reference is dropped rather than rendering an empty chip.
    project: projectId && projectName ? { id: projectId, name: projectName } : null,
    areaLabel: areaLabel || null,
    media: parseMedia(row.media, POST_MEDIA_BUCKET, publicUrl),
  }
}

function parseComment(value: unknown, publicUrl: UrlResolver): CommunityComment | null {
  const row = asRecord(value)
  const id = asString(row?.id)
  if (!row || !id) return null

  const parentId = asString(row.parent_id)
  const authorName = asString(row.author_name, "Resident")
  return {
    id,
    postId: asString(row.post_id),
    parentId: parentId || null,
    authorName,
    author: parseAuthor(row.author, authorName, publicUrl),
    body: asString(row.body),
    createdAt: asString(row.created_at),
    score: asNumber(row.score),
    viewerVote: asVote(row.viewer_vote),
    media: parseMedia(row.media, COMMENT_MEDIA_BUCKET, publicUrl),
  }
}

function parsePulse(value: unknown): CommunityPulse {
  const row = asRecord(value)
  const rawTopics = Array.isArray(row?.topics) ? row.topics : []
  const lastActivity = asString(row?.last_activity_at)
  return {
    discussions: asNumber(row?.discussions),
    observations: asNumber(row?.observations),
    photos: asNumber(row?.photos),
    comments: asNumber(row?.comments),
    lastActivityAt: lastActivity || null,
    topics: rawTopics.flatMap((entry) => {
      const topicRow = asRecord(entry)
      const topic = asString(topicRow?.topic)
      return topic ? [{ topic: asTopic(topic), count: asNumber(topicRow?.count) }] : []
    }),
  }
}

function parseActivity(value: unknown): ProjectActivityItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const row = asRecord(entry)
    const postId = asString(row?.post_id)
    const title = asString(row?.title)
    if (!postId || !title) return []
    return [
      {
        postId,
        kind: asKind(row?.kind),
        title,
        excerpt: asString(row?.body),
        authorName: asString(row?.author_name, "Resident"),
        createdAt: asString(row?.created_at),
        photoCount: asNumber(row?.photo_count),
      },
    ]
  })
}

function parseProfile(value: unknown, publicUrl: UrlResolver): CommunityProfile | null {
  const row = asRecord(value)
  const username = asString(row?.username)
  if (!row || !username) return null
  const avatarPath = asString(row.avatar_path)
  return {
    username,
    displayName: asString(row.display_name, "Resident"),
    bio: asString(row.bio),
    avatarPath: avatarPath || null,
    avatarUrl: avatarPath ? publicUrl(AVATAR_BUCKET, avatarPath) : null,
    joinedAt: asString(row.joined_at),
    postCount: asNumber(row.post_count),
    observationCount: asNumber(row.observation_count),
    commentCount: asNumber(row.comment_count),
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

class CommunityRpcUnavailableError extends CommunitySchemaMissingError {
  constructor(readonly rpcName: string) {
    super()
    this.name = "CommunityRpcUnavailableError"
  }
}

function isCommunityRpcUnavailable(error: unknown, rpcName: string): boolean {
  return error instanceof CommunityRpcUnavailableError && error.rpcName === rpcName
}

/** Turns a Postgres error into something worth showing a resident. */
function toFriendlyError(message: string, rpcName?: string, code?: string): Error {
  if (message.includes("community_rate_limit_exceeded")) {
    return new Error("You have reached the posting limit. Please try again later.")
  }
  if (message.includes("authentication required") || message.includes("permission denied")) {
    return new CommunityAuthRequiredError()
  }
  const escapedRpcName = rpcName?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const namesRequestedRpc = escapedRpcName
    ? new RegExp(`(?:^|\\.)${escapedRpcName}(?:\\s*\\(|\\b)`).test(message)
    : false
  if (
    code === "PGRST202" &&
    message.includes("Could not find the function") &&
    namesRequestedRpc
  ) {
    return new CommunityRpcUnavailableError(rpcName!)
  }
  // PostgREST reports a genuinely absent relation/schema as a setup error.
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

export function createSupabaseSource(client: SupabaseClient): CommunitySource {
  const publicUrl: UrlResolver = (bucket, path) =>
    client.storage.from(bucket).getPublicUrl(path).data.publicUrl

  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args)
    if (error) {
      throw toFriendlyError(
        error.message || `Unable to complete ${name}.`,
        name,
        error.code,
      )
    }
    return data
  }

  const parsePosts = (data: unknown): CommunityPost[] =>
    Array.isArray(data) ? data.flatMap((row) => parsePost(row, publicUrl) ?? []) : []

  /**
   * Compatibility for databases that already have the original Community
   * discussion migration but not the later profile/media/project-feed upgrade.
   * The original feed can return up to 100 existing rows; filters introduced
   * later are applied locally without bypassing its RLS-protected read API.
   */
  async function listLegacyPosts(query: FeedQuery): Promise<CommunityPost[]> {
    const data = await rpc("community_feed", {
      p_sort: query.sort,
      p_topic: query.topic,
      p_search: query.search.trim() || null,
      p_limit: 100,
      p_offset: 0,
    })
    const author = query.author?.trim().toLowerCase() ?? ""
    return parsePosts(data).filter((post) =>
      (!query.projectId || post.project?.id === query.projectId) &&
      (!query.kind || post.kind === query.kind) &&
      (!author ||
        post.author.username?.toLowerCase() === author ||
        post.authorName.toLowerCase() === author),
    )
  }

  /** Fails fast for actions the RPC grants would reject anyway. */
  async function requireViewer(): Promise<void> {
    const { data } = await client.auth.getSession()
    if (!data.session) throw new CommunityAuthRequiredError()
  }

  /**
   * Uploads photos under `<bucket>/<owner-id>/` and registers the paths.
   *
   * The row exists before any upload so the storage policy can verify
   * ownership by folder. An upload failure is reported but does not discard the
   * post: the text is already saved, and the composer surfaces the shortfall.
   */
  async function uploadMedia(
    bucket: string,
    ownerId: string,
    files: File[],
    attachRpc: string,
    idArg: string,
  ): Promise<{ failed: number }> {
    if (files.length === 0) return { failed: 0 }

    const storage = client.storage.from(bucket)
    const uploaded: string[] = []
    let failed = 0

    for (const file of files) {
      const path = `${ownerId}/${mediaObjectName(file)}`
      const { error } = await storage.upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (error) failed += 1
      else uploaded.push(path)
    }

    if (uploaded.length > 0) {
      try {
        await rpc(attachRpc, { [idArg]: ownerId, p_paths: uploaded })
      } catch (cause) {
        // Registration failed, so do not leave inaccessible objects behind.
        await storage.remove(uploaded).catch(() => undefined)
        throw cause
      }
    }

    return { failed }
  }

  return {
    async listPosts(query) {
      try {
        const data = await rpc("community_feed", {
          p_sort: query.sort,
          p_topic: query.topic,
          p_search: query.search.trim() || null,
          p_project_id: query.projectId,
          p_kind: query.kind,
          p_author: query.author,
        })
        return parsePosts(data)
      } catch (cause) {
        if (!isCommunityRpcUnavailable(cause, "community_feed")) throw cause
        try {
          return await listLegacyPosts(query)
        } catch (legacyCause) {
          if (isCommunityRpcUnavailable(legacyCause, "community_feed")) {
            throw new CommunitySchemaMissingError()
          }
          throw legacyCause
        }
      }
    },

    async listPostsForProject(projectId) {
      const cleanProjectId = projectId.trim()
      if (!cleanProjectId) throw new Error("A project ID is required to load discussions.")
      return this.listPosts({
        sort: "popular",
        search: "",
        topic: null,
        projectId: cleanProjectId,
        kind: null,
        author: null,
      })
    },

    async getPost(postId) {
      return parsePost(await rpc("community_post", { p_post_id: postId }), publicUrl)
    },

    async listComments(postId) {
      const data = await rpc("community_comments_for_post", { p_post_id: postId })
      const comments = Array.isArray(data)
        ? data.flatMap((row) => parseComment(row, publicUrl) ?? [])
        : []
      return buildCommentTree(comments)
    },

    async createPost(input) {
      await requireViewer()

      const createWithProject = async (projectId: string | null): Promise<unknown> => {
        try {
          return await rpc("create_community_post", {
            p_title: input.title.trim(),
            p_body: input.body.trim(),
            p_topic: input.topic,
            p_project_id: projectId,
            p_kind: input.kind,
            // Area is meaningful only for an observation.
            p_area_label: input.kind === "observation" ? input.areaLabel?.trim() || null : null,
          })
        } catch (cause) {
          if (!isCommunityRpcUnavailable(cause, "create_community_post")) throw cause
          try {
            return await rpc("create_community_post", {
              p_title: input.title.trim(),
              p_body: input.body.trim(),
              p_topic: input.topic,
              p_project_id: projectId,
            })
          } catch (legacyCause) {
            if (isCommunityRpcUnavailable(legacyCause, "create_community_post")) {
              throw new CommunitySchemaMissingError()
            }
            throw legacyCause
          }
        }
      }

      let createdValue: unknown
      try {
        createdValue = await createWithProject(input.projectId)
      } catch (cause) {
        const projectIsMissing =
          input.projectId &&
          cause instanceof Error &&
          cause.message.includes("related project not found")
        if (!projectIsMissing) throw cause
        // Live DPWH map records can exist before the Supabase project catalog is
        // synchronized. Project context is optional, so publish without a stale
        // foreign-key reference rather than discarding the resident's post.
        createdValue = await createWithProject(null)
      }

      const created = parsePost(createdValue, publicUrl)
      if (!created) throw new Error("Your post was saved but could not be displayed.")

      try {
        const { failed } = await uploadMedia(
          POST_MEDIA_BUCKET,
          created.id,
          input.photos,
          "attach_community_post_media",
          "p_post_id",
        )
        if (failed > 0) {
          throw new CommunityMediaError(
            failed === input.photos.length
              ? "Your post was published, but the photos could not be uploaded."
              : `Your post was published, but ${failed} photo(s) could not be uploaded.`,
            created,
          )
        }

        // Re-read so the returned post carries the media rows just registered.
        const refreshed = await this.getPost(created.id)
        if (!refreshed) {
          throw new CommunityMediaError(
            "Your post was published, but its final details could not be loaded. Refresh to see it.",
            created,
          )
        }
        return refreshed
      } catch (cause) {
        if (isCommunityMediaError(cause)) {
          throw cause.publishedPost
            ? cause
            : new CommunityMediaError(cause.message, created)
        }
        throw new CommunityMediaError(
          input.photos.length > 0
            ? "Your post was published, but its photos could not be fully saved."
            : "Your post was published, but its final details could not be loaded. Refresh to see it.",
          created,
        )
      }
    },

    async createComment(input) {
      await requireViewer()
      const created = parseComment(
        await rpc("create_community_comment", {
          p_post_id: input.postId,
          p_body: input.body.trim(),
          p_parent_id: input.parentId,
        }),
        publicUrl,
      )
      if (!created) throw new Error("Your comment was saved but could not be displayed.")

      if (input.photo) {
        const { failed } = await uploadMedia(
          COMMENT_MEDIA_BUCKET,
          created.id,
          [input.photo],
          "attach_community_comment_media",
          "p_comment_id",
        )
        if (failed > 0) {
          throw new CommunityMediaError(
            "Your comment was posted, but the photo could not be uploaded.",
          )
        }
        // Re-read the registered path rather than reconstructing it.
        return {
          ...created,
          media: parseMedia(
            await rpc("community_comment_media_paths", { p_comment_id: created.id }),
            COMMENT_MEDIA_BUCKET,
            publicUrl,
          ),
        }
      }

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

    async getPulse(projectId = null) {
      return parsePulse(await rpc("community_pulse", { p_project_id: projectId }))
    },

    async getProjectActivity(projectId, limit = 5) {
      return parseActivity(
        await rpc("community_project_activity", { p_project_id: projectId, p_limit: limit }),
      )
    },

    async getProfile(username) {
      return parseProfile(await rpc("community_profile", { p_username: username }), publicUrl)
    },

    async updateProfile(edit) {
      await requireViewer()
      const updated = parseProfile(
        await rpc("update_community_profile", {
          p_display_name: edit.displayName.trim(),
          p_username: edit.username.trim().toLowerCase(),
          p_bio: edit.bio.trim(),
        }),
        publicUrl,
      )
      if (!updated) throw new Error("Your profile was saved but could not be displayed.")
      return updated
    },

    async uploadAvatar(file) {
      await requireViewer()
      const { data } = await client.auth.getUser()
      const userId = data.user?.id
      if (!userId) throw new CommunityAuthRequiredError()

      // A fresh object name per upload avoids serving a stale cached avatar.
      const path = `${userId}/${mediaObjectName(file)}`
      const { error } = await client.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true })
      if (error) throw new CommunityMediaError("Your profile photo could not be uploaded.")

      const updated = parseProfile(
        await rpc("update_community_profile", { p_avatar_path: path }),
        publicUrl,
      )
      if (!updated) throw new Error("Your profile photo was saved but could not be displayed.")
      return updated
    },

    async removeAvatar() {
      await requireViewer()
      const updated = parseProfile(
        await rpc("update_community_profile", { p_clear_avatar: true }),
        publicUrl,
      )
      if (!updated) throw new Error("Your profile could not be updated.")
      return updated
    },

    async signOut() {
      await client.auth.signOut()
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
        username: null,
        avatarUrl: null,
        bio: "",
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

  source = createSupabaseSource(supabase)
  return source
}
