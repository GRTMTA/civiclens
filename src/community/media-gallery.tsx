import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

import { cn } from "@/lib/utils"
import type { MediaItem } from "./community-contract"

/**
 * Resident-supplied photos attached to a post or comment.
 *
 * Presented as supporting material contributed by a resident. It is never
 * labelled as evidence of a finding, and carries no verification language.
 */
export function MediaGallery({
  media,
  className,
  /** Comment media stays visually secondary to the text. */
  size = "default",
  label = "Resident photo",
}: {
  media: MediaItem[]
  className?: string
  size?: "sm" | "default"
  label?: string
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const lightbox = lightboxIndex === null ? null : media[lightboxIndex]

  const close = useCallback(() => setLightboxIndex(null), [])
  const move = useCallback(
    (direction: -1 | 1) => {
      setLightboxIndex((current) =>
        current === null ? null : (current + direction + media.length) % media.length,
      )
    },
    [media.length],
  )

  useEffect(() => {
    if (!lightbox) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
      if (event.key === "ArrowLeft" && media.length > 1) move(-1)
      if (event.key === "ArrowRight" && media.length > 1) move(1)
    }
    document.addEventListener("keydown", onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [close, lightbox, media.length, move])

  if (media.length === 0) return null

  const compact = size === "sm"
  const single = media.length === 1

  return (
    <>
      <ul
        className={cn(
          "grid overflow-hidden rounded-xl border border-border bg-black/90",
          single ? "grid-cols-1" : "grid-cols-2",
          !single && "gap-px",
          className,
        )}
      >
        {media.map((item, index) => (
          <li
            key={item.id}
            className={cn(
              "min-w-0 bg-secondary/40",
              !compact && media.length === 3 && index === 0 && "row-span-2",
            )}
          >
            <button
              type="button"
              onClick={() => setLightboxIndex(index)}
              aria-label={`${label} ${index + 1} of ${media.length} — open larger`}
              className="group/media block h-full w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <img
                src={item.url}
                alt=""
                loading="lazy"
                decoding="async"
                className={cn(
                  "w-full transition-transform duration-200 group-hover/media:scale-[1.015]",
                  compact
                    ? "h-28 object-cover"
                    : single
                      ? "max-h-[32rem] min-h-56 object-contain sm:min-h-72"
                      : media.length === 3 && index === 0
                        ? "h-full min-h-72 object-cover sm:min-h-96"
                        : "h-36 object-cover sm:h-48",
                )}
              />
            </button>
          </li>
        ))}
      </ul>

      {lightbox && lightboxIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${label} ${lightboxIndex + 1} of ${media.length}, enlarged`}
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <img
            src={lightbox.url}
            alt=""
            className="max-h-[88dvh] max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
          {media.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  move(-1)
                }}
                aria-label="Previous photo"
                className="absolute left-3 inline-flex size-10 items-center justify-center rounded-full bg-card/90 text-foreground outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  move(1)
                }}
                aria-label="Next photo"
                className="absolute right-3 inline-flex size-10 items-center justify-center rounded-full bg-card/90 text-foreground outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            </>
          )}
          <span className="absolute bottom-4 rounded-full bg-card/90 px-3 py-1 text-xs text-foreground tabular-nums">
            {lightboxIndex + 1} / {media.length}
          </span>
          <button
            type="button"
            onClick={close}
            autoFocus
            aria-label="Close photo"
            className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  )
}

/**
 * Pre-submission thumbnails for photos chosen in a composer.
 *
 * Shows upload progress and lets a resident remove a photo before posting.
 */
export function MediaPreviewList({
  files,
  onRemove,
  uploading = false,
  className,
}: {
  files: File[]
  onRemove: (index: number) => void
  uploading?: boolean
  className?: string
}) {
  const [urls, setUrls] = useState<string[]>([])

  // Object URLs must be revoked or the blobs leak for the page's lifetime.
  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file))
    setUrls(next)
    return () => next.forEach((url) => URL.revokeObjectURL(url))
  }, [files])

  if (files.length === 0) return null

  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {files.map((file, index) => (
        <li key={`${file.name}-${index}`} className="relative">
          <span className="block size-20 overflow-hidden rounded-lg border border-border bg-secondary/40">
            {urls[index] && (
              <img src={urls[index]} alt="" className="size-full object-cover" />
            )}
          </span>
          {uploading ? (
            <span
              className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70 text-[0.65rem] font-medium"
              role="status"
            >
              Uploading…
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${file.name}`}
              className="absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full border border-border bg-card text-foreground shadow outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
