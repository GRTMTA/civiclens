import { describe, expect, it } from "vitest"
import { fetchProjectDetail, fetchViewportProjects } from "./public-projects"

describe("public project data seam", () => {
  it("turns an invalid project ID into a recoverable unavailable detail", async () => {
    const result = await fetchProjectDetail("missing-project", {
      rpc: async () => ({ data: null, error: null }),
    })

    expect(result).toBeNull()
  })

  it("passes only bounded viewport arguments to the public query", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const result = await fetchViewportProjects(
      { south: 10, west: 123, north: 11, east: 124 },
      {
        rpc: async (name, args) => {
          calls.push({ name, args })
          return {
            data: { type: "FeatureCollection", truncated: false, features: [] },
            error: null,
          }
        },
      },
    )

    expect(result).toEqual({ features: [], truncated: false })
    expect(calls).toEqual([
      {
        name: "projects_in_view",
        args: {
          p_south: 10,
          p_west: 123,
          p_north: 11,
          p_east: 124,
        },
      },
    ])
  })
})
