"use client"

import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
  IconNotification,
  IconUserCircle,
} from "@tabler/icons-react"

import { Avatar } from "@/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { Viewer } from "@/community/community-data"

export type NavUserData = {
  name: string
  email: string
  avatar: string
  profilePath?: string
}

export function NavUser({
  user,
  ready = true,
  onSignIn,
  onSignOut,
}: {
  user: NavUserData | null
  ready?: boolean
  onSignIn?: () => void
  onSignOut?: () => void
}) {
  const { isMobile } = useSidebar()

  if (!ready) {
    return <div className="h-12 w-full animate-pulse rounded-xl bg-sidebar-accent/50" aria-hidden="true" />
  }

  if (!user) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild={!onSignIn} onClick={onSignIn}>
            {onSignIn ? (
              <span>Sign in</span>
            ) : (
              <a href="/login">Sign in</a>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  const profilePath = user.profilePath ?? "/community"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip="Account"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar
                name={user.name}
                url={user.avatar || null}
                size="default"
                className="rounded-lg grayscale"
              />
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <IconDotsVertical className="ml-auto size-4" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar
                  name={user.name}
                  url={user.avatar || null}
                  size="default"
                  className="rounded-lg"
                />
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href={`${profilePath}?edit=1#account`}>
                  <IconUserCircle />
                  Account
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconCreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconNotification />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onSignOut?.()}>
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function navUserFromViewer(viewer: Viewer): NavUserData {
  return {
    name: viewer.name,
    email: viewer.email || (viewer.username ? `@${viewer.username}` : "Signed-in resident"),
    avatar: viewer.avatarUrl ?? "",
    profilePath: viewer.username ? `/community/profile/${viewer.username}` : "/community",
  }
}
