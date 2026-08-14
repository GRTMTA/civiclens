"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, SpinnerIcon } from "@phosphor-icons/react"

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false
    return window.matchMedia("(max-width: 767px)").matches
  })

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mediaQuery = window.matchMedia("(max-width: 767px)")
    const update = () => setIsMobile(mediaQuery.matches)
    update()
    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return isMobile
}

const Toaster = ({ position, offset, mobileOffset, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const isMobile = useIsMobile()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={position ?? (isMobile ? "bottom-center" : "top-right")}
      offset={offset ?? { top: "4.5rem", right: "1rem" }}
      mobileOffset={
        mobileOffset ?? {
          top: "1rem",
          right: "1rem",
          bottom: "4.5rem",
          left: "1rem",
        }
      }
      className="toaster group"
      icons={{
        success: (
          <CheckCircleIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
        ),
        info: (
          <InfoIcon className="size-4 text-primary" />
        ),
        warning: (
          <WarningIcon className="size-4 text-amber-600 dark:text-amber-400" />
        ),
        error: (
          <XCircleIcon className="size-4 text-destructive" />
        ),
        loading: (
          <SpinnerIcon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast w-[min(400px,calc(100vw-2rem))] rounded-xl border bg-popover text-popover-foreground shadow-lg",
          title: "text-sm font-medium text-popover-foreground",
          description: "text-xs text-foreground/80",
          actionButton: "bg-primary text-primary-foreground hover:bg-primary/90",
          cancelButton: "bg-muted text-muted-foreground hover:bg-muted/80",
          success: "border-emerald-500/40",
          info: "border-primary/30",
          warning: "border-amber-500/60",
          error: "border-destructive/50",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
