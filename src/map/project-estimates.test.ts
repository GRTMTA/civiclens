import { describe, expect, it } from "vitest"

import {
  AUTOMATIC_MATCH_RADIUS_METERS,
  FALLBACK_ESTIMATE_RADIUS_METERS,
  classifyProjectEstimate,
  createFallbackEstimateCircle,
  isEligibleOsmFeature,
  selectNearestEstimateCandidate,
} from "./project-estimates"

const CENTER = [123.9, 10.3] as const
const EARTH_RADIUS_METERS = 6_371_000

function distanceMeters(a: readonly number[], b: readonly number[]) {
  const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180
  const dx = (b[0] - a[0]) * Math.PI / 180 * EARTH_RADIUS_METERS * Math.cos(latitude)
  const dy = (b[1] - a[1]) * Math.PI / 180 * EARTH_RADIUS_METERS
  return Math.hypot(dx, dy)
}

describe("automatic project estimates", () => {
  it("classifies specific linear keywords before treating other projects as areas", () => {
    expect(classifyProjectEstimate("Infrastructure", "National bridge repair")).toBe("bridge")
    expect(classifyProjectEstimate("Flood control", "Drainage canal improvement")).toBe("drainage")
    expect(classifyProjectEstimate("Road", "Barangay access")).toBe("road")
    expect(classifyProjectEstimate("Education", "School building")).toBe("building_area")
  })

  it("uses category-specific OSM tag eligibility", () => {
    expect(isEligibleOsmFeature("road", { highway: "primary" })).toBe(true)
    expect(isEligibleOsmFeature("bridge", { highway: "primary", bridge: "yes" })).toBe(true)
    expect(isEligibleOsmFeature("bridge", { highway: "primary" })).toBe(false)
    expect(isEligibleOsmFeature("drainage", { waterway: "ditch" })).toBe(true)
    expect(isEligibleOsmFeature("drainage", { highway: "service" })).toBe(false)
    expect(isEligibleOsmFeature("building_area", { building: "school" })).toBe(true)
    expect(isEligibleOsmFeature("building_area", { building: "no" })).toBe(false)
  })

  it("selects the nearest eligible feature at or within 50 metres", () => {
    const selected = selectNearestEstimateCandidate("road", [
      { distanceMeters: 30, tags: { highway: "secondary" }, value: "farther" },
      { distanceMeters: AUTOMATIC_MATCH_RADIUS_METERS, tags: { highway: "service" }, value: "edge" },
      { distanceMeters: 10, tags: { building: "yes" }, value: "wrong-kind" },
      { distanceMeters: 12, tags: { highway: "primary" }, value: "nearest" },
      { distanceMeters: 50.01, tags: { highway: "primary" }, value: "outside" },
    ])

    expect(selected?.value).toBe("nearest")
    expect(selectNearestEstimateCandidate("road", [
      { distanceMeters: 50.01, tags: { highway: "primary" }, value: "outside" },
    ])).toBeNull()
  })

  it("creates a closed circular fallback with a 50-meter radius", () => {
    const circle = createFallbackEstimateCircle(CENTER[0], CENTER[1])
    const ring = circle.coordinates[0]

    expect(ring).toHaveLength(65)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    for (const coordinate of ring.slice(0, -1)) {
      expect(distanceMeters(CENTER, coordinate)).toBeCloseTo(
        FALLBACK_ESTIMATE_RADIUS_METERS,
        0,
      )
    }
  })
})
