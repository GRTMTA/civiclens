import { createClient } from "@supabase/supabase-js"
import {
  parseProjectDetail,
  parseViewportPayload,
  type ProjectDetail,
  type ViewportBounds,
  type ViewportResponse,
  isQueryableViewportBounds,
} from "./map-contract"

export type PublicRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>
}

export class MapConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MapConfigurationError"
  }
}

export class InvalidViewportError extends Error {
  constructor() {
    super("Zoom in to load projects for a smaller map area.")
    this.name = "InvalidViewportError"
  }
}

export function isMapConfigurationError(
  error: unknown,
): error is MapConfigurationError {
  return error instanceof MapConfigurationError
}

export function isInvalidViewportError(
  error: unknown,
): error is InvalidViewportError {
  return error instanceof InvalidViewportError
}

export type ProjectDataErrorCopy = {
  kind: "configuration" | "migration" | "query"
  title: string
  description: string
}

export function getProjectDataErrorCopy(error: unknown): ProjectDataErrorCopy {
  if (isMapConfigurationError(error)) {
    return {
      kind: "configuration",
      title: "Project data configuration required",
      description:
        "Set the public Supabase configuration to load official project records.",
    }
  }

  if (isInvalidViewportError(error)) {
    return {
      kind: "query",
      title: "Zoom in to load projects",
      description: "The selected map area is too large. Zoom in to request official records.",
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "")
  const normalized = message.toLowerCase()
  if (
    normalized.includes("projects_in_view") &&
    (normalized.includes("schema cache") || normalized.includes("could not find the function"))
  ) {
    return {
      kind: "migration",
      title: "Map data migration required",
      description:
        "The connected Supabase project is missing the public project-map function. Apply the map migration, then retry.",
    }
  }

  return {
    kind: "query",
    title: "Project data unavailable",
    description: "Official project records could not be loaded. Retry when the data service is available.",
  }
}

export function getMapStyleUrl(): string | null {
  const value = import.meta.env.VITE_MAP_STYLE_URL?.trim()
  return value || null
}

export function createPublicRpcClient(): PublicRpcClient {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new MapConfigurationError(
      "Project data configuration is required to load the official map.",
    )
  }
  const client = createClient(url, key)
  return {
    rpc: async (functionName, args) => {
      const { data, error } = await client.rpc(functionName, args)
      return { data, error }
    },
  }
}

export async function fetchViewportProjects(
  bounds: ViewportBounds,
  client: PublicRpcClient = createPublicRpcClient(),
): Promise<ViewportResponse> {
  if (!isQueryableViewportBounds(bounds)) throw new InvalidViewportError()
  const { data, error } = await client.rpc("projects_in_view", {
    p_south: bounds.south,
    p_west: bounds.west,
    p_north: bounds.north,
    p_east: bounds.east,
  })
  if (error) throw new Error(error.message || "Unable to load projects.")
  return parseViewportPayload(data)
}

export async function fetchProjectDetail(
  projectId: string,
  client: PublicRpcClient = createPublicRpcClient(),
): Promise<ProjectDetail | null> {
  const { data, error } = await client.rpc("project_detail", {
    p_project_id: projectId,
  })
  if (error) throw new Error(error.message || "Unable to load project details.")
  return parseProjectDetail(data)
}
