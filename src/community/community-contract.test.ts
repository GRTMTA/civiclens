import { describe, expect, it } from "vitest"

import {
  applyVote,
  buildCommentTree,
  countComments,
  formatScore,
  relativeTime,
  selectPosts,
  sortPosts,
  validateNewPost,
  type CommunityComment,
  type CommunityPost,
} from "./community-contract"

function post(overrides: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id: "post-1",
    title: "Bridge works paused",
    body: "Equipment has not moved.",
    authorName: "CivicLens Resident",
    createdAt: "2026-08-01T00:00:00.000Z",
    topic: "bridges",
    score: 10,
    commentCount: 2,
    viewerVote: 0,
    project: null,
    ...overrides,
  }
}

function comment(overrides: Partial<CommunityComment> = {}): CommunityComment {
  return {
    id: "comment-1",
    postId: "post-1",
    parentId: null,
    authorName: "resident",
    body: "Noted.",
    createdAt: "2026-08-01T00:00:00.000Z",
    score: 1,
    viewerVote: 0,
    ...overrides,
  }
}

describe("applyVote", () => {
  it("adds an upvote from a neutral state", () => {
    expect(applyVote({ score: 10, viewerVote: 0 }, 1)).toEqual({ score: 11, viewerVote: 1 })
  })

  it("clears the vote when the active direction is pressed again", () => {
    expect(applyVote({ score: 11, viewerVote: 1 }, 1)).toEqual({ score: 10, viewerVote: 0 })
  })

  it("moves the score by two when switching direction", () => {
    expect(applyVote({ score: 11, viewerVote: 1 }, -1)).toEqual({ score: 9, viewerVote: -1 })
  })

  it("is reversible, so a failed vote can be rolled back", () => {
    const start = { score: 10, viewerVote: 0 as const }
    const optimistic = applyVote(start, 1)
    expect(applyVote(optimistic, 1)).toEqual(start)
  })
})

describe("buildCommentTree", () => {
  it("nests replies under their parent and counts the whole thread", () => {
    const tree = buildCommentTree([
      comment({ id: "a" }),
      comment({ id: "b", parentId: "a" }),
      comment({ id: "c", parentId: "b" }),
      comment({ id: "d" }),
    ])

    expect(tree).toHaveLength(2)
    expect(tree[0].replies[0].id).toBe("b")
    expect(tree[0].replies[0].replies[0].id).toBe("c")
    expect(countComments(tree)).toBe(4)
  })

  it("treats a comment with a missing parent as top level", () => {
    const tree = buildCommentTree([comment({ id: "orphan", parentId: "gone" })])
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe("orphan")
  })
})

describe("sortPosts", () => {
  const older = post({ id: "older", score: 50, commentCount: 1, createdAt: "2026-08-01T00:00:00.000Z" })
  const newer = post({ id: "newer", score: 10, commentCount: 9, createdAt: "2026-08-05T00:00:00.000Z" })

  it("orders popular by score", () => {
    expect(sortPosts([newer, older], "popular").map((item) => item.id)).toEqual(["older", "newer"])
  })

  it("orders new by recency", () => {
    expect(sortPosts([older, newer], "new").map((item) => item.id)).toEqual(["newer", "older"])
  })

  it("orders discussed by comment count", () => {
    expect(sortPosts([older, newer], "discussed").map((item) => item.id)).toEqual(["newer", "older"])
  })

  it("does not mutate the input", () => {
    const input = [newer, older]
    sortPosts(input, "popular")
    expect(input.map((item) => item.id)).toEqual(["newer", "older"])
  })
})

describe("selectPosts", () => {
  const roads = post({ id: "roads", topic: "roads", title: "Road repaving update" })
  const bridges = post({
    id: "bridges",
    topic: "bridges",
    title: "Bridge question",
    project: { id: "p-1", name: "Mandaue–Mactan Bridge Rehabilitation" },
  })

  it("filters by topic", () => {
    const result = selectPosts([roads, bridges], { sort: "new", search: "", topic: "roads" })
    expect(result.map((item) => item.id)).toEqual(["roads"])
  })

  it("searches titles case-insensitively", () => {
    const result = selectPosts([roads, bridges], { sort: "new", search: "REPAVING", topic: null })
    expect(result.map((item) => item.id)).toEqual(["roads"])
  })

  it("searches the related project name", () => {
    const result = selectPosts([roads, bridges], { sort: "new", search: "mactan", topic: null })
    expect(result.map((item) => item.id)).toEqual(["bridges"])
  })

  it("returns everything for an empty query", () => {
    expect(selectPosts([roads, bridges], { sort: "new", search: "  ", topic: null })).toHaveLength(2)
  })
})

describe("validateNewPost", () => {
  const base = { body: "", topic: "roads" as const, projectId: null }

  it("rejects a title that is too short", () => {
    expect(validateNewPost({ ...base, title: "Short" })?.field).toBe("title")
  })

  it("accepts a titled post with no body or project", () => {
    expect(validateNewPost({ ...base, title: "Is this project still active?" })).toBeNull()
  })

  it("rejects a body beyond the limit", () => {
    const invalid = validateNewPost({
      ...base,
      title: "A reasonable question about this road",
      body: "x".repeat(4001),
    })
    expect(invalid?.field).toBe("body")
  })
})

describe("relativeTime", () => {
  const now = new Date("2026-08-15T12:00:00.000Z")

  it("formats hours and days compactly", () => {
    expect(relativeTime("2026-08-15T09:00:00.000Z", now)).toBe("3h")
    expect(relativeTime("2026-08-13T12:00:00.000Z", now)).toBe("2d")
  })

  it("returns an empty string for an unparseable value", () => {
    expect(relativeTime("not-a-date", now)).toBe("")
  })
})

describe("formatScore", () => {
  it("abbreviates large scores and preserves small ones", () => {
    expect(formatScore(184)).toBe("184")
    expect(formatScore(-3)).toBe("-3")
    expect(formatScore(1200)).toBe("1.2k")
    expect(formatScore(15400)).toBe("15k")
  })
})
