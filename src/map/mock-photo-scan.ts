import type { ViewportFeature } from "./map-contract"

export const MOCK_SCAN_MAX_IMAGE_BYTES = 10 * 1024 * 1024

export type MockPhotoFile = Pick<File, "name" | "type" | "size" | "lastModified">

export type MockScanLocation = {
  latitude: number
  longitude: number
}

export type MockPhotoScanResult = {
  location: MockScanLocation | null
  matchedProject: ViewportFeature | null
  matchDistanceMeters: number | null
}

const EARTH_RADIUS_METERS = 6_371_000

export const MOCK_SCAN_TARGET_PROJECT: ViewportFeature = {
  id: "dpwh-17HH0130",
  name: "CONSTRUCTION / MAINTENANCE OF FLOOD CONTROL MITIGATION STRUCTURES, BRGY. MAMBALING, CEBU CITY",
  category: "Flood Control and Drainage",
  source: "DPWH Transparency Portal via BetterGov archive",
  rawStatus: "Completed",
  displayStatus: "completed",
  coordinates: [123.8754864, 10.2894062],
  displayGeometry: {
    type: "Point",
    coordinates: [123.8754864, 10.2894062],
  },
  displayMode: "location_indicator",
  geometryKind: "estimated",
}

function stableFileHash(file: MockPhotoFile) {
  const input = `${file.name}\u0000${file.type}\u0000${file.size}\u0000${file.lastModified}`
  let hash = 2_166_136_261
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 16_777_619)
  }
  return hash >>> 0
}

function offsetCoordinates(
  origin: readonly [number, number],
  distanceMeters: number,
  bearingDegrees: number,
): [number, number] {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS
  const bearing = bearingDegrees * Math.PI / 180
  const latitude = origin[1] * Math.PI / 180
  const longitude = origin[0] * Math.PI / 180
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
    Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
  )
  const destinationLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude),
  )

  return [
    ((destinationLongitude * 180 / Math.PI + 540) % 360) - 180,
    destinationLatitude * 180 / Math.PI,
  ]
}

export function validateMockScanImage(file: MockPhotoFile): string | null {
  if (!file.type.startsWith("image/")) return "Choose an image from your camera or gallery."
  if (file.size <= 0) return "The selected image is empty. Choose another photo."
  if (file.size > MOCK_SCAN_MAX_IMAGE_BYTES) return "Choose an image no larger than 10 MB."
  return null
}

export function distanceBetweenCoordinatesMeters(
  first: readonly [number, number],
  second: readonly [number, number],
) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = toRadians(second[1] - first[1])
  const longitudeDelta = toRadians(second[0] - first[0])
  const firstLatitude = toRadians(first[1])
  const secondLatitude = toRadians(second[1])
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function findNearestViewportProject(
  projects: readonly ViewportFeature[],
  coordinates: readonly [number, number],
) {
  return projects.reduce<{ project: ViewportFeature; distanceMeters: number } | null>(
    (nearest, project) => {
      const distanceMeters = distanceBetweenCoordinatesMeters(coordinates, project.coordinates)
      return !nearest || distanceMeters < nearest.distanceMeters
        ? { project, distanceMeters }
        : nearest
    },
    null,
  )
}

/**
 * Demonstration only: every valid photo simulates EXIF coordinates near the fixed DPWH
 * contract 17HH0130 target. It does not inspect image bytes or contact any external service.
 */
export function createMockPhotoScan(
  file: MockPhotoFile,
): MockPhotoScanResult {
  const hash = stableFileHash(file)
  const simulatedCoordinates = offsetCoordinates(
    MOCK_SCAN_TARGET_PROJECT.coordinates,
    12 + ((hash >>> 8) % 1_800) / 100,
    (hash >>> 16) % 360,
  )

  return {
    location: {
      latitude: simulatedCoordinates[1],
      longitude: simulatedCoordinates[0],
    },
    matchedProject: MOCK_SCAN_TARGET_PROJECT,
    matchDistanceMeters: distanceBetweenCoordinatesMeters(
      simulatedCoordinates,
      MOCK_SCAN_TARGET_PROJECT.coordinates,
    ),
  }
}
