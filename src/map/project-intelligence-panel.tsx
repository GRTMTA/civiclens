import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ExternalLink,
  Gauge,
  Layers,
  MinusCircle,
  Users,
} from "lucide-react"

import { getCommunitySource } from "@/community/community-data"
import { postPath } from "@/community/community-routes"
import { relativeTime, type CommunityPost, type CommunityPulse } from "@/community/community-contract"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { ProjectDetail } from "./map-contract"
import {
  analyzeProject,
  type ConfidenceBand,
  type EvidenceStatus,
  type GapSeverity,
  type IntelligenceSource,
  type ProjectIntelligence,
  type SourceId,
} from "./project-intelligence"

const BAND_TEXT: Record<ConfidenceBand, string> = {
  high: "text-positive",
  moderate: "text-warning",
  low: "text-destructive",
}

const BAND_BAR: Record<ConfidenceBand, string> = {
  high: "*:data-[slot=progress-indicator]:bg-positive",
  moderate: "*:data-[slot=progress-indicator]:bg-warning",
  low: "*:data-[slot=progress-indicator]:bg-destructive",
}

const SEVERITY_STYLES: Record<GapSeverity, { icon: string; badge: string; label: string }> = {
  high: {
    icon: "text-destructive",
    badge: "border-destructive/40 bg-destructive/10 text-destructive",
    label: "Higher concern",
  },
  moderate: {
    icon: "text-warning",
    badge: "border-warning/40 bg-warning/10 text-warning",
    label: "Moderate concern",
  },
  low: {
    icon: "text-muted-foreground",
    badge: "border-border bg-muted/60 text-muted-foreground",
    label: "Low concern",
  },
}

/** Section label shared by every block, so the layer reads as one system. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
      {children}
    </p>
  )
}

function EvidenceIcon({ status, className }: { status: EvidenceStatus; className?: string }) {
  if (status === "supported") {
    return (
      <CheckCircle2
        className={cn("size-3.5 shrink-0 text-positive", className)}
        aria-hidden="true"
      />
    )
  }
  if (status === "partial") {
    return (
      <MinusCircle
        className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
        aria-hidden="true"
      />
    )
  }
  return (
    <AlertTriangle
      className={cn("size-3.5 shrink-0 text-warning", className)}
      aria-hidden="true"
    />
  )
}

function evidenceStatusLabel(status: EvidenceStatus): string {
  return status === "supported"
    ? "Supporting"
    : status === "partial"
      ? "Partial"
      : "Verification gap"
}

/** "3d ago" / "just now", so a very recent timestamp does not read "just now ago". */
function TimeAgo({ at }: { at: string }) {
  const label = relativeTime(at)
  if (!label) return null
  return (
    <time dateTime={at}>{label === "just now" ? label : `${label} ago`}</time>
  )
}

/**
 * A compact source chip that opens the underlying supporting information.
 *
 * Every fact shown comes from the record, the linked resident accounts, or the
 * geographic reference actually used. Links point only at real, resolvable
 * locations; nothing here is a constructed citation.
 */
function SourceChip({ source }: { source: IntelligenceSource }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[0.7rem] font-medium transition-colors duration-150 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/60",
            source.status === "gap"
              ? "border-warning/35 bg-warning/5 text-warning"
              : source.status === "supported"
                ? "border-positive/35 bg-positive/5 text-foreground/90"
                : "border-border bg-muted/40 text-foreground/85",
          )}
        >
          <EvidenceIcon status={source.status} />
          <span className="truncate">{source.label}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="dark z-[80] w-80 max-w-[calc(100vw-2rem)] gap-3 rounded-xl border border-border p-3.5"
      >
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 font-heading text-sm font-semibold">
            <EvidenceIcon status={source.status} />
            {source.label}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">{source.detail}</p>
        </div>
        <dl className="space-y-1.5 border-t border-border pt-2.5 text-xs">
          {source.facts.map((fact) => (
            <div key={fact.label} className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
              <dd className="text-right break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>
        {source.url && (
          <Button variant="outline" size="sm" className="w-full" asChild>
            <a
              href={source.url}
              {...(source.url.startsWith("http")
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              <ExternalLink aria-hidden="true" />
              {source.urlLabel ?? "Open source"}
            </a>
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ConfidenceBlock({ intelligence }: { intelligence: ProjectIntelligence }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <SectionLabel>Confidence</SectionLabel>
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "font-heading text-2xl font-semibold tabular-nums",
              BAND_TEXT[intelligence.band],
            )}
          >
            {intelligence.confidence}%
          </span>
          <span className="text-xs text-muted-foreground">{intelligence.bandLabel}</span>
        </div>
      </div>

      <Progress
        value={intelligence.confidence}
        aria-label="CivicLens assessment confidence"
        aria-valuetext={`${intelligence.confidence}% — ${intelligence.bandLabel}`}
        className={cn("mt-2.5 h-1.5 bg-muted", BAND_BAR[intelligence.band])}
      />

      <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
        {intelligence.confidenceSummary}
      </p>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Gauge aria-hidden="true" />
            {open ? "Hide how this was scored" : "How this was scored"}
            <ChevronDown
              className={cn("transition-transform duration-150", open && "rotate-180")}
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-2 space-y-2 border-t border-border pt-2.5">
            {intelligence.factors.map((factor) => (
              <li key={factor.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-foreground/90">{factor.label}</span>
                  <span className="shrink-0 text-[0.7rem] tabular-nums text-muted-foreground">
                    {Math.round(factor.score * 100)}% · weight {Math.round(factor.weight * 100)}%
                  </span>
                </div>
                <Progress
                  value={Math.round(factor.score * 100)}
                  aria-label={`${factor.label} evidence quality`}
                  aria-valuetext={`${Math.round(factor.score * 100)}%`}
                  className="h-1 bg-muted"
                />
                <p className="text-[0.7rem] leading-4 text-muted-foreground">{factor.detail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[0.7rem] leading-4 text-muted-foreground">
            Confidence describes the quality and agreement of the evidence available to
            CivicLens, not the condition of the project.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function TransparencyGaps({ intelligence }: { intelligence: ProjectIntelligence }) {
  const sourceById = useMemo(
    () => new Map(intelligence.sources.map((source) => [source.id, source])),
    [intelligence.sources],
  )
  const clean = intelligence.transparencyGaps.every((gap) => gap.id === "no-significant-gaps")

  return (
    <section aria-labelledby="intelligence-gaps-heading" className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>
          <span id="intelligence-gaps-heading">Transparency gaps</span>
        </SectionLabel>
        {clean && (
          <Badge variant="outline" className="border-positive/40 bg-positive/10 text-positive">
            No significant gaps
          </Badge>
        )}
      </div>

      <ul className="space-y-2">
        {intelligence.transparencyGaps.map((gap) => {
          const styles = SEVERITY_STYLES[gap.severity]
          const positive = gap.id === "no-significant-gaps"

          return (
            <li
              key={gap.id}
              className="rounded-lg border border-border bg-muted/20 p-2.5"
            >
              <div className="flex items-start gap-2">
                {positive ? (
                  <CheckCircle2
                    className="mt-0.5 size-3.5 shrink-0 text-positive"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className={cn("mt-0.5 size-3.5 shrink-0", styles.icon)}
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm leading-5 font-medium">{gap.title}</p>
                    {!positive && (
                      <Badge variant="outline" className={cn("shrink-0", styles.badge)}>
                        {styles.label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{gap.detail}</p>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {gap.sources.map((id: SourceId) => {
                      const source = sourceById.get(id)
                      return source ? <SourceChip key={id} source={source} /> : null
                    })}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CommunitySignals({ intelligence }: { intelligence: ProjectIntelligence }) {
  const signals = intelligence.communitySignals

  return (
    <section aria-labelledby="intelligence-community-heading" className="space-y-2.5">
      <SectionLabel>
        <span id="intelligence-community-heading">Community signals</span>
      </SectionLabel>

      {!signals.available ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Resident discussion could not be read for this record, so no local signal is
          included in this reading.
        </p>
      ) : signals.observations === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          No resident accounts available for this record yet.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="flex items-baseline gap-2 text-sm">
                <Users
                  className="size-4 shrink-0 translate-y-0.5 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="font-semibold tabular-nums">{signals.observations}</span>
                <span className="text-muted-foreground">
                  {signals.observations === 1 ? "resident account" : "resident accounts"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                from{" "}
                <span className="tabular-nums">{signals.residents}</span>{" "}
                {signals.residents === 1 ? "resident" : "residents"}
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-positive/25 bg-positive/5 px-2.5 py-2">
                <p className="text-sm font-semibold tabular-nums text-positive">
                  {signals.supportive}
                </p>
                <p className="text-[0.7rem] text-muted-foreground">Supportive</p>
              </div>
              <div className="rounded-md border border-warning/25 bg-warning/5 px-2.5 py-2">
                <p className="text-sm font-semibold tabular-nums text-warning">
                  {signals.concerns}
                </p>
                <p className="text-[0.7rem] text-muted-foreground">Concerns</p>
              </div>
              <div className="rounded-md border border-border bg-muted/40 px-2.5 py-2">
                <p className="text-sm font-semibold tabular-nums">{signals.neutral}</p>
                <p className="text-[0.7rem] text-muted-foreground">No stated view</p>
              </div>
            </div>

            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-border bg-muted/60 text-foreground/85">
                {signals.strengthLabel}
              </Badge>
              {signals.lastActivityAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    last account <TimeAgo at={signals.lastActivityAt} />
                  </span>
                </>
              )}
            </p>
          </div>

          {signals.themes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Recurring themes in resident accounts
              </p>
              <ul className="space-y-1">
                {signals.themes.slice(0, 4).map((theme) => (
                  <li
                    key={theme.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          theme.stance === "concern" ? "bg-warning" : "bg-positive",
                        )}
                      />
                      <span className="truncate text-foreground/85">{theme.label}</span>
                    </span>
                    <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                      {theme.residents === 1
                        ? "1 resident"
                        : `${theme.residents} residents`}
                      {theme.recurring ? " · recurring" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {signals.excerpts.length > 0 && (
            <ul className="space-y-2">
              {signals.excerpts.map((excerpt) => (
                <li
                  key={excerpt.postId}
                  className="rounded-lg border border-border bg-muted/20 p-2.5"
                >
                  <p className="text-sm leading-6 text-foreground/85">“{excerpt.text}”</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.7rem] text-muted-foreground">
                    <span>{excerpt.authorName}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={excerpt.createdAt}>{relativeTime(excerpt.createdAt)}</time>
                    <span aria-hidden="true">·</span>
                    <a
                      href={postPath(excerpt.postId)}
                      className="rounded-sm underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      Read the full account
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            These are resident reports about what they observed. They are not verified
            findings about the project or its delivery.
          </p>
        </>
      )}
    </section>
  )
}

function EvidenceBreakdown({ intelligence }: { intelligence: ProjectIntelligence }) {
  const [open, setOpen] = useState(false)
  const sourceById = useMemo(
    () => new Map(intelligence.sources.map((source) => [source.id, source])),
    [intelligence.sources],
  )
  const supporting = intelligence.evidence.filter((item) => item.status !== "gap").length

  return (
    <section aria-labelledby="intelligence-evidence-heading" className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>
          <span id="intelligence-evidence-heading">Evidence</span>
        </SectionLabel>
        <span className="text-[0.7rem] text-muted-foreground tabular-nums">
          {supporting} of {intelligence.evidence.length} categories supporting
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {intelligence.sources.map((source) => (
          <SourceChip key={source.id} source={source} />
        ))}
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full sm:w-auto">
            <Layers aria-hidden="true" />
            {open ? "Hide evidence breakdown" : "View evidence breakdown"}
            <ChevronDown
              className={cn("transition-transform duration-150", open && "rotate-180")}
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-2.5 space-y-2">
            {intelligence.evidence.map((item) => {
              const source = sourceById.get(item.source)
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-border bg-muted/20 p-2.5"
                >
                  <div className="flex items-start gap-2">
                    <EvidenceIcon status={item.status} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm leading-5 font-medium">{item.title}</p>
                        <span className="text-[0.7rem] text-muted-foreground">
                          {evidenceStatusLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {item.detail}
                      </p>
                      {source && (
                        <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
                          Source: {source.label}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}

/**
 * The CivicLens Intelligence layer for one Official-source record.
 *
 * It reads as an analytical layer over public infrastructure data: what the
 * record claims, what the available evidence supports, what residents report,
 * where verification is missing, and how much confidence the evidence justifies.
 * It never states that wrongdoing occurred — it identifies verification gaps.
 */
export function ProjectIntelligencePanel({ detail }: { detail: ProjectDetail }) {
  const projectId = detail.id
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [pulse, setPulse] = useState<CommunityPulse | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "partial">("loading")

  useEffect(() => {
    let cancelled = false
    setState("loading")
    setPosts([])
    setPulse(null)

    let source
    try {
      source = getCommunitySource()
    } catch {
      // Resident accounts are one evidence category. Losing it degrades the
      // reading rather than removing the analytical layer.
      setState("partial")
      return
    }

    Promise.all([source.listPostsForProject(projectId), source.getPulse(projectId)])
      .then(([nextPosts, nextPulse]) => {
        if (cancelled) return
        setPosts(nextPosts)
        setPulse(nextPulse)
        setState("ready")
      })
      .catch(() => {
        if (!cancelled) setState("partial")
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  const intelligence = useMemo(
    () =>
      analyzeProject({
        detail,
        posts,
        pulse,
        communityAvailable: state === "ready",
      }),
    [detail, posts, pulse, state],
  )

  if (state === "loading") {
    return (
      <section
        aria-labelledby="intelligence-heading"
        className="space-y-3 rounded-xl border border-border bg-muted/15 p-3.5 sm:p-4"
        aria-busy="true"
      >
        <h3 id="intelligence-heading" className="font-heading text-sm font-semibold">
          CivicLens Intelligence
        </h3>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </section>
    )
  }

  return (
    <section
      aria-labelledby="intelligence-heading"
      className="space-y-4 rounded-xl border border-border bg-muted/15 p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 id="intelligence-heading" className="font-heading text-sm font-semibold">
            CivicLens Intelligence
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            An assessment of the published record against the evidence available to
            CivicLens. It identifies verification gaps; it does not allege wrongdoing.
          </p>
        </div>
        <p className="shrink-0 text-[0.7rem] text-muted-foreground">
          Updated <TimeAgo at={intelligence.lastAnalyzed} />
        </p>
      </div>

      <ConfidenceBlock intelligence={intelligence} />

      <section aria-labelledby="intelligence-assessment-heading" className="space-y-1.5">
        <SectionLabel>
          <span id="intelligence-assessment-heading">Assessment</span>
        </SectionLabel>
        <p className="text-sm leading-6">{intelligence.assessment}</p>
      </section>

      <TransparencyGaps intelligence={intelligence} />
      <CommunitySignals intelligence={intelligence} />
      <EvidenceBreakdown intelligence={intelligence} />

      {state === "partial" && (
        <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
          <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Resident accounts were unavailable when this reading was produced, so the
          confidence above reflects record and geographic evidence only.
        </p>
      )}
    </section>
  )
}
