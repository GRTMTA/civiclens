import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ProjectMapSurface } from "./map/project-map"

export function Dashboard01Page() {
  return (
    <TooltipProvider>
      <div className="dark min-h-svh bg-background text-foreground">
        <SidebarProvider
          className="lg:h-svh lg:overflow-hidden"
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 62)",
              "--header-height": "calc(var(--spacing) * 12)",
            } as React.CSSProperties
          }
        >
          <AppSidebar variant="inset" />
          <SidebarInset>
            <SiteHeader />
            <div className="flex min-h-0 flex-1 flex-col">
              <ProjectMapSurface />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </TooltipProvider>
  )
}
