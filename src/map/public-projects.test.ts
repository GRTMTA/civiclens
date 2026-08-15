import { describe, expect, it } from "vitest"
import {
  fetchProjectDetail,
  fetchViewportProjects,
  getMapStyle,
  isCurrentUserModerator,
  isMapConfigurationError,
  MapConfigurationError,
  SATELLITE_ATTRIBUTION,
  SATELLITE_STYLE,
  saveReviewedOsmEstimate,
} from "./public-projects"

describe("public project data seam", () => {
  it("turns an invalid project ID into a recoverable unavailable detail", async () => {
    const result = await fetchProjectDetail("missing-project", {
      rpc: async () => ({ data: null, error: null }),
    })

    expect(result).toBeNull()
  })

  it("uses the no-key attributed satellite style unless an override is set", () => {
    expect(getMapStyle("", "")).toBe(SATELLITE_STYLE)
    expect(getMapStyle("   ", "   ")).toBe(SATELLITE_STYLE)
    expect(getMapStyle("", "free-key")).toBe(
      "https://api.maptiler.com/maps/hybrid/style.json?key=free-key",
    )
    expect(getMapStyle("https://maps.example/style.json", "free-key")).toBe(
      "https://maps.example/style.json",
    )

    const satelliteSource = SATELLITE_STYLE.sources.satellite
    expect(satelliteSource).toMatchObject({
      type: "raster",
      maxzoom: 14,
      attribution: SATELLITE_ATTRIBUTION,
    })
    expect(SATELLITE_ATTRIBUTION).toContain("Sentinel-2 cloudless")
    expect(SATELLITE_ATTRIBUTION).toContain("EOX IT Services GmbH")
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

  it("keeps missing public-data configuration distinguishable from query failures", () => {
    const configurationError = new MapConfigurationError("configuration required")

    expect(isMapConfigurationError(configurationError)).toBe(true)
    expect(isMapConfigurationError(new Error("query failed"))).toBe(false)
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
          geometry_kind: "official",
          geometry_source: "DPWH approved plan",
          geometry_source_url: "https://example.gov.ph/plan",
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
        geometryKind: "official",
        geometrySource: "DPWH approved plan",
        geometrySourceUrl: "https://example.gov.ph/plan",
      }),
    )
  })
})


describe("reviewed OSM geometry RPC seam", () => {
  it("checks moderator status without treating RPC failures as authorization", async () => {
    await expect(
      isCurrentUserModerator({ rpc: async () => ({ data: true, error: null }) }),
    ).resolves.toBe(true)
    await expect(
      isCurrentUserModerator({ rpc: async () => ({ data: null, error: { message: "signed out" } }) }),
    ).resolves.toBe(false)
  })

  it("submits only reviewed line geometry and provenance fields", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    await saveReviewedOsmEstimate(
      {
        projectId: "dpwh-1",
        osmWayId: 123,
        geometry: {
          type: "LineString",
          coordinates: [[123.9, 10.3], [123.901, 10.301]],
        },
        note: "Checked against the contract location",
      },
      {
        rpc: async (name, args) => {
          calls.push({ name, args })
          return { data: null, error: null }
        },
      },
    )

    expect(calls).toEqual([{
      name: "review_project_osm_geometry",
      args: {
        p_project_id: "dpwh-1",
        p_osm_way_id: 123,
        p_geometry: {
          type: "LineString",
          coordinates: [[123.9, 10.3], [123.901, 10.301]],
        },
        p_note: "Checked against the contract location",
      },
    }])
  })
})
