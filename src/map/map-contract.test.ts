import { describe, expect, it } from "vitest"
import {
  normalizeOfficialStatus,
  parseProjectDetail,
  parseViewportPayload,
  readMapUrlState,
  writeCameraSearch,
  writeProjectSearch,
} from "./map-contract"

describe("official project map contract", () => {
  it("normalizes pre-construction before the broad construction rule", () => {
    expect(normalizeOfficialStatus("Pre-construction works")).toBe(
      "planned",
    )
    expect(normalizeOfficialStatus("Under construction")).toBe("ongoing")
    expect(normalizeOfficialStatus("Completed")).toBe("completed")
  })

  it("keeps an unrecognized source status in the Unknown display bucket", () => {
    expect(normalizeOfficialStatus("Awaiting source confirmation")).toBe(
      "unknown",
    )
    expect(normalizeOfficialStatus(null)).toBe("unknown")
    expect(normalizeOfficialStatus("Incomplete documentation")).toBe("unknown")
  })

  it("parses a truncated lightweight viewport response", () => {
    const result = parseViewportPayload({
      type: "FeatureCollection",
      truncated: true,
      features: [
        {
          type: "Feature",
          id: "dpwh-1",
          geometry: { type: "Point", coordinates: [123.9, 10.3] },
          properties: {
            id: "dpwh-1",
            name: "Barangay road improvement",
            category: "road",
            status: "Ongoing",
            source: "DPWH",
          },
        },
      ],
    })

    expect(result.truncated).toBe(true)
    expect(result.features[0]).toMatchObject({
      id: "dpwh-1",
      name: "Barangay road improvement",
      displayStatus: "ongoing",
      coordinates: [123.9, 10.3],
    })
  })

  it("rejects an unavailable project detail as a recoverable result", () => {
    expect(parseProjectDetail(null)).toBeNull()
    expect(parseProjectDetail({ id: "" })).toBeNull()
    expect(
      parseProjectDetail({
        id: "dpwh-1",
        name: "A project",
        latitude: 10.3,
        longitude: 123.9,
      }),
    ).toEqual(expect.objectContaining({ id: "dpwh-1", name: "A project" }))
  })

  it("reads project selection and valid camera state from the URL", () => {
    expect(
      readMapUrlState(
        "?project=dpwh-1&lat=10.3157&lng=123.8854&zoom=12.5",
      ),
    ).toEqual({
      projectId: "dpwh-1",
      camera: { latitude: 10.3157, longitude: 123.8854, zoom: 12.5 },
    })
  })

  it("ignores incomplete and unsupported world-scale camera state", () => {
    expect(readMapUrlState("").camera).toBeNull()
    expect(readMapUrlState("?project=dpwh-1").camera).toBeNull()
    expect(readMapUrlState("?lat=0&lng=0&zoom=0").camera).toBeNull()
  })

  it("writes camera state without changing project selection", () => {
    expect(
      writeCameraSearch("?project=dpwh-1", {
        latitude: 10.3157,
        longitude: 123.8854,
        zoom: 12.5,
      }),
    ).toBe("project=dpwh-1&lat=10.3157&lng=123.8854&zoom=12.5")
  })

  it("opens and closes project selection through URL state", () => {
    expect(writeProjectSearch("?lat=10.3", "dpwh-1")).toBe(
      "lat=10.3&project=dpwh-1",
    )
    expect(writeProjectSearch("?project=dpwh-1&lat=10.3", null)).toBe(
      "lat=10.3",
    )
  })
})
