import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/95 supports-backdrop-filter:backdrop-blur md:top-2 md:rounded-t-2xl">
      <div className="flex w-full min-w-0 items-center gap-1 px-3 lg:gap-2 lg:px-5">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-1.5 data-[orientation=vertical]:h-4"
        />
        <h1 className="truncate text-sm font-medium">Explore Map</h1>
      </div>
    </header>
  )
}
