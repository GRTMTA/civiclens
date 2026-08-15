import { IconEye, IconMapPin } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import type { PostKind } from "./community-contract"

/**
 * Marks a post as a resident's dated account of something they saw.
 *
 * Deliberately neutral: an observation is supporting material contributed by a
 * resident, never a verified finding, an official report, or a confirmed
 * statement about a project's condition. The wording here must not drift toward
 * "verified", "confirmed", or "official".
 */
export function PostKindBadge({ kind, className }: { kind: PostKind; className?: string }) {
  if (kind !== "observation") return null

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-warning/35 bg-warning/10 px-2 py-1 text-[0.7rem] font-semibold tracking-[0.06em] text-warning uppercase",
        className,
      )}
    >
      <IconEye className="size-3.5 shrink-0" aria-hidden="true" />
      Resident observation
    </span>
  )
}

/**
 * Approximate area a resident gave for an observation.
 *
 * CivicLens publishes an approximate area only — never a precise capture point.
 */
export function AreaLabel({ area, className }: { area: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <IconMapPin className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Approximate area: <span className="text-foreground/80">{area}</span>
      </span>
    </p>
  )
}
