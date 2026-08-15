import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"

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
  const [lightbox, setLightbox] = useState<MediaItem | null>(null)

  const close = useCallback(() => setLightbox(null), [])

  useEffect(() => {
    if (!lightbox) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("keydown", onKeyDown)
    // Prevent the page behind the lightbox from scrolling under it.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [close, lightbox])

  if (media.length === 0) return null

  const single = media.length === 1
  const height = size === "sm" ? "h-28" : single ? "h-56 sm:h-72" : "h-32 sm:h-40"

  return (
    <>
      <ul
        className={cn(
          "grid gap-2",
          single ? "grid-cols-1" : media.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3",
          className,
        )}
      >
        {media.map((item, index) => (
          <li key={item.id} className="min-w-0">
            <button
              type="button"
              onClick={() => setLightbox(item)}
              aria-label={`${label} ${index + 1} of ${media.length} — open larger`}
              className="group/media block w-full overflow-hidden rounded-lg border border-border bg-secondary/40 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <img
                src={item.url}
                alt=""
                loading="lazy"
                decoding="async"
                className={cn(
                  "w-full object-cover transition-transform duration-200 group-hover/media:scale-[1.02]",
                  height,
                )}
              />
            </button>
          </li>
        ))}
      </ul>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${label}, enlarged`}
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(0.1_0.02_256_/_0.88)] p-4"
        >
          <img
            src={lightbox.url}
            alt=""
            className="max-h-[88dvh] max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            onClick={close}
            autoFocus
            aria-label="Close photo"
            className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/60"
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
