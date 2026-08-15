import { IconCamera, IconEye, IconFileText, IconMessages } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { relativeTime, type ProjectActivityItem } from "@/community/community-contract"
import type { ProjectDetail } from "./map-contract"

type TimelineEntry = {
  key: string
  /** Official events come from the source record; community events do not. */
  origin: "official" | "community"
  label: string
  detail: string
  at: string | null
}

function officialDate(value?: string): string {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? ""
    : date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
}

/**
 * Builds a single chronological list from official record dates and community
 * activity, keeping the origin of every entry attached to it.
 */
function buildTimeline(
  detail: ProjectDetail,
  activity: ProjectActivityItem[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  if (detail.startDate) {
    entries.push({
      key: "official-start",
      origin: "official",
      label: "Construction start",
      detail: officialDate(detail.startDate),
      at: detail.startDate,
    })
  }
  if (detail.completionDate) {
    entries.push({
      key: "official-completion",
      origin: "official",
      label: "Recorded completion date",
      detail: officialDate(detail.completionDate),
      at: detail.completionDate,
    })
  }

  for (const item of activity) {
    entries.push({
      key: `community-${item.postId}`,
      origin: "community",
      label:
        item.kind === "observation"
          ? item.photoCount > 0
            ? "Resident observation with photos"
            : "Resident observation"
          : "Community discussion",
      detail: item.title,
      at: item.createdAt,
    })
  }

  return entries.sort((a, b) => {
    const left = a.at ? new Date(a.at).valueOf() : 0
    const right = b.at ? new Date(b.at).valueOf() : 0
    return left - right
  })
}

/**
 * Chronology of an Official-source record alongside community activity.
 *
 * Official events and resident activity are visually distinguished by icon,
 * colour, *and* an explicit origin label, so the distinction never depends on
 * colour alone. The timeline is contextual, not investigative: community
 * entries neither verify nor invalidate the official record, and the closing
 * note says so.
 */
export function ProjectTimeline({
  detail,
  activity,
  className,
}: {
  detail: ProjectDetail
  activity: ProjectActivityItem[]
  className?: string
}) {
  const entries = buildTimeline(detail, activity)

  // With no official dates and no community activity there is no chronology to
  // show, and an empty rail would only add noise.
  if (entries.length === 0) return null

  return (
    <section aria-labelledby="project-timeline-heading" className={cn("space-y-3", className)}>
      <div>
        <h3 id="project-timeline-heading" className="font-heading text-sm font-semibold">
          Project timeline
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Official record dates and community activity, in order.
        </p>
      </div>

      <ol className="space-y-3 border-l pl-4">
        {entries.map((entry) => {
          const official = entry.origin === "official"
          const Icon = official
            ? IconFileText
            : entry.label.includes("photos")
              ? IconCamera
              : entry.label.startsWith("Resident")
                ? IconEye
                : IconMessages

          return (
            <li key={entry.key} className="relative">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1 -left-[1.4rem] flex size-4 items-center justify-center rounded-full border",
                  official
                    ? "border-primary/50 bg-primary/20"
                    : "border-warning/45 bg-warning/15",
                )}
              />
              <p className="flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                <Icon
                  className={cn("size-3.5 shrink-0", official ? "text-primary" : "text-warning")}
                  aria-hidden="true"
                />
                {/* Origin is stated in text, not implied by colour. */}
                <span className={cn("font-semibold uppercase tracking-[0.06em]", official ? "text-primary" : "text-warning")}>
                  {official ? "Official record" : "Community"}
                </span>
                <span aria-hidden="true">·</span>
                <span>{entry.label}</span>
                {!official && entry.at && (
                  <>
                    <span aria-hidden="true">·</span>
                    <time dateTime={entry.at}>{relativeTime(entry.at)}</time>
                  </>
                )}
              </p>
              <p className="mt-1 text-sm leading-6">{entry.detail}</p>
            </li>
          )
        })}
      </ol>

      <p className="text-xs leading-5 text-muted-foreground">
        Community entries are resident contributions shown for context. They do not verify or
        invalidate the official record.
      </p>
    </section>
  )
}
