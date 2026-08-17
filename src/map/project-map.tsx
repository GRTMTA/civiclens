import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Map as MapLibre,
  NavigationControl,
  Source,
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre"
import type { ExpressionSpecification, GeoJSONSource } from "maplibre-gl"
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Info,
  LocateFixed,
  MapPinned,
  RefreshCw,
  Route,
  Search,
} from "lucide-react"

import { communityActionDecision, requestSignIn } from "@/community/community-auth"
import { CreatePostModal } from "@/community/create-post-modal"
import { isCommunityMediaError } from "@/community/community-data"
import { PostCard } from "@/community/post-card"
import { useCommunityAccess } from "@/community/use-community"
import type {
  CommunityPost,
  NewPostInput,
  ProjectReference,
} from "@/community/community-contract"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ProjectCommunityContext } from "./project-community-context"
import { ProjectTimeline } from "./project-timeline"
import {
  createPublicRpcClient,
  fetchProjectDetail,
  fetchViewportProjects,
  getMapProviders,
  isCurrentUserModerator,
  isMapConfigurationError,
  mapPitchForZoom,
  nextMapProviderIndex,
  OPENFREEMAP_BUILDING_LAYER,
  saveReviewedOsmEstimate,
  shouldScheduleMapProviderFallback,
  type MapProvider,
  type PublicRpcClient,
} from "./public-projects"
import { MapDialog } from "./map-dialog"
import {
  addPublishedProjectPost,
  optimisticallyVoteProjectPost,
  setProjectPostVote,
} from "./project-community-state"
import {
  fetchOsmRoadCandidates,
  type OsmRoadCandidate,
} from "./osm-road-candidates"
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

// MapLibre cannot consume CSS variables, so mirror the CivicLens blue ramp here.
// Labels and geometry stroke patterns continue to provide the primary distinctions.
const MAP_STATUS_COLORS: Record<DisplayStatus, string> = {
  ongoing: "#60a5fa",
  completed: "#93c5fd",
  planned: "#3b82f6",
  unknown: "#64748b",
}

const PROJECT_INDICATOR_COLOR = "#dc2626"
const PROJECT_INDICATOR_DARK = "#7f1d1d"

const STATUS_CLASSES: Record<DisplayStatus, string> = {
  ongoing: "border-primary/40 bg-primary/15 text-primary",
  completed: "border-border bg-secondary text-secondary-foreground",
  planned: "border-border bg-muted text-foreground",
  unknown: "border-border bg-muted/60 text-muted-foreground",
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
    geometryEstimateMethod: feature.geometryEstimateMethod ?? "",
    geometryEstimateClass: feature.geometryEstimateClass ?? "",
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

function geometryLabel(kind: GeometryKind, method?: ProjectDetail["geometryEstimateMethod"]) {
  if (kind === "official") return "Official project geometry"
  if (kind === "reviewed_estimate") return "Reviewed OSM estimate"
  if (kind === "estimated" || method === "radius_circle") return "Estimated project indicator · 50 m radius"
  return "Estimated project route/building · OSM"
}

function GeometryBadge({
  kind,
  method,
}: {
  kind: GeometryKind
  method?: ProjectDetail["geometryEstimateMethod"]
}) {
  const label = geometryLabel(kind, method)
  const classes =
    kind === "official"
      ? "border-primary/40 bg-primary/15 text-primary"
      : kind === "reviewed_estimate"
        ? "border-border bg-secondary text-secondary-foreground"
        : kind === "automatic_estimate"
          ? "border-border bg-muted text-foreground"
          : "border-border bg-muted/60 text-muted-foreground"

  return (
    <Badge variant="outline" className={classes}>
      {label}
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
  onSelect,
  onRetry,
  queryError,
  configurationRequired,
  onCollapse,
  showHeader = true,
}: {
  features: ViewportFeature[]
  selectedId: string | null
  loading: boolean
  onSelect: (feature: ViewportFeature) => void
  onRetry: () => void
  queryError: string | null
  configurationRequired: boolean
  onCollapse?: () => void
  showHeader?: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(PROJECT_LIST_PAGE_SIZE)
  const visibleFeatures = features.slice(0, visibleCount)
  const hasMore = visibleFeatures.length < features.length

  useEffect(() => {
    setVisibleCount(PROJECT_LIST_PAGE_SIZE)
  }, [features])

  return (
    <Card
      size="sm"
      className="flex min-h-0 flex-1 gap-0 rounded-xl py-0 shadow-sm ring-1 ring-border"
    >
      {showHeader && (
        <CardHeader className="shrink-0 border-b px-4 py-3">
          <CardTitle className="flex items-center gap-2">
            <span>Projects in this view</span>
            <Badge variant="secondary" aria-label={`${features.length} projects returned`}>
              {features.length}
            </Badge>
          </CardTitle>
          <CardAction className="self-center">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onCollapse}
              aria-label="Collapse projects panel"
              title="Collapse projects panel"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </CardAction>
        </CardHeader>
      )}
      {queryError && (
        <Alert variant="destructive" className="m-3 mb-0">
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
        <Alert className="m-3 mb-0 border-primary/30 bg-primary/10 text-foreground">
          <Info aria-hidden="true" />
          <AlertTitle>Project data configuration required</AlertTitle>
          <AlertDescription>
            Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to load project records.
          </AlertDescription>
        </Alert>
      )}
      <CardContent className="flex min-h-0 flex-1 px-0">
        <ScrollArea className="min-h-0 flex-1" aria-live="polite">
          <div className="p-2">
            {loading && features.length === 0 && (
              <div className="space-y-2 p-2" aria-label="Loading projects">
                <div className="flex items-center gap-2 px-1 pb-1 text-xs text-muted-foreground">
                  <Spinner aria-hidden="true" /> Loading visible projects…
                </div>
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-[4.25rem] w-full rounded-xl" />
                ))}
              </div>
            )}
            {!loading && !queryError && !configurationRequired && features.length === 0 && (
              <Empty className="min-h-40 gap-3 border-0 p-5">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle className="text-base">No official projects in this view</EmptyTitle>
                  <EmptyDescription>
                    Pan or zoom the map to browse another area.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            <ul className="space-y-1" aria-label="Official projects">
              {visibleFeatures.map((feature) => {
                const selected = selectedId === feature.id
                return (
                  <Item
                    key={feature.id}
                    asChild
                    size="xs"
                    variant={selected ? "muted" : "default"}
                    className="relative rounded-xl border-transparent px-3 py-2.5 hover:border-border hover:bg-muted/60 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-[selected=true]:border-primary/20 data-[selected=true]:bg-primary/5"
                  >
                    <li data-selected={selected}>
                      <button
                        type="button"
                        className="absolute inset-0 z-10 rounded-xl outline-none"
                        aria-label={`${feature.name}, ${statusLabel(feature.displayStatus)}, ${feature.category}, ${feature.id}`}
                        aria-current={selected ? "true" : undefined}
                        onClick={() => onSelect(feature)}
                      />
                      <ItemContent className="pointer-events-none min-w-0 gap-1" aria-hidden="true">
                        <ItemHeader className="items-start">
                          <ItemTitle className="line-clamp-2 w-auto min-w-0 text-left">
                            {feature.name}
                          </ItemTitle>
                          <ItemActions className="shrink-0">
                            <StatusBadge status={feature.displayStatus} />
                          </ItemActions>
                        </ItemHeader>
                        <ItemDescription className="flex items-center gap-2 text-xs">
                          <span className="capitalize">{feature.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{feature.id}</span>
                        </ItemDescription>
                      </ItemContent>
                    </li>
                  </Item>
                )
              })}
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
        </ScrollArea>
      </CardContent>
      <CardFooter className="shrink-0 justify-between border-t px-4 py-3 text-xs text-muted-foreground">
        <span>
          {loading && features.length > 0
            ? "Updating this area…"
            : `Showing ${visibleFeatures.length} of ${features.length} returned`}
        </span>
        {loading && features.length > 0 && <Spinner aria-hidden="true" />}
      </CardFooter>
    </Card>
  )
}

function OsmRoadReviewPanel({
  detail,
  onSaved,
}: {
  detail: ProjectDetail
  onSaved: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [candidates, setCandidates] = useState<OsmRoadCandidate[]>([])
  const [selected, setSelected] = useState<OsmRoadCandidate | null>(null)
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const loadCandidates = async () => {
    setOpen(true)
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const next = await fetchOsmRoadCandidates(detail.latitude, detail.longitude, {
        endpoint: import.meta.env.VITE_OVERPASS_URL,
      })
      setCandidates(next)
      setSelected(next[0] ?? null)
    } catch (candidateError) {
      setError(candidateError instanceof Error ? candidateError.message : "Unable to find nearby OSM roads.")
    } finally {
      setLoading(false)
    }
  }

  const approve = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await saveReviewedOsmEstimate({
        projectId: detail.id,
        osmWayId: selected.osmWayId,
        geometry: selected.geometry,
        note: note.trim(),
      })
      await onSaved()
      setSaved(true)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the reviewed estimate.")
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <section className="space-y-2 rounded-lg border border-primary/30 bg-primary/10 p-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Route className="size-4 text-primary" aria-hidden="true" /> Moderator geometry review
        </h3>
        <p className="text-xs leading-5 text-muted-foreground">
          Find nearby OpenStreetMap roads and approve one short segment as a reviewed estimate. It will never be labeled official.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void loadCandidates()}>
          Find nearby OSM roads
        </Button>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/10 p-3" aria-labelledby="osm-review-heading">
      <div>
        <h3 id="osm-review-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Route className="size-4 text-primary" aria-hidden="true" /> Review nearby OSM road segments
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Candidates are clipped to roughly 300 m around the DPWH point. Confirm the road against project documents before approval.
        </p>
      </div>

      {loading && <p className="text-sm text-foreground" aria-live="polite">Loading nearby roads…</p>}
      {!loading && candidates.length === 0 && !error && (
        <p className="text-sm text-foreground">No mapped roads were found within 100 m.</p>
      )}
      {candidates.length > 0 && (
        <ul className="space-y-2" aria-label="Nearby OpenStreetMap road candidates">
          {candidates.map((candidate) => (
            <li key={candidate.osmWayId}>
              <button
                type="button"
                aria-pressed={selected?.osmWayId === candidate.osmWayId}
                className="w-full rounded-md border border-border bg-card p-2 text-left text-sm text-card-foreground aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary/30"
                onClick={() => setSelected(candidate)}
              >
                <span className="block font-medium">{candidate.name}</span>
                <span className="text-xs capitalize text-muted-foreground">
                  {candidate.highway.replace(/_/g, " ")} · about {candidate.distanceMeters} m from point
                </span>
              </button>
              <a
                className="mt-1 inline-block text-xs text-primary underline underline-offset-2"
                href={candidate.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Inspect OSM way {candidate.osmWayId}
              </a>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="space-y-2">
          <label htmlFor={`osm-review-note-${detail.id}`} className="text-xs font-medium text-foreground">
            Review justification
          </label>
          <Input
            id={`osm-review-note-${detail.id}`}
            value={note}
            minLength={5}
            maxLength={500}
            placeholder="Checked against contract location or project plan"
            onChange={(event) => setNote(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void approve()}
            disabled={saving || note.trim().length < 5}
          >
            {saving ? "Saving…" : detail.geometryKind === "reviewed_estimate" ? "Replace reviewed estimate" : "Approve reviewed estimate"}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {saved && (
        <p className="flex items-center gap-1 text-xs font-medium text-primary" role="status">
          <CheckCircle2 className="size-4" aria-hidden="true" /> Reviewed estimate saved.
        </p>
      )}
      <p className="text-[11px] leading-4 text-muted-foreground">
        Road data © OpenStreetMap contributors, ODbL. The request sends only this project coordinate to the configured Overpass service.
      </p>
    </section>
  )
}

function ProjectDetailContent({
  feature,
  detail,
  loading,
  error,
  onRetry,
  isModerator,
  onGeometryReviewed,
}: {
  feature: ViewportFeature | null
  detail: ProjectDetail | null
  loading: boolean
  error: string | null
  onRetry: () => void
  isModerator: boolean
  onGeometryReviewed: () => Promise<void>
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
    <div className="space-y-5 p-4 sm:p-5" tabIndex={-1}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.displayStatus} />
          <GeometryBadge kind={detail.geometryKind} method={detail.geometryEstimateMethod} />
          <span className="text-xs text-muted-foreground">{detail.category}</span>
        </div>
        <h2 className="font-heading text-lg font-semibold leading-tight">
          {detail.name}
        </h2>
        <p className="text-sm text-muted-foreground">{detail.location}</p>
      </div>

      <Card size="sm" className="gap-0 rounded-xl bg-muted/30 py-0 shadow-none ring-1 ring-border">
        <CardContent className="p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Official status</p>
              <p className="mt-1 text-sm font-medium">{detail.status || "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contract amount</p>
              <p className="mt-1 text-sm font-medium">{formatMoney(detail.budget)}</p>
            </div>
            {detail.progress !== undefined && (
              <div className="col-span-2 border-t pt-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Official progress</p>
                  <p className="text-sm font-medium tabular-nums">{detail.progress}%</p>
                </div>
                <Progress
                  value={detail.progress}
                  aria-label="Official project progress"
                  aria-valuetext={`${detail.progress}%`}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {detail.description && (
        <p className="text-sm leading-6 text-muted-foreground">{detail.description}</p>
      )}

      <Alert className={
        detail.geometryKind === "official"
          ? "border-primary/30 bg-primary/10 text-foreground"
          : detail.geometryKind === "reviewed_estimate"
            ? "border-border bg-secondary text-secondary-foreground"
            : detail.geometryKind === "automatic_estimate"
              ? "border-border bg-muted text-foreground"
              : "border-border bg-muted/60 text-muted-foreground"
      }>
        <MapPinned aria-hidden="true" />
        <AlertTitle>{geometryLabel(detail.geometryKind, detail.geometryEstimateMethod)}</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            {detail.geometryKind === "official"
              ? `This shape was supplied by ${detail.geometrySource ?? "an official source"}.`
              : detail.geometryKind === "reviewed_estimate"
                ? "A moderator selected this OpenStreetMap road segment as a plausible project route. It is not an official DPWH boundary."
                : detail.geometryKind === "automatic_estimate"
                  ? "This is the nearest eligible OpenStreetMap road or building within 50 m of the recorded project point. It is an automatic approximation, not an official project measurement."
                  : "No eligible nearby OpenStreetMap feature was available, so this 50 m radius circle is a rough indicator around the recorded project point, not an official boundary."}
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
          </p>
          {detail.geometryEstimateClass && detail.geometryKind !== "official" && detail.geometryKind !== "reviewed_estimate" && (
            <p className="text-xs capitalize">
              Estimate type: {detail.geometryEstimateClass.replace(/_/g, " ")}
              {detail.geometryEstimateMethod === "radius_circle" ? " fallback circle (50 m radius)" : " nearest OSM match"}
            </p>
          )}
          {detail.geometryReviewNote && (
            <p className="text-xs">Review note: {detail.geometryReviewNote}</p>
          )}
          {detail.geometryReviewedAt && (
            <p className="text-xs">Reviewed: {formatDate(detail.geometryReviewedAt)}</p>
          )}
        </AlertDescription>
      </Alert>

      {isModerator && detail.geometryKind !== "official" && (
        <OsmRoadReviewPanel detail={detail} onSaved={onGeometryReviewed} />
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
          {detail.progress === undefined && (
            <div className="flex justify-between gap-4 border-b pb-2">
              <dt className="text-muted-foreground">Progress</dt>
              <dd className="text-right">Not provided</dd>
            </div>
          )}
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

function ProjectDetailDialog({
  selectedId,
  feature,
  detail,
  loading,
  error,
  onRetry,
  onClose,
  isModerator,
  onGeometryReviewed,
}: {
  selectedId: string | null
  feature: ViewportFeature | null
  detail: ProjectDetail | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onClose: () => void
  isModerator: boolean
  onGeometryReviewed: () => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<"details" | "community">("details")
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [postsState, setPostsState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [postsError, setPostsError] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [interactionError, setInteractionError] = useState<string | null>(null)
  const [publishMessage, setPublishMessage] = useState<string | null>(null)
  const [pendingVoteIds, setPendingVoteIds] = useState<Set<string>>(() => new Set())
  const postsRequestRef = useRef(0)
  const voteGenerationRef = useRef(0)
  const pendingVoteIdsRef = useRef(new Set<string>())
  const { source, configError, viewerReady, canInteract } = useCommunityAccess()

  const loadPosts = useCallback(async () => {
    if (!selectedId) return
    if (!source) {
      setPostsError(configError ?? "Community discussion is unavailable.")
      setPostsState("error")
      return
    }
    const requestId = ++postsRequestRef.current
    setPostsState("loading")
    setPostsError(null)
    try {
      const nextPosts = await source.listPostsForProject(selectedId)
      if (requestId !== postsRequestRef.current) return
      setPosts(nextPosts)
      setPostsState("ready")
    } catch (postsCause) {
      if (requestId !== postsRequestRef.current) return
      setPostsError(
        postsCause instanceof Error
          ? postsCause.message
          : "Unable to load community posts for this project.",
      )
      setPostsState("error")
    }
  }, [configError, selectedId, source])

  useEffect(() => {
    postsRequestRef.current += 1
    voteGenerationRef.current += 1
    pendingVoteIdsRef.current.clear()
    setPendingVoteIds(new Set())
    setPosts([])
    setPostsState("idle")
    setPostsError(null)
    setInteractionError(null)
    setPublishMessage(null)
    setComposerOpen(false)
  }, [selectedId])

  useEffect(() => {
    if (activeTab === "community" && postsState === "idle") void loadPosts()
  }, [activeTab, loadPosts, postsState])

  const selectedProject = useMemo<ProjectReference | null>(() => {
    if (!selectedId) return null
    return {
      id: selectedId,
      name: detail?.name ?? feature?.name ?? selectedId,
    }
  }, [detail?.name, feature?.name, selectedId])

  const runCommunityAction = useCallback(
    (action: () => void) => {
      const decision = communityActionDecision(canInteract, viewerReady)
      if (decision === "allow") action()
      else if (decision === "sign-in") requestSignIn()
    },
    [canInteract, viewerReady],
  )

  const createProjectPost = useCallback(
    async (input: NewPostInput) => {
      if (!source) throw new Error(configError ?? "Community discussion is unavailable.")
      setInteractionError(null)
      setPublishMessage(null)

      try {
        const created = await source.createPost(input)
        setPosts((current) => addPublishedProjectPost(current, created, selectedId ?? ""))
        if (created.project?.id === selectedId) {
          setPostsState("ready")
          setPublishMessage("Your post was published and added to this project's Community posts.")
        } else if (created.project) {
          setPublishMessage(
            `Your post was published and linked to ${created.project.name}, so it does not appear in this project's list.`,
          )
        } else {
          setPublishMessage(
            "Your post was published to Community without a project link, so it does not appear in this project's list.",
          )
        }
        return created
      } catch (cause) {
        if (isCommunityMediaError(cause)) {
          const published = cause.publishedPost
          if (published) {
            setPosts((current) =>
              addPublishedProjectPost(current, published, selectedId ?? ""),
            )
            if (published.project?.id === selectedId) setPostsState("ready")
          } else if (input.projectId === selectedId) {
            await loadPosts()
          }
          const destination =
            input.projectId === selectedId
              ? " It remains linked to this project's Community posts."
              : " It does not appear in this project's list because its project link was changed or removed."
          setPublishMessage(`${cause.message}${destination}`)
          return published ?? undefined
        }
        const message =
          cause instanceof Error ? cause.message : "Your post could not be published."
        setInteractionError(message)
        throw cause
      }
    },
    [configError, loadPosts, selectedId, source],
  )

  const voteOnProjectPost = useCallback(
    (postId: string, direction: 1 | -1) => {
      runCommunityAction(() => {
        if (!source || pendingVoteIdsRef.current.has(postId)) return
        const currentPost = posts.find((post) => post.id === postId)
        if (!currentPost) return

        const previous = {
          score: currentPost.score,
          viewerVote: currentPost.viewerVote,
        }
        const generation = voteGenerationRef.current
        pendingVoteIdsRef.current.add(postId)
        setPendingVoteIds(new Set(pendingVoteIdsRef.current))
        setInteractionError(null)
        setPosts((current) =>
          optimisticallyVoteProjectPost(current, postId, direction),
        )

        source
          .votePost(postId, direction)
          .then(
            (next) => {
              if (voteGenerationRef.current !== generation) return
              setPosts((current) => setProjectPostVote(current, postId, next))
            },
            (cause: unknown) => {
              if (voteGenerationRef.current !== generation) return
              setPosts((current) => setProjectPostVote(current, postId, previous))
              setInteractionError(
                cause instanceof Error ? cause.message : "Your vote could not be saved.",
              )
            },
          )
          .finally(() => {
            pendingVoteIdsRef.current.delete(postId)
            setPendingVoteIds(new Set(pendingVoteIdsRef.current))
          })
      })
    },
    [posts, runCommunityAction, source],
  )

  return (
    <>
      <MapDialog
        open={Boolean(selectedId)}
        onOpenChange={(open) => !open && onClose()}
        size="project"
        title="Project information"
        description="Official project details and explicitly linked resident discussions."
      >
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "details" | "community")}
        className="flex min-h-0 w-full flex-1 flex-col gap-0"
      >
        <TabsList
          variant="line"
          aria-label="Project information sections"
          className="grid h-12 w-full shrink-0 grid-cols-2 gap-0 self-stretch rounded-none border-b border-border bg-muted/30 p-0"
        >
          <TabsTrigger
            value="details"
            className="h-full min-h-12 rounded-none border-0 border-b-2 border-transparent px-4 py-0 text-center text-muted-foreground data-[state=active]:border-primary! data-[state=active]:bg-transparent! data-[state=active]:text-foreground"
          >
            Project details
          </TabsTrigger>
          <TabsTrigger
            value="community"
            className="h-full min-h-12 rounded-none border-0 border-b-2 border-transparent px-4 py-0 text-center text-muted-foreground data-[state=active]:border-primary! data-[state=active]:bg-transparent! data-[state=active]:text-foreground"
          >
            Community posts
            {postsState === "ready" && (
              <Badge variant="secondary" className="ml-1 tabular-nums">
                {posts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full min-h-0">
            <ProjectDetailContent
              feature={feature}
              detail={detail}
              loading={loading}
              error={error}
              onRetry={onRetry}
              isModerator={isModerator}
              onGeometryReviewed={onGeometryReviewed}
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="community" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full min-h-0">
            <div className="p-4 sm:p-5">
              <Alert className="mb-4 bg-muted/30">
                <Info aria-hidden="true" />
                <AlertTitle>Resident discussion</AlertTitle>
                <AlertDescription>
                  These posts are explicitly linked to this project. They are not official project updates or verified findings.
                </AlertDescription>
              </Alert>

              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted-foreground">
                  Use the full Community composer. You may keep, change, or remove this project link before publishing.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  disabled={!viewerReady || !source}
                  onClick={() => runCommunityAction(() => setComposerOpen(true))}
                >
                  {!viewerReady
                    ? "Checking sign-in…"
                    : canInteract
                      ? "Create post"
                      : "Sign in to post"}
                </Button>
              </div>

              {publishMessage && (
                <Alert className="mb-4" role="status" aria-live="polite">
                  <CheckCircle2 aria-hidden="true" />
                  <AlertTitle>Post published</AlertTitle>
                  <AlertDescription>{publishMessage}</AlertDescription>
                </Alert>
              )}

              {interactionError && (
                <Alert variant="destructive" className="mb-4" role="alert">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Community action failed</AlertTitle>
                  <AlertDescription>{interactionError}</AlertDescription>
                </Alert>
              )}

              {postsState === "loading" && (
                <div className="space-y-3" aria-label="Loading project community posts">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner aria-hidden="true" /> Loading community posts…
                  </div>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-32 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {postsState === "error" && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Community posts unavailable</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>{postsError}</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadPosts()}>
                      <RefreshCw aria-hidden="true" /> Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {postsState === "ready" && posts.length === 0 && (
                <Empty className="border border-dashed px-5 py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CircleHelp aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle className="text-base">No community posts for this project yet</EmptyTitle>
                    <EmptyDescription>
                      Discussions appear here only when residents explicitly link them to this project.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}

              {postsState === "ready" && posts.length > 0 && (
                <div className="space-y-3" aria-label="Community posts linked to this project">
                  {posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onVote={(direction) => voteOnProjectPost(post.id, direction)}
                      canInteract={canInteract}
                      votePending={pendingVoteIds.has(post.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      </MapDialog>

      <CreatePostModal
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onSubmit={createProjectPost}
        defaultProject={selectedProject}
        portalLayer="above-map"
      />
    </>
  )
}

const AREA_INTERACTIVE_LAYER_IDS = [
  "project-area-official",
  "project-area-official-fill",
  "project-area-reviewed",
  "project-area-automatic-fill",
  "project-area-automatic",
  "project-area-estimated-fill",
  "project-area-estimated-outline",
]

function OfficialProjectMap({
  mapProvider,
  response,
  selectedId,
  camera,
  onSelect,
  onViewportSettled,
  onProviderReady,
  onProviderFailure,
  mapRef,
}: {
  mapProvider: MapProvider
  response: ViewportResponse
  selectedId: string | null
  camera: CameraState
  onSelect: (feature: ViewportFeature) => void
  onViewportSettled: (bounds: ViewportBounds, camera: CameraState) => void
  onProviderReady: () => void
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

  const statusColor: ExpressionSpecification = [
    "match",
    ["get", "displayStatus"],
    "ongoing",
    MAP_STATUS_COLORS.ongoing,
    "completed",
    MAP_STATUS_COLORS.completed,
    "planned",
    MAP_STATUS_COLORS.planned,
    MAP_STATUS_COLORS.unknown,
  ]

  return (
    <>
      <MapLibre
        ref={mapRef}
        initialViewState={{ ...camera, pitch: mapPitchForZoom(camera.zoom) }}
        minZoom={7}
        maxZoom={20}
        maxPitch={60}
        mapStyle={mapProvider.style}
        interactiveLayerIds={[
          "project-clusters",
          "projects-unclustered",
          ...AREA_INTERACTIVE_LAYER_IDS,
        ]}
        onClick={handleClick}
        onMouseEnter={(event) => { event.target.getCanvas().style.cursor = "pointer" }}
        onMouseLeave={(event) => { event.target.getCanvas().style.cursor = "" }}
        onLoad={(event) => {
          onProviderReady()
          onViewportSettled(
            boundsFromMap(event.target),
            {
              latitude: event.target.getCenter().lat,
              longitude: event.target.getCenter().lng,
              zoom: event.target.getZoom(),
            },
          )
        }}
        onMoveEnd={(event) => {
          const targetPitch = mapPitchForZoom(event.viewState.zoom)
          if (Math.abs(event.target.getPitch() - targetPitch) > 0.5) {
            const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
            event.target.easeTo({ pitch: targetPitch, duration: reduceMotion ? 0 : 300 })
            return
          }
          onViewportSettled(
            boundsFromMap(event.target),
            {
              latitude: event.viewState.latitude,
              longitude: event.viewState.longitude,
              zoom: event.viewState.zoom,
            },
          )
        }}
        onError={onProviderFailure}
        attributionControl={{ compact: true }}
        reuseMaps
      >
        <NavigationControl position="bottom-right" showCompass />
        {mapProvider.id === "openfreemap" && (
          <Layer {...OPENFREEMAP_BUILDING_LAYER} />
        )}
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
              "circle-color": PROJECT_INDICATOR_DARK,
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
              "circle-color": PROJECT_INDICATOR_COLOR,
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
            paint={{ "fill-color": PROJECT_INDICATOR_COLOR, "fill-opacity": 0.34 }}
          />
          <Layer
            id="project-area-estimated-casing"
            type="line"
            minzoom={15}
            filter={["==", ["get", "geometryKind"], "estimated"]}
            paint={{
              "line-color": "#ffffff",
              "line-width": 6,
              "line-opacity": 0.9,
            }}
          />
          <Layer
            id="project-area-estimated-outline"
            type="line"
            minzoom={15}
            filter={["==", ["get", "geometryKind"], "estimated"]}
            paint={{
              "line-color": PROJECT_INDICATOR_COLOR,
              "line-width": 3,
              "line-opacity": 1,
              "line-dasharray": [2, 2],
            }}
          />
          <Layer
            id="project-area-automatic-fill"
            type="fill"
            minzoom={15}
            filter={["all", ["==", ["get", "geometryKind"], "automatic_estimate"], ["==", ["geometry-type"], "Polygon"]]}
            paint={{ "fill-color": statusColor, "fill-opacity": 0.25 }}
          />
          <Layer
            id="project-area-automatic"
            type="line"
            minzoom={15}
            filter={["==", ["get", "geometryKind"], "automatic_estimate"]}
            paint={{
              "line-color": statusColor,
              "line-width": ["match", ["geometry-type"], "LineString", 8, 3],
              "line-opacity": 0.95,
              "line-dasharray": [1, 1],
            }}
          />
          <Layer
            id="project-area-reviewed"
            type="line"
            minzoom={15}
            filter={["==", ["get", "geometryKind"], "reviewed_estimate"]}
            paint={{
              "line-color": statusColor,
              "line-width": 7,
              "line-opacity": 0.95,
              "line-dasharray": [3, 1],
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

      <MapDialog
        open={overlapChoices.length > 0}
        onOpenChange={(open) => !open && setOverlapChoices([])}
        size="chooser"
        title="Choose a project"
        description="Multiple highlighted project areas overlap here."
      >
        <ul className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Overlapping infrastructure projects">
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
                  <GeometryBadge kind={feature.geometryKind} method={feature.geometryEstimateMethod} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </MapDialog>
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
  const [providerIndex, setProviderIndex] = useState(0)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isModerator, setIsModerator] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [projectsPanelCollapsed, setProjectsPanelCollapsed] = useState(false)
  const mapRef = useRef<MapRef | null>(null)
  const clientRef = useRef<PublicRpcClient | null>(null)
  const requestRef = useRef(0)
  const detailRequestRef = useRef(0)
  const viewportTimerRef = useRef<number | null>(null)
  const providerFailureTimerRef = useRef<number | null>(null)
  const hasResponseRef = useRef(false)
  const lastBoundsRef = useRef(DEFAULT_BOUNDS)
  const failedProvidersRef = useRef(new Set<string>())
  const readyProvidersRef = useRef(new Set<string>())
  const providers = useMemo(() => getMapProviders(), [])
  const mapProvider = providers[providerIndex] ?? null

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

  useEffect(() => {
    let active = true
    const checkModerator = async () => {
      try {
        if (!clientRef.current) clientRef.current = createPublicRpcClient()
        const moderator = await isCurrentUserModerator(clientRef.current)
        if (active) setIsModerator(moderator)
      } catch {
        if (active) setIsModerator(false)
      }
    }
    void checkModerator()
    return () => { active = false }
  }, [])

  useEffect(
    () => () => {
      if (viewportTimerRef.current !== null) {
        window.clearTimeout(viewportTimerRef.current)
      }
      if (providerFailureTimerRef.current !== null) {
        window.clearTimeout(providerFailureTimerRef.current)
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

  const refreshReviewedGeometry = useCallback(async () => {
    await Promise.all([
      loadDetails(),
      loadViewport(lastBoundsRef.current),
    ])
  }, [loadDetails, loadViewport])

  useEffect(() => {
    const onPopState = () => {
      const nextState = readMapUrlState(window.location.search)
      setSelectedId(nextState.projectId)
      if (nextState.camera) {
        setCamera(nextState.camera)
        mapRef.current?.flyTo({
          center: [nextState.camera.longitude, nextState.camera.latitude],
          zoom: nextState.camera.zoom,
          pitch: mapPitchForZoom(nextState.camera.zoom),
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
    const targetZoom = Math.max(camera.zoom, 15)
    mapRef.current?.flyTo({
      center: feature.coordinates,
      zoom: targetZoom,
      pitch: mapPitchForZoom(targetZoom),
    })
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

  const handleProviderReady = useCallback(() => {
    if (!mapProvider) return
    readyProvidersRef.current.add(mapProvider.id)
    if (providerFailureTimerRef.current !== null) {
      window.clearTimeout(providerFailureTimerRef.current)
      providerFailureTimerRef.current = null
    }
  }, [mapProvider])

  const handleProviderFailure = useCallback(() => {
    if (!mapProvider || !shouldScheduleMapProviderFallback(
      readyProvidersRef.current.has(mapProvider.id),
      failedProvidersRef.current.has(mapProvider.id),
      providerFailureTimerRef.current !== null,
    )) return

    providerFailureTimerRef.current = window.setTimeout(() => {
      failedProvidersRef.current.add(mapProvider.id)
      providerFailureTimerRef.current = null
      setProviderIndex((current) => nextMapProviderIndex(current, providers.length))
    }, 1_500)
  }, [mapProvider, providers.length])

  const retryProviders = useCallback(() => {
    if (providerFailureTimerRef.current !== null) {
      window.clearTimeout(providerFailureTimerRef.current)
      providerFailureTimerRef.current = null
    }
    failedProvidersRef.current.clear()
    readyProvidersRef.current.clear()
    setProviderIndex(0)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 md:p-4">
      <div className={`grid min-h-0 flex-1 gap-3 ${projectsPanelCollapsed ? "lg:grid-cols-[minmax(0,1fr)_2.5rem]" : "lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]"}`}>
        <section className="relative min-h-[34rem] overflow-hidden rounded-xl border bg-muted/30 lg:min-h-0" aria-label="Official project map">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="absolute right-3 top-3 z-20 flex size-7 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm"
                role="status"
                aria-label={
                  queryState === "loading" || queryState === "refreshing"
                    ? "Updating map"
                    : queryState === "configuration" || queryError
                      ? "Project data unavailable"
                      : "Map ready"
                }
              >
                {queryState === "loading" || queryState === "refreshing" ? (
                  <Spinner aria-hidden="true" />
                ) : queryState === "configuration" || queryError ? (
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="left">
              {queryState === "loading" || queryState === "refreshing"
                ? "Updating projects"
                : queryState === "configuration" || queryError
                  ? "Project data unavailable"
                  : "Map ready"}
            </TooltipContent>
          </Tooltip>
          {mapProvider ? (
            <OfficialProjectMap
              key={mapProvider.id}
              mapProvider={mapProvider}
              response={response}
              selectedId={selectedId}
              camera={camera}
              onSelect={selectProject}
              onViewportSettled={onViewportSettled}
              onProviderReady={handleProviderReady}
              onProviderFailure={handleProviderFailure}
              mapRef={mapRef}
            />
          ) : (
            <MapStatePanel
              title="Map providers unavailable"
              description="OpenFreeMap and the configured fallbacks could not be loaded. Project records remain available in the list."
              action={
                <Button variant="outline" size="sm" onClick={retryProviders}>
                  <RefreshCw aria-hidden="true" /> Retry map providers
                </Button>
              }
            />
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="absolute bottom-3 left-3 z-10 size-8 rounded-full bg-background/90 shadow-sm backdrop-blur-sm"
                aria-label="Show project map legend"
              >
                <CircleHelp aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-64 gap-2 rounded-xl bg-background/95 p-3 backdrop-blur-sm"
            >
              <p className="font-heading text-xs font-medium">Project map legend</p>
              <div className="flex items-center gap-2 border-t pt-2 text-xs">
                <span className="size-3 rounded-full border-2 border-white bg-red-600 ring-1 ring-red-900" aria-hidden="true" />
                <span>Project location marker</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-7 rounded-sm border-2 border-primary bg-primary/25" aria-hidden="true" />
                  <span>Official project geometry</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-7 border-t-[3px] border-dashed border-secondary-foreground" aria-hidden="true" />
                  <span>Reviewed OSM estimate</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-7 border-t-[3px] border-dotted border-primary/70" aria-hidden="true" />
                  <span>Estimated project route/building</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full border-2 border-white bg-red-600 ring-1 ring-red-900" aria-hidden="true" />
                  <span>Fallback circle · 50 m radius</span>
                </div>
                <p className="pt-1 text-muted-foreground">
                  {mapProvider ? `${mapProvider.name} · ` : ""}3D view begins at zoom 15.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </section>

        <aside className="hidden min-h-0 flex-col lg:flex">
          {projectsPanelCollapsed ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="self-start rounded-xl"
              onClick={() => setProjectsPanelCollapsed(false)}
              aria-label="Expand projects panel"
              title="Expand projects panel"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
          ) : (
            <ProjectList
              features={response.features}
              selectedId={selectedId}
              loading={queryState === "loading" || queryState === "refreshing"}
              onSelect={selectProject}
              onRetry={() => void loadViewport(lastBoundsRef.current)}
              queryError={queryError}
              configurationRequired={queryState === "configuration"}
              onCollapse={() => setProjectsPanelCollapsed(true)}
            />
          )}
        </aside>
      </div>

      <div className="lg:hidden">
        <ButtonGroup className="max-w-full">
          <Button variant="outline" onClick={() => setListOpen(true)}>
            <Search aria-hidden="true" /> Projects in this view
            <Badge variant="secondary" className="ml-1 tabular-nums">
              {response.features.length}
            </Badge>
          </Button>
          <ButtonGroupText className="shrink text-xs text-muted-foreground">
            <LocateFixed aria-hidden="true" />
            <span className="hidden sm:inline">Cebu City view</span>
            <span className="sm:hidden">Cebu</span>
          </ButtonGroupText>
        </ButtonGroup>
      </div>

      <Drawer open={listOpen} onOpenChange={setListOpen}>
        <DrawerContent className="dark h-[82dvh] max-h-[82dvh]">
          <DrawerHeader className="shrink-0 border-b px-2 pb-3 pt-2 text-left">
            <DrawerTitle>Projects in this view</DrawerTitle>
            <DrawerDescription>
              Select an official record from the current map area.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 px-2 pb-2 pt-3">
            <ProjectList
              features={response.features}
              selectedId={selectedId}
              loading={queryState === "loading" || queryState === "refreshing"}
              onSelect={selectProject}
              onRetry={() => void loadViewport(lastBoundsRef.current)}
              queryError={queryError}
              configurationRequired={queryState === "configuration"}
              showHeader={false}
            />
          </div>
        </DrawerContent>
      </Drawer>
      <ProjectDetailDialog
        key={selectedId ?? "closed-project"}
        selectedId={selectedId}
        feature={selectedFeature}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onRetry={() => void loadDetails()}
        onClose={closeProject}
        isModerator={isModerator}
        onGeometryReviewed={refreshReviewedGeometry}
      />
    </div>
  )
}
