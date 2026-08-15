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
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">Map</h1>
        <div className="ml-auto flex shrink-0 items-center">
          <AuthMenu viewer={viewer} ready={ready} onSignOut={signOut} />
        </div>
      </div>
    </header>
  )
}
