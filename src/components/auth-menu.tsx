import { useEffect, useRef, useState } from "react"
import { ChevronDown, LogOut, Settings, UserCog, UserRound } from "lucide-react"

import { Avatar } from "@/components/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Viewer } from "@/community/community-data"

/**
 * Persistent authentication control for the application header.
 *
 * This is the single canonical sign-in call to action: a guest sees one
 * `Sign in`, and a signed-in resident sees their identity. Surfaces must not add
 * their own sign-in buttons — write controls route guests into this same flow.
 */
export function AuthMenu({
  viewer,
  ready,
  loginPath = "/login",
  onSignIn,
  onSignOut,
}: {
  viewer: Viewer | null
  /** Until the session resolves, neither state is asserted. */
  ready: boolean
  loginPath?: string
  onSignIn?: () => void
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Dismiss on outside click or Escape, returning focus to the trigger so the
  // menu is fully operable from the keyboard.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  if (!ready) {
    // A placeholder of the same size keeps the header from shifting once the
    // session resolves.
    return <div className="h-8 w-20" aria-hidden="true" />
  }

  if (!viewer) {
    return (
      <Button size="sm" onClick={onSignIn} asChild={!onSignIn}>
        {onSignIn ? <span>Sign in</span> : <a href={loginPath}>Sign in</a>}
      </Button>
    )
  }

  const profilePath = viewer.username ? `/community/profile/${viewer.username}` : "/community"
  const itemClass =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground/85 transition-colors duration-150 outline-none hover:bg-elevated focus-visible:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/60"

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex max-w-[13rem] items-center gap-2 rounded-full border border-border bg-secondary/60 py-1 pr-2 pl-1 text-sm transition-colors duration-150 outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/60",
          open && "bg-elevated",
        )}
      >
        <Avatar name={viewer.name} url={viewer.avatarUrl} size="sm" />
        <span className="hidden truncate font-medium sm:inline">{viewer.name}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
        <span className="sr-only">Your account menu</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-1.5 w-56 rounded-lg border border-border bg-popover p-1 shadow-xl"
        >
          <div className="border-b border-border px-2.5 py-2">
            <p className="truncate text-sm font-medium">{viewer.name}</p>
            {viewer.username && (
              <p className="truncate text-xs text-muted-foreground">@{viewer.username}</p>
            )}
          </div>

          <a role="menuitem" href={profilePath} className={cn(itemClass, "mt-1")}>
            <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
            View profile
          </a>
          <a role="menuitem" href={`${profilePath}?edit=1`} className={itemClass}>
            <UserCog className="size-4 text-muted-foreground" aria-hidden="true" />
            Edit profile
          </a>
          <a role="menuitem" href={`${profilePath}?edit=1#account`} className={itemClass}>
            <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
            Account settings
          </a>

          <div className="my-1 border-t border-border" />

          <button role="menuitem" type="button" onClick={onSignOut} className={itemClass}>
            <LogOut className="size-4 text-muted-foreground" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
