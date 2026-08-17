import type { FillExtrusionLayerSpecification, StyleSpecification } from "maplibre-gl"
import { supabase } from "@/supabase"
import {
  parseProjectDetail,
  parseViewportPayload,
  type ProjectDetail,
  type ProjectDisplayGeometry,
  type ViewportBounds,
  type ViewportResponse,
} from "./map-contract"

export type PublicRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>
  get?: (
    args: Record<string, string | number>,
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

export const OPENFREEMAP_3D_STYLE = "https://tiles.openfreemap.org/styles/fiord"


export const OPENFREEMAP_BUILDING_LAYER = {
  id: "civiclens-3d-buildings",
  type: "fill-extrusion",
  source: "openmaptiles",
  "source-layer": "building",
  minzoom: 15,
  filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
  paint: {
    "fill-extrusion-color": "#cbd5e1",
    "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
    "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
    "fill-extrusion-opacity": 0.72,
  },
} satisfies FillExtrusionLayerSpecification
export type MapProvider = {
  id: "override" | "openfreemap" | "maptiler" | "eox"
  name: string
  style: string | StyleSpecification
}

export function getMapProviders(
  configuredStyleUrl: string | undefined = import.meta.env.VITE_MAP_STYLE_URL,
  mapTilerKey: string | undefined = import.meta.env.VITE_MAPTILER_KEY,
): MapProvider[] {
  const providers: MapProvider[] = []
  const override = configuredStyleUrl?.trim()
  if (override) {
    providers.push({ id: "override", name: "Configured map", style: override })
  }

  providers.push({
    id: "openfreemap",
    name: "OpenFreeMap 3D",
    style: OPENFREEMAP_3D_STYLE,
  })

  const key = mapTilerKey?.trim()
  if (key) {
    providers.push({
      id: "maptiler",
      name: "MapTiler Satellite Hybrid",
      style: `https://api.maptiler.com/maps/hybrid/style.json?key=${encodeURIComponent(key)}`,
    })
  }

  providers.push({ id: "eox", name: "EOX Sentinel-2", style: SATELLITE_STYLE })
  return providers
}

/** Retained as a small compatibility seam for callers that need one style. */
export function getMapStyle(
  configuredStyleUrl: string | undefined = import.meta.env.VITE_MAP_STYLE_URL,
  mapTilerKey: string | undefined = import.meta.env.VITE_MAPTILER_KEY,
): string | StyleSpecification {
  return getMapProviders(configuredStyleUrl, mapTilerKey)[0].style
}


export function nextMapProviderIndex(current: number, providerCount: number): number {
  return Math.min(Math.max(0, current + 1), Math.max(0, providerCount))
}

export function mapPitchForZoom(zoom: number): number {
  return zoom >= 15 ? 55 : 0
}

export function shouldScheduleMapProviderFallback(
  providerReady: boolean,
  providerAlreadyFailed: boolean,
  fallbackPending: boolean,
): boolean {
  return !providerReady && !providerAlreadyFailed && !fallbackPending
}

export function createPublicRpcClient(): PublicRpcClient {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new MapConfigurationError(
      "Project data configuration is required to load the official map.",
    )
  }
  const client = supabase
  return {
    rpc: async (functionName, args) => {
      const { data, error } = await client.rpc(functionName, args)
      return { data, error }
    },
    get: async (args) => {
      const query = new URLSearchParams(
        Object.entries(args).map(([name, value]) => [name, String(value)]),
      )
      const response = await fetch(
        `${url.replace(/\/$/, "")}/functions/v1/dpwh-projects?${query}`,
        { headers: { apikey: key } },
      )
      const data = await response.json().catch(() => null)
      return {
        data,
        error: response.ok
          ? null
          : { message: (data as { error?: string } | null)?.error || "Unable to load DPWH projects." },
      }
    },
  }
}

export async function fetchViewportProjects(
  bounds: ViewportBounds,
  client: PublicRpcClient = createPublicRpcClient(),
): Promise<ViewportResponse> {
  const request = {
    south: bounds.south,
    west: bounds.west,
    north: bounds.north,
    east: bounds.east,
  }
  const { data, error } = client.get
    ? await client.get(request)
    : await client.rpc("projects_in_view", {
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
  const { data, error } = client.get
    ? await client.get({ id: projectId })
    : await client.rpc("project_detail", { p_project_id: projectId })
  if (error) throw new Error(error.message || "Unable to load project details.")
  return parseProjectDetail(data)
}

export async function isCurrentUserModerator(
  client: PublicRpcClient = createPublicRpcClient(),
): Promise<boolean> {
  const { data, error } = await client.rpc("is_moderator", {})
  if (error) return false
  return data === true
}

export async function saveReviewedOsmEstimate(
  input: {
    projectId: string
    osmWayId: number
    geometry: Extract<ProjectDisplayGeometry, { type: "LineString" }>
    note: string
  },
  client: PublicRpcClient = createPublicRpcClient(),
): Promise<void> {
  const { error } = await client.rpc("review_project_osm_geometry", {
    p_project_id: input.projectId,
    p_osm_way_id: input.osmWayId,
    p_geometry: input.geometry,
    p_note: input.note,
  })
  if (error) {
    throw new Error(error.message || "Unable to save the reviewed OSM estimate.")
  }
}
