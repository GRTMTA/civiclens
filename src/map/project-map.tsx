import { Popover, Tabs } from "radix-ui"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
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
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  Info,
  LocateFixed,
  MapPinned,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Route,
  Search,
} from "lucide-react"

import { PostCard } from "@/community/post-card"
import { getCommunitySource } from "@/community/community-data"
import type { CommunityPost } from "@/community/community-contract"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  isCurrentUserModerator,
  isMapConfigurationError,
  saveReviewedOsmEstimate,
  type PublicRpcClient,
} from "./public-projects"
import { MapDialog } from "./map-dialog"
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
  const label =
    kind === "official"
      ? "Official project geometry"
      : kind === "reviewed_estimate"
        ? "Reviewed OSM estimate"
        : "Estimated project area"
  const classes =
    kind === "official"
      ? "border-sky-300 bg-sky-50 text-sky-950"
      : kind === "reviewed_estimate"
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : "border-slate-300 bg-white/90 text-slate-800"

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
  highlightedId,
  loading,
  onSelect,
  onHighlight,
  onRetry,
  queryError,
  configurationRequired,
  onCollapse,
}: {
  features: ViewportFeature[]
  selectedId: string | null
  highlightedId: string | null
  loading: boolean
  onSelect: (feature: ViewportFeature) => void
  onHighlight: (projectId: string | null) => void
  onRetry: () => void
  queryError: string | null
  configurationRequired: boolean
  onCollapse?: () => void
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
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold">
            Projects in this view
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Official records at documented project locations
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" aria-label={`${features.length} projects returned`}>
            {features.length}
          </Badge>
          {onCollapse && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mr-2"
              onClick={onCollapse}
              aria-label="Hide projects panel"
            >
              <PanelRightClose aria-hidden="true" />
              Hide projects
            </Button>
          )}
        </div>
      </div>
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
                className="w-full rounded-lg border border-transparent p-3 text-left transition hover:border-border hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring data-[highlighted=true]:border-ring/50 data-[highlighted=true]:bg-muted/80 data-[selected=true]:border-primary/60 data-[selected=true]:bg-primary/5 data-[selected=true]:shadow-sm"
                data-selected={selectedId === feature.id}
                data-highlighted={highlightedId === feature.id}
                aria-current={selectedId === feature.id ? "true" : undefined}
                onClick={() => onSelect(feature)}
                onMouseEnter={() => onHighlight(feature.id)}
                onMouseLeave={() => onHighlight(null)}
                onFocus={() => onHighlight(feature.id)}
                onBlur={() => onHighlight(null)}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="line-clamp-2 text-sm font-medium">
                    {readableProjectTitle(feature.name)}
                  </span>
                  <StatusBadge status={feature.displayStatus} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">{feature.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[0.7rem]">{feature.id}</span>
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
      <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-950">
          <Route className="size-4" aria-hidden="true" /> Moderator geometry review
        </h3>
        <p className="text-xs leading-5 text-amber-950/80">
          Find nearby OpenStreetMap roads and approve one short segment as a reviewed estimate. It will never be labeled official.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void loadCandidates()}>
          Find nearby OSM roads
        </Button>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3" aria-labelledby="osm-review-heading">
      <div>
        <h3 id="osm-review-heading" className="flex items-center gap-2 text-sm font-semibold text-amber-950">
          <Route className="size-4" aria-hidden="true" /> Review nearby OSM road segments
        </h3>
        <p className="mt-1 text-xs leading-5 text-amber-950/80">
          Candidates are clipped to roughly 300 m around the DPWH point. Confirm the road against project documents before approval.
        </p>
      </div>

      {loading && <p className="text-sm text-amber-950" aria-live="polite">Loading nearby roads…</p>}
      {!loading && candidates.length === 0 && !error && (
        <p className="text-sm text-amber-950">No mapped roads were found within 100 m.</p>
      )}
      {candidates.length > 0 && (
        <ul className="space-y-2" aria-label="Nearby OpenStreetMap road candidates">
          {candidates.map((candidate) => (
            <li key={candidate.osmWayId}>
              <button
                type="button"
                aria-pressed={selected?.osmWayId === candidate.osmWayId}
                className="w-full rounded-md border bg-white p-2 text-left text-sm aria-pressed:border-amber-600 aria-pressed:ring-2 aria-pressed:ring-amber-300"
                onClick={() => setSelected(candidate)}
              >
                <span className="block font-medium">{candidate.name}</span>
                <span className="text-xs capitalize text-muted-foreground">
                  {candidate.highway.replace(/_/g, " ")} · about {candidate.distanceMeters} m from point
                </span>
              </button>
              <a
                className="mt-1 inline-block text-xs text-amber-900 underline underline-offset-2"
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
          <label htmlFor={`osm-review-note-${detail.id}`} className="text-xs font-medium text-amber-950">
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
        <p className="flex items-center gap-1 text-xs font-medium text-emerald-800" role="status">
          <CheckCircle2 className="size-4" aria-hidden="true" /> Reviewed estimate saved.
        </p>
      )}
      <p className="text-[11px] leading-4 text-amber-950/70">
        Road data © OpenStreetMap contributors, ODbL. The request sends only this project coordinate to the configured Overpass service.
      </p>
    </section>
  )
}

function ProjectDetailContent({
  detail,
  loading,
  error,
  onRetry,
  isModerator,
  onGeometryReviewed,
}: {
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
          <GeometryBadge kind={detail.geometryKind} />
          <span className="text-xs text-muted-foreground">{detail.category}</span>
        </div>
        <h2 className="font-heading text-lg font-semibold leading-tight">
          {detail.name}
        </h2>
        <p className="text-sm text-muted-foreground">{detail.location}</p>
      </div>

      <dl className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Official status</dt>
          <dd className="mt-1 font-medium">{statusLabel(detail.displayStatus)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Contract amount</dt>
          <dd className="mt-1 font-medium">{formatMoney(detail.budget)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Contractor</dt>
          <dd className="mt-1 font-medium">{detail.contractor ?? "Not provided"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Contract ID</dt>
          <dd className="mt-1 font-mono text-xs font-medium">{detail.contractId ?? "Not provided"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Start date</dt>
          <dd className="mt-1 font-medium">{formatDate(detail.startDate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Completion date</dt>
          <dd className="mt-1 font-medium">{formatDate(detail.completionDate)}</dd>
        </div>
      </dl>

      {detail.description && (
        <p className="text-sm leading-6 text-muted-foreground">{detail.description}</p>
      )}

      <Alert className={
        detail.geometryKind === "official"
          ? "border-sky-300 bg-sky-50"
          : detail.geometryKind === "reviewed_estimate"
            ? "border-amber-300 bg-amber-50"
            : "border-slate-300 bg-slate-50"
      }>
        <MapPinned aria-hidden="true" />
        <AlertTitle>
          {detail.geometryKind === "official"
            ? "Official project geometry"
            : detail.geometryKind === "reviewed_estimate"
              ? "Moderator-reviewed OSM estimate"
              : "Estimated project area"}
        </AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            {detail.geometryKind === "official"
              ? `This shape was supplied by ${detail.geometrySource ?? "an official source"}.`
              : detail.geometryKind === "reviewed_estimate"
                ? "A moderator selected this OpenStreetMap road segment as a plausible project route. It is not an official DPWH boundary."
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
          </p>
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
      {hasDistinctSourceStatus(detail.status, detail.displayStatus) && (
        <p className="text-xs text-muted-foreground">
          Source status: <span className="font-medium">{detail.status}</span>. The normalized status above makes the source record easier to compare across projects.
        </p>
      )}
    </div>
  )
}

type ProjectDetailViewProps = {
  selectedId: string | null
  detail: ProjectDetail | null
  loading: boolean
  error: string | null
  onRetry: () => void
  isModerator: boolean
  onGeometryReviewed: () => Promise<void>
}

function readableProjectTitle(value: string) {
  const trimmed = value.trim()
  if (!trimmed || trimmed !== trimmed.toUpperCase() || !/[A-Z]/.test(trimmed)) {
    return value
  }

  return trimmed
    .toLocaleLowerCase("en-PH")
    .replace(/(^|[\s(/-])([a-z])/g, (_, prefix: string, letter: string) =>
      `${prefix}${letter.toUpperCase()}`,
    )
}

function hasDistinctSourceStatus(status: string, displayStatus: DisplayStatus) {
  return status.trim().toLocaleLowerCase() !== statusLabel(displayStatus).toLocaleLowerCase()
}

function ProjectDetailView({
  selectedId,
  detail,
  loading,
  error,
  onRetry,
  isModerator,
  onGeometryReviewed,
}: ProjectDetailViewProps) {
  const [activeTab, setActiveTab] = useState<"details" | "community">("details")
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [postsState, setPostsState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [postsError, setPostsError] = useState<string | null>(null)
  const postsRequestRef = useRef(0)

  const loadPosts = useCallback(async () => {
    if (!selectedId) return
    const requestId = ++postsRequestRef.current
    setPostsState("loading")
    setPostsError(null)
    try {
      const nextPosts = await getCommunitySource().listPostsForProject(selectedId)
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
  }, [selectedId])

  useEffect(() => {
    if (activeTab === "community" && postsState === "idle") void loadPosts()
  }, [activeTab, loadPosts, postsState])

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as "details" | "community")}
      className="flex min-h-0 w-full flex-1 flex-col"
    >
      <Tabs.List
        aria-label="Project information sections"
        className="grid w-full shrink-0 grid-cols-2 gap-1 border-b border-border px-4 pt-2 sm:px-5"
      >
        <Tabs.Trigger
          value="details"
          className="flex min-h-11 items-center justify-center rounded-t-md border-b-2 border-transparent px-3 py-2 text-center text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-primary data-[state=active]:text-foreground"
        >
          Project details
        </Tabs.Trigger>
        <Tabs.Trigger
          value="community"
          className="flex min-h-11 items-center justify-center rounded-t-md border-b-2 border-transparent px-3 py-2 text-center text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-primary data-[state=active]:text-foreground"
        >
          Community posts
          {postsState === "ready" && (
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] tabular-nums">
              {posts.length}
            </span>
          )}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="details" className="min-h-0 flex-1 overflow-y-auto outline-none">
        <ProjectDetailContent
          detail={detail}
          loading={loading}
          error={error}
          onRetry={onRetry}
          isModerator={isModerator}
          onGeometryReviewed={onGeometryReviewed}
        />
      </Tabs.Content>

      <Tabs.Content
        value="community"
        className="min-h-0 flex-1 overflow-y-auto p-4 outline-none sm:p-5"
      >
        <div className="mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          These are resident discussions explicitly linked to this project. They are not official project updates or verified findings.
        </div>

        {postsState === "loading" && (
          <div className="space-y-3" aria-label="Loading project community posts">
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
          <div className="rounded-lg border border-dashed border-border px-5 py-12 text-center">
            <p className="text-sm font-medium">No community posts for this project yet</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Discussions appear here only when residents explicitly link them to this project.
            </p>
          </div>
        )}

        {postsState === "ready" && posts.length > 0 && (
          <div className="space-y-3" aria-label="Community posts linked to this project">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onVote={() => undefined}
                canInteract={false}
              />
            ))}
          </div>
        )}
      </Tabs.Content>
    </Tabs.Root>
  )
}

function ProjectMapKey() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-background/95 shadow-sm backdrop-blur-sm"
          aria-label="Open project map key"
        >
          <Info aria-hidden="true" />
          Map key
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
        >
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Project map key</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Status colors describe the official source record. Geometry styles describe how the shape was obtained.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {(Object.keys(STATUS_LABELS) as DisplayStatus[]).map((status) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={`size-2.5 rounded-full ${STATUS_DOT_CLASSES[status]}`} aria-hidden="true" />
                  <span>{statusLabel(status)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t pt-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-7 rounded-sm border-2 border-sky-600 bg-sky-400/40" aria-hidden="true" />
                <span>Official project geometry</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-7 border-t-[3px] border-dashed border-amber-600" aria-hidden="true" />
                <span>Moderator-reviewed OSM estimate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-7 rounded-sm border border-dashed border-slate-500 bg-slate-400/10" aria-hidden="true" />
                <span>Generic estimated area, not an official boundary</span>
              </div>
              <p className="text-muted-foreground">Estimated areas appear only when the map is sufficiently zoomed in.</p>
            </div>
          </div>
          <Popover.Arrow className="fill-popover" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ProjectDetailDialog(props: ProjectDetailViewProps & { onClose: () => void }) {
  return (
    <MapDialog
      open={Boolean(props.selectedId)}
      onOpenChange={(open) => !open && props.onClose()}
      size="project"
      title="Project information"
      description="Official project details and explicitly linked resident discussions."
    >
      <ProjectDetailView {...props} />
    </MapDialog>
  )
}

function ProjectDetailWorkspace(props: ProjectDetailViewProps & { onClose: () => void; onCollapse?: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
      <header className="shrink-0 border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 shrink-0"
            onClick={props.onClose}
          >
            <ArrowLeft aria-hidden="true" />
            Back to projects
          </Button>
          {props.onCollapse && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mr-2 shrink-0"
              onClick={props.onCollapse}
              aria-label="Hide projects panel"
            >
              <PanelRightClose aria-hidden="true" />
              Hide projects
            </Button>
          )}
        </div>
        <div className="mt-3 min-w-0">
          <h2 className="font-heading text-base font-semibold">Official project details</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Official record and explicitly linked resident discussions.
          </p>
        </div>
      </header>
      <ProjectDetailView {...props} />
    </div>
  )
}

const AREA_INTERACTIVE_LAYER_IDS = [
  "project-area-official",
  "project-area-official-fill",
  "project-area-reviewed",
  "project-area-estimated-fill",
  "project-area-estimated-outline",
]

function OfficialProjectMap({
  mapStyle,
  response,
  selectedId,
  highlightedId,
  camera,
  onSelect,
  onHighlight,
  onViewportSettled,
  onProviderFailure,
  mapRef,
}: {
  mapStyle: ReturnType<typeof getMapStyle>
  response: ViewportResponse
  selectedId: string | null
  highlightedId: string | null
  camera: CameraState
  onSelect: (feature: ViewportFeature) => void
  onHighlight: (projectId: string | null) => void
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

  const statusColor: ExpressionSpecification = [
    "match",
    ["get", "displayStatus"],
    "ongoing",
    "#f59e0b",
    "completed",
    "#22c55e",
    "planned",
    "#6366f1",
    "#64748b",
  ]

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
        onMouseMove={(event) => {
          const feature = event.features?.find((item) => !item.properties?.cluster)
          const id = feature?.properties?.id ?? feature?.id
          onHighlight(id ? String(id) : null)
          event.target.getCanvas().style.cursor = feature ? "pointer" : ""
        }}
        onMouseLeave={(event) => {
          onHighlight(null)
          event.target.getCanvas().style.cursor = ""
        }}
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
            id="project-highlighted-point"
            type="circle"
            maxzoom={15}
            filter={["==", ["get", "id"], highlightedId ?? ""]}
            paint={{
              "circle-color": "#ffffff",
              "circle-radius": 10,
              "circle-opacity": 0.2,
              "circle-stroke-width": 3,
              "circle-stroke-color": "#0f172a",
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
            paint={{ "fill-color": "#64748b", "fill-opacity": 0.06 }}
          />
          <Layer
            id="project-area-estimated-outline"
            type="line"
            minzoom={15}
            filter={["==", ["get", "geometryKind"], "estimated"]}
            paint={{
              "line-color": "#64748b",
              "line-width": 1.25,
              "line-opacity": 0.65,
              "line-dasharray": [1, 2],
            }}
          />
          <Layer
            id="project-area-reviewed"
            type="line"
            minzoom={15}
            filter={["==", ["get", "geometryKind"], "reviewed_estimate"]}
            paint={{
              "line-color": statusColor,
              "line-width": 4,
              "line-opacity": 0.8,
              "line-dasharray": [2, 1],
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
            id="project-area-highlighted-outline"
            type="line"
            minzoom={15}
            filter={["==", ["get", "id"], highlightedId ?? ""]}
            paint={{
              "line-color": "#0f172a",
              "line-width": 3,
              "line-opacity": 0.85,
              "line-dasharray": [1, 1],
            }}
          />
          <Layer
            id="project-area-selected-fill"
            type="fill"
            minzoom={15}
            filter={["all", ["==", ["get", "id"], selectedId ?? ""], ["==", ["geometry-type"], "Polygon"]]}
            paint={{ "fill-color": "#ffffff", "fill-opacity": 0.16 }}
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
                  <GeometryBadge kind={feature.geometryKind} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </MapDialog>
    </>
  )
}

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)")
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return isMobile
}

export function ProjectMapSurface() {
  const initialUrlState = useMemo(() => readMapUrlState(window.location.search), [])
  const isMobile = useMobileViewport()
  const [camera, setCamera] = useState<CameraState>(
    initialUrlState.camera ?? DEFAULT_CAMERA,
  )
  const [selectedId, setSelectedId] = useState<string | null>(
    initialUrlState.projectId,
  )
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
  const [isModerator, setIsModerator] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [projectPanelOpen, setProjectPanelOpen] = useState(true)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const mapRef = useRef<MapRef | null>(null)
  const clientRef = useRef<PublicRpcClient | null>(null)
  const requestRef = useRef(0)
  const detailRequestRef = useRef(0)
  const viewportTimerRef = useRef<number | null>(null)
  const hasResponseRef = useRef(false)
  const lastBoundsRef = useRef(DEFAULT_BOUNDS)
  const mapStyle = useMemo(() => getMapStyle(), [])

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      mapRef.current?.getMap().resize()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [projectPanelOpen])

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
    },
    [],
  )

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
    if (isMobile && selectedId) setListOpen(true)
  }, [isMobile, selectedId])

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
        })
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const selectProject = useCallback((feature: ViewportFeature) => {
    setSelectedId(feature.id)
    if (isMobile) {
      setListOpen(true)
    } else {
      setListOpen(false)
      setProjectPanelOpen(true)
    }
    const search = writeProjectSearch(window.location.search, feature.id)
    window.history.pushState({ projectId: feature.id }, "", `${window.location.pathname}?${search}`)
    mapRef.current?.flyTo({ center: feature.coordinates, zoom: Math.max(camera.zoom, 15) })
  }, [camera.zoom, isMobile])

  const closeProject = useCallback(() => {
    setSelectedId(null)
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
      <div className={`grid min-h-0 flex-1 gap-3 ${projectPanelOpen ? "lg:grid-cols-[minmax(0,1fr)_25rem]" : "lg:grid-cols-1"}`}>
        <section className="relative min-h-[34rem] overflow-hidden rounded-xl border bg-muted/30 lg:min-h-0" aria-label="Official project map">
          {!styleFailure ? (
            <OfficialProjectMap
              mapStyle={mapStyle}
              response={response}
              selectedId={selectedId}
              highlightedId={highlightedId}
              camera={camera}
              onSelect={selectProject}
              onHighlight={setHighlightedId}
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
          {!projectPanelOpen && (queryError || queryState === "configuration") && !mapUnavailable && (
            <MapStatePanel
              title={queryState === "configuration" ? "Project data configuration required" : "Projects unavailable"}
              description={queryError ?? "Configure the project data connection to browse official records."}
              action={
                queryState === "configuration" ? undefined : (
                  <Button variant="outline" size="sm" onClick={() => void loadViewport(lastBoundsRef.current)}>
                    <RefreshCw aria-hidden="true" /> Retry project query
                  </Button>
                )
              }
            />
          )}
          {response.truncated && (
            <div className="absolute left-3 right-3 top-3 z-10 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-950 shadow-sm backdrop-blur-sm">
              Results are incomplete. Zoom in to see more projects; cluster counts show returned records only.
            </div>
          )}
          <div className="absolute bottom-3 left-3 z-10">
            <ProjectMapKey />
          </div>
          {!projectPanelOpen && (
            <div className="absolute right-3 top-3 z-10">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-background/95 shadow-sm backdrop-blur-sm"
                onClick={() => setProjectPanelOpen(true)}
              >
                <PanelRightOpen aria-hidden="true" />
                Show projects · {response.features.length}
              </Button>
            </div>
          )}
          {projectPanelOpen && (
            <span className="sr-only" aria-live="polite">
              Project panel is visible
            </span>
          )}
          <div className="sr-only" aria-live="polite">
            {highlightedId ? `Highlighted project ${highlightedId}` : ""}
          </div>
        </section>

        {projectPanelOpen && <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
          {selectedId ? (
            <ProjectDetailWorkspace
              selectedId={selectedId}
              detail={detail}
              loading={detailLoading}
              error={detailError}
              onRetry={() => void loadDetails()}
              onClose={closeProject}
              isModerator={isModerator}
              onGeometryReviewed={refreshReviewedGeometry}
              onCollapse={() => setProjectPanelOpen(false)}
            />
          ) : (
            <ProjectList
              features={response.features}
              selectedId={selectedId}
              highlightedId={highlightedId}
              loading={queryState === "loading" || queryState === "refreshing"}
              onSelect={selectProject}
              onHighlight={setHighlightedId}
              onRetry={() => void loadViewport(lastBoundsRef.current)}
              queryError={queryError}
              configurationRequired={queryState === "configuration"}
              onCollapse={() => setProjectPanelOpen(false)}
            />
          )}
        </aside>}
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

      <Sheet
        open={listOpen}
        onOpenChange={(open) => {
          setListOpen(open)
          if (!open && selectedId) closeProject()
        }}
      >
        <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-2xl p-0">
          {selectedId ? (
            <ProjectDetailWorkspace
              selectedId={selectedId}
              detail={detail}
              loading={detailLoading}
              error={detailError}
              onRetry={() => void loadDetails()}
              onClose={closeProject}
              isModerator={isModerator}
              onGeometryReviewed={refreshReviewedGeometry}
            />
          ) : (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>Projects in this view</SheetTitle>
                <SheetDescription>
                  Select an official record from the current map area.
                </SheetDescription>
              </SheetHeader>
              <div className="flex h-[55dvh] min-h-0 p-3">
                <ProjectList
                  features={response.features}
                  selectedId={selectedId}
                  highlightedId={highlightedId}
                  loading={queryState === "loading" || queryState === "refreshing"}
                  onSelect={selectProject}
                  onHighlight={setHighlightedId}
                  onRetry={() => void loadViewport(lastBoundsRef.current)}
                  queryError={queryError}
                  configurationRequired={queryState === "configuration"}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      {!isMobile && (
        <ProjectDetailDialog
          key={selectedId ?? "closed-project"}
          selectedId={selectedId}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onRetry={() => void loadDetails()}
          onClose={closeProject}
          isModerator={isModerator}
          onGeometryReviewed={refreshReviewedGeometry}
        />
      )}
    </div>
  )
}
