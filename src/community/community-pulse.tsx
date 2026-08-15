import { IconCamera, IconMessage2, IconMessages, IconEye } from "@tabler/icons-react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { relativeTime, topicLabel, type CommunityPulse } from "./community-contract"

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof IconMessages
  value: number
  label: string
}) {
  return (
    <div className="flex items-baseline gap-2">
      <Icon className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden="true" />
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

/**
 * Aggregate community activity, optionally for one Official-source record.
 *
 * These are counts of resident discussion, not findings about a project. The
 * heading and the closing note say so explicitly, and the category breakdown is
 * labelled "discussion activity" rather than anything resembling problems,
 * issues, or verified conditions.
 */
export function CommunityPulsePanel({
  pulse,
  loading = false,
  className,
  /** Set when the pulse describes one project rather than the whole community. */
  scope = "community",
}: {
  pulse: CommunityPulse | null
  loading?: boolean
  className?: string
  scope?: "community" | "project"
}) {
  if (loading) {
    return (
      <div className={cn("space-y-2.5", className)} aria-busy="true">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-32" />
      </div>
    )
  }

  if (!pulse) return null

  const total = pulse.discussions + pulse.observations
  const topTopics = pulse.topics.slice(0, 5)

  return (
    <div className={cn("space-y-3.5", className)}>
      {total === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          No community activity yet
          {scope === "project" ? " about this project record." : "."}
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Metric
              icon={IconMessages}
              value={pulse.discussions}
              label={pulse.discussions === 1 ? "discussion" : "discussions"}
            />
            <Metric
              icon={IconEye}
              value={pulse.observations}
              label={pulse.observations === 1 ? "observation" : "observations"}
            />
            <Metric
              icon={IconCamera}
              value={pulse.photos}
              label={pulse.photos === 1 ? "photo" : "photos"}
            />
            <Metric
              icon={IconMessage2}
              value={pulse.comments}
              label={pulse.comments === 1 ? "comment" : "comments"}
            />
          </div>

          {pulse.lastActivityAt && (
            <p className="text-xs text-muted-foreground">
              Last activity{" "}
              <time dateTime={pulse.lastActivityAt}>{relativeTime(pulse.lastActivityAt)}</time> ago
            </p>
          )}

          {topTopics.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Discussion activity
              </p>
              <ul className="space-y-1">
                {topTopics.map((entry) => (
                  <li
                    key={entry.topic}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-foreground/85">{topicLabel(entry.topic)}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {entry.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            These counts describe resident discussion, not the condition or
            performance of {scope === "project" ? "this project" : "any project"}.
          </p>
        </>
      )}
    </div>
  )
}
