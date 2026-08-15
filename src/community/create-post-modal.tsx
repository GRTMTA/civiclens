import { useEffect, useId, useMemo, useState } from "react"
import { Dialog } from "radix-ui"
import { Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  listTopics,
  POST_BODY_MAX,
  POST_TITLE_MAX,
  validateNewPost,
  type NewPostInput,
  type ProjectReference,
  type TopicId,
} from "./community-contract"
import { getCommunitySource } from "./community-data"
import { TOPIC_ICONS } from "./topic-chip"

const fieldLabelClass = "text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase"

const textFieldClass =
  "w-full rounded-lg border border-border bg-input/60 px-3 py-2 text-sm text-foreground transition-colors duration-150 outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"

/**
 * Composer for a new community discussion.
 *
 * Related project is deliberately optional: most discussion is not about one
 * specific Official-source record, and forcing a selection would imply a
 * connection the resident has not made.
 */
export function CreatePostModal({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: NewPostInput) => Promise<unknown>
}) {
  const fieldId = useId()
  const titleId = `${fieldId}-title`
  const bodyId = `${fieldId}-body`
  const topicId = `${fieldId}-topic`
  const projectId = `${fieldId}-project`
  const errorId = `${fieldId}-error`

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [topic, setTopic] = useState<TopicId>("infrastructure")
  const [relatedProjectId, setRelatedProjectId] = useState("")
  const [projects, setProjects] = useState<ProjectReference[]>([])
  const [projectsState, setProjectsState] = useState<"loading" | "ready" | "error">("loading")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const topics = useMemo(() => listTopics(), [])

  useEffect(() => {
    if (!open) return
    setTitle("")
    setBody("")
    setTopic("infrastructure")
    setRelatedProjectId("")
    setError(null)
    setSubmitting(false)
    setProjectsState("loading")
    let cancelled = false
    // A failure here must not block posting: the project link is optional, so
    // the selector degrades to "no related project" rather than erroring.
    try {
      getCommunitySource()
        .searchProjects("")
        .then((next) => {
          if (cancelled) return
          setProjects(next)
          setProjectsState("ready")
        })
        .catch(() => {
          if (cancelled) return
          setProjects([])
          setProjectsState("error")
        })
    } catch {
      setProjects([])
      setProjectsState("error")
    }
    return () => {
      cancelled = true
    }
  }, [open])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input: NewPostInput = {
      title,
      body,
      topic,
      projectId: relatedProjectId || null,
    }
    const invalid = validateNewPost(input)
    if (invalid) {
      setError(invalid.message)
      document.getElementById(invalid.field === "title" ? titleId : bodyId)?.focus()
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit(input)
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your post could not be published.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.1_0.02_256_/_0.72)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content
          aria-describedby={`${fieldId}-description`}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-[-0.01em]">
                Start a community discussion
              </Dialog.Title>
              <Dialog.Description
                id={`${fieldId}-description`}
                className="mt-1 text-xs leading-5 text-muted-foreground"
              >
                Posts are resident discussion, not official records. Share what you observed or
                what you would like to understand better.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close composer">
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="space-y-1.5">
                <label htmlFor={titleId} className={fieldLabelClass}>
                  Title
                </label>
                <input
                  id={titleId}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={POST_TITLE_MAX}
                  required
                  autoComplete="off"
                  placeholder="What would you like the community to discuss?"
                  aria-describedby={error ? errorId : undefined}
                  className={cn(textFieldClass, "h-10")}
                />
                <p className="text-right text-[0.7rem] text-muted-foreground tabular-nums">
                  {title.trim().length}/{POST_TITLE_MAX}
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={bodyId} className={fieldLabelClass}>
                  Body
                </label>
                <textarea
                  id={bodyId}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={POST_BODY_MAX}
                  rows={6}
                  placeholder="Share what you observed, what you're wondering about, or what you'd like to discuss..."
                  className={cn(textFieldClass, "resize-y leading-6")}
                />
              </div>

              <fieldset className="space-y-2">
                <legend className={fieldLabelClass} id={topicId}>
                  Topic
                </legend>
                {/*
                  Toggle buttons instead of `radiogroup`/`radio`: those roles
                  commit to single-arrow-key traversal with one tab stop, while
                  these remain individually tabbable.
                */}
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((item) => {
                    const TopicIcon = TOPIC_ICONS[item.id]
                    const active = topic === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setTopic(item.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/60",
                          active
                            ? "border-primary/60 bg-primary/15 text-foreground"
                            : "text-foreground/80",
                        )}
                      >
                        <TopicIcon
                          className={cn(
                            "size-3.5",
                            active ? "text-primary" : "text-muted-foreground",
                          )}
                          aria-hidden="true"
                        />
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <div className="space-y-1.5">
                <label htmlFor={projectId} className={fieldLabelClass}>
                  Related project (optional)
                </label>
                <select
                  id={projectId}
                  value={relatedProjectId}
                  onChange={(event) => setRelatedProjectId(event.target.value)}
                  disabled={projectsState === "loading"}
                  className={cn(textFieldClass, "h-10 appearance-none pr-8")}
                >
                  <option value="">
                    {projectsState === "loading" ? "Loading projects…" : "No related project"}
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-muted-foreground">
                  {projectsState === "error"
                    ? "Project records could not be loaded, so this post will not reference one."
                    : projectsState === "ready" && projects.length === 0
                      ? "No official project records are available to reference yet."
                      : "Linking a project marks this as a discussion about that record. It does not add your post to the official record."}
                </p>
              </div>

              {error && (
                <p id={errorId} role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/40 px-5 py-3.5">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="lg" disabled={submitting}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" size="lg" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
                {submitting ? "Posting…" : "Post"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
