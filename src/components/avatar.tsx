import { cn } from "@/lib/utils"
import { initialsFor } from "@/community/community-contract"

/**
 * Resident avatar with an initials fallback.
 *
 * The image is decorative next to an accessible name, so it carries empty alt
 * text; callers are expected to render the resident's name alongside it or to
 * pass an explicit label when the avatar stands alone.
 */
export function Avatar({
  name,
  url,
  size = "default",
  className,
  label,
}: {
  name: string
  url: string | null
  size?: "sm" | "default" | "lg" | "xl"
  className?: string
  /** Set when the avatar is the only thing naming the resident. */
  label?: string
}) {
  const dimension =
    size === "sm" ? "size-6" : size === "lg" ? "size-12" : size === "xl" ? "size-20" : "size-8"
  const text =
    size === "sm"
      ? "text-[0.6rem]"
      : size === "lg"
        ? "text-sm"
        : size === "xl"
          ? "text-xl"
          : "text-[0.7rem]"

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary font-semibold text-foreground/80 select-none",
        dimension,
        text,
        className,
      )}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
      ) : (
        initialsFor(name)
      )}
    </span>
  )
}
