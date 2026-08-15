/**
 * Community state hooks.
 *
 * These sit between the data source and the UI components: components render,
 * hooks own loading/error/optimistic state, and the source owns persistence.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  applyVote,
  COMMUNITY_TOPICS,
  countComments,
  SORT_OPTIONS,
  type CommentNode,
  type CommunityPost,
  type FeedQuery,
  type NewPostInput,
  type SortOption,
  type TopicId,
  type VoteState,
} from "./community-contract"
import {
  getCommunitySource,
  isCommunityAuthRequiredError,
  isCommunityConfigurationError,
  isCommunitySchemaMissingError,
  type CommunitySource,
} from "./community-data"

type LoadState = "loading" | "ready" | "error" | "unconfigured"

export type Viewer = { id: string; name: string } | null

function messageFor(cause: unknown, fallback: string): string {
  if (isCommunityAuthRequiredError(cause)) return cause.message
  return cause instanceof Error ? cause.message : fallback
}

/**
 * A database without the community migration is a setup condition, not a
 * transient failure, so it maps to `unconfigured` (no retry offered).
 */
function stateFor(cause: unknown): "error" | "unconfigured" {
  return isCommunitySchemaMissingError(cause) ? "unconfigured" : "error"
}

/**
 * Resolves the data source lazily so a missing Supabase configuration becomes
 * render state instead of a module-load crash.
 */
function useSource() {
  return useMemo(() => {
    try {
      return { source: getCommunitySource(), configError: null as string | null }
    } catch (cause) {
      if (isCommunityConfigurationError(cause)) {
        return { source: null, configError: cause.message }
      }
      throw cause
    }
  }, [])
}

/** Tracks the signed-in resident so the UI can gate write actions. */
function useViewer(source: CommunitySource | null): {
  viewer: Viewer
  ready: boolean
} {
  const [viewer, setViewer] = useState<Viewer>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!source) {
      setReady(true)
      return
    }
    let cancelled = false
    source
      .getViewer()
      .then((next) => {
        if (!cancelled) setViewer(next)
      })
      .catch(() => {
        if (!cancelled) setViewer(null)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [source])

  return { viewer, ready }
}

function mapNode(
  nodes: CommentNode[],
  commentId: string,
  update: (node: CommentNode) => CommentNode,
): CommentNode[] {
  return nodes.map((node) =>
    node.id === commentId
      ? update(node)
      : { ...node, replies: mapNode(node.replies, commentId, update) },
  )
}

function insertReply(
  nodes: CommentNode[],
  parentId: string,
  reply: CommentNode,
): CommentNode[] {
  return nodes.map((node) =>
    node.id === parentId
      ? { ...node, replies: [...node.replies, reply] }
      : { ...node, replies: insertReply(node.replies, parentId, reply) },
  )
}

/** Reads the feed's initial sort and topic from the URL, if present. */
function readFeedUrlState(search: string): { sort: SortOption; topic: TopicId | null } {
  const params = new URLSearchParams(search)
  const rawSort = params.get("sort")
  const rawTopic = params.get("topic")
  return {
    sort: SORT_OPTIONS.includes(rawSort as SortOption) ? (rawSort as SortOption) : "popular",
    topic: COMMUNITY_TOPICS.includes(rawTopic as TopicId) ? (rawTopic as TopicId) : null,
  }
}

export function useCommunityFeed() {
  const { source, configError } = useSource()
  const initial = useMemo(() => readFeedUrlState(window.location.search), [])
  const [sort, setSort] = useState<SortOption>(initial.sort)
  const [search, setSearch] = useState("")
  const [topic, setTopic] = useState<TopicId | null>(initial.topic)
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [state, setState] = useState<LoadState>(configError ? "unconfigured" : "loading")
  const [error, setError] = useState<string | null>(configError)
  const [reloadToken, setReloadToken] = useState(0)
  const requestRef = useRef(0)
  const { viewer, ready: viewerReady } = useViewer(source)

  const query = useMemo<FeedQuery>(() => ({ sort, search, topic }), [sort, search, topic])

  useEffect(() => {
    if (!source) return
    const requestId = ++requestRef.current
    let cancelled = false
    setState((current) => (current === "ready" ? "ready" : "loading"))
    setError(null)
    source
      .listPosts(query)
      .then((next) => {
        if (cancelled || requestId !== requestRef.current) return
        setPosts(next)
        setState("ready")
      })
      .catch((cause: unknown) => {
        if (cancelled || requestId !== requestRef.current) return
        setError(messageFor(cause, "Unable to load discussions."))
        setState(stateFor(cause))
      })
    return () => {
      cancelled = true
    }
  }, [query, reloadToken, source])

  const retry = useCallback(() => setReloadToken((token) => token + 1), [])

  const vote = useCallback(
    (postId: string, direction: 1 | -1) => {
      if (!source) return
      // Optimistic: the control responds immediately, then reconciles.
      setPosts((current) =>
        current.map((post) =>
          post.id === postId ? { ...post, ...applyVote(post, direction) } : post,
        ),
      )
      source.votePost(postId, direction).then(
        (next) =>
          setPosts((current) =>
            current.map((post) => (post.id === postId ? { ...post, ...next } : post)),
          ),
        (cause: unknown) => {
          // Reverting the same direction restores the pre-click state.
          setPosts((current) =>
            current.map((post) =>
              post.id === postId ? { ...post, ...applyVote(post, direction) } : post,
            ),
          )
          setError(messageFor(cause, "Your vote could not be saved."))
        },
      )
    },
    [source],
  )

  const createPost = useCallback(
    async (input: NewPostInput) => {
      if (!source) throw new Error(configError ?? "Community discussion is unavailable.")
      const created = await source.createPost(input)
      // Land on the new discussion by clearing filters and showing newest first.
      setSort("new")
      setSearch("")
      setTopic(null)
      setPosts(await source.listPosts({ sort: "new", search: "", topic: null }))
      return created
    },
    [configError, source],
  )

  return {
    posts,
    state,
    error,
    sort,
    setSort,
    search,
    setSearch,
    topic,
    setTopic,
    vote,
    createPost,
    retry,
    viewer,
    viewerReady,
    canInteract: Boolean(source && viewer),
  }
}

export function usePostThread(postId: string) {
  const { source, configError } = useSource()
  const [post, setPost] = useState<CommunityPost | null>(null)
  const [comments, setComments] = useState<CommentNode[]>([])
  const [state, setState] = useState<LoadState>(configError ? "unconfigured" : "loading")
  const [error, setError] = useState<string | null>(configError)
  const { viewer, ready: viewerReady } = useViewer(source)

  useEffect(() => {
    if (!source) return
    let cancelled = false
    setState("loading")
    setError(null)
    Promise.all([source.getPost(postId), source.listComments(postId)])
      .then(([nextPost, nextComments]) => {
        if (cancelled) return
        setPost(nextPost)
        setComments(nextComments)
        setState("ready")
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(messageFor(cause, "Unable to load this discussion."))
        setState(stateFor(cause))
      })
    return () => {
      cancelled = true
    }
  }, [postId, source])

  const votePost = useCallback(
    (direction: 1 | -1) => {
      if (!source) return
      setPost((current) => (current ? { ...current, ...applyVote(current, direction) } : current))
      source.votePost(postId, direction).then(
        (next) => setPost((current) => (current ? { ...current, ...next } : current)),
        (cause: unknown) => {
          setPost((current) =>
            current ? { ...current, ...applyVote(current, direction) } : current,
          )
          setError(messageFor(cause, "Your vote could not be saved."))
        },
      )
    },
    [postId, source],
  )

  const voteComment = useCallback(
    (commentId: string, direction: 1 | -1) => {
      if (!source) return
      setComments((current) =>
        mapNode(current, commentId, (node) => ({ ...node, ...applyVote(node, direction) })),
      )
      source.voteComment(commentId, direction).then(
        (next: { score: number; viewerVote: VoteState }) =>
          setComments((current) =>
            mapNode(current, commentId, (node) => ({ ...node, ...next })),
          ),
        (cause: unknown) => {
          setComments((current) =>
            mapNode(current, commentId, (node) => ({ ...node, ...applyVote(node, direction) })),
          )
          setError(messageFor(cause, "Your vote could not be saved."))
        },
      )
    },
    [source],
  )

  const addComment = useCallback(
    async (body: string, parentId: string | null) => {
      if (!source) throw new Error(configError ?? "Community discussion is unavailable.")
      const created = await source.createComment({ postId, parentId, body })
      const node: CommentNode = { ...created, replies: [] }
      setComments((current) =>
        parentId ? insertReply(current, parentId, node) : [...current, node],
      )
      setPost((current) =>
        current ? { ...current, commentCount: current.commentCount + 1 } : current,
      )
    },
    [configError, postId, source],
  )

  const commentCount = useMemo(() => countComments(comments), [comments])

  return {
    post,
    comments,
    commentCount,
    state,
    error,
    votePost,
    voteComment,
    addComment,
    viewer,
    viewerReady,
    canInteract: Boolean(source && viewer),
  }
}
