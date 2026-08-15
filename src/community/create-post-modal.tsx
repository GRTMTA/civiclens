import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Dialog } from "radix-ui"
import { ImagePlus, Loader2, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ACCEPTED_IMAGE_TYPES,
  AREA_LABEL_MAX,
  listTopics,
  POST_BODY_MAX,
  POST_KINDS,
  POST_PHOTO_MAX,
  POST_TITLE_MAX,
  validateImage,
  validateNewPost,
  type NewPostInput,
  type PostKind,
  type ProjectReference,
  type TopicId,
} from "./community-contract"
import { getCommunitySource } from "./community-data"
import { MediaPreviewList } from "./media-gallery"
import { TOPIC_ICONS } from "./topic-chip"

const fieldLabelClass = "text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase"

const textFieldClass =
  "w-full rounded-lg border border-border bg-input/60 px-3 py-2 text-sm text-foreground transition-colors duration-150 outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"

const KIND_COPY: Record<PostKind, { label: string; hint: string }> = {
  discussion: {
    label: "Discussion",
    hint: "A question, local knowledge, or something you want to understand better.",
  },
  observation: {
    label: "Resident observation",
    hint: "Something you personally saw. Shared as a resident account, not a verified finding.",
  },
}

/**
 * Composer for new community content.
 *
 * Two intents only — discussion and resident observation — which is the
 * CivicLens-specific distinction. Related project stays optional: most
 * discussion is not about one specific Official-source record, and forcing a
 * selection would imply a connection the resident has not made.
 *
 * `.dark` is applied to the portal content because Radix renders it into
 * `document.body`, outside the shell's `.dark` wrapper. Without it the modal
 * falls back to the light `:root` tokens and appears white.
 */
export function CreatePostModal({
  open,
  onOpenChange,
  onSubmit,
  defaultProjectId = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: NewPostInput) => Promise<unknown>
  /** Pre-selects a project, e.g. when posting from a project context. */
  defaultProjectId?: string | null
}) {
  const fieldId = useId()
  const titleId = `${fieldId}-title`
  const bodyId = `${fieldId}-body`
  const areaId = `${fieldId}-area`
  const projectId = `${fieldId}-project`
  const projectSearchId = `${fieldId}-project-search`
  const errorId = `${fieldId}-error`

  const [kind, setKind] = useState<PostKind>("discussion")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [topic, setTopic] = useState<TopicId>("infrastructure")
  const [areaLabel, setAreaLabel] = useState("")
  const [relatedProjectId, setRelatedProjectId] = useState("")
  const [projectSearch, setProjectSearch] = useState("")
  const [projects, setProjects] = useState<ProjectReference[]>([])
  const [projectsState, setProjectsState] = useState<"loading" | "ready" | "error">("loading")
  const [photos, setPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const topics = useMemo(() => listTopics(), [])

  useEffect(() => {
    if (!open) return
    setKind("discussion")
    setTitle("")
    setBody("")
    setTopic("infrastructure")
    setAreaLabel("")
    setRelatedProjectId(defaultProjectId ?? "")
    setProjectSearch("")
    setPhotos([])
    setError(null)
    setSubmitting(false)
  }, [defaultProjectId, open])

  // Project options are searched server-side so a large dataset is not fetched
  // in full. A failure here must not block posting: the link is optional, so the
  // selector degrades to "no related project".
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setProjectsState("loading")
    const timer = window.setTimeout(() => {
      try {
        getCommunitySource()
          .searchProjects(projectSearch)
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
    }, projectSearch ? 200 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, projectSearch])

  const addPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const chosen = Array.from(files)
    const room = POST_PHOTO_MAX - photos.length
    if (room <= 0) {
      setError(`You can attach up to ${POST_PHOTO_MAX} photos.`)
      return
    }
    const accepted: File[] = []
    for (const file of chosen.slice(0, room)) {
      const invalid = validateImage(file)
      if (invalid) {
        setError(invalid)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length > 0) {
      setPhotos((current) => [...current, ...accepted])
      setError(null)
    }
    // Reset so choosing the same file again still fires a change event.
    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input: NewPostInput = {
      kind,
      title,
      body,
      topic,
      projectId: relatedProjectId || null,
      areaLabel: areaLabel.trim() || null,
      photos,
    }
    const invalid = validateNewPost(input)
    if (invalid) {
      setError(invalid.message)
      const target =
        invalid.field === "title" ? titleId : invalid.field === "area" ? areaId : bodyId
      document.getElementById(target)?.focus()
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
        {/*
          `dark` here, not on a parent: Radix portals to document.body, so the
          shell's `.dark` wrapper does not apply and the modal would otherwise
          render with the light palette.
        */}
        <Dialog.Overlay className="dark fixed inset-0 z-50 bg-[oklch(0.1_0.02_256_/_0.72)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content
          aria-describedby={`${fieldId}-description`}
          className="dark fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
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
              {/* TYPE — the CivicLens post intent. */}
              <fieldset className="space-y-2">
                <legend className={fieldLabelClass}>Type</legend>
                <div className="flex flex-wrap gap-1.5">
                  {POST_KINDS.map((option) => {
                    const active = kind === option
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setKind(option)}
                        className={cn(
                          "rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium transition-colors duration-150 outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/60",
                          active
                            ? "border-primary/60 bg-primary/15 text-foreground"
                            : "text-foreground/80",
                        )}
                      >
                        {KIND_COPY[option].label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{KIND_COPY[kind].hint}</p>
              </fieldset>

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
                  placeholder={
                    kind === "observation"
                      ? "What did you observe?"
                      : "What would you like the community to discuss?"
                  }
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
                  rows={5}
                  placeholder="Share what you observed, what you're wondering about, or what you'd like to discuss..."
                  className={cn(textFieldClass, "resize-y leading-6")}
                />
              </div>

              {/* RELATED PROJECT — searchable, and always explicit. */}
              <div className="space-y-1.5">
                <label htmlFor={projectSearchId} className={fieldLabelClass}>
                  Related project (optional)
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id={projectSearchId}
                    type="search"
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                    placeholder="Search projects..."
                    className={cn(textFieldClass, "h-10 pl-8")}
                  />
                </div>
                <select
                  id={projectId}
                  value={relatedProjectId}
                  onChange={(event) => setRelatedProjectId(event.target.value)}
                  aria-label="Related project"
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
                    : "Linking a project marks this as a discussion about that record. It does not add your post to the official record."}
                </p>
              </div>

              {kind === "observation" && (
                <div className="space-y-1.5">
                  <label htmlFor={areaId} className={fieldLabelClass}>
                    Approximate area (optional)
                  </label>
                  <input
                    id={areaId}
                    value={areaLabel}
                    onChange={(event) => setAreaLabel(event.target.value)}
                    maxLength={AREA_LABEL_MAX}
                    autoComplete="off"
                    placeholder="e.g. Barangay Pajac"
                    className={cn(textFieldClass, "h-10")}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    An approximate area only, such as a barangay. Do not include a precise
                    address or anyone's exact location.
                  </p>
                </div>
              )}

              <fieldset className="space-y-2">
                <legend className={fieldLabelClass}>Topic</legend>
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

              {/* PHOTOS */}
              <div className="space-y-2">
                <p className={fieldLabelClass}>Photos</p>
                <MediaPreviewList
                  files={photos}
                  uploading={submitting}
                  onRemove={(index) =>
                    setPhotos((current) => current.filter((_, i) => i !== index))
                  }
                />
                <input
                  ref={photoInputRef}
                  id={`${fieldId}-photos`}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  multiple
                  className="sr-only"
                  onChange={(event) => addPhotos(event.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={photos.length >= POST_PHOTO_MAX || submitting}
                  onClick={() => photoInputRef.current?.click()}
                >
                  <ImagePlus aria-hidden="true" />
                  Add photos
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  Up to {POST_PHOTO_MAX} photos, 5MB each. Photos you add are resident-supplied
                  supporting material.
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
