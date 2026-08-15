import { useEffect, useState } from "react"
import { IconCamera, IconEye, IconMessages } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  relativeTime,
  type CommunityPulse,
  type ProjectActivityItem,
} from "@/community/community-contract"
import { CommunityPulsePanel } from "@/community/community-pulse"
import { getCommunitySource } from "@/community/community-data"
import { projectDiscussionPath } from "@/community/community-routes"
import { ProjectTimeline } from "./project-timeline"
import type { ProjectDetail } from "./map-contract"

/**
 * Community context for one Official-source record.
 *
 * This is the map side of the CivicLens relationship: the official record is
 * presented above, and this section adds what residents have discussed and
 * observed around it. The separation is explicit — resident content never
 * appears as part of, or as a verification of, the official record.
 */
export function ProjectCommunityContext({ detail }: { detail: ProjectDetail }) {
  const projectId = detail.id
  const [pulse, setPulse] = useState<CommunityPulse | null>(null)
  const [activity, setActivity] = useState<ProjectActivityItem[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let cancelled = false
    setState("loading")
    let source
    try {
      source = getCommunitySource()
    } catch {
      setState("error")
      return
    }
    Promise.all([source.getPulse(projectId), source.getProjectActivity(projectId, 4)])
      .then(([nextPulse, nextActivity]) => {
        if (cancelled) return
        setPulse(nextPulse)
        setActivity(nextActivity)
        setState("ready")
      })
      .catch(() => {
        if (!cancelled) setState("error")
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  // Community context is additive: if it cannot load, the official record on
  // this panel is unaffected and no error is forced on the reader.
  if (state === "error") return null

  return (
    <section aria-labelledby="community-context-heading" className="space-y-3">
      <div>
        <h3 id="community-context-heading" className="font-heading text-sm font-semibold">
          Community context
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Resident discussion and observations about this record. Not part of the official
          record, and not a verification of it.
        </p>
      </div>

      {state === "loading" ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Community Pulse
            </p>
            <CommunityPulsePanel pulse={pulse} scope="project" className="mt-2.5" />
          </div>

          {activity.length > 0 && (
            <div className="space-y-2">
              <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Latest activity
              </p>
              <ul className="space-y-2">
                {activity.map((item) => (
                  <li key={item.postId} className="rounded-lg border bg-muted/20 p-3">
                    <p className="flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                      {item.kind === "observation" ? (
                        <>
                          <IconEye className="size-3.5 shrink-0" aria-hidden="true" />
                          Resident observation
                        </>
                      ) : (
                        <>
                          <IconMessages className="size-3.5 shrink-0" aria-hidden="true" />
                          Discussion
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{item.authorName}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
                      {item.photoCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            <IconCamera className="size-3.5 shrink-0" aria-hidden="true" />
                            {item.photoCount}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="mt-1.5 text-sm leading-6">{item.title}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button variant="outline" size="sm" asChild>
            <a href={projectDiscussionPath(projectId)}>
              {activity.length > 0
                ? "Open community discussion"
                : "Start a community discussion"}
            </a>
          </Button>

          <ProjectTimeline detail={detail} activity={activity} className="border-t pt-4" />
        </>
      )}
    </section>
  )
}
