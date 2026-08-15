import type { ProjectDisplayGeometry } from "./map-contract"

const EARTH_RADIUS_METERS = 6_371_000
const DEFAULT_SEARCH_RADIUS_METERS = 100
const REVIEW_HALF_LENGTH_METERS = 150
const MAX_CANDIDATES = 5

export const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter"

export type OsmRoadCandidate = {
  osmWayId: number
  name: string
  highway: string
  distanceMeters: number
  sourceUrl: string
  geometry: Extract<ProjectDisplayGeometry, { type: "LineString" }>
}

type Coordinate = [number, number]
type LocalPoint = { x: number; y: number }
type OverpassGeometryPoint = { lat?: unknown; lon?: unknown }
type OverpassElement = {
  type?: unknown
  id?: unknown
  tags?: Record<string, unknown>
  geometry?: OverpassGeometryPoint[]
}

type OverpassPayload = { elements?: OverpassElement[] }

function toLocalMeters(coordinate: Coordinate, center: Coordinate): LocalPoint {
  const latitudeRadians = (center[1] * Math.PI) / 180
  return {
    x:
      ((coordinate[0] - center[0]) * Math.PI * EARTH_RADIUS_METERS *
        Math.cos(latitudeRadians)) /
      180,
    y: ((coordinate[1] - center[1]) * Math.PI * EARTH_RADIUS_METERS) / 180,
  }
}

function interpolate(a: Coordinate, b: Coordinate, amount: number): Coordinate {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
  ]
}

function cumulativeLengths(coordinates: Coordinate[], center: Coordinate): number[] {
  const lengths = [0]
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = toLocalMeters(coordinates[index - 1], center)
    const current = toLocalMeters(coordinates[index], center)
    lengths.push(
      lengths[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y),
    )
  }
  return lengths
}

function coordinateAtDistance(
  coordinates: Coordinate[],
  lengths: number[],
  distance: number,
): Coordinate {
  if (distance <= 0) return coordinates[0]
  const total = lengths[lengths.length - 1]
  if (distance >= total) return coordinates[coordinates.length - 1]

  const segmentIndex = lengths.findIndex((length) => length >= distance)
  const endIndex = Math.max(1, segmentIndex)
  const startDistance = lengths[endIndex - 1]
  const segmentLength = lengths[endIndex] - startDistance
  const amount = segmentLength === 0 ? 0 : (distance - startDistance) / segmentLength
  return interpolate(coordinates[endIndex - 1], coordinates[endIndex], amount)
}

function nearestLocationOnLine(
  coordinates: Coordinate[],
  center: Coordinate,
  lengths: number[],
): { distanceMeters: number; alongMeters: number } {
  let bestDistance = Number.POSITIVE_INFINITY
  let bestAlong = 0

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = toLocalMeters(coordinates[index - 1], center)
    const end = toLocalMeters(coordinates[index], center)
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    const amount =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(start.x * dx + start.y * dy) / lengthSquared))
    const nearestX = start.x + dx * amount
    const nearestY = start.y + dy * amount
    const distance = Math.hypot(nearestX, nearestY)
    if (distance < bestDistance) {
      bestDistance = distance
      bestAlong = lengths[index - 1] + Math.sqrt(lengthSquared) * amount
    }
  }

  return { distanceMeters: bestDistance, alongMeters: bestAlong }
}

function clipAroundLocation(
  coordinates: Coordinate[],
  center: Coordinate,
): { coordinates: Coordinate[]; distanceMeters: number } | null {
  const lengths = cumulativeLengths(coordinates, center)
  const total = lengths[lengths.length - 1]
  if (!Number.isFinite(total) || total <= 0) return null

  const nearest = nearestLocationOnLine(coordinates, center, lengths)
  const startDistance = Math.max(0, nearest.alongMeters - REVIEW_HALF_LENGTH_METERS)
  const endDistance = Math.min(total, nearest.alongMeters + REVIEW_HALF_LENGTH_METERS)
  const clipped: Coordinate[] = [
    coordinateAtDistance(coordinates, lengths, startDistance),
  ]

  coordinates.forEach((coordinate, index) => {
    if (lengths[index] > startDistance && lengths[index] < endDistance) {
      clipped.push(coordinate)
    }
  })
  clipped.push(coordinateAtDistance(coordinates, lengths, endDistance))

  const unique = clipped.filter(
    (coordinate, index) =>
      index === 0 ||
      coordinate[0] !== clipped[index - 1][0] ||
      coordinate[1] !== clipped[index - 1][1],
  )
  return unique.length >= 2
    ? { coordinates: unique, distanceMeters: nearest.distanceMeters }
    : null
}

function readCoordinates(geometry: OverpassGeometryPoint[] | undefined): Coordinate[] {
  if (!Array.isArray(geometry)) return []
  return geometry.flatMap((point): Coordinate[] => {
    const latitude = Number(point.lat)
    const longitude = Number(point.lon)
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [[longitude, latitude]]
      : []
  })
}

export function parseOverpassRoadCandidates(
  payload: unknown,
  center: Coordinate,
): OsmRoadCandidate[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("The OpenStreetMap road response was malformed.")
  }

  const elements = Array.isArray((payload as OverpassPayload).elements)
    ? (payload as OverpassPayload).elements ?? []
    : []

  return elements
    .flatMap((element): OsmRoadCandidate[] => {
      const osmWayId = Number(element.id)
      const tags = element.tags ?? {}
      const highway = typeof tags.highway === "string" ? tags.highway : "road"
      const coordinates = readCoordinates(element.geometry)
      if (element.type !== "way" || !Number.isSafeInteger(osmWayId) || osmWayId <= 0) {
        return []
      }
      const clipped = clipAroundLocation(coordinates, center)
      if (!clipped || clipped.distanceMeters > DEFAULT_SEARCH_RADIUS_METERS) return []

      const taggedName =
        typeof tags.name === "string" && tags.name.trim()
          ? tags.name.trim()
          : typeof tags.ref === "string" && tags.ref.trim()
            ? tags.ref.trim()
            : `${highway.replace(/_/g, " ")} road`

      return [{
        osmWayId,
        name: taggedName,
        highway,
        distanceMeters: Math.round(clipped.distanceMeters),
        sourceUrl: `https://www.openstreetmap.org/way/${osmWayId}`,
        geometry: { type: "LineString", coordinates: clipped.coordinates },
      }]
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, MAX_CANDIDATES)
}

export async function fetchOsmRoadCandidates(
  latitude: number,
  longitude: number,
  options: {
    endpoint?: string
    fetcher?: typeof fetch
  } = {},
): Promise<OsmRoadCandidate[]> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("A valid project coordinate is required for OSM review.")
  }

  const endpoint = options.endpoint?.trim() || DEFAULT_OVERPASS_URL
  const fetcher = options.fetcher ?? fetch
  const query = `[out:json][timeout:15];way(around:${DEFAULT_SEARCH_RADIUS_METERS},${latitude},${longitude})["highway"];out tags geom;`
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams({ data: query }).toString(),
  })

  if (!response.ok) {
    throw new Error(`OpenStreetMap road lookup failed (${response.status}). Try again later.`)
  }
  return parseOverpassRoadCandidates(await response.json(), [longitude, latitude])
}
