import {
  IconClock,
  IconFlame,
  IconHome,
  IconMapPin,
  IconMessages,
  IconUsersGroup,
  type Icon,
} from "@tabler/icons-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { listTopics, type SortOption, type TopicId } from "./community-contract"
import { TOPIC_ICONS } from "./topic-chip"

const MAIN_LINKS: { title: string; url: string; icon: Icon }[] = [
  { title: "Home", url: "/", icon: IconHome },
  { title: "Community", url: "/community", icon: IconUsersGroup },
  { title: "Explore Map", url: "/map", icon: IconMapPin },
]

const FEED_LINKS: { title: string; sort: SortOption; icon: Icon }[] = [
  { title: "Popular", sort: "popular", icon: IconFlame },
  { title: "New", sort: "new", icon: IconClock },
  { title: "Discussed", sort: "discussed", icon: IconMessages },
]

/**
 * Left navigation for the community experience.
 *
 * Reuses the shared `Sidebar` primitives so it collapses into the same drawer
 * on small screens as the rest of the application shell.
 */
export function CommunitySidebar({
  sort,
  onSortChange,
  topic,
  onTopicChange,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  sort: SortOption
  onSortChange: (sort: SortOption) => void
  topic: TopicId | null
  onTopicChange: (topic: TopicId | null) => void
}) {
  const topics = listTopics().filter((item) => item.id !== "other")
  const { isMobile, setOpenMobile } = useSidebar()

  // On mobile the sidebar is a drawer over the feed, so close it after a
  // filter is chosen — otherwise the result of the tap stays hidden behind it.
  const dismissOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <a href="/community">
                <IconUsersGroup className="size-5!" />
                <span className="text-base font-semibold">CivicLens</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MAIN_LINKS.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={item.url === "/community"}
                  >
                    <a
                      href={item.url}
                      aria-current={item.url === "/community" ? "page" : undefined}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Community</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {FEED_LINKS.map((item) => (
                <SidebarMenuItem key={item.sort}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={sort === item.sort}
                    aria-pressed={sort === item.sort}
                    onClick={() => {
                      onSortChange(item.sort)
                      dismissOnMobile()
                    }}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Topics</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {topics.map((item) => {
                const TopicIcon = TOPIC_ICONS[item.id]
                const active = topic === item.id
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      isActive={active}
                      aria-pressed={active}
                      onClick={() => {
                        onTopicChange(active ? null : item.id)
                        dismissOnMobile()
                      }}
                    >
                      <TopicIcon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="text-sidebar-foreground/70">
              <span className="truncate">Resident discussion</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
