import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
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
  getMapStyleUrl,
  isMapConfigurationError,
  type PublicRpcClient,
} from "./public-projects"
import {
  normalizeOfficialStatus,
  parseProjectDetail,
  readMapUrlState,
  writeCameraSearch,
  writeProjectSearch,
  type CameraState,
  type DisplayStatus,
  type ProjectDetail,
  type ViewportBounds,
  type ViewportFeature,
  type ViewportResponse,
} from "./map-contract"

const PROJECT_LIST_PAGE_SIZE = 10

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
  ongoing:
    "border-amber-500/40 bg-amber-500/10 text-amber-300 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
  completed:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
  planned:
    "border-indigo-500/40 bg-indigo-500/10 text-indigo-300 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300",
  unknown:
    "border-border bg-muted/40 text-muted-foreground",
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

function PaginationBar({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}) {
  if (totalPages <= 1) return null
  // Show at most 5 page number buttons centred around the current page
  const windowSize = 5
  const half = Math.floor(windowSize / 2)
  let start = Math.max(1, page - half)
  const end = Math.min(totalPages, start + windowSize - 1)
  start = Math.max(1, end - windowSize + 1)
  const pages: ReactNode[] = []
  for (let p = start; p <= end; p++) {
    const isCurrent = p === page
    pages.push(
      <button
        key={p}
        type="button"
        aria-label={`Page ${p}`}
        aria-current={isCurrent ? "page" : undefined}
        className={[
          "flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-2 text-xs transition",
          isCurrent
            ? "bg-primary text-primary-foreground font-semibold"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        ].join(" ")}
        onClick={() => {
          if (!isCurrent) {
            // Navigate to page p by invoking onPrev/onNext is not the right API;
            // instead we expose a direct setPage via context. Since we can't pass
            // it through here without refactoring, we calculate relative jumps:
            const delta = p - page
            if (delta > 0) for (let i = 0; i < delta; i++) onNext()
            else for (let i = 0; i < -delta; i++) onPrev()
          }
        }}
      >
        {p}
      </button>,
    )
  }
  return (
    <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
      <button
        type="button"
        disabled={page === 1}
        onClick={onPrev}
        aria-label="Previous page"
        className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        ← Prev
      </button>
      <div className="flex items-center gap-0.5">{pages}</div>
      <button
        type="button"
        disabled={page === totalPages}
        onClick={onNext}
        aria-label="Next page"
        className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        Next →
      </button>
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
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(features.length / PROJECT_LIST_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PROJECT_LIST_PAGE_SIZE
  const visibleFeatures = features.slice(start, start + PROJECT_LIST_PAGE_SIZE)

  // Reset to page 1 whenever the feature set changes (new viewport)
  useEffect(() => {
    setPage(1)
  }, [features])

  const goNext = () => setPage((p) => Math.min(totalPages, p + 1))
  const goPrev = () => setPage((p) => Math.max(1, p - 1))

  return (
    // min-w-0 stops this flex child from blowing past its container's width
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border bg-card">
      <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-heading text-sm font-semibold">
            Projects in this view
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Official records at documented locations
          </p>
        </div>
        <Badge
          variant="secondary"
          className="shrink-0 tabular-nums"
          aria-label={`${features.length} projects returned`}
        >
          {features.length}
        </Badge>
      </div>
      {/* Alerts: wrapped in px-3 pt-3 so the Alert's w-full resolves against
          the padded container — not the outer panel — preventing overflow */}
      {truncated && (
        <div className="px-3 pt-3">
          <Alert className="border-warning/30 bg-warning/10 text-warning-foreground [&>svg]:text-warning">
            <Info aria-hidden="true" />
            <AlertTitle>Results are incomplete</AlertTitle>
            <AlertDescription>
              Zoom in to see more projects. Cluster counts represent returned
              records, not every project in this area.
            </AlertDescription>
          </Alert>
        </div>
      )}
      {queryError && (
        <div className="px-3 pt-3">
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Project query unavailable</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{queryError}</span>
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RefreshCw aria-hidden="true" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
      {configurationRequired && (
        <div className="px-3 pt-3">
          <Alert className="border-warning/30 bg-warning/10 text-warning-foreground [&>svg]:text-warning">
            <Info aria-hidden="true" />
            <AlertTitle>Project data configuration required</AlertTitle>
            <AlertDescription>
              Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to load project records.
            </AlertDescription>
          </Alert>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-live="polite">
        {loading && features.length === 0 && (
          <div className="space-y-2 p-2" aria-label="Loading projects">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        )}
        {!loading && !queryError && !configurationRequired && features.length === 0 && (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-5 text-center">
            <Search className="size-7 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">No official projects in this view</p>
            <p className="text-xs text-muted-foreground">
              Pan or zoom the map to browse another area.
            </p>
          </div>
        )}
        <ul className="space-y-0.5" aria-label="Official projects">
          {visibleFeatures.map((feature) => (
            <li key={feature.id}>
              <button
                type="button"
                className="w-full min-w-0 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[selected=true]:border-primary/30 data-[selected=true]:bg-primary/10"
                data-selected={selectedId === feature.id}
                aria-current={selectedId === feature.id ? "true" : undefined}
                onClick={() => onSelect(feature)}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="line-clamp-2 min-w-0 text-sm font-medium leading-snug">
                    {feature.name}
                  </span>
                  <StatusBadge status={feature.displayStatus} />
                </div>
                <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="shrink-0 capitalize">{feature.category}</span>
                  <span aria-hidden="true" className="shrink-0 opacity-40">·</span>
                  <span className="truncate opacity-60">{feature.id}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <PaginationBar
        page={safePage}
        totalPages={totalPages}
        onPrev={goPrev}
        onNext={goNext}
      />
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {loading && features.length > 0
          ? "Updating this area…"
          : features.length === 0
            ? "No projects in this view"
            : `Page ${safePage} of ${totalPages} · ${features.length} total`}
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
      minZoom={7}
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
    if (!styleUrl) void loadViewport(DEFAULT_BOUNDS)
  }, [loadViewport, styleUrl])

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
      if (viewportTimerRef.current !== null) {
        window.clearTimeout(viewportTimerRef.current)
      }
      viewportTimerRef.current = window.setTimeout(() => {
        void loadViewport(bounds)
      }, 250)
    },
    [loadViewport],
  )

  const mapStyleMissing = !styleUrl
  const mapUnavailable = mapStyleMissing || styleFailure

  return (
    // overflow-x-hidden: last-resort guard so no child causes horizontal page scroll
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden p-3 md:gap-4 md:p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
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
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {queryState === "refreshing" && <RefreshCw className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />}
          <span className="truncate">
            {queryState === "loading"
              ? "Loading visible projects…"
              : queryState === "refreshing"
                ? "Updating this area…"
                : queryState === "configuration"
                  ? "Configuration required"
                  : "Map area ready"}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]">
        <section className="relative min-h-[34rem] overflow-hidden rounded-xl border bg-muted/30 lg:min-h-0" aria-label="Official project map">
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
                  ? "Set VITE_MAP_STYLE_URL to display the geographic map. The official project list remains available."
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
          {response.features.length === 0 && !queryError && queryState === "ready" && !mapUnavailable && (
            <MapStatePanel
              title="No official projects in this view"
              description="Pan or zoom the map to browse another area."
            />
          )}
          {response.truncated && (
            <div className="absolute left-3 right-3 top-3 z-10 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground shadow-sm backdrop-blur-sm">
              Results are incomplete. Zoom in to see more projects; cluster counts show returned records only.
            </div>
          )}
          <div className="absolute bottom-3 left-3 z-10 hidden rounded-lg border border-border bg-background/90 p-3 shadow-sm backdrop-blur-sm md:block">
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
        <Button variant="outline" className="min-w-0 shrink" onClick={() => setListOpen(true)}>
          <Search className="shrink-0" aria-hidden="true" />
          <span className="truncate">Projects in this view</span>
          <span className="ml-1 shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">{response.features.length}</span>
        </Button>
        <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <LocateFixed className="shrink-0" aria-hidden="true" /> Cebu City view
        </div>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        {/* max-h-[90dvh]: more room on small phones; flex-col + overflow-hidden
            keeps the sheet itself from becoming wider than the viewport */}
        <SheetContent side="bottom" className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl p-0">
          {/* px-4 py-3 instead of the default p-6 saves 24px on narrow screens */}
          <SheetHeader className="shrink-0 border-b px-4 py-3">
            <SheetTitle>Projects in this view</SheetTitle>
            <SheetDescription>
              Select an official record from the current map area.
            </SheetDescription>
          </SheetHeader>
          {/* flex-1 + min-h-0: fills remaining sheet height so ProjectList
              can scroll; overflow-hidden guards against inner overflow */}
          <div className="flex min-h-0 flex-1 overflow-hidden p-3">
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
