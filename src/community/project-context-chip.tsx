import { IconMapPin } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import type { ProjectReference } from "./community-contract"

/**
 * Marks that a resident related this discussion to an Official-source record.
 *
 * The chip signals a reference only. The discussion around it stays Resident
 * content, and the chip must never read as an official statement about the
 * project. Linking out to the map is where the official record is presented.
 */
export function ProjectContextChip({
  project,
  className,
}: {
  project: ProjectReference
  className?: string
}) {
  return (
    <a
      href={`/map?project=${encodeURIComponent(project.id)}`}
      className={cn(
        "group/project inline-flex max-w-full items-center gap-2 rounded-md border border-primary/30 bg-primary/10 py-1 pr-2.5 pl-2 text-xs transition-colors duration-150 outline-none hover:border-primary/50 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/60",
        className,
      )}
      title={`Discussion about the project record: ${project.name}`}
    >
      <IconMapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="shrink-0 font-semibold tracking-[0.08em] text-primary uppercase">
        Project
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span className="truncate text-foreground/90 group-hover/project:underline">
        {project.name}
      </span>
      <span className="sr-only">— discussion about this project record</span>
    </a>
  )
}
