import { describe, expect, it } from "vitest"

import type { ViewportFeature } from "./map-contract"
import {
  createMockPhotoScan,
  distanceBetweenCoordinatesMeters,
  findNearestViewportProject,
  MOCK_SCAN_MAX_IMAGE_BYTES,
  validateMockScanImage,
} from "./mock-photo-scan"

function feature(id: string, coordinates: [number, number]): ViewportFeature {
  return {
    id,
    name: `${id} infrastructure project`,
    category: "road",
    source: "DPWH",
    rawStatus: "Ongoing",
    displayStatus: "ongoing",
    coordinates,
    displayGeometry: { type: "Point", coordinates },
    displayMode: "location_indicator",
    geometryKind: "estimated",
  }
}

const projects = [
  feature("north", [123.88, 10.31]),
  feature("south", [123.91, 10.28]),
]

const photo = {
  name: "road-repair.jpg",
  type: "image/jpeg",
  size: 248_000,
  lastModified: Date.UTC(2026, 7, 17, 4, 0, 0),
}

describe("mock infrastructure photo scan", () => {
  it("selects the actual nearest loaded project", () => {
    const nearest = findNearestViewportProject(projects, [123.9098, 10.2802])

    expect(nearest?.project.id).toBe("south")
    expect(nearest?.distanceMeters).toBeLessThan(50)
    expect(distanceBetweenCoordinatesMeters([123.88, 10.31], [123.88, 10.31])).toBe(0)
  })

  it("creates reproducible simulated location metadata near a loaded project", () => {
    const first = createMockPhotoScan(photo, projects)
    const second = createMockPhotoScan(photo, projects)

    expect(first).toEqual(second)
    expect(first.location).not.toBeNull()
    expect(first.matchedProject).not.toBeNull()
    expect(first.matchDistanceMeters).toBeGreaterThanOrEqual(10)
    expect(first.matchDistanceMeters).toBeLessThan(35)
  })

  it("uses whichever project feed is current when the demo result is created", () => {
    const original = createMockPhotoScan(photo, [projects[0]])
    const replacement = feature("replacement", [123.95, 10.35])
    const updated = createMockPhotoScan(photo, [replacement])

    expect(original.matchedProject?.id).toBe("north")
    expect(updated.matchedProject?.id).toBe("replacement")
    expect(createMockPhotoScan(photo, []).matchedProject).toBeNull()
  })

  it("does not fabricate a location or match when no projects are loaded", () => {
    expect(createMockPhotoScan(photo, [])).toEqual({
      location: null,
      matchedProject: null,
      matchDistanceMeters: null,
    })
  })

  it("accepts images up to 10 MB and rejects invalid files", () => {
    expect(validateMockScanImage(photo)).toBeNull()
    expect(validateMockScanImage({ ...photo, size: MOCK_SCAN_MAX_IMAGE_BYTES })).toBeNull()
    expect(validateMockScanImage({ ...photo, type: "text/plain" })).toMatch(/image/)
    expect(validateMockScanImage({ ...photo, size: 0 })).toMatch(/empty/)
    expect(validateMockScanImage({ ...photo, size: MOCK_SCAN_MAX_IMAGE_BYTES + 1 })).toMatch(/10 MB/)
  })
})
