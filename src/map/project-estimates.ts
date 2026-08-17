import type { ProjectDisplayGeometry } from "./map-contract"

const EARTH_RADIUS_METERS = 6_371_000
export const AUTOMATIC_MATCH_RADIUS_METERS = 50
export const FALLBACK_ESTIMATE_RADIUS_METERS = 50
const DEFAULT_CIRCLE_STEPS = 64

export type ProjectEstimateClass = "road" | "bridge" | "drainage" | "building_area"

export type OsmEstimateCandidate<T = unknown> = {
  distanceMeters: number
  tags: Record<string, string | undefined>
  value: T
}

/**
 * Category matching is deliberately deterministic. More specific linear
 * categories win before the broad road rule; everything else is an area.
 */
export function classifyProjectEstimate(category: string, name = ""): ProjectEstimateClass {
  const text = `${category} ${name}`.toLowerCase().replace(/[_-]+/g, " ")
  if (/\bbridge\b/.test(text)) return "bridge"
  if (/\b(drainage|drain|ditch|canal)\b/.test(text)) return "drainage"
  if (/\b(road|street|highway|carriageway)\b/.test(text)) return "road"
  return "building_area"
}

export function isEligibleOsmFeature(
  estimateClass: ProjectEstimateClass,
  tags: Record<string, string | undefined>,
): boolean {
  if (estimateClass === "road") return Boolean(tags.highway)
  if (estimateClass === "bridge") {
    return Boolean(tags.highway) && Boolean(tags.bridge) && tags.bridge !== "no"
  }
  if (estimateClass === "drainage") {
    return tags.waterway === "drain" || tags.waterway === "ditch" || tags.waterway === "canal"
  }
  return Boolean(tags.building) && tags.building !== "no"
}

export function selectNearestEstimateCandidate<T>(
  estimateClass: ProjectEstimateClass,
  candidates: readonly OsmEstimateCandidate<T>[],
): OsmEstimateCandidate<T> | null {
  return candidates
    .filter(
      (candidate) =>
        Number.isFinite(candidate.distanceMeters) &&
        candidate.distanceMeters >= 0 &&
        candidate.distanceMeters <= AUTOMATIC_MATCH_RADIUS_METERS &&
        isEligibleOsmFeature(estimateClass, candidate.tags),
    )
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0] ?? null
}

/** Creates a geodesic circle with a 50-meter radius around a recorded point. */
export function createFallbackEstimateCircle(
  longitude: number,
  latitude: number,
  steps = DEFAULT_CIRCLE_STEPS,
): Extract<ProjectDisplayGeometry, { type: "Polygon" }> {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error("A valid project coordinate is required for an estimate circle.")
  }
  if (!Number.isInteger(steps) || steps < 8) {
    throw new Error("An estimate circle requires at least eight steps.")
  }

  const angularDistance = FALLBACK_ESTIMATE_RADIUS_METERS / EARTH_RADIUS_METERS
  const latitudeRadians = latitude * Math.PI / 180
  const longitudeRadians = longitude * Math.PI / 180
  const ring: [number, number][] = []

  for (let step = 0; step <= steps; step += 1) {
    const bearing = step / steps * Math.PI * 2
    const destinationLatitude = Math.asin(
      Math.sin(latitudeRadians) * Math.cos(angularDistance) +
      Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing),
    )
    const destinationLongitude = longitudeRadians + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
      Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(destinationLatitude),
    )

    ring.push([
      ((destinationLongitude * 180 / Math.PI + 540) % 360) - 180,
      destinationLatitude * 180 / Math.PI,
    ])
  }

  ring[ring.length - 1] = [...ring[0]]
  return { type: "Polygon", coordinates: [ring] }
}
