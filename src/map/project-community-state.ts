import {
  applyVote,
  type CommunityPost,
  type VoteState,
} from "@/community/community-contract"

export type PostVoteSnapshot = {
  score: number
  viewerVote: VoteState
}

export function sortProjectPosts(posts: readonly CommunityPost[]): CommunityPost[] {
  return [...posts].sort((left, right) =>
    right.score - left.score ||
    Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
    left.id.localeCompare(right.id),
  )
}

/** Adds a newly published post only when it explicitly references this project. */
export function addPublishedProjectPost(
  posts: readonly CommunityPost[],
  post: CommunityPost,
  projectId: string,
): CommunityPost[] {
  if (post.project?.id !== projectId) return [...posts]
  return sortProjectPosts([post, ...posts.filter((current) => current.id !== post.id)])
}

/** Applies the same optimistic vote transition used by the main Community feed. */
export function optimisticallyVoteProjectPost(
  posts: readonly CommunityPost[],
  postId: string,
  direction: 1 | -1,
): CommunityPost[] {
  return sortProjectPosts(posts.map((post) =>
    post.id === postId ? { ...post, ...applyVote(post, direction) } : post,
  ))
}

/** Reconciles or restores one post without disturbing newer list changes. */
export function setProjectPostVote(
  posts: readonly CommunityPost[],
  postId: string,
  vote: PostVoteSnapshot,
): CommunityPost[] {
  return sortProjectPosts(
    posts.map((post) => (post.id === postId ? { ...post, ...vote } : post)),
  )
}
