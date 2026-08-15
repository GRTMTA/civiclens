export type DisplayStatus = "ongoing" | "completed" | "planned" | "unknown"

export type CameraState = {
  latitude: number
  longitude: number
  zoom: number
}

export type ViewportBounds = {
  south: number
  west: number
  north: number
  east: number
}

export type ViewportFeature = {
  id: string
  name: string
  category: string
  source: string
  rawStatus: string
  displayStatus: DisplayStatus
  coordinates: [number, number]
}

export type ViewportResponse = {
  features: ViewportFeature[]
  truncated: boolean
}

export type ProjectDetail = {
  id: string
  source: string
  sourceUrl: string
  name: string
  category: string
  description: string
  agency: string
  contractor?: string
  budget?: number
  amountPaid?: number
  status: string
  displayStatus: DisplayStatus
  progress?: number
  location: string
  latitude: number
  longitude: number
  lastChecked: string
  contractId?: string
  startDate?: string
  completionDate?: string
  infrastructureYear?: string
  programName?: string
  sourceOfFunds?: string
}

type RecordValue = Record<string, unknown>

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object"
    ? (value as RecordValue)
    : null
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asCoordinates(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const longitude = Number(value[0])
  const latitude = Number(value[1])
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null
}

export function normalizeOfficialStatus(value: string | null | undefined): DisplayStatus {
  const status = value?.trim().toLowerCase() ?? ""
  const normalized = status.replace(/[_-]+/g, " ")

  if (
    normalized.includes("pre construction") ||
    normalized.includes("planned") ||
    normalized.includes("proposed") ||
    normalized.includes("not started")
  ) {
    return "planned"
  }

  if (normalized.includes("incomplete") || normalized.includes("not complete")) {
    return "unknown"
  }

  if (
    /\b(completed|complete|finished)\b/.test(normalized)
  ) {
    return "completed"
  }

  if (
    status.includes("ongoing") ||
    status.includes("in progress") ||
    status.includes("under construction") ||
    status.includes("construction")
  ) {
    return "ongoing"
  }

  return "unknown"
}

export function parseViewportPayload(value: unknown): ViewportResponse {
  const payload = asRecord(value)
  if (!payload || payload.type !== "FeatureCollection") {
    throw new Error("The project viewport response was malformed.")
  }

  const rawFeatures = Array.isArray(payload.features) ? payload.features : []
  const features = rawFeatures.flatMap((rawFeature): ViewportFeature[] => {
    const feature = asRecord(rawFeature)
    const properties = asRecord(feature?.properties)
    const coordinates = asCoordinates(asRecord(feature?.geometry)?.coordinates)
    const id = asString(properties?.id ?? feature?.id)
    if (!properties || !coordinates || !id) return []

    return [
      {
        id,
        name: asString(properties.name, "Unnamed project"),
        category: asString(properties.category, "unknown"),
        source: asString(properties.source, "Official source"),
        rawStatus: asString(properties.status, "Unknown"),
        displayStatus: normalizeOfficialStatus(asString(properties.status)),
        coordinates,
      },
    ]
  })

  return {
    features,
    truncated: payload.truncated === true,
  }
}

export function parseProjectDetail(value: unknown): ProjectDetail | null {
  const project = asRecord(value)
  const id = asString(project?.id)
  const name = asString(project?.name)
  const coordinates = asCoordinates([
    project?.longitude,
    project?.latitude,
  ])
  if (!project || !id || !name || !coordinates) return null

  return {
    id,
    source: asString(project.source, "Official source"),
    sourceUrl: asString(project.source_url),
    name,
    category: asString(project.category, "unknown"),
    description: asString(project.description),
    agency: asString(project.agency, "Not provided"),
    contractor: asOptionalString(project.contractor),
    budget: asOptionalNumber(project.budget),
    amountPaid: asOptionalNumber(project.amount_paid),
    status: asString(project.status, "Unknown"),
    displayStatus: normalizeOfficialStatus(asString(project.status)),
    progress: asOptionalNumber(project.progress),
    location: asString(project.location, "Location not provided"),
    latitude: coordinates[1],
    longitude: coordinates[0],
    lastChecked: asString(project.last_checked),
    contractId: asOptionalString(project.contract_id),
    startDate: asOptionalString(project.start_date),
    completionDate: asOptionalString(project.completion_date),
    infrastructureYear: asOptionalString(project.infrastructure_year),
    programName: asOptionalString(project.program_name),
    sourceOfFunds: asOptionalString(project.source_of_funds),
  }
}

function readNumber(params: URLSearchParams, key: string): number | null {
  const rawValue = params.get(key)
  if (rawValue === null || rawValue.trim() === "") return null
  const value = Number(rawValue)
  return Number.isFinite(value) ? value : null
}

function readCamera(params: URLSearchParams): CameraState | null {
  const latitude = readNumber(params, "lat")
  const longitude = readNumber(params, "lng")
  const zoom = readNumber(params, "zoom")
  if (
    latitude === null ||
    longitude === null ||
    zoom === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    zoom < 7 ||
    zoom > 24
  ) {
    return null
  }
  return { latitude, longitude, zoom }
}

export function readMapUrlState(search: string): {
  projectId: string | null
  camera: CameraState | null
} {
  const params = new URLSearchParams(search)
  const rawProjectId = params.get("project")?.trim() ?? ""
  return {
    projectId: rawProjectId || null,
    camera: readCamera(params),
  }
}

export function writeCameraSearch(search: string, camera: CameraState): string {
  const params = new URLSearchParams(search)
  const format = (value: number, fractionDigits: number) =>
    value.toFixed(fractionDigits).replace(/\.?0+$/, "")
  params.set("lat", format(camera.latitude, 4))
  params.set("lng", format(camera.longitude, 4))
  params.set("zoom", format(camera.zoom, 2))
  return params.toString()
}

export function writeProjectSearch(search: string, projectId: string | null): string {
  const params = new URLSearchParams(search)
  if (projectId) params.set("project", projectId)
  else params.delete("project")
  return params.toString()
}
