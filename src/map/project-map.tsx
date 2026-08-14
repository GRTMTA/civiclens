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
import { toast } from "sonner"
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Info,
  LoaderCircle,
  MapPinned,
  RefreshCw,
  Search,
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
import { cn } from "@/lib/utils"
import {
  createPublicRpcClient,
  fetchProjectDetail,
  fetchViewportProjects,
  getMapStyleUrl,
  getProjectDataErrorCopy,
  type PublicRpcClient,
  type ProjectDataErrorCopy,
} from "./public-projects"
import {
  normalizeOfficialStatus,
  parseProjectDetail,
  readMapUrlState,
  writeCameraSearch,
  writeProjectSearch,
  isQueryableViewportBounds,
  type CameraState,
  type DisplayStatus,
  type ProjectDetail,
  type ViewportBounds,
  type ViewportFeature,
  type ViewportResponse,
} from "./map-contract"

const DEFAULT_CAMERA: CameraState = {
  latitude: 12.8797,
  longitude: 121.774,
  zoom: 7,
}

const DEFAULT_BOUNDS: ViewportBounds = {
  south: 7,
  west: 117,
  north: 17,
  east: 127,
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

function toGeoJson(response: ViewportResponse) {
  return {
    type: "FeatureCollection" as const,
    features: response.features.map((feature) => ({
      type: "Feature" as const,
      id: feature.id,
      geometry: {
        type: "Point" as const,
        coordinates: feature.coordinates,
      },
      properties: {
        id: feature.id,
        name: feature.name,
        category: feature.category,
        source: feature.source,
        status: feature.rawStatus,
        displayStatus: feature.displayStatus,
      },
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
    <div
      className="absolute inset-3 z-10 flex items-center justify-center rounded-xl border border-dashed bg-background/95 p-6 text-center shadow-sm backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-sm space-y-2">
        <MapPinned className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action}
      </div>
    </div>
  )
}

type MapStatusNoticeVariant = "empty" | "info" | "limited" | "loading"

function MapStatusNotice({
  variant,
  title,
  description,
  action,
}: {
  variant: MapStatusNoticeVariant
  title: string
  description?: string
  action?: React.ReactNode
}) {
  const isEmpty = variant === "empty"
  const hasAction = Boolean(action)

  return (
    <div
      className={cn(
        "absolute left-1/2 z-10 -translate-x-1/2 border border-border bg-background/95 text-foreground shadow-sm backdrop-blur-sm",
        isEmpty
          ? "top-4 w-[min(calc(100%-2rem),24rem)] rounded-lg p-3 shadow-md"
          : "top-3 max-w-[min(30rem,calc(100%-2rem))] rounded-lg px-3 py-2",
        hasAction ? "pointer-events-auto" : "pointer-events-none",
        variant === "limited" && "border-amber-300/80",
      )}
      role="status"
      aria-live="polite"
    >
      <div className={cn("flex gap-2", isEmpty ? "items-center justify-between" : "items-start")}>
        <div className="flex min-w-0 items-start gap-2">
          {variant === "loading" ? (
            <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : variant !== "empty" ? (
            <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : null}
          <div className="min-w-0 space-y-0.5">
            <p className={cn(isEmpty ? "text-sm font-semibold" : "text-xs font-medium")}>{title}</p>
            {description && (
              <p className={cn("text-xs text-muted-foreground", !isEmpty && "leading-5")}>
                {description}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
    </div>
  )
}

function MapEmptyNotice({ onReset }: { onReset: () => void }) {
  return (
    <MapStatusNotice
      variant="empty"
      title="No projects in this area"
      description="Move around the map or zoom out to discover nearby projects."
      action={
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onReset}>
          Reset view
        </Button>
      }
    />
  )
}

function ProjectList({
  features,
  selectedId,
  loading,
  onSelect,
}: {
  features: ViewportFeature[]
  selectedId: string | null
  loading: boolean
  onSelect: (feature: ViewportFeature) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card" aria-busy={loading}>
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-heading text-base font-semibold">
            Projects in this view
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Official records at documented project locations
          </p>
        </div>
        <Badge variant="secondary" aria-label={`${features.length} projects in this view`}>
          {features.length}
        </Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && features.length === 0 && (
          <div className="space-y-2 p-2" aria-label="Loading projects">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        )}
        {!loading && features.length === 0 && (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-5 text-center">
            <Search className="size-7 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">No projects in this area</p>
            <p className="text-sm text-muted-foreground">
              Move around the map or zoom out to discover nearby projects.
            </p>
          </div>
        )}
        <ul className="space-y-1" aria-label="Official projects">
          {features.map((feature) => (
            <li key={feature.id}>
              <button
                type="button"
                className="w-full rounded-lg border border-transparent p-3 text-left transition hover:border-border hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring data-[selected=true]:border-primary/40 data-[selected=true]:bg-primary/5"
                data-selected={selectedId === feature.id}
                aria-pressed={selectedId === feature.id}
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
                  <span className="font-mono text-[11px]">{feature.id}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t p-3 text-xs text-muted-foreground" role="status" aria-live="polite">
        {loading && features.length > 0
          ? "Updating projects in this area…"
          : `${features.length} ${features.length === 1 ? "project" : "projects"} in this view`}
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
            <dd className="max-w-[12rem] break-all text-right font-mono text-xs">
              {detail.contractId ?? "Not provided"}
            </dd>
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
}: {
  selectedId: string | null
  feature: ViewportFeature | null
  detail: ProjectDetail | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
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

function OfficialProjectMap({
  styleUrl,
  response,
  selectedId,
  camera,
  onSelect,
  onViewportSettled,
  onProviderFailure,
  mapRef,
}: {
  styleUrl: string
  response: ViewportResponse
  selectedId: string | null
  camera: CameraState
  onSelect: (feature: ViewportFeature) => void
  onViewportSettled: (bounds: ViewportBounds, camera: CameraState) => void
  onProviderFailure: () => void
  mapRef: React.RefObject<MapRef | null>
}) {
  const geoJson = useMemo(() => toGeoJson(response), [response])
  const featuresById = useMemo(
    () => new Map(response.features.map((feature) => [feature.id, feature])),
    [response.features],
  )

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
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
            mapRef.current?.flyTo({ center: coordinates, zoom })
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

  return (
    <MapLibre
      ref={mapRef}
      initialViewState={camera}
      mapStyle={styleUrl}
      interactiveLayerIds={["project-clusters", "projects-unclustered"]}
      onClick={handleClick}
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
        data={geoJson}
        cluster
        clusterMaxZoom={13}
        clusterRadius={48}
      >
        <Layer
          id="project-clusters"
          type="circle"
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
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": [
              "match",
              ["get", "displayStatus"],
              "ongoing",
              "#d97706",
              "completed",
              "#16a34a",
              "planned",
              "#4f46e5",
              "#64748b",
            ],
            "circle-radius": 7,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          }}
        />
        <Layer
          id="project-selected"
          type="circle"
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
    </MapLibre>
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
  const [queryError, setQueryError] = useState<ProjectDataErrorCopy | null>(null)
  const [styleFailure, setStyleFailure] = useState(false)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const mapRef = useRef<MapRef | null>(null)
  const clientRef = useRef<PublicRpcClient | null>(null)
  const requestRef = useRef(0)
  const detailRequestRef = useRef(0)
  const viewportTimerRef = useRef<number | null>(null)
  const hasResponseRef = useRef(false)
  const lastBoundsRef = useRef(DEFAULT_BOUNDS)
  const styleUrl = getMapStyleUrl()

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
      const errorCopy = getProjectDataErrorCopy(error)
      setQueryState(errorCopy.kind === "configuration" ? "configuration" : "ready")
      setQueryError(errorCopy)
    }
  }, [])

  useEffect(() => {
    if (!styleUrl) void loadViewport(DEFAULT_BOUNDS)
  }, [loadViewport, styleUrl])

  useEffect(() => {
    if (queryError?.kind !== "query" || response.features.length === 0) return
    toast.error(queryError.title, {
      id: "project-data-query",
      description: queryError.description,
      duration: 8000,
      action: {
        label: "Retry",
        onClick: () => void loadViewport(lastBoundsRef.current),
      },
    })
  }, [loadViewport, queryError, response.features.length])

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
      console.error("CivicLens project detail query failed", error)
      setDetailError("We couldn't load this project's official details. Retry when you're ready.")
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
    const search = writeProjectSearch(window.location.search, feature.id)
    window.history.pushState({ projectId: feature.id }, "", `${window.location.pathname}?${search}`)
    mapRef.current?.flyTo({ center: feature.coordinates, zoom: Math.max(camera.zoom, 13) })
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
      if (!isQueryableViewportBounds(bounds)) {
        setQueryState("ready")
        setQueryError({
          kind: "viewport",
          title: "Zoom in to load projects",
          description: "The selected map area is too large. Zoom in to request official records.",
        })
        return
      }
      setQueryError(null)
      if (viewportTimerRef.current !== null) {
        window.clearTimeout(viewportTimerRef.current)
      }
      viewportTimerRef.current = window.setTimeout(() => {
        void loadViewport(bounds)
      }, 250)
    },
    [loadViewport],
  )

  const resetView = useCallback(() => {
    setCamera(DEFAULT_CAMERA)
    const search = writeCameraSearch(window.location.search, DEFAULT_CAMERA)
    window.history.replaceState(null, "", `${window.location.pathname}?${search}`)
    mapRef.current?.flyTo({
      center: [DEFAULT_CAMERA.longitude, DEFAULT_CAMERA.latitude],
      zoom: DEFAULT_CAMERA.zoom,
      essential: true,
    })
  }, [])

  const mapStyleMissing = !styleUrl
  const mapUnavailable = mapStyleMissing || styleFailure

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 md:p-4">
      <div className="relative min-h-0 flex-1">
        <section className="relative h-full min-h-[34rem] overflow-hidden rounded-xl border bg-muted/30" aria-label="Official project map">
          {styleUrl && !styleFailure ? (
            <OfficialProjectMap
              styleUrl={styleUrl}
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
              title={mapStyleMissing ? "Map style configuration required" : "Map style unavailable"}
              description={
                mapStyleMissing
                  ? "Set VITE_MAP_STYLE_URL to display the geographic map."
                  : "The configured map style could not be loaded. Retry against the same configured provider."
              }
              action={
                !mapStyleMissing ? (
                  <Button variant="outline" size="sm" onClick={() => setStyleFailure(false)}>
                    <RefreshCw aria-hidden="true" /> Retry map style
                  </Button>
                ) : undefined
              }
            />
          )}
          {queryError?.kind === "viewport" && !mapUnavailable && (
            <MapStatusNotice
              variant="info"
              title={queryError.title}
              description={queryError.description}
            />
          )}
          {queryError && (queryError.kind === "configuration" || queryError.kind === "migration") && !mapUnavailable && (
            <MapStatePanel
              title={queryError.title}
              description={queryError.description}
              action={
                queryError.kind === "migration" ? (
                  <Button variant="outline" size="sm" onClick={() => void loadViewport(lastBoundsRef.current)}>
                    <RefreshCw aria-hidden="true" /> Retry project data
                  </Button>
                ) : undefined
              }
            />
          )}
          {queryError?.kind === "query" && response.features.length === 0 && !mapUnavailable && (
            <MapStatePanel
              title={queryError.title}
              description={queryError.description}
              action={
                <Button variant="outline" size="sm" onClick={() => void loadViewport(lastBoundsRef.current)}>
                  <RefreshCw aria-hidden="true" /> Retry project data
                </Button>
              }
            />
          )}
          {!queryError && queryState === "loading" && !mapUnavailable && (
            <MapStatusNotice variant="loading" title="Loading official projects" />
          )}
          {!queryError && queryState === "refreshing" && !mapUnavailable && (
            <MapStatusNotice variant="loading" title="Updating projects in this area" />
          )}
          {!queryError && queryState === "ready" && response.truncated && !mapUnavailable && (
            <MapStatusNotice
              variant="limited"
              title="More projects may be available"
              description="Zoom in to see a more complete set of official project records."
            />
          )}
          {!queryError && response.features.length === 0 && queryState === "ready" && !mapUnavailable && (
            <MapEmptyNotice onReset={resetView} />
          )}
          <div className="absolute bottom-3 left-3 z-10 hidden rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur-sm md:block">
            <div className="mb-2 text-xs font-medium">Status legend</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {(Object.keys(STATUS_LABELS) as DisplayStatus[]).map((status) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={`size-2.5 rounded-full ${STATUS_DOT_CLASSES[status]}`} aria-hidden="true" />
                  <span>{statusLabel(status)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>

      <ProjectDetailPanel
        selectedId={selectedId}
        feature={selectedFeature}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onRetry={() => void loadDetails()}
        onClose={closeProject}
      />
    </div>
  )
}
