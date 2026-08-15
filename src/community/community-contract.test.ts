import { describe, expect, it } from "vitest"

import {
  applyVote,
  buildCommentTree,
  countComments,
  initialsFor,
  joinedLabel,
  relativeTime,
  topicLabel,
  validateImage,
  validateNewPost,
  validateProfile,
  type CommunityComment,
  type NewPostInput,
} from "./community-contract"

function post(overrides: Partial<NewPostInput> = {}): NewPostInput {
  return {
    kind: "discussion",
    title: "Construction near the eastern section",
    body: "",
    topic: "roads",
    projectId: null,
    areaLabel: null,
    photos: [],
    ...overrides,
  }
}

function image(name: string, type = "image/jpeg", size = 1024): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe("post validation", () => {
  it("accepts a well-formed discussion", () => {
    expect(validateNewPost(post())).toBeNull()
  })

  it("requires a usable title", () => {
    expect(validateNewPost(post({ title: "short" }))?.field).toBe("title")
  })

  it("accepts an observation with an approximate area", () => {
    expect(
      validateNewPost(post({ kind: "observation", areaLabel: "Barangay Pajac" })),
    ).toBeNull()
  })

  it("rejects an over-long area label", () => {
    expect(validateNewPost(post({ areaLabel: "x".repeat(200) }))?.field).toBe("area")
  })

  it("caps attached photos at four", () => {
    const photos = [image("a.jpg"), image("b.jpg"), image("c.jpg"), image("d.jpg"), image("e.jpg")]
    expect(validateNewPost(post({ photos }))?.field).toBe("photos")
  })

  it("rejects a non-image attachment", () => {
    expect(validateNewPost(post({ photos: [image("notes.pdf", "application/pdf")] }))?.field).toBe(
      "photos",
    )
  })
})

describe("image validation", () => {
  it("accepts the bucket's allowed types", () => {
    expect(validateImage(image("a.webp", "image/webp"))).toBeNull()
    expect(validateImage(image("a.png", "image/png"))).toBeNull()
  })

  it("rejects a file over the size limit", () => {
    expect(validateImage(image("big.jpg", "image/jpeg", 6 * 1024 * 1024))).toContain("larger than")
  })
})

describe("profile validation", () => {
  it("accepts a valid handle", () => {
    expect(
      validateProfile({ displayName: "Maria Santos", username: "maria_s", bio: "Resident." }),
    ).toBeNull()
  })

  it("rejects uppercase and punctuation in handles", () => {
    expect(
      validateProfile({ displayName: "Maria", username: "Maria.Santos", bio: "" })?.field,
    ).toBe("username")
  })

  it("rejects a handle that is too short", () => {
    expect(validateProfile({ displayName: "Maria", username: "ms", bio: "" })?.field).toBe(
      "username",
    )
  })

  it("caps the bio length", () => {
    expect(
      validateProfile({ displayName: "Maria", username: "maria", bio: "x".repeat(300) })?.field,
    ).toBe("bio")
  })
})

describe("presentation helpers", () => {
  it("derives initials from a display name", () => {
    expect(initialsFor("Maria Santos")).toBe("MS")
    expect(initialsFor("Vincent")).toBe("VI")
    expect(initialsFor("   ")).toBe("R")
  })

  it("formats a join month", () => {
    expect(joinedLabel("2026-08-01T00:00:00Z")).toContain("2026")
    expect(joinedLabel("not-a-date")).toBe("")
  })

  it("labels known topics", () => {
    expect(topicLabel("flood-control")).toBe("Flood Control")
  })

  it("reports compact relative time", () => {
    const now = new Date("2026-08-15T12:00:00Z")
    expect(relativeTime("2026-08-15T09:00:00Z", now)).toBe("3h")
  })
})

describe("voting", () => {
  it("clears a vote when the active direction is pressed again", () => {
    expect(applyVote({ score: 5, viewerVote: 1 }, 1)).toEqual({ score: 4, viewerVote: 0 })
  })

  it("moves the score by two when switching direction", () => {
    expect(applyVote({ score: 5, viewerVote: 1 }, -1)).toEqual({ score: 3, viewerVote: -1 })
  })
})

describe("comment threading", () => {
  const base = {
    postId: "p1",
    authorName: "Maria Santos",
    author: { name: "Maria Santos", username: "maria", avatarPath: null, avatarUrl: null },
    body: "",
    createdAt: "2026-08-15T00:00:00Z",
    score: 0,
    viewerVote: 0 as const,
    media: [],
  }

  it("nests replies under their parent and counts the whole tree", () => {
    const comments: CommunityComment[] = [
      { ...base, id: "c1", parentId: null },
      { ...base, id: "c2", parentId: "c1" },
      { ...base, id: "c3", parentId: "c2" },
      { ...base, id: "c4", parentId: null },
    ]
    const tree = buildCommentTree(comments)
    expect(tree).toHaveLength(2)
    expect(tree[0].replies[0].replies[0].id).toBe("c3")
    expect(countComments(tree)).toBe(4)
  })
})
