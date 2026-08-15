import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Link2, MessageSquare, MoreHorizontal, Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function useCopyLink(url: string) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }, [url])

  return { copied, copy }
}

/** Overflow menu. Kept to a native details/summary disclosure — no new deps. */
function OverflowMenu({ label }: { label: string }) {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        ref.current.open = false
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false
      }
    }
    document.addEventListener("click", onDocumentClick)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("click", onDocumentClick)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  const itemClass =
    "w-full rounded-md px-2.5 py-1.5 text-left text-xs text-foreground/85 transition-colors duration-150 outline-none hover:bg-elevated focus-visible:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/60"

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={`More actions: ${label}`}
        className="inline-flex h-7 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 outline-none hover:bg-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">More</span>
      </summary>
      <div
        role="menu"
        className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg"
      >
        <button type="button" role="menuitem" className={itemClass}>
          Save discussion
        </button>
        <button type="button" role="menuitem" className={itemClass}>
          Follow updates
        </button>
        <button type="button" role="menuitem" className={itemClass}>
          Report to moderators
        </button>
      </div>
    </details>
  )
}

/**
 * Footer action row shared by the feed card and the post detail view.
 */
export function PostActions({
  postId,
  title,
  commentCount,
  className,
  commentsAsLink = true,
  onCommentsClick,
}: {
  postId: string
  title: string
  commentCount: number
  className?: string
  /** Feed cards link into the thread; the detail view focuses the composer. */
  commentsAsLink?: boolean
  onCommentsClick?: () => void
}) {
  const url = `${window.location.origin}/community/post/${postId}`
  const { copied, copy } = useCopyLink(url)

  const commentLabel = `${commentCount} ${commentCount === 1 ? "comment" : "comments"}`

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {commentsAsLink ? (
        <Button variant="ghost" size="sm" className="rounded-md text-muted-foreground" asChild>
          <a href={`/community/post/${postId}`} aria-label={`${commentLabel} on ${title}`}>
            <MessageSquare aria-hidden="true" />
            <span>{commentLabel}</span>
          </a>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="rounded-md text-muted-foreground"
          onClick={onCommentsClick}
          aria-label={`${commentLabel}. Jump to the reply composer.`}
        >
          <MessageSquare aria-hidden="true" />
          <span>{commentLabel}</span>
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="rounded-md text-muted-foreground"
        onClick={() => void copy()}
        aria-label={`Copy a link to ${title}`}
      >
        {copied ? (
          <Check className="text-positive" aria-hidden="true" />
        ) : (
          <Share2 aria-hidden="true" />
        )}
        <span>{copied ? "Link copied" : "Share"}</span>
      </Button>

      <OverflowMenu label={title} />

      {/* Announce the copy result without moving focus. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Discussion link copied to clipboard" : ""}
      </span>
    </div>
  )
}
