import { relativeTime, type CommunityPost } from "./community-contract"
import { PostActions } from "./post-actions"
import { ProjectContextChip } from "./project-context-chip"
import { TopicChip } from "./topic-chip"
import { VoteControl } from "./vote-control"

/**
 * Feed row for a single community discussion.
 *
 * Hierarchy runs vote rail → byline → title → excerpt → context → actions, so a
 * long feed stays scannable without any single card growing tall.
 */
export function PostCard({
  post,
  onVote,
  canInteract = true,
}: {
  post: CommunityPost
  onVote: (direction: 1 | -1) => void
  canInteract?: boolean
}) {
  const href = `/community/post/${post.id}`

  return (
    <article className="group/post rounded-lg border border-border bg-card transition-colors duration-150 hover:border-border/80 hover:bg-elevated/40 focus-within:border-ring/50">
      <div className="flex gap-1 p-3 sm:gap-2 sm:p-4">
        <div className="pt-0.5">
          <VoteControl
            score={post.score}
            vote={post.viewerVote}
            onVote={onVote}
            label={post.title}
            canInteract={canInteract}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/75">{post.authorName}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()}>
              {relativeTime(post.createdAt)}
            </time>
            <span aria-hidden="true">·</span>
            <span>community discussion</span>
          </p>

          <h3 className="mt-1.5 text-[0.975rem] leading-snug font-semibold tracking-[-0.01em]">
            <a
              href={href}
              className="rounded-sm outline-none group-hover/post:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {post.title}
            </a>
          </h3>

          {post.body && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {post.body}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <TopicChip topic={post.topic} />
            {post.project && <ProjectContextChip project={post.project} />}
          </div>

          <PostActions
            postId={post.id}
            title={post.title}
            commentCount={post.commentCount}
            className="mt-2 -ml-1"
          />
        </div>
      </div>
    </article>
  )
}
