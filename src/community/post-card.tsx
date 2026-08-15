import { Avatar } from "@/components/avatar"
import { relativeTime, type CommunityPost } from "./community-contract"
import { MediaGallery } from "./media-gallery"
import { PostActions } from "./post-actions"
import { AreaLabel, PostKindBadge } from "./post-kind-badge"
import { ProjectContextChip } from "./project-context-chip"
import { profilePath, postPath } from "./community-routes"
import { TopicChip } from "./topic-chip"
import { VoteControl } from "./vote-control"

/**
 * Feed entry for one piece of community content.
 *
 * The hierarchy is deliberately civic rather than generic-social: author →
 * project reference → what the resident wrote → their photos → community
 * response. Leading with the project is what makes a CivicLens post legible as
 * context around an Official-source record instead of a standalone submission.
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
  const href = postPath(post.id)
  const authorHref = post.author.username ? profilePath(post.author.username) : null

  return (
    <article className="group/post rounded-lg border border-border bg-card transition-colors duration-150 hover:border-border/80 focus-within:border-ring/50">
      <div className="p-3 sm:p-4">
        {/* AUTHOR */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Avatar name={post.author.name} url={post.author.avatarUrl} size="sm" />
          {authorHref ? (
            <a
              href={authorHref}
              className="rounded-sm font-medium text-foreground/85 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {post.authorName}
            </a>
          ) : (
            <span className="font-medium text-foreground/85">{post.authorName}</span>
          )}
          <span aria-hidden="true">·</span>
          <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()}>
            {relativeTime(post.createdAt)}
          </time>
          <PostKindBadge kind={post.kind} className="ml-0.5" />
        </div>

        {/* PROJECT — the CivicLens relationship, stated before the discussion. */}
        {post.project && (
          <div className="mt-2.5">
            <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Project
            </p>
            <ProjectContextChip project={post.project} className="mt-1" />
          </div>
        )}

        {/* DISCUSSION / OBSERVATION */}
        <h3 className="mt-2.5 text-[0.975rem] leading-snug font-semibold tracking-[-0.01em]">
          <a
            href={href}
            className="rounded-sm outline-none group-hover/post:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {post.title}
          </a>
        </h3>

        {post.body && (
          <p className="mt-1.5 line-clamp-3 text-sm leading-6 text-muted-foreground">
            {post.body}
          </p>
        )}

        {post.areaLabel && <AreaLabel area={post.areaLabel} className="mt-2" />}

        {/* MEDIA */}
        <MediaGallery
          media={post.media}
          className="mt-3"
          label={
            post.kind === "observation" ? "Resident observation photo" : "Resident photo"
          }
        />

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <TopicChip topic={post.topic} />
        </div>

        {/* COMMUNITY RESPONSE */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <VoteControl
            score={post.score}
            vote={post.viewerVote}
            onVote={onVote}
            label={post.title}
            orientation="horizontal"
            size="sm"
            canInteract={canInteract}
          />
          <PostActions
            postId={post.id}
            title={post.title}
            commentCount={post.commentCount}
          />
        </div>
      </div>
    </article>
  )
}
