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
import { getCommunitySource, type CommunitySource } from "./community-data"

type LoadState = "loading" | "ready" | "error"

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

export function useCommunityFeed(source: CommunitySource = getCommunitySource()) {
  const initial = useMemo(() => readFeedUrlState(window.location.search), [])
  const [sort, setSort] = useState<SortOption>(initial.sort)
  const [search, setSearch] = useState("")
  const [topic, setTopic] = useState<TopicId | null>(initial.topic)
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [state, setState] = useState<LoadState>("loading")
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const query = useMemo<FeedQuery>(() => ({ sort, search, topic }), [sort, search, topic])

  useEffect(() => {
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
        setError(cause instanceof Error ? cause.message : "Unable to load discussions.")
        setState("error")
      })
    return () => {
      cancelled = true
    }
  }, [query, source])

  const vote = useCallback(
    (postId: string, direction: 1 | -1) => {
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
        () => {
          // Reverting the same direction restores the pre-click state.
          setPosts((current) =>
            current.map((post) =>
              post.id === postId ? { ...post, ...applyVote(post, direction) } : post,
            ),
          )
          setError("Your vote could not be saved.")
        },
      )
    },
    [source],
  )

  const createPost = useCallback(
    async (input: NewPostInput) => {
      const created = await source.createPost(input)
      setPosts(await source.listPosts({ ...query, sort: "new", search: "", topic: null }))
      setSort("new")
      setSearch("")
      setTopic(null)
      return created
    },
    [query, source],
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
    isSampleContent: source.isSampleContent,
  }
}

export function usePostThread(
  postId: string,
  source: CommunitySource = getCommunitySource(),
) {
  const [post, setPost] = useState<CommunityPost | null>(null)
  const [comments, setComments] = useState<CommentNode[]>([])
  const [state, setState] = useState<LoadState>("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
        setError(cause instanceof Error ? cause.message : "Unable to load this discussion.")
        setState("error")
      })
    return () => {
      cancelled = true
    }
  }, [postId, source])

  const votePost = useCallback(
    (direction: 1 | -1) => {
      setPost((current) => (current ? { ...current, ...applyVote(current, direction) } : current))
      source.votePost(postId, direction).then(
        (next) => setPost((current) => (current ? { ...current, ...next } : current)),
        () => {
          setPost((current) =>
            current ? { ...current, ...applyVote(current, direction) } : current,
          )
          setError("Your vote could not be saved.")
        },
      )
    },
    [postId, source],
  )

  const voteComment = useCallback(
    (commentId: string, direction: 1 | -1) => {
      setComments((current) =>
        mapNode(current, commentId, (node) => ({ ...node, ...applyVote(node, direction) })),
      )
      source.voteComment(commentId, direction).then(
        (next: { score: number; viewerVote: VoteState }) =>
          setComments((current) =>
            mapNode(current, commentId, (node) => ({ ...node, ...next })),
          ),
        () => {
          setComments((current) =>
            mapNode(current, commentId, (node) => ({ ...node, ...applyVote(node, direction) })),
          )
          setError("Your vote could not be saved.")
        },
      )
    },
    [source],
  )

  const addComment = useCallback(
    async (body: string, parentId: string | null) => {
      const created = await source.createComment({ postId, parentId, body })
      const node: CommentNode = { ...created, replies: [] }
      setComments((current) =>
        parentId ? insertReply(current, parentId, node) : [...current, node],
      )
      setPost((current) =>
        current ? { ...current, commentCount: current.commentCount + 1 } : current,
      )
    },
    [postId, source],
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
    isSampleContent: source.isSampleContent,
  }
}
