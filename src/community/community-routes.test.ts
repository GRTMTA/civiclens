import { describe, expect, it } from "vitest"

import {
  isCommunityPath,
  postPath,
  profilePath,
  projectDiscussionPath,
  projectMapPath,
  readCommunityRoute,
} from "./community-routes"

describe("community route ownership", () => {
  it("claims the feed and its nested paths", () => {
    expect(isCommunityPath("/community")).toBe(true)
    expect(isCommunityPath("/community/post/abc")).toBe(true)
    expect(isCommunityPath("/community/profile/maria")).toBe(true)
  })

  it("does not claim other surfaces", () => {
    expect(isCommunityPath("/map")).toBe(false)
    expect(isCommunityPath("/scan")).toBe(false)
    expect(isCommunityPath("/communityx")).toBe(false)
  })
})

describe("community route parsing", () => {
  it("reads the feed", () => {
    expect(readCommunityRoute("/community")).toEqual({ kind: "feed" })
  })

  it("reads a discussion", () => {
    expect(readCommunityRoute("/community/post/abc-123")).toEqual({
      kind: "post",
      postId: "abc-123",
    })
  })

  it("reads a profile and normalises the handle", () => {
    expect(readCommunityRoute("/community/profile/Maria")).toEqual({
      kind: "profile",
      username: "maria",
    })
  })

  it("falls back to the feed for unrecognised shapes", () => {
    expect(readCommunityRoute("/community/post/")).toEqual({ kind: "feed" })
    expect(readCommunityRoute("/community/profile/")).toEqual({ kind: "feed" })
    expect(readCommunityRoute("/community/other")).toEqual({ kind: "feed" })
  })

  it("decodes percent-encoded segments", () => {
    expect(readCommunityRoute("/community/post/a%20b")).toEqual({ kind: "post", postId: "a b" })
  })
})

describe("path builders", () => {
  it("builds canonical community paths", () => {
    expect(profilePath("maria")).toBe("/community/profile/maria")
    expect(postPath("abc")).toBe("/community/post/abc")
  })

  it("links a project to community and map context", () => {
    expect(projectDiscussionPath("dpwh-1")).toBe("/community?project=dpwh-1")
    expect(projectMapPath("dpwh-1")).toBe("/map?project=dpwh-1")
  })

  it("escapes ids that would otherwise break the path", () => {
    expect(profilePath("a/b")).toBe("/community/profile/a%2Fb")
    expect(projectMapPath("a&b=c")).toBe("/map?project=a%26b%3Dc")
  })
})
