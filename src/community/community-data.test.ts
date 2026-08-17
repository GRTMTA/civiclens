import type { SupabaseClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import { createSupabaseSource } from "./community-data"

function post(id: string, score: number, projectId = "dpwh-1") {
  return {
    id,
    title: `Discussion ${id}`,
    body: "Resident overview",
    author_name: "Resident",
    created_at: "2026-08-16T00:00:00Z",
    topic: "roads",
    project_id: projectId,
    project_name: "Road project",
    score,
    comment_count: 2,
    viewer_vote: 0,
  }
}

describe("project-linked community posts", () => {
  it("uses the existing feed's project filter and parses score-ranked posts", async () => {
    const rpc = vi.fn(async () => ({
      data: [post("high", 8), post("low", 2)],
      error: null,
    }))
    const source = createSupabaseSource({ rpc } as unknown as SupabaseClient)

    const result = await source.listPostsForProject("  dpwh-1  ")

    expect(rpc).toHaveBeenCalledWith("community_feed", {
      p_sort: "popular",
      p_topic: null,
      p_search: null,
      p_project_id: "dpwh-1",
      p_kind: null,
      p_author: null,
    })
    expect(result.map((item) => ({ id: item.id, score: item.score }))).toEqual([
      { id: "high", score: 8 },
      { id: "low", score: 2 },
    ])
    expect(result[0].project).toEqual({ id: "dpwh-1", name: "Road project" })
  })

  it("uses and filters the original feed when extended filters are absent", async () => {
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) =>
      "p_project_id" in args
        ? {
            data: null,
            error: {
              code: "PGRST202",
              message: "Could not find the function public.community_feed(p_project_id)",
            },
          }
        : {
            data: [post("linked", 4, "dpwh-1"), post("other", 9, "dpwh-2")],
            error: null,
          },
    )
    const source = createSupabaseSource({ rpc } as unknown as SupabaseClient)

    const result = await source.listPostsForProject("dpwh-1")

    expect(result.map((item) => item.id)).toEqual(["linked"])
    expect(rpc).toHaveBeenNthCalledWith(2, "community_feed", {
      p_sort: "popular",
      p_topic: null,
      p_search: null,
      p_limit: 100,
      p_offset: 0,
    })
  })

  it("falls back directly from an extended feed query to the original signature", async () => {
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) =>
      "p_project_id" in args
        ? {
            data: null,
            error: {
              code: "PGRST202",
              message: "Could not find the function public.community_feed(p_project_id)",
            },
          }
        : {
            data: [post("linked", 3, "dpwh-1"), post("other", 7, "dpwh-2")],
            error: null,
          },
    )
    const source = createSupabaseSource({ rpc } as unknown as SupabaseClient)

    const result = await source.listPosts({
      sort: "popular",
      search: "",
      topic: null,
      projectId: "dpwh-1",
      kind: "discussion",
      author: null,
    })

    expect(result.map((item) => item.id)).toEqual(["linked"])
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it("does not hide non-schema failures behind a compatibility retry", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "network unavailable" },
    }))
    const source = createSupabaseSource({ rpc } as unknown as SupabaseClient)

    await expect(source.listPostsForProject("dpwh-1")).rejects.toThrow(
      "network unavailable",
    )
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it("does not retry an unrelated schema-cache failure as a legacy feed", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "Could not find the table public.community_posts in the schema cache" },
    }))
    const source = createSupabaseSource({ rpc } as unknown as SupabaseClient)

    await expect(source.listPosts({
      sort: "popular",
      search: "",
      topic: null,
      projectId: null,
      kind: null,
      author: null,
    })).rejects.toMatchObject({ name: "CommunitySchemaMissingError" })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it("does not retry a differently named missing function with the same prefix", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.community_feed_helper() in the schema cache",
      },
    }))
    const source = createSupabaseSource({ rpc } as unknown as SupabaseClient)

    await expect(source.listPosts({
      sort: "popular",
      search: "",
      topic: null,
      projectId: null,
      kind: null,
      author: null,
    })).rejects.toMatchObject({ name: "CommunitySchemaMissingError" })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it("rejects an empty project ID before issuing an RPC", async () => {
    const rpc = vi.fn()
    const source = createSupabaseSource({ rpc } as unknown as SupabaseClient)

    await expect(source.listPostsForProject("   ")).rejects.toThrow(
      "A project ID is required",
    )
    expect(rpc).not.toHaveBeenCalled()
  })

  it("surfaces a genuinely missing base Community API", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.community_feed(p_project_id)",
      },
    }))
    const source = createSupabaseSource({ rpc } as unknown as SupabaseClient)

    await expect(source.listPostsForProject("dpwh-1")).rejects.toMatchObject({
      name: "CommunitySchemaMissingError",
    })
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})


describe("project-linked Community writes", () => {
  function authenticatedClient(rpc: ReturnType<typeof vi.fn>): SupabaseClient {
    return {
      rpc,
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: "resident-1" } } } })),
      },
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }),
        })),
      },
    } as unknown as SupabaseClient
  }

  it("creates with the resident's explicit project choice and re-reads the canonical post", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === "create_community_post" || name === "community_post"
        ? post("created", 1)
        : null,
      error: null,
    }))
    const source = createSupabaseSource(authenticatedClient(rpc))

    const created = await source.createPost({
      kind: "discussion",
      title: "Question about the road schedule",
      body: "When is the next phase expected?",
      topic: "roads",
      projectId: "dpwh-1",
      areaLabel: null,
      photos: [],
    })

    expect(rpc).toHaveBeenNthCalledWith(1, "create_community_post", {
      p_title: "Question about the road schedule",
      p_body: "When is the next phase expected?",
      p_topic: "roads",
      p_project_id: "dpwh-1",
      p_kind: "discussion",
      p_area_label: null,
    })
    expect(rpc).toHaveBeenNthCalledWith(2, "community_post", { p_post_id: "created" })
    expect(created.project).toEqual({ id: "dpwh-1", name: "Road project" })
  })


  it("uses the original create-post signature when newer arguments are unavailable", async () => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "create_community_post" && "p_kind" in args) {
        return {
          data: null,
          error: {
            code: "PGRST202",
            message: "Could not find the function public.create_community_post(p_kind)",
          },
        }
      }
      return {
        data: name === "create_community_post" || name === "community_post"
          ? post("legacy-created", 1)
          : null,
        error: null,
      }
    })
    const source = createSupabaseSource(authenticatedClient(rpc))

    const created = await source.createPost({
      kind: "observation",
      title: "Observed work beside the road",
      body: "Resident observation",
      topic: "roads",
      projectId: "dpwh-1",
      areaLabel: "Barangay Pajac",
      photos: [],
    })

    expect(created.id).toBe("legacy-created")
    expect(rpc).toHaveBeenNthCalledWith(2, "create_community_post", {
      p_title: "Observed work beside the road",
      p_body: "Resident observation",
      p_topic: "roads",
      p_project_id: "dpwh-1",
    })
    expect(rpc).toHaveBeenNthCalledWith(3, "community_post", {
      p_post_id: "legacy-created",
    })
  })

  it("does not retry a quota failure with the legacy create signature", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "community_rate_limit_exceeded" },
    }))
    const source = createSupabaseSource(authenticatedClient(rpc))

    await expect(source.createPost({
      kind: "discussion",
      title: "Question about the road schedule",
      body: "",
      topic: "roads",
      projectId: "dpwh-1",
      areaLabel: null,
      photos: [],
    })).rejects.toThrow("You have reached the posting limit")
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it("does not retry a validation failure with the legacy create signature", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "title must be between 8 and 160 characters" },
    }))
    const source = createSupabaseSource(authenticatedClient(rpc))

    await expect(source.createPost({
      kind: "discussion",
      title: "Question about the road schedule",
      body: "",
      topic: "roads",
      projectId: "dpwh-1",
      areaLabel: null,
      photos: [],
    })).rejects.toThrow("title must be between 8 and 160 characters")
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it("delegates vote toggle semantics to the established post vote RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { score: 6, viewer_vote: 0 },
      error: null,
    }))
    const source = createSupabaseSource(authenticatedClient(rpc))

    await expect(source.votePost("post-1", 1)).resolves.toEqual({
      score: 6,
      viewerVote: 0,
    })
    expect(rpc).toHaveBeenCalledWith("vote_community_post", {
      p_post_id: "post-1",
      p_direction: 1,
    })
  })

  it("rejects guest creation before issuing a write RPC", async () => {
    const rpc = vi.fn()
    const source = createSupabaseSource({
      rpc,
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null } })),
      },
      storage: { from: vi.fn() },
    } as unknown as SupabaseClient)

    await expect(source.createPost({
      kind: "discussion",
      title: "Question about the road schedule",
      body: "",
      topic: "roads",
      projectId: "dpwh-1",
      areaLabel: null,
      photos: [],
    })).rejects.toMatchObject({ name: "CommunityAuthRequiredError" })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("carries the published post when media attachment fails after creation", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "create_community_post"
        ? { data: post("created", 1), error: null }
        : name === "attach_community_post_media"
          ? { data: null, error: { message: "attachment unavailable" } }
          : { data: null, error: null },
    )
    const client = authenticatedClient(rpc) as unknown as {
      storage: { from: ReturnType<typeof vi.fn> }
    }
    client.storage = {
      from: vi.fn(() => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }),
        upload: vi.fn(async () => ({ error: null })),
      })),
    }
    const source = createSupabaseSource(client as unknown as SupabaseClient)

    await expect(source.createPost({
      kind: "discussion",
      title: "Question about the road schedule",
      body: "",
      topic: "roads",
      projectId: "dpwh-1",
      areaLabel: null,
      photos: [new File(["photo"], "road.jpg", { type: "image/jpeg" })],
    })).rejects.toMatchObject({
      name: "CommunityMediaError",
      publishedPost: { id: "created" },
    })
  })

  it("carries the published post when its canonical re-read fails", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "create_community_post"
        ? { data: post("created", 1), error: null }
        : { data: null, error: { message: "read unavailable" } },
    )
    const source = createSupabaseSource(authenticatedClient(rpc))

    await expect(source.createPost({
      kind: "discussion",
      title: "Question about the road schedule",
      body: "",
      topic: "roads",
      projectId: "dpwh-1",
      areaLabel: null,
      photos: [],
    })).rejects.toMatchObject({
      name: "CommunityMediaError",
      publishedPost: { id: "created" },
    })
  })

  it("treats a null canonical re-read as partial publication", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === "create_community_post" ? post("created", 1) : null,
      error: null,
    }))
    const source = createSupabaseSource(authenticatedClient(rpc))

    await expect(source.createPost({
      kind: "discussion",
      title: "Question about the road schedule",
      body: "",
      topic: "roads",
      projectId: "dpwh-1",
      areaLabel: null,
      photos: [],
    })).rejects.toMatchObject({
      name: "CommunityMediaError",
      publishedPost: { id: "created" },
    })
  })
})
