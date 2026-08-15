import { type Icon } from "@tabler/icons-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

/** True when the current path is the destination or nested beneath it. */
function isActivePath(url: string, pathname: string): boolean {
  return pathname === url || pathname.startsWith(`${url}/`)
}

export function NavMain({
  items,
  currentPath = typeof window === "undefined" ? "" : window.location.pathname,
}: {
  items: {
    title: string
    url: string
    icon?: Icon
  }[]
  currentPath?: string
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActivePath(item.url, currentPath)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
                  <a href={item.url} aria-current={active ? "page" : undefined}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
