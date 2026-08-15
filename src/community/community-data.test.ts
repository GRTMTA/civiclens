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
  it("requests only the selected project and parses score-ranked posts", async () => {
    const rpc = vi.fn(async () => ({
      data: [post("high", 8), post("low", 2)],
      error: null,
    }))
    const source = createSupabaseSource({ rpc } as unknown as SupabaseClient)

    const result = await source.listPostsForProject("  dpwh-1  ")

    expect(rpc).toHaveBeenCalledWith("community_posts_for_project", {
      p_project_id: "dpwh-1",
      p_limit: 50,
      p_offset: 0,
    })
    expect(result.map((item) => ({ id: item.id, score: item.score }))).toEqual([
      { id: "high", score: 8 },
      { id: "low", score: 2 },
    ])
    expect(result[0].project).toEqual({ id: "dpwh-1", name: "Road project" })
  })

  it("rejects an empty project ID before issuing an RPC", async () => {
    const rpc = vi.fn()
    const source = createSupabaseSource({ rpc } as unknown as SupabaseClient)

    await expect(source.listPostsForProject("   ")).rejects.toThrow(
      "A project ID is required",
    )
    expect(rpc).not.toHaveBeenCalled()
  })

  it("surfaces missing schema as the established recoverable error", async () => {
    const source = createSupabaseSource({
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "Could not find the function public.community_posts_for_project" },
      })),
    } as unknown as SupabaseClient)

    await expect(source.listPostsForProject("dpwh-1")).rejects.toMatchObject({
      name: "CommunitySchemaMissingError",
    })
  })
})
