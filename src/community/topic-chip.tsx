import {
  IconBuilding,
  IconBuildingBridge,
  IconBuildingCommunity,
  IconBus,
  IconDroplet,
  IconMessages,
  IconRoad,
  IconTools,
  type Icon,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { topicLabel, type TopicId } from "./community-contract"

export const TOPIC_ICONS: Record<TopicId, Icon> = {
  infrastructure: IconTools,
  roads: IconRoad,
  bridges: IconBuildingBridge,
  "flood-control": IconDroplet,
  transportation: IconBus,
  "public-buildings": IconBuilding,
  "local-government": IconBuildingCommunity,
  other: IconMessages,
}

/**
 * Compact topic label for a discussion. Purely a category marker — it makes no
 * claim about an Official-source record.
 */
export function TopicChip({
  topic,
  className,
  asButton = false,
  onClick,
  active = false,
}: {
  topic: TopicId
  className?: string
  asButton?: boolean
  onClick?: () => void
  active?: boolean
}) {
  const TopicIcon = TOPIC_ICONS[topic]
  const content = (
    <>
      <TopicIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{topicLabel(topic)}</span>
    </>
  )

  const base =
    "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-secondary/60 px-2 py-1 text-xs font-medium text-foreground/85"

  if (!asButton) {
    return <span className={cn(base, className)}>{content}</span>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        base,
        "transition-colors duration-150 outline-none hover:border-border hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/60",
        active && "border-primary/60 bg-primary/15 text-foreground",
        className,
      )}
    >
      {content}
    </button>
  )
}
