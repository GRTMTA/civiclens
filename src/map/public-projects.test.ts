import { describe, expect, it } from "vitest"
import {
  fetchProjectDetail,
  fetchViewportProjects,
  getProjectDataErrorCopy,
  isInvalidViewportError,
  isMapConfigurationError,
  InvalidViewportError,
  ProjectDataRequestError,
  MapConfigurationError,
} from "./public-projects"

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

  it("rejects an oversized viewport before making the RPC request", async () => {
    let called = false
    let caught: unknown
    try {
      await fetchViewportProjects(
        { south: 0, west: 0, north: 20, east: 20 },
        {
          rpc: async () => {
            called = true
            return { data: null, error: null }
          },
        },
      )
    } catch (error) {
      caught = error
    }
    expect(isInvalidViewportError(caught)).toBe(true)
    expect(caught).toBeInstanceOf(InvalidViewportError)
    expect(called).toBe(false)
    expect(getProjectDataErrorCopy(caught).title).toBe("Zoom in to load projects")
  })

  it("keeps missing public-data configuration distinguishable from query failures", () => {
    const configurationError = new MapConfigurationError("configuration required")

    expect(isMapConfigurationError(configurationError)).toBe(true)
    expect(isMapConfigurationError(new Error("query failed"))).toBe(false)
  })

  it("turns a missing viewport RPC into an actionable migration state", () => {
    const copy = getProjectDataErrorCopy(
      new Error(
        "Could not find the function public.projects_in_view(p_east, p_north, p_south, p_west) in the schema cache",
      ),
    )

    expect(copy).toEqual({
      kind: "migration",
      title: "Map data migration required",
      description:
        "The connected Supabase project is missing the public project-map function. Apply the map migration, then retry.",
    })
  })

  it("keeps Supabase contract and timeout failures actionable", () => {
    expect(
      getProjectDataErrorCopy(
        new ProjectDataRequestError("canceling statement due to statement timeout", "57014"),
      ),
    ).toEqual({
      kind: "query",
      title: "Project query timed out",
      description: "The official project query took too long. Zoom in and retry.",
    })

    expect(
      getProjectDataErrorCopy(
        new ProjectDataRequestError("function projects_in_view is not available", "PGRST202"),
      ).kind,
    ).toBe("migration")
  })

  it("surfaces public viewport and detail query failures to the caller", async () => {
    const client = {
      rpc: async () => ({ data: null, error: { message: "temporary outage" } }),
    }

    await expect(
      fetchViewportProjects(
        { south: 10, west: 123, north: 11, east: 124 },
        client,
      ),
    ).rejects.toThrow("temporary outage")
    await expect(fetchProjectDetail("dpwh-1", client)).rejects.toThrow(
      "temporary outage",
    )
  })

  it("preserves optional official metadata during detail hydration", async () => {
    const result = await fetchProjectDetail("dpwh-1", {
      rpc: async () => ({
        data: {
          id: "dpwh-1",
          name: "Bridge improvement",
          status: "Completed",
          category: "bridge",
          latitude: 10.3,
          longitude: 123.9,
          amount_paid: 420000,
          infrastructure_year: "2025",
          program_name: "Bridge program",
          source_of_funds: "National government",
        },
        error: null,
      }),
    })

    expect(result).toEqual(
      expect.objectContaining({
        amountPaid: 420000,
        infrastructureYear: "2025",
        programName: "Bridge program",
        sourceOfFunds: "National government",
      }),
    )
  })
})
