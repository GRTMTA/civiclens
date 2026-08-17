import type { ReactNode } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function MapDialog({
  open,
  onOpenChange,
  title,
  description,
  size,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  size: "chooser" | "project"
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[70] bg-black/45"
        className={cn(
          "dark z-[71] flex w-[calc(100%-1.5rem)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl ring-0 duration-150",
          size === "chooser"
            ? "max-h-[70dvh] max-w-[42rem] sm:max-w-[42rem] md:max-w-[48rem]"
            : "h-[82dvh] max-h-[54rem] max-w-[48rem] sm:max-w-[48rem] lg:h-[76dvh] lg:max-h-[52rem] lg:max-w-[72rem]",
        )}
      >
        <DialogHeader className="flex-row items-start justify-between gap-4 border-b border-border px-4 py-3.5 text-left sm:px-5 sm:py-4">
          <div className="min-w-0">
            <DialogTitle className="font-heading text-base font-semibold tracking-[-0.01em]">
              {title}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </DialogDescription>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogClose asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label="Close dialog"
                  >
                    <X aria-hidden="true" />
                  </Button>
                </DialogClose>
              </TooltipTrigger>
              <TooltipContent className="dark z-[72]" side="left" sideOffset={6}>
                Close dialog
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
