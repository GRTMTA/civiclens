import type { ReactNode } from "react"
import { Dialog } from "radix-ui"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/45 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-[71] flex w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            size === "chooser"
              ? "max-h-[70dvh] max-w-[42rem] md:max-w-[48rem]"
              : "h-[82dvh] max-h-[54rem] max-w-[48rem] lg:h-[76dvh] lg:max-h-[52rem] lg:max-w-[72rem]",
          )}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <Dialog.Title className="font-heading text-base font-semibold tracking-[-0.01em]">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Close dialog">
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
