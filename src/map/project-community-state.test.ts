import { describe, expect, it } from "vitest"

import type { CommunityPost } from "@/community/community-contract"
import {
  addPublishedProjectPost,
  optimisticallyVoteProjectPost,
  setProjectPostVote,
} from "./project-community-state"

function post(
  id: string,
  projectId: string | null = "dpwh-1",
  score = 0,
  viewerVote: -1 | 0 | 1 = 0,
): CommunityPost {
  return {
    id,
    kind: "discussion",
    title: `Discussion ${id}`,
    body: "Resident context",
    authorName: "Resident",
    author: {
      name: "Resident",
      username: null,
      avatarPath: null,
      avatarUrl: null,
    },
    createdAt: "2026-08-17T00:00:00Z",
    topic: "roads",
    score,
    commentCount: 0,
    viewerVote,
    project: projectId ? { id: projectId, name: `Project ${projectId}` } : null,
    areaLabel: null,
    media: [],
  }
}

describe("map project Community state", () => {
  it("immediately prepends and deduplicates a post linked to the open project", () => {
    const created = post("new")
    expect(addPublishedProjectPost([post("old"), post("new", "dpwh-1", 1, 1)], created, "dpwh-1"))
      .toEqual([created, post("old")])
  })

  it("does not add a post whose project link was changed or removed", () => {
    const existing = [post("old")]
    expect(addPublishedProjectPost(existing, post("other", "dpwh-2"), "dpwh-1"))
      .toEqual(existing)
    expect(addPublishedProjectPost(existing, post("unlinked", null), "dpwh-1"))
      .toEqual(existing)
  })

  it("keeps higher-score posts ahead of a newly published author-upvoted post", () => {
    const ranked = addPublishedProjectPost(
      [post("popular", "dpwh-1", 9), post("quiet", "dpwh-1", 0)],
      post("new", "dpwh-1", 1, 1),
      "dpwh-1",
    )
    expect(ranked.map((item) => item.id)).toEqual(["popular", "new", "quiet"])
  })

  it("re-ranks posts after a vote score changes", () => {
    const ranked = optimisticallyVoteProjectPost(
      [post("first", "dpwh-1", 2), post("second", "dpwh-1", 1)],
      "second",
      1,
    )
    expect(ranked.map((item) => item.id)).toEqual(["first", "second"])
    expect(setProjectPostVote(ranked, "second", { score: 3, viewerVote: 1 })
      .map((item) => item.id)).toEqual(["second", "first"])
  })

  it("applies upvote, clear, and opposite-direction vote behavior", () => {
    expect(optimisticallyVoteProjectPost([post("p", "dpwh-1", 4, 0)], "p", 1)[0])
      .toMatchObject({ score: 5, viewerVote: 1 })
    expect(optimisticallyVoteProjectPost([post("p", "dpwh-1", 4, 1)], "p", 1)[0])
      .toMatchObject({ score: 3, viewerVote: 0 })
    expect(optimisticallyVoteProjectPost([post("p", "dpwh-1", 4, 1)], "p", -1)[0])
      .toMatchObject({ score: 2, viewerVote: -1 })
  })

  it("restores the exact pre-vote snapshot after a failed switched vote", () => {
    const original = post("p", "dpwh-1", 5, -1)
    const optimistic = optimisticallyVoteProjectPost([original], "p", 1)
    expect(optimistic[0]).toMatchObject({ score: 7, viewerVote: 1 })
    expect(setProjectPostVote(optimistic, "p", { score: 5, viewerVote: -1 })[0])
      .toEqual(original)
  })
})
