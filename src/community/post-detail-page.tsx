import { useCallback, useState } from "react"
import { IconChevronRight } from "@tabler/icons-react"
import { ArrowLeft } from "lucide-react"

import { Avatar } from "@/components/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CommentThread } from "./comment-thread"
import { requestSignIn } from "./community-auth"
import { CommunityRightRail } from "./community-right-rail"
import { CommunityShell } from "./community-shell"
import { relativeTime, type SortOption, type TopicId } from "./community-contract"
import { profilePath } from "./community-routes"
import { MediaGallery } from "./media-gallery"
import { PostActions } from "./post-actions"
import { AreaLabel, PostKindBadge } from "./post-kind-badge"
import { ProjectContextChip } from "./project-context-chip"
import { TopicChip } from "./topic-chip"
import { useCommunityPulse, usePostThread } from "./use-community"
import { VoteControl } from "./vote-control"

const COMPOSER_ID = "post-reply-composer"

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
        <div className="flex gap-3">
          <Skeleton className="h-16 w-8 rounded-md" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
          </div>
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  )
}

function NotFound() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-14 text-center">
      <h2 className="text-base font-semibold">This discussion is not available</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        The post may have been removed, or the link may be incorrect.
      </p>
      <Button variant="outline" size="lg" className="mt-4" asChild>
        <a href="/community">
          <ArrowLeft aria-hidden="true" />
          Back to Community
        </a>
      </Button>
    </div>
  )
}

/**
 * `/community/post/:postId` — focused view of one discussion.
 *
 * Reuses the same shell, vote control, chips, and action row as the feed so the
 * detail view is a continuation of the community surface, not a new language.
 */
export function PostDetailPage({ postId }: { postId: string }) {
  const thread = usePostThread(postId)
  // Community activity for this discussion's project, when it references one.
  const pulse = useCommunityPulse(thread.post?.project?.id ?? null)
  // The shell's sort/topic controls navigate back to the feed from here.
  const [sort, setSort] = useState<SortOption>("popular")

  // Guests are sent into the existing login flow rather than shown extra
  // sign-in buttons beside every interactive control. Clicks before the viewer
  // resolves are ignored so a signed-in resident is never bounced to /login.
  const requireViewer = useCallback(
    (action: () => void) => {
      if (thread.canInteract) {
        action()
        return
      }
      if (thread.viewerReady) requestSignIn()
    },
    [thread.canInteract, thread.viewerReady],
  )

  const goToFeed = useCallback((search: string) => {
    window.location.assign(`/community${search}`)
  }, [])

  const onSortChange = useCallback(
    (next: SortOption) => {
      setSort(next)
      goToFeed(`?sort=${next}`)
    },
    [goToFeed],
  )

  const onTopicChange = useCallback(
    (next: TopicId | null) => {
      goToFeed(next ? `?topic=${next}` : "")
    },
    [goToFeed],
  )

  const focusComposer = useCallback(() => {
    const composer = document.getElementById(COMPOSER_ID)?.querySelector("textarea")
    if (composer instanceof HTMLTextAreaElement) {
      composer.scrollIntoView({ block: "center", behavior: "smooth" })
      composer.focus()
    }
  }, [])

  const { post } = thread

  return (
    <CommunityShell
      headerTitle="Community"
      breadcrumb={
        <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
          <IconChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{post ? post.title : "Discussion"}</span>
        </span>
      }
      sort={sort}
      onSortChange={onSortChange}
      topic={null}
      onTopicChange={onTopicChange}
      showGuestNote={
        thread.viewerReady && !thread.canInteract && thread.state !== "unconfigured"
      }
      viewer={thread.viewer}
      viewerReady={thread.viewerReady}
      onSignOut={thread.signOut}
    >
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem] xl:gap-5">
        <main className="min-w-0 space-y-3">
          <Button variant="ghost" size="sm" className="-ml-1 text-muted-foreground" asChild>
            <a href="/community">
              <ArrowLeft aria-hidden="true" />
              Back to Community
            </a>
          </Button>

          {thread.error && (
            <p
              role="alert"
              className={
                thread.state === "unconfigured"
                  ? "rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-warning"
                  : "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              }
            >
              {thread.error}
            </p>
          )}

          {thread.state === "loading" ? (
            <DetailSkeleton />
          ) : thread.state === "unconfigured" ? null : !post ? (
            <NotFound />
          ) : (
            <>
              <article className="rounded-lg border border-border bg-card p-3 sm:p-5">
                {/* AUTHOR */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Avatar name={post.author.name} url={post.author.avatarUrl} size="sm" />
                  {post.author.username ? (
                    <a
                      href={profilePath(post.author.username)}
                      className="rounded-sm font-medium text-foreground/80 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      {post.authorName}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground/80">{post.authorName}</span>
                  )}
                  <span aria-hidden="true">·</span>
                  <time
                    dateTime={post.createdAt}
                    title={new Date(post.createdAt).toLocaleString()}
                  >
                    {relativeTime(post.createdAt)}
                  </time>
                  <PostKindBadge kind={post.kind} className="ml-0.5" />
                </div>

                {/* PROJECT — stated before the discussion itself. */}
                {post.project && (
                  <div className="mt-3">
                    <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                      Project
                    </p>
                    <ProjectContextChip project={post.project} className="mt-1" />
                  </div>
                )}

                {/* DISCUSSION / OBSERVATION */}
                <h2 className="mt-3 text-lg leading-snug font-semibold tracking-[-0.015em] sm:text-xl">
                  {post.title}
                </h2>

                {post.body && (
                  <p className="mt-2.5 text-sm leading-7 whitespace-pre-line text-foreground/85">
                    {post.body}
                  </p>
                )}

                {post.areaLabel && <AreaLabel area={post.areaLabel} className="mt-3" />}

                {/* MEDIA */}
                <MediaGallery
                  media={post.media}
                  className="mt-3.5"
                  label={
                    post.kind === "observation"
                      ? "Resident observation photo"
                      : "Resident photo"
                  }
                />

                <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                  <TopicChip topic={post.topic} />
                </div>

                {post.project && (
                  <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
                    This is resident discussion about that project record. It is not part of the
                    official record, and nothing here is a verified finding.
                  </p>
                )}

                {/* COMMUNITY RESPONSE */}
                <div className="mt-3 flex flex-wrap items-center gap-1">
                  <VoteControl
                    score={post.score}
                    vote={post.viewerVote}
                    onVote={(direction) => requireViewer(() => thread.votePost(direction))}
                    label={post.title}
                    orientation="horizontal"
                    size="sm"
                    canInteract={thread.canInteract}
                  />
                  <PostActions
                    postId={post.id}
                    title={post.title}
                    commentCount={thread.commentCount}
                    commentsAsLink={false}
                    onCommentsClick={focusComposer}
                  />
                </div>
              </article>

              <CommentThread
                comments={thread.comments}
                commentCount={thread.commentCount}
                onVote={(commentId, direction) =>
                  requireViewer(() => thread.voteComment(commentId, direction))
                }
                onReply={(body, parentId, photo) =>
                  thread.addComment(body, parentId, photo)
                }
                composerId={COMPOSER_ID}
                canInteract={thread.canInteract}
              />
            </>
          )}
        </main>

        <div className="hidden min-w-0 xl:block">
          <div className="sticky top-[calc(var(--header-height)+1.25rem)]">
            {/*
              Scoped to this discussion's project when it has one, so the rail
              answers "what else has the community said about this record?".
            */}
            <CommunityRightRail
              topic={null}
              onTopicChange={onTopicChange}
              pulse={pulse.pulse}
              pulseLoading={pulse.state === "loading"}
            />
          </div>
        </div>
      </div>
    </CommunityShell>
  )
}
