import * as React from "react"
import { IconInfoCircle } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { CommunitySidebar } from "./community-sidebar"
import type { SortOption, TopicId } from "./community-contract"

/**
 * Prompt shown to residents browsing without an account.
 *
 * Discussion is readable anonymously, so this explains why the write controls
 * will not work rather than hiding the content behind a wall.
 */
function SignInNotice() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/60 px-3.5 py-2.5">
      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <IconInfoCircle className="mt-px size-4 shrink-0" aria-hidden="true" />
        <span>
          You are browsing as a guest. Sign in to post, comment, and vote.
        </span>
      </p>
      <Button size="sm" variant="outline" asChild>
        <a href="/login">Sign in</a>
      </Button>
    </div>
  )
}

/**
 * Shared frame for every community route.
 *
 * Built from the same `SidebarProvider` / `SidebarInset` primitives as the map
 * surface so navigation, collapse behaviour, and responsive layout match the
 * rest of the application shell. The dark blue surface is scoped here via
 * `.dark` rather than applied globally, leaving existing routes untouched.
 */
export function CommunityShell({
  headerTitle,
  breadcrumb,
  sort,
  onSortChange,
  topic,
  onTopicChange,
  showSignInNotice = false,
  children,
}: {
  headerTitle: string
  breadcrumb?: React.ReactNode
  sort: SortOption
  onSortChange: (sort: SortOption) => void
  topic: TopicId | null
  onTopicChange: (topic: TopicId | null) => void
  showSignInNotice?: boolean
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <div className="dark min-h-svh bg-background text-foreground">
        <SidebarProvider
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 62)",
              "--header-height": "calc(var(--spacing) * 12)",
            } as React.CSSProperties
          }
        >
          <CommunitySidebar
            variant="inset"
            sort={sort}
            onSortChange={onSortChange}
            topic={topic}
            onTopicChange={onTopicChange}
          />
          {/*
            `min-w-0` (not `overflow-x-hidden`) is what prevents horizontal
            overflow here: clipping one axis would compute the other to `auto`,
            turning this into a scroll container and breaking both the sticky
            header and the overflow menus inside post cards.
          */}
          <SidebarInset className="min-w-0">
            {/*
              The inset panel is offset and rounded on md+, so the sticky
              header matches that offset and radius instead of poking out of
              the panel's corners as it pins.
            */}
            <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/95 supports-backdrop-filter:backdrop-blur md:top-2 md:rounded-t-2xl">
              <div className="flex w-full min-w-0 items-center gap-1 px-3 lg:gap-2 lg:px-5">
                <SidebarTrigger className="-ml-1" />
                <Separator
                  orientation="vertical"
                  className="mx-1.5 data-[orientation=vertical]:h-4"
                />
                <h1 className="truncate text-sm font-medium">{headerTitle}</h1>
                {breadcrumb}
              </div>
            </header>

            <div className="mx-auto w-full max-w-[84rem] min-w-0 px-3 py-4 sm:px-5 sm:py-5">
              {showSignInNotice && (
                <div className="mb-3">
                  <SignInNotice />
                </div>
              )}
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </TooltipProvider>
  )
}
