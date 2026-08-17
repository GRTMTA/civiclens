import { describe, expect, it } from "vitest"

import type { ViewportFeature } from "./map-contract"
import {
  createMockPhotoScan,
  distanceBetweenCoordinatesMeters,
  findNearestViewportProject,
  MOCK_SCAN_MAX_IMAGE_BYTES,
  MOCK_SCAN_TARGET_PROJECT,
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

  it("always matches DPWH contract 17HH0130 with reproducible simulated metadata", () => {
    const first = createMockPhotoScan(photo)
    const second = createMockPhotoScan(photo)

    expect(first).toEqual(second)
    expect(first.matchedProject).toBe(MOCK_SCAN_TARGET_PROJECT)
    expect(first.matchedProject).toMatchObject({
      id: "dpwh-17HH0130",
      name: "CONSTRUCTION / MAINTENANCE OF FLOOD CONTROL MITIGATION STRUCTURES, BRGY. MAMBALING, CEBU CITY",
      coordinates: [123.8754864, 10.2894062],
    })
    expect(first.matchDistanceMeters).toBeGreaterThanOrEqual(10)
    expect(first.matchDistanceMeters).toBeLessThan(35)
  })

  it("keeps the fixed contract match for different uploaded photos", () => {
    const anotherPhoto = {
      ...photo,
      name: "flood-control.png",
      type: "image/png",
      size: 512_000,
    }

    expect(createMockPhotoScan(anotherPhoto).matchedProject?.id).toBe("dpwh-17HH0130")
  })

  it("accepts images up to 10 MB and rejects invalid files", () => {
    expect(validateMockScanImage(photo)).toBeNull()
    expect(validateMockScanImage({ ...photo, size: MOCK_SCAN_MAX_IMAGE_BYTES })).toBeNull()
    expect(validateMockScanImage({ ...photo, type: "text/plain" })).toMatch(/image/)
    expect(validateMockScanImage({ ...photo, size: 0 })).toMatch(/empty/)
    expect(validateMockScanImage({ ...photo, size: MOCK_SCAN_MAX_IMAGE_BYTES + 1 })).toMatch(/10 MB/)
  })
})
