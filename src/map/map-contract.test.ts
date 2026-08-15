import { describe, expect, it } from "vitest"
import {
  areaSelectionKind,
  normalizeOfficialStatus,
  parseProjectDetail,
  parseViewportPayload,
  readMapUrlState,
  uniqueProjectIds,
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

  it("parses estimated polygons and official lines with recorded coordinates", () => {
    const result = parseViewportPayload({
      type: "FeatureCollection",
      truncated: false,
      features: [
        {
          type: "Feature",
          id: "dpwh-estimated",
          geometry: {
            type: "Polygon",
            coordinates: [[[123.89, 10.29], [123.91, 10.29], [123.91, 10.31], [123.89, 10.29]]],
          },
          properties: {
            id: "dpwh-estimated",
            name: "Estimated project",
            recorded_coordinates: [123.9, 10.3],
            geometry_kind: "estimated",
          },
        },
        {
          type: "Feature",
          id: "dpwh-official",
          geometry: {
            type: "LineString",
            coordinates: [[123.9, 10.3], [123.91, 10.31]],
          },
          properties: {
            id: "dpwh-official",
            name: "Official road project",
            recorded_coordinates: [123.905, 10.305],
            geometry_kind: "official",
            geometry_source: "DPWH official plan",
            geometry_source_url: "https://example.gov.ph/geometry",
          },
        },
      ],
    })

    expect(result.features[0]).toMatchObject({
      geometryKind: "estimated",
      coordinates: [123.9, 10.3],
      displayGeometry: { type: "Polygon" },
    })
    expect(result.features[1]).toMatchObject({
      geometryKind: "official",
      geometrySource: "DPWH official plan",
      geometrySourceUrl: "https://example.gov.ph/geometry",
      displayGeometry: { type: "LineString" },
    })
  })

  it("drops malformed display geometry instead of rendering misleading areas", () => {
    const result = parseViewportPayload({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        id: "broken",
        geometry: { type: "Polygon", coordinates: [[[123.9, 10.3]]] },
        properties: { id: "broken", recorded_coordinates: [123.9, 10.3] },
      }],
    })

    expect(result.features).toEqual([])
  })

  it("deduplicates overlapping layer hits and chooses only when needed", () => {
    expect(uniqueProjectIds(["dpwh-1", "dpwh-1", "", "dpwh-2"])).toEqual([
      "dpwh-1",
      "dpwh-2",
    ])
    expect(areaSelectionKind([])).toBe("none")
    expect(areaSelectionKind(["dpwh-1", "dpwh-1"])).toBe("direct")
    expect(areaSelectionKind(["dpwh-1", "dpwh-2"])).toBe("choose")
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

  it("keeps camera state out of the public URL", () => {
    expect(
      writeCameraSearch("?project=dpwh-1&lat=10&lng=123&zoom=8", {
        latitude: 10.3157,
        longitude: 123.8854,
        zoom: 12.5,
      }),
    ).toBe("project=dpwh-1")
  })

  it("opens and closes project selection without camera parameters", () => {
    expect(writeProjectSearch("?lat=10.3&lng=123.8&zoom=12", "dpwh-1")).toBe(
      "project=dpwh-1",
    )
    expect(writeProjectSearch("?project=dpwh-1&lat=10.3", null)).toBe("")
  })
})


describe("reviewed estimate map contract", () => {
  it("preserves reviewed OSM provenance without promoting it to official", () => {
    const viewport = parseViewportPayload({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        id: "dpwh-reviewed",
        geometry: {
          type: "LineString",
          coordinates: [[123.9, 10.3], [123.901, 10.301]],
        },
        properties: {
          id: "dpwh-reviewed",
          name: "Reviewed route",
          recorded_coordinates: [123.9, 10.3],
          geometry_kind: "reviewed_estimate",
          geometry_source: "OpenStreetMap contributors",
          geometry_source_url: "https://www.openstreetmap.org/way/123",
        },
      }],
    })
    const detail = parseProjectDetail({
      id: "dpwh-reviewed",
      name: "Reviewed route",
      latitude: 10.3,
      longitude: 123.9,
      geometry_kind: "reviewed_estimate",
      geometry_reviewed_at: "2026-08-16T01:00:00Z",
      geometry_review_note: "Checked against contract location",
    })

    expect(viewport.features[0]).toMatchObject({
      geometryKind: "reviewed_estimate",
      geometrySourceUrl: "https://www.openstreetmap.org/way/123",
    })
    expect(detail).toMatchObject({
      geometryKind: "reviewed_estimate",
      geometryReviewedAt: "2026-08-16T01:00:00Z",
      geometryReviewNote: "Checked against contract location",
    })
  })
})
