import { useId, useState } from "react"
import { Loader2, MessageSquare, Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  COMMENT_BODY_MAX,
  relativeTime,
  type CommentNode,
} from "./community-contract"
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
  onSubmit: (body: string) => Promise<void>
  composerId?: string
}) {
  const fieldId = useId()
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      await onSubmit(trimmed)
      setBody("")
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
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.7rem] text-muted-foreground tabular-nums">
          {body.trim().length}/{COMMENT_BODY_MAX}
        </span>
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
}: {
  comment: CommentNode
  depth: number
  onVote: (commentId: string, direction: 1 | -1) => void
  onReply: (body: string, parentId: string) => Promise<void>
}) {
  const [replying, setReplying] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const replyCount = comment.replies.length

  return (
    <li
      className={cn(
        "min-w-0",
        depth === 0 && "rounded-lg border border-border bg-card p-3 sm:p-4",
      )}
    >
      <article className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{comment.authorName}</span>
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

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <VoteControl
            score={comment.score}
            vote={comment.viewerVote}
            onVote={(direction) => onVote(comment.id, direction)}
            label={`comment by ${comment.authorName}`}
            orientation="horizontal"
            size="sm"
          />
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
              onSubmit={(body) => onReply(body, comment.id)}
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
}: {
  comments: CommentNode[]
  commentCount: number
  onVote: (commentId: string, direction: 1 | -1) => void
  onReply: (body: string, parentId: string | null) => Promise<void>
  composerId?: string
}) {
  return (
    <section aria-label="Discussion comments" className="space-y-5">
      <ReplyComposer
        label="Add a comment to this discussion"
        placeholder="Add your observation or question…"
        submitLabel="Comment"
        composerId={composerId}
        onSubmit={(body) => onReply(body, null)}
      />

      <h2 className="text-sm font-semibold">
        {commentCount} {commentCount === 1 ? "comment" : "comments"}
      </h2>

      {comments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-secondary/40 p-5 text-center text-sm text-muted-foreground">
          No comments yet. Start the discussion.
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
            />
          ))}
        </ul>
      )}
    </section>
  )
}
