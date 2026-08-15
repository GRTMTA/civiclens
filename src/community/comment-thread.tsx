import { useId, useRef, useState } from "react"
import { ImagePlus, Loader2, MessageSquare, Share2 } from "lucide-react"

import { Avatar } from "@/components/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ACCEPTED_IMAGE_TYPES,
  COMMENT_BODY_MAX,
  relativeTime,
  validateImage,
  type CommentNode,
} from "./community-contract"
import { profilePath } from "./community-routes"
import { MediaGallery, MediaPreviewList } from "./media-gallery"
import { VoteControl } from "./vote-control"

const MAX_INDENT_DEPTH = 5

function ReplyComposer({
  label,
  placeholder,
  submitLabel,
  autoFocus = false,
  onCancel,
  onSubmit,
  composerId,
}: {
  label: string
  placeholder: string
  submitLabel: string
  autoFocus?: boolean
  onCancel?: () => void
  onSubmit: (body: string, photo: File | null) => Promise<void>
  composerId?: string
}) {
  const fieldId = useId()
  const [body, setBody] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const choosePhoto = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const invalid = validateImage(file)
    if (invalid) {
      setError(invalid)
      return
    }
    setPhoto(file)
    setError(null)
    // Reset so choosing the same file again still fires a change event.
    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) {
      setError("Write something before posting.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit(trimmed, photo)
      setBody("")
      setPhoto(null)
      onCancel?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your reply could not be posted.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2" id={composerId}>
      <label htmlFor={fieldId} className="sr-only">
        {label}
      </label>
      <textarea
        id={fieldId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={COMMENT_BODY_MAX}
        rows={3}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className="w-full resize-y rounded-lg border border-border bg-input/60 px-3 py-2 text-sm leading-6 text-foreground transition-colors duration-150 outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      />

      <MediaPreviewList
        files={photo ? [photo] : []}
        uploading={submitting}
        onRemove={() => setPhoto(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            ref={photoInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="sr-only"
            id={`${fieldId}-photo`}
            onChange={(event) => choosePhoto(event.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={photo !== null || submitting}
            onClick={() => photoInputRef.current?.click()}
          >
            <ImagePlus aria-hidden="true" />
            Add photo
          </Button>
          <span className="text-[0.7rem] text-muted-foreground tabular-nums">
            {body.trim().length}/{COMMENT_BODY_MAX}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" disabled={submitting || body.trim().length === 0}>
            {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {submitting ? "Posting…" : submitLabel}
          </Button>
        </div>
      </div>
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

function Comment({
  comment,
  depth,
  onVote,
  onReply,
  canInteract,
}: {
  comment: CommentNode
  depth: number
  onVote: (commentId: string, direction: 1 | -1) => void
  onReply: (body: string, parentId: string, photo: File | null) => Promise<void>
  canInteract: boolean
}) {
  const [replying, setReplying] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const replyCount = comment.replies.length
  const authorHref = comment.author.username ? profilePath(comment.author.username) : null

  return (
    <li
      className={cn(
        "min-w-0",
        depth === 0 && "rounded-lg border border-border bg-card p-3 sm:p-4",
      )}
    >
      <article className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Avatar name={comment.author.name} url={comment.author.avatarUrl} size="sm" />
          {authorHref ? (
            <a
              href={authorHref}
              className="rounded-sm font-medium text-foreground/80 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {comment.authorName}
            </a>
          ) : (
            <span className="font-medium text-foreground/80">{comment.authorName}</span>
          )}
          <span aria-hidden="true">·</span>
          <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString()}>
            {relativeTime(comment.createdAt)}
          </time>
          {replyCount > 0 && (
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
              className="ml-1 rounded-sm px-1 text-[0.7rem] font-medium text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {collapsed ? `Show ${replyCount} ${replyCount === 1 ? "reply" : "replies"}` : "Hide replies"}
            </button>
          )}
        </div>

        <p className="mt-1.5 text-sm leading-6 text-foreground/90">{comment.body}</p>

        {/* Comment media stays secondary to the text. */}
        <MediaGallery
          media={comment.media}
          size="sm"
          className="mt-2 max-w-xs"
          label="Resident photo"
        />

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <VoteControl
            score={comment.score}
            vote={comment.viewerVote}
            onVote={(direction) => onVote(comment.id, direction)}
            label={`comment by ${comment.authorName}`}
            orientation="horizontal"
            size="sm"
            canInteract={canInteract}
          />
          {canInteract && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-md text-muted-foreground"
              onClick={() => setReplying((value) => !value)}
              aria-expanded={replying}
            >
              <MessageSquare aria-hidden="true" />
              Reply
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-md text-muted-foreground"
            aria-label={`Share comment by ${comment.authorName}`}
          >
            <Share2 aria-hidden="true" />
            Share
          </Button>
        </div>

        {replying && (
          <div className="mt-3">
            <ReplyComposer
              label={`Reply to ${comment.authorName}`}
              placeholder={`Reply to ${comment.authorName}…`}
              submitLabel="Reply"
              autoFocus
              onCancel={() => setReplying(false)}
              onSubmit={(body, photo) => onReply(body, comment.id, photo)}
            />
          </div>
        )}
      </article>

      {replyCount > 0 && !collapsed && (
        <ul
          className={cn(
            "mt-3 space-y-4 border-l border-border/70 pl-3 sm:pl-4",
            depth >= MAX_INDENT_DEPTH && "border-l-0 pl-0 sm:pl-0",
          )}
        >
          {comment.replies.map((reply) => (
            <Comment
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              onVote={onVote}
              onReply={onReply}
              canInteract={canInteract}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * Threaded discussion for a post: a top-level composer plus nested replies
 * marked by indentation and a subtle vertical thread line.
 */
export function CommentThread({
  comments,
  commentCount,
  onVote,
  onReply,
  composerId,
  canInteract = true,
}: {
  comments: CommentNode[]
  commentCount: number
  onVote: (commentId: string, direction: 1 | -1) => void
  onReply: (body: string, parentId: string | null, photo: File | null) => Promise<void>
  composerId?: string
  canInteract?: boolean
}) {
  return (
    <section aria-label="Discussion comments" className="space-y-5">
      {canInteract ? (
        <ReplyComposer
          label="Add a comment to this discussion"
          placeholder="Add your observation or question…"
          submitLabel="Comment"
          composerId={composerId}
          onSubmit={(body, photo) => onReply(body, null, photo)}
        />
      ) : (
        /*
          Text only: the header's account control carries the single sign-in
          call to action, and voting a comment routes a guest into the same
          flow.
        */
        <p className="rounded-lg border border-dashed border-border bg-secondary/40 px-4 py-3.5 text-sm text-muted-foreground">
          Sign in to join this discussion.
        </p>
      )}

      <h2 className="text-sm font-semibold">
        {commentCount} {commentCount === 1 ? "comment" : "comments"}
      </h2>

      {comments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-secondary/40 p-5 text-center text-sm text-muted-foreground">
          {canInteract
            ? "No comments yet. Start the discussion."
            : "No comments yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              depth={0}
              onVote={onVote}
              onReply={onReply}
              canInteract={canInteract}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
