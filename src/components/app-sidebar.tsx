import * as React from "react"
import { useCallback, useEffect, useState } from "react"
import {
  IconHome,
  IconMapPin,
  IconInnerShadowTop,
  IconUsersGroup,
} from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import { NavUser, navUserFromViewer } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { getCommunitySource, type Viewer } from "@/community/community-data"

const data = {
  navMain: [
    {
      title: "Home",
      url: "/",
      icon: IconHome,
    },
    {
      title: "Community",
      url: "/community",
      icon: IconUsersGroup,
    },
    {
      title: "Explore Map",
      url: "/map",
      icon: IconMapPin,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [viewerReady, setViewerReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let source
    try {
      source = getCommunitySource()
    } catch {
      setViewerReady(true)
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
        if (!cancelled) setViewerReady(true)
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
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="/map">
                <IconInnerShadowTop className="size-5!" />
                <span className="text-base font-semibold">Source map</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={viewer ? navUserFromViewer(viewer) : null}
          ready={viewerReady}
          onSignOut={signOut}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
