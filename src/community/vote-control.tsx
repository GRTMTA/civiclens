import { ArrowBigDown, ArrowBigUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatScore, type VoteState } from "./community-contract"

/**
 * Vote control for a post or comment.
 *
 * Selected state is carried by fill, colour, weight *and* `aria-pressed`, so it
 * never depends on colour alone.
 */
export function VoteControl({
  score,
  vote,
  onVote,
  label,
  orientation = "vertical",
  size = "default",
  canInteract = true,
  pending = false,
}: {
  score: number
  vote: VoteState
  onVote: (direction: 1 | -1) => void
  /** Names the thing being voted on, for assistive technology. */
  label: string
  orientation?: "vertical" | "horizontal"
  size?: "default" | "sm"
  /** False for guests: the controls explain themselves instead of failing. */
  canInteract?: boolean
  /** True while this post's vote RPC is settling; prevents overlapping toggles. */
  pending?: boolean
}) {
  const vertical = orientation === "vertical"
  const iconSize = size === "sm" ? "size-4" : "size-[1.15rem]"
  const buttonSize = size === "sm" ? "size-6" : "size-7"

  const buttonBase = cn(
    "inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 outline-none hover:bg-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-transparent",
    buttonSize,
  )
  const pendingLabel = `Saving vote: ${label}`
  const buttonTitle = pending ? "Saving vote…" : canInteract ? undefined : "Sign in to vote"

  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        "flex items-center",
        vertical ? "flex-col gap-0.5" : "gap-1",
      )}
    >
      <button
        type="button"
        disabled={pending}
        aria-pressed={vote === 1}
        aria-label={pending ? pendingLabel : canInteract ? `Upvote: ${label}` : `Sign in to upvote: ${label}`}
        title={buttonTitle}
        onClick={() => onVote(1)}
        className={cn(buttonBase, vote === 1 && "text-primary hover:text-primary")}
      >
        <ArrowBigUp
          className={cn(iconSize, vote === 1 && "fill-current")}
          aria-hidden="true"
        />
      </button>
      <span
        className={cn(
          "text-center text-xs font-semibold tabular-nums",
          size === "sm" ? "min-w-6" : "min-w-8",
          vote === 1 ? "text-primary" : vote === -1 ? "text-destructive" : "text-foreground/85",
        )}
      >
        {formatScore(score)}
        <span className="sr-only">
          {" "}
          points{vote === 1 ? ", you upvoted" : vote === -1 ? ", you downvoted" : ""}
        </span>
      </span>
      <button
        type="button"
        disabled={pending}
        aria-pressed={vote === -1}
        aria-label={pending ? pendingLabel : canInteract ? `Downvote: ${label}` : `Sign in to downvote: ${label}`}
        title={buttonTitle}
        onClick={() => onVote(-1)}
        className={cn(buttonBase, vote === -1 && "text-destructive hover:text-destructive")}
      >
        <ArrowBigDown
          className={cn(iconSize, vote === -1 && "fill-current")}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
