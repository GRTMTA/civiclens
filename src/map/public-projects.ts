import { createClient } from "@supabase/supabase-js"
import type { StyleSpecification } from "maplibre-gl"
import {
  parseProjectDetail,
  parseViewportPayload,
  type ProjectDetail,
  type ViewportBounds,
  type ViewportResponse,
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

export function isMapConfigurationError(
  error: unknown,
): error is MapConfigurationError {
  return error instanceof MapConfigurationError
}

export const SATELLITE_ATTRIBUTION =
  '<a href="https://s2maps.eu" target="_blank" rel="noreferrer">Sentinel-2 cloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)'

export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
      ],
      tileSize: 256,
      maxzoom: 14,
      attribution: SATELLITE_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: "satellite",
      type: "raster",
      source: "satellite",
    },
  ],
}

export function getMapStyle(
  configuredStyleUrl: string | undefined = import.meta.env.VITE_MAP_STYLE_URL,
): string | StyleSpecification {
  const value = configuredStyleUrl?.trim()
  return value || SATELLITE_STYLE
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
