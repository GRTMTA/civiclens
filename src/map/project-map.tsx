import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Map as MapLibre,
  NavigationControl,
  Source,
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre"
import type { GeoJSONSource } from "maplibre-gl"
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Info,
  LocateFixed,
  MapPinned,
  RefreshCw,
  Search,
  X,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { ProjectCommunityContext } from "./project-community-context"
import { ProjectTimeline } from "./project-timeline"
import {
  createPublicRpcClient,
  fetchProjectDetail,
  fetchViewportProjects,
  getMapStyle,
  isMapConfigurationError,
  type PublicRpcClient,
} from "./public-projects"
import {
  areaSelectionKind,
  readMapUrlState,
  uniqueProjectIds,
  writeCameraSearch,
  writeProjectSearch,
  type CameraState,
  type DisplayStatus,
  type GeometryKind,
  type ProjectDetail,
  type ViewportBounds,
  type ViewportFeature,
  type ViewportResponse,
} from "./map-contract"

const PROJECT_LIST_PAGE_SIZE = 50

const DEFAULT_CAMERA: CameraState = {
  latitude: 10.3157,
  longitude: 123.8854,
  zoom: 11.2,
}

const DEFAULT_BOUNDS: ViewportBounds = {
  south: 10.08,
  west: 123.68,
  north: 10.55,
  east: 124.15,
}

const STATUS_LABELS: Record<DisplayStatus, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  planned: "Planned / not started",
  unknown: "Unknown status",
}

const STATUS_CLASSES: Record<DisplayStatus, string> = {
  ongoing: "border-amber-300 bg-amber-50 text-amber-950",
  completed: "border-emerald-300 bg-emerald-50 text-emerald-950",
  planned: "border-indigo-300 bg-indigo-50 text-indigo-950",
  unknown: "border-slate-300 bg-slate-100 text-slate-800",
}

const STATUS_DOT_CLASSES: Record<DisplayStatus, string> = {
  ongoing: "bg-amber-600",
  completed: "bg-emerald-600",
  planned: "bg-indigo-600",
  unknown: "bg-slate-500",
}

function statusLabel(status: DisplayStatus) {
  return STATUS_LABELS[status]
}

function formatMoney(value?: number) {
  if (value === undefined) return "Not provided"
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value?: string) {
  if (!value) return "Not provided"
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(date)
}

function boundsFromMap(target: MapLayerMouseEvent["target"]): ViewportBounds {
  const bounds = target.getBounds()
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  }
}

function featureProperties(feature: ViewportFeature) {
  return {
    id: feature.id,
    name: feature.name,
    category: feature.category,
    source: feature.source,
    status: feature.rawStatus,
    displayStatus: feature.displayStatus,
    geometryKind: feature.geometryKind,
    geometrySource: feature.geometrySource ?? "",
  }
}

function toPointGeoJson(response: ViewportResponse) {
  return {
    type: "FeatureCollection" as const,
    features: response.features.map((feature) => ({
      type: "Feature" as const,
      id: feature.id,
      geometry: {
        type: "Point" as const,
        coordinates: feature.coordinates,
      },
      properties: featureProperties(feature),
    })),
  }
}

function toDisplayGeoJson(response: ViewportResponse) {
  return {
    type: "FeatureCollection" as const,
    features: response.features.map((feature) => ({
      type: "Feature" as const,
      id: feature.id,
      geometry: feature.displayGeometry,
      properties: featureProperties(feature),
    })),
  }
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASSES[status]}>
      {statusLabel(status)}
    </Badge>
  )
}

function GeometryBadge({ kind }: { kind: GeometryKind }) {
  return (
    <Badge
      variant="outline"
      className={
        kind === "official"
          ? "border-sky-300 bg-sky-50 text-sky-950"
          : "border-slate-300 bg-white/90 text-slate-800"
      }
    >
      {kind === "official" ? "Official project geometry" : "Estimated project area"}
    </Badge>
  )
}

function MapStatePanel({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="absolute inset-3 z-10 flex items-center justify-center rounded-xl border border-dashed bg-background/95 p-6 text-center shadow-sm backdrop-blur-sm">
      <div className="max-w-sm space-y-2">
        <MapPinned className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action}
      </div>
    </div>
  )
}

function ProjectList({
  features,
  selectedId,
  loading,
  truncated,
  onSelect,
  onRetry,
  queryError,
  configurationRequired,
}: {
  features: ViewportFeature[]
  selectedId: string | null
  loading: boolean
  truncated: boolean
  onSelect: (feature: ViewportFeature) => void
  onRetry: () => void
  queryError: string | null
  configurationRequired: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(PROJECT_LIST_PAGE_SIZE)
  const visibleFeatures = features.slice(0, visibleCount)
  const hasMore = visibleFeatures.length < features.length

  useEffect(() => {
    setVisibleCount(PROJECT_LIST_PAGE_SIZE)
  }, [features])

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-heading text-base font-semibold">
            Projects in this view
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Official records at documented project locations
          </p>
        </div>
        <Badge variant="secondary" aria-label={`${features.length} projects returned`}>
          {features.length}
        </Badge>
      </div>
      {truncated && (
        <Alert className="m-3 border-amber-300 bg-amber-50 text-amber-950">
          <Info aria-hidden="true" />
          <AlertTitle>Results are incomplete</AlertTitle>
          <AlertDescription>
            Zoom in to see more projects. Cluster counts represent returned
            records, not every project in this area.
          </AlertDescription>
        </Alert>
      )}
      {queryError && (
        <Alert variant="destructive" className="m-3">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Project query unavailable</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{queryError}</span>
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw aria-hidden="true" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {configurationRequired && (
        <Alert className="m-3 border-amber-300 bg-amber-50 text-amber-950">
          <Info aria-hidden="true" />
          <AlertTitle>Project data configuration required</AlertTitle>
          <AlertDescription>
            Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to load project records.
          </AlertDescription>
        </Alert>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-live="polite">
        {loading && features.length === 0 && (
          <div className="space-y-2 p-2" aria-label="Loading projects">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        )}
        {!loading && !queryError && !configurationRequired && features.length === 0 && (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-5 text-center">
            <Search className="size-7 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">No official projects in this view</p>
            <p className="text-sm text-muted-foreground">
              Pan or zoom the map to browse another area.
            </p>
          </div>
        )}
        <ul className="space-y-1" aria-label="Official projects">
          {visibleFeatures.map((feature) => (
            <li key={feature.id}>
              <button
                type="button"
                className="w-full rounded-lg border border-transparent p-3 text-left transition hover:border-border hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                data-selected={selectedId === feature.id}
                aria-current={selectedId === feature.id ? "true" : undefined}
                onClick={() => onSelect(feature)}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="line-clamp-2 text-sm font-medium">
                    {feature.name}
                  </span>
                  <StatusBadge status={feature.displayStatus} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">{feature.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{feature.id}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
        {hasMore && (
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full"
            onClick={() => setVisibleCount((count) => count + PROJECT_LIST_PAGE_SIZE)}
          >
            Show {Math.min(PROJECT_LIST_PAGE_SIZE, features.length - visibleFeatures.length)} more
          </Button>
        )}
      </div>
      <div className="border-t p-3 text-xs text-muted-foreground">
        {loading && features.length > 0
          ? "Updating this area…"
          : `Showing ${visibleFeatures.length} of ${features.length} returned`}
      </div>
    </div>
  )
}

function ProjectDetailContent({
  feature,
  detail,
  loading,
  error,
  onRetry,
}: {
  feature: ViewportFeature | null
  detail: ProjectDetail | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  if (loading) {
    return (
      <div className="space-y-4 p-4" aria-live="polite" aria-label="Loading project details">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Project details unavailable</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw aria-hidden="true" /> Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!detail) {
    return (
      <Alert className="m-4">
        <CircleHelp aria-hidden="true" />
        <AlertTitle>Project unavailable</AlertTitle>
        <AlertDescription>
          This project link is no longer available in the public records.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5 overflow-y-auto p-4" tabIndex={-1}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.displayStatus} />
          <GeometryBadge kind={detail.geometryKind} />
          <span className="text-xs text-muted-foreground">{detail.category}</span>
        </div>
        <h2 className="font-heading text-lg font-semibold leading-tight">
          {detail.name}
        </h2>
        <p className="text-sm text-muted-foreground">{detail.location}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
        <div>
          <dt className="text-xs text-muted-foreground">Official status</dt>
          <dd className="mt-1 text-sm font-medium">{detail.status || "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Contract amount</dt>
          <dd className="mt-1 text-sm font-medium">{formatMoney(detail.budget)}</dd>
        </div>
      </div>

      {detail.description && (
        <p className="text-sm leading-6 text-muted-foreground">{detail.description}</p>
      )}

      <Alert className={detail.geometryKind === "estimated" ? "border-slate-300 bg-slate-50" : "border-sky-300 bg-sky-50"}>
        <MapPinned aria-hidden="true" />
        <AlertTitle>
          {detail.geometryKind === "official" ? "Official project geometry" : "Estimated project area"}
        </AlertTitle>
        <AlertDescription>
          {detail.geometryKind === "official"
            ? `This shape was supplied by ${detail.geometrySource ?? "an official source"}.`
            : "This 50 m area is an estimate around the recorded project coordinate, not an official project boundary."}
          {detail.geometrySourceUrl && (
            <a
              className="ml-1 underline underline-offset-2"
              href={detail.geometrySourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              View geometry source
            </a>
          )}
        </AlertDescription>
      </Alert>

      <section aria-labelledby="official-details-heading" className="space-y-3">
        <h3 id="official-details-heading" className="font-heading text-sm font-semibold">
          Official details
        </h3>
        <dl className="grid gap-3 text-sm">
          <div className="flex justify-between gap-4 border-b pb-2">
            <dt className="text-muted-foreground">Implementing agency</dt>
            <dd className="text-right">{detail.agency}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b pb-2">
            <dt className="text-muted-foreground">Contractor</dt>
            <dd className="text-right">{detail.contractor ?? "Not provided"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b pb-2">
            <dt className="text-muted-foreground">Contract ID</dt>
            <dd className="text-right">{detail.contractId ?? "Not provided"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b pb-2">
            <dt className="text-muted-foreground">Start date</dt>
            <dd className="text-right">{formatDate(detail.startDate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Completion date</dt>
            <dd className="text-right">{formatDate(detail.completionDate)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b pb-2">
            <dt className="text-muted-foreground">Progress</dt>
            <dd className="text-right">
              {detail.progress === undefined ? "Not provided" : `${detail.progress}%`}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b pb-2">
            <dt className="text-muted-foreground">Amount paid</dt>
            <dd className="text-right">{formatMoney(detail.amountPaid)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b pb-2">
            <dt className="text-muted-foreground">Infrastructure year</dt>
            <dd className="text-right">{detail.infrastructureYear ?? "Not provided"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b pb-2">
            <dt className="text-muted-foreground">Program</dt>
            <dd className="text-right">{detail.programName ?? "Not provided"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b pb-2">
            <dt className="text-muted-foreground">Source of funds</dt>
            <dd className="text-right">{detail.sourceOfFunds ?? "Not provided"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Last checked</dt>
            <dd className="text-right">{formatDate(detail.lastChecked)}</dd>
          </div>
        </dl>
      </section>

      <Separator />
      <ProjectCommunityContext detail={detail} />

      <Separator />
      <section aria-labelledby="provenance-heading" className="space-y-2">
        <h3 id="provenance-heading" className="font-heading text-sm font-semibold">
          Source attribution
        </h3>
        <p className="text-sm text-muted-foreground">
          This is an Official-source record. Its status describes the source
          record, not current physical conditions.
        </p>
        <p className="text-xs text-muted-foreground">Source: {detail.source}</p>
        {detail.sourceUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={detail.sourceUrl} target="_blank" rel="noreferrer">
              Open official record
            </a>
          </Button>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Recorded project location: {detail.latitude.toFixed(5)}, {detail.longitude.toFixed(5)}
      </p>
      {feature && feature.rawStatus !== detail.status && (
        <p className="text-xs text-muted-foreground">
          The map used the source status “{feature.rawStatus}”; this detail reflects the same official record.
        </p>
      )}
    </div>
  )
}

function ProjectDetailPanel({
  selectedId,
  feature,
  detail,
  loading,
  error,
  onRetry,
  onClose,
  mobile = false,
}: {
  selectedId: string | null
  feature: ViewportFeature | null
  detail: ProjectDetail | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onClose: () => void
  mobile?: boolean
}) {
  if (mobile) {
    return (
      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl p-0">
          <SheetHeader className="border-b pr-14">
            <SheetTitle>Official project record</SheetTitle>
            <SheetDescription>
              Source-attributed details for the selected project.
            </SheetDescription>
          </SheetHeader>
          <ProjectDetailContent
            feature={feature}
            detail={detail}
            loading={loading}
            error={error}
            onRetry={onRetry}
          />
        </SheetContent>
      </Sheet>
    )
  }

  if (!selectedId) return null
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card" aria-label="Selected official project">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="font-heading text-base font-semibold">Project details</h2>
          <p className="text-xs text-muted-foreground">Official-source record</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close project details">
          <X aria-hidden="true" />
        </Button>
      </div>
      <ProjectDetailContent
        feature={feature}
        detail={detail}
        loading={loading}
        error={error}
        onRetry={onRetry}
      />
    </section>
  )
}

const AREA_INTERACTIVE_LAYER_IDS = [
  "project-area-official",
  "project-area-official-fill",
  "project-area-estimated-fill",
  "project-area-estimated-outline",
]

function OfficialProjectMap({
  mapStyle,
  response,
  selectedId,
  camera,
  onSelect,
  onViewportSettled,
  onProviderFailure,
  mapRef,
}: {
  mapStyle: ReturnType<typeof getMapStyle>
  response: ViewportResponse
  selectedId: string | null
  camera: CameraState
  onSelect: (feature: ViewportFeature) => void
  onViewportSettled: (bounds: ViewportBounds, camera: CameraState) => void
  onProviderFailure: () => void
  mapRef: React.RefObject<MapRef | null>
}) {
  const pointGeoJson = useMemo(() => toPointGeoJson(response), [response])
  const displayGeoJson = useMemo(() => toDisplayGeoJson(response), [response])
  const [overlapChoices, setOverlapChoices] = useState<ViewportFeature[]>([])
  const featuresById = useMemo(
    () => new Map(response.features.map((feature) => [feature.id, feature])),
    [response.features],
  )

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (event.target.getZoom() >= 15) {
        const point = event.point
        const rendered = event.target.queryRenderedFeatures(
          [[point.x - 8, point.y - 8], [point.x + 8, point.y + 8]],
          { layers: AREA_INTERACTIVE_LAYER_IDS },
        )
        const ids = uniqueProjectIds(
          rendered.map((feature) => String(feature.properties?.id ?? feature.id ?? "")),
        )
        const selectionKind = areaSelectionKind(ids)
        if (selectionKind === "none") return
        const choices = ids.flatMap((id) => {
          const feature = featuresById.get(id)
          return feature ? [feature] : []
        })
        if (selectionKind === "direct" && choices[0]) onSelect(choices[0])
        else setOverlapChoices(choices)
        return
      }

      const feature = event.features?.[0]
      if (!feature) return
      if (feature.properties?.cluster) {
        const clusterId = Number(feature.properties.cluster_id)
        const source = mapRef.current?.getMap().getSource("official-projects") as
          | GeoJSONSource
          | undefined
        if (source && Number.isFinite(clusterId)) {
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [
              number,
              number,
            ]
            mapRef.current?.flyTo({ center: coordinates, zoom: Math.min(zoom, 15) })
          })
        }
        return
      }
      const id = String(feature.properties?.id ?? feature.id ?? "")
      const selected = featuresById.get(id)
      if (selected) onSelect(selected)
    },
    [featuresById, mapRef, onSelect],
  )

  const statusColor = [
    "match",
    ["get", "displayStatus"],
    "ongoing",
    "#f59e0b",
    "completed",
    "#22c55e",
    "planned",
    "#6366f1",
    "#64748b",
  ] as const

  return (
    <>
      <MapLibre
        ref={mapRef}
        initialViewState={camera}
        minZoom={7}
        maxZoom={20}
        mapStyle={mapStyle}
        interactiveLayerIds={[
          "project-clusters",
          "projects-unclustered",
          ...AREA_INTERACTIVE_LAYER_IDS,
        ]}
        onClick={handleClick}
        onMouseEnter={(event) => { event.target.getCanvas().style.cursor = "pointer" }}
        onMouseLeave={(event) => { event.target.getCanvas().style.cursor = "" }}
        onLoad={(event) =>
          onViewportSettled(
            boundsFromMap(event.target),
            {
              latitude: event.target.getCenter().lat,
              longitude: event.target.getCenter().lng,
              zoom: event.target.getZoom(),
            },
          )
        }
        onMoveEnd={(event) =>
          onViewportSettled(
            boundsFromMap(event.target),
            {
              latitude: event.viewState.latitude,
              longitude: event.viewState.longitude,
              zoom: event.viewState.zoom,
            },
          )
        }
        onError={onProviderFailure}
        attributionControl={{ compact: true }}
        reuseMaps
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <Source
          id="official-projects"
          type="geojson"
          data={pointGeoJson}
          cluster
          clusterMaxZoom={14}
          clusterRadius={48}
        >
          <Layer
            id="project-clusters"
            type="circle"
            maxzoom={15}
            filter={["has", "point_count"]}
            paint={{
              "circle-color": "#475569",
              "circle-radius": ["step", ["get", "point_count"], 18, 25, 22, 100, 28],
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            }}
          />
          <Layer
            id="project-cluster-count"
            type="symbol"
            maxzoom={15}
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 12,
            }}
            paint={{ "text-color": "#ffffff" }}
          />
          <Layer
            id="projects-unclustered"
            type="circle"
            maxzoom={15}
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": statusColor,
              "circle-radius": 7,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            }}
          />
          <Layer
            id="project-selected-point"
            type="circle"
            maxzoom={15}
            filter={["==", ["get", "id"], selectedId ?? ""]}
            paint={{
              "circle-color": "#0f172a",
              "circle-radius": 12,
              "circle-opacity": 0.2,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#0f172a",
            }}
          />
        </Source>

        <Source id="project-display-geometries" type="geojson" data={displayGeoJson}>
          <Layer
            id="project-area-estimated-fill"
            type="fill"
            minzoom={15}
            filter={["all", ["==", ["get", "geometryKind"], "estimated"], ["==", ["geometry-type"], "Polygon"]]}
            paint={{ "fill-color": statusColor, "fill-opacity": 0.2 }}
          />
          <Layer
            id="project-area-estimated-outline"
            type="line"
            minzoom={15}
            filter={["==", ["get", "geometryKind"], "estimated"]}
            paint={{
              "line-color": statusColor,
              "line-width": 2.5,
              "line-opacity": 0.95,
              "line-dasharray": [2, 2],
            }}
          />
          <Layer
            id="project-area-official-fill"
            type="fill"
            minzoom={15}
            filter={["all", ["==", ["get", "geometryKind"], "official"], ["==", ["geometry-type"], "Polygon"]]}
            paint={{ "fill-color": statusColor, "fill-opacity": 0.32 }}
          />
          <Layer
            id="project-area-official"
            type="line"
            minzoom={15}
            filter={["==", ["get", "geometryKind"], "official"]}
            paint={{
              "line-color": statusColor,
              "line-width": ["match", ["geometry-type"], "LineString", 8, 3],
              "line-opacity": 0.95,
            }}
          />
          <Layer
            id="project-area-selected-fill"
            type="fill"
            minzoom={15}
            filter={["all", ["==", ["get", "id"], selectedId ?? ""], ["==", ["geometry-type"], "Polygon"]]}
            paint={{ "fill-color": "#ffffff", "fill-opacity": 0.22 }}
          />
          <Layer
            id="project-area-selected-outline"
            type="line"
            minzoom={15}
            filter={["==", ["get", "id"], selectedId ?? ""]}
            paint={{ "line-color": "#ffffff", "line-width": 5, "line-opacity": 1 }}
          />
        </Source>
      </MapLibre>

      <Sheet
        open={overlapChoices.length > 0}
        onOpenChange={(open) => !open && setOverlapChoices([])}
      >
        <SheetContent side="bottom" className="max-h-[70dvh] rounded-t-2xl p-0 sm:mx-auto sm:max-w-xl">
          <SheetHeader className="border-b pr-14">
            <SheetTitle>Choose a project</SheetTitle>
            <SheetDescription>
              Multiple highlighted project areas overlap here.
            </SheetDescription>
          </SheetHeader>
          <ul className="overflow-y-auto p-3" aria-label="Overlapping infrastructure projects">
            {overlapChoices.map((feature) => (
              <li key={feature.id}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-transparent p-3 text-left hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setOverlapChoices([])
                    onSelect(feature)
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-medium">{feature.name}</span>
                    <StatusBadge status={feature.displayStatus} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{feature.category}</span>
                    <GeometryBadge kind={feature.geometryKind} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}

export function ProjectMapSurface() {
  const initialUrlState = useMemo(() => readMapUrlState(window.location.search), [])
  const [camera, setCamera] = useState<CameraState>(
    initialUrlState.camera ?? DEFAULT_CAMERA,
  )
  const [selectedId, setSelectedId] = useState<string | null>(
    initialUrlState.projectId,
  )
  const [selectedFeature, setSelectedFeature] = useState<ViewportFeature | null>(null)
  const [response, setResponse] = useState<ViewportResponse>({
    features: [],
    truncated: false,
  })
  const [queryState, setQueryState] = useState<
    "loading" | "refreshing" | "ready" | "configuration"
  >("loading")
  const [queryError, setQueryError] = useState<string | null>(null)
  const [styleFailure, setStyleFailure] = useState(false)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const mapRef = useRef<MapRef | null>(null)
  const clientRef = useRef<PublicRpcClient | null>(null)
  const requestRef = useRef(0)
  const detailRequestRef = useRef(0)
  const viewportTimerRef = useRef<number | null>(null)
  const hasResponseRef = useRef(false)
  const lastBoundsRef = useRef(DEFAULT_BOUNDS)
  const mapStyle = useMemo(() => getMapStyle(), [])

  const loadViewport = useCallback(async (bounds: ViewportBounds) => {
    const requestId = ++requestRef.current
    lastBoundsRef.current = bounds
    setQueryState(hasResponseRef.current ? "refreshing" : "loading")
    setQueryError(null)
    try {
      if (!clientRef.current) clientRef.current = createPublicRpcClient()
      const nextResponse = await fetchViewportProjects(bounds, clientRef.current)
      if (requestId !== requestRef.current) return
      hasResponseRef.current = true
      setResponse(nextResponse)
      setQueryState("ready")
    } catch (error) {
      if (requestId !== requestRef.current) return
      if (isMapConfigurationError(error)) {
        setQueryState("configuration")
        setQueryError(null)
        return
      }
      setQueryState(hasResponseRef.current ? "ready" : "loading")
      setQueryError(error instanceof Error ? error.message : "Unable to load projects.")
    }
  }, [])

  useEffect(() => {
    void loadViewport(DEFAULT_BOUNDS)
  }, [loadViewport])

  useEffect(
    () => () => {
      if (viewportTimerRef.current !== null) {
        window.clearTimeout(viewportTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    const feature = response.features.find((item) => item.id === selectedId) ?? null
    setSelectedFeature(feature)
  }, [response.features, selectedId])

  const loadDetails = useCallback(async () => {
    if (!selectedId) return
    const requestId = ++detailRequestRef.current
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    try {
      if (!clientRef.current) clientRef.current = createPublicRpcClient()
      const nextDetail = await fetchProjectDetail(selectedId, clientRef.current)
      if (requestId !== detailRequestRef.current) return
      setDetail(nextDetail)
    } catch (error) {
      if (requestId !== detailRequestRef.current) return
      setDetailError(error instanceof Error ? error.message : "Unable to load project details.")
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    if (selectedId) void loadDetails()
    else {
      detailRequestRef.current += 1
      setDetail(null)
      setDetailError(null)
      setDetailLoading(false)
    }
  }, [loadDetails, selectedId])

  useEffect(() => {
    const onPopState = () => {
      const nextState = readMapUrlState(window.location.search)
      setSelectedId(nextState.projectId)
      if (nextState.camera) {
        setCamera(nextState.camera)
        mapRef.current?.flyTo({
          center: [nextState.camera.longitude, nextState.camera.latitude],
          zoom: nextState.camera.zoom,
        })
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const selectProject = useCallback((feature: ViewportFeature) => {
    setSelectedId(feature.id)
    setSelectedFeature(feature)
    setListOpen(false)
    const search = writeProjectSearch(window.location.search, feature.id)
    window.history.pushState({ projectId: feature.id }, "", `${window.location.pathname}?${search}`)
    mapRef.current?.flyTo({ center: feature.coordinates, zoom: Math.max(camera.zoom, 15) })
  }, [camera.zoom])

  const closeProject = useCallback(() => {
    setSelectedId(null)
    setSelectedFeature(null)
    const search = writeProjectSearch(window.location.search, null)
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`)
  }, [])

  const onViewportSettled = useCallback(
    (bounds: ViewportBounds, nextCamera: CameraState) => {
      setCamera(nextCamera)
      const search = writeCameraSearch(window.location.search, nextCamera)
      window.history.replaceState(null, "", `${window.location.pathname}?${search}`)
      if (viewportTimerRef.current !== null) {
        window.clearTimeout(viewportTimerRef.current)
      }
      viewportTimerRef.current = window.setTimeout(() => {
        void loadViewport(bounds)
      }, 250)
    },
    [loadViewport],
  )

  const mapUnavailable = styleFailure

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:gap-4 md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Source records
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Infrastructure projects
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Browse source-attributed infrastructure records by documented project location.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {queryState === "refreshing" && <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />}
          {queryState === "loading"
            ? "Loading visible projects…"
            : queryState === "refreshing"
              ? "Updating this area…"
              : queryState === "configuration"
                ? "Project data configuration required"
                : "Map area ready"}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]">
        <section className="relative min-h-[34rem] overflow-hidden rounded-xl border bg-muted/30 lg:min-h-0" aria-label="Official project map">
          {!styleFailure ? (
            <OfficialProjectMap
              mapStyle={mapStyle}
              response={response}
              selectedId={selectedId}
              camera={camera}
              onSelect={selectProject}
              onViewportSettled={onViewportSettled}
              onProviderFailure={() => {
                setStyleFailure(true)
              }}
              mapRef={mapRef}
            />
          ) : (
            <MapStatePanel
              title="Satellite map unavailable"
              description="The configured satellite imagery could not be loaded. Project records remain available in the list."
              action={
                <Button variant="outline" size="sm" onClick={() => setStyleFailure(false)}>
                  <RefreshCw aria-hidden="true" /> Retry satellite map
                </Button>
              }
            />
          )}
          {response.features.length === 0 && !queryError && queryState === "ready" && !mapUnavailable && (
            <MapStatePanel
              title="No official projects in this view"
              description="Pan or zoom the map to browse another area."
            />
          )}
          {response.truncated && (
            <div className="absolute left-3 right-3 top-3 z-10 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-950 shadow-sm backdrop-blur-sm">
              Results are incomplete. Zoom in to see more projects; cluster counts show returned records only.
            </div>
          )}
          <div className="absolute bottom-3 left-3 z-10 max-w-[15rem] rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur-sm md:max-w-xs">
            <div className="mb-2 text-xs font-medium">Project map legend</div>
            <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {(Object.keys(STATUS_LABELS) as DisplayStatus[]).map((status) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={`size-2.5 rounded-full ${STATUS_DOT_CLASSES[status]}`} aria-hidden="true" />
                  <span>{statusLabel(status)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 border-t pt-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-7 rounded-sm border-2 border-sky-600 bg-sky-400/40" aria-hidden="true" />
                <span>Official project geometry</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-7 rounded-sm border-2 border-dashed border-slate-600 bg-slate-300/40" aria-hidden="true" />
                <span>Estimated 50 m project area</span>
              </div>
              <p className="pt-1 text-muted-foreground">Zoom to 15+ to see highlighted areas.</p>
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
          <ProjectList
            features={response.features}
            selectedId={selectedId}
            loading={queryState === "loading" || queryState === "refreshing"}
            truncated={response.truncated}
            onSelect={selectProject}
            onRetry={() => void loadViewport(lastBoundsRef.current)}
            queryError={queryError}
            configurationRequired={queryState === "configuration"}
          />
          <ProjectDetailPanel
            selectedId={selectedId}
            feature={selectedFeature}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onRetry={() => void loadDetails()}
            onClose={closeProject}
          />
        </aside>
      </div>

      <div className="flex items-center justify-between gap-2 lg:hidden">
        <Button variant="outline" onClick={() => setListOpen(true)}>
          <Search aria-hidden="true" /> Projects in this view
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{response.features.length}</span>
        </Button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <LocateFixed aria-hidden="true" /> Cebu City view
        </div>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-2xl p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Projects in this view</SheetTitle>
            <SheetDescription>
              Select an official record from the current map area.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 h-[55dvh] p-3">
            <ProjectList
              features={response.features}
              selectedId={selectedId}
            loading={queryState === "loading" || queryState === "refreshing"}
              truncated={response.truncated}
              onSelect={selectProject}
            onRetry={() => void loadViewport(lastBoundsRef.current)}
            queryError={queryError}
            configurationRequired={queryState === "configuration"}
            />
          </div>
        </SheetContent>
      </Sheet>
      <ProjectDetailPanel
        selectedId={selectedId}
        feature={selectedFeature}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onRetry={() => void loadDetails()}
        onClose={closeProject}
        mobile
      />
    </div>
  )
}
