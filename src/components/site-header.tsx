import { useCallback, useEffect, useState } from "react"

import { AuthMenu } from "@/components/auth-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { getCommunitySource, type Viewer } from "@/community/community-data"

/**
 * Header for the map surface.
 *
 * Carries the same `AuthMenu` as the community shell so a resident can always
 * tell whether they are signed in, and can reach their profile and account
 * controls, from anywhere in the application rather than only from Community.
 */
export function SiteHeader() {
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let source
    try {
      source = getCommunitySource()
    } catch {
      // Without Supabase configuration there is no session to report; the map
      // itself surfaces the configuration problem.
      setReady(true)
      return
    }
    source
      .getViewer()
      .then((next) => {
        if (!cancelled) setViewer(next)
      })
      .catch(() => {
        if (!cancelled) setViewer(null)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signOut = useCallback(() => {
    try {
      void getCommunitySource()
        .signOut()
        .finally(() => window.location.reload())
    } catch {
      window.location.reload()
    }
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/95 supports-backdrop-filter:backdrop-blur md:top-2 md:rounded-t-2xl">
      <div className="flex w-full min-w-0 items-center gap-1 px-3 lg:gap-2 lg:px-5">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-1.5 data-[orientation=vertical]:h-4"
        />
        <h1 className="truncate text-sm font-medium">Explore Map</h1>
        <h1 className="text-base font-medium">Map</h1>
        <div className="ml-auto flex shrink-0 items-center">
          <AuthMenu viewer={viewer} ready={ready} onSignOut={signOut} />
        </div>
      </div>
    </header>
  )
}
