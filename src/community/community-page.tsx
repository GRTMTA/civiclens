import { useEffect, useMemo, useState } from "react"

import { communityActionDecision, requestSignIn } from "./community-auth"
import { CommunityFeed } from "./community-feed"
import { CommunityRightRail } from "./community-right-rail"
import { CommunityShell } from "./community-shell"
import { CreatePostModal } from "./create-post-modal"
import { useCommunityFeed, useCommunityPulse } from "./use-community"

/**
 * `/community` — the CivicLens community context layer.
 *
 * Desktop lays out a three-part grid: shell navigation, the dominant feed, and
 * a compact context rail. The rail drops out below `xl` and the navigation
 * collapses to a drawer on mobile, leaving the feed single-column.
 *
 * When `?project=` is present the feed is scoped to one Official-source record,
 * which is what makes the Map → Project → Community round trip work.
 */
export function CommunityPage() {
  const feed = useCommunityFeed()
  const pulse = useCommunityPulse(feed.projectId)
  const [composerOpen, setComposerOpen] = useState(false)

  // The scoped project's name comes from the posts themselves, so no extra
  // request is needed to label the scope.
  const scopedProject = useMemo(() => {
    if (!feed.projectId) return null
    const match = feed.posts.find((post) => post.project?.id === feed.projectId)
    return match?.project ?? { id: feed.projectId, name: feed.projectId }
  }, [feed.posts, feed.projectId])

  // Keep the address bar in step with the project scope so the view is
  // shareable and the browser's back button behaves.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (feed.projectId) params.set("project", feed.projectId)
    else params.delete("project")
    const search = params.toString()
    window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}`)
  }, [feed.projectId])

  // Write actions are offered to everyone; a guest is sent through the existing
  // login flow instead of being shown a second sign-in button. Clicks are
  // ignored until the viewer resolves so a signed-in resident is never bounced
  // to /login and straight back here.
  const requireViewer = (action: () => void) => () => {
    const decision = communityActionDecision(feed.canInteract, feed.viewerReady)
    if (decision === "allow") action()
    else if (decision === "sign-in") requestSignIn()
  }

  return (
    <CommunityShell
      headerTitle="Community"
      sort={feed.sort}
      onSortChange={feed.setSort}
      topic={feed.topic}
      onTopicChange={feed.setTopic}
      showGuestNote={feed.viewerReady && !feed.canInteract && feed.state !== "unconfigured"}
      viewer={feed.viewer}
      viewerReady={feed.viewerReady}
      onSignOut={feed.signOut}
    >
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem] xl:gap-5">
        <main className="min-w-0">
          <CommunityFeed
            posts={feed.posts}
            state={feed.state}
            error={feed.error}
            sort={feed.sort}
            onSortChange={feed.setSort}
            search={feed.search}
            onSearchChange={feed.setSearch}
            topic={feed.topic}
            onTopicChange={feed.setTopic}
            kind={feed.kind}
            onKindChange={feed.setKind}
            scopedProject={scopedProject}
            onClearProject={() => feed.setProjectId(null)}
            onVote={(postId, direction) =>
              requireViewer(() => feed.vote(postId, direction))()
            }
            onCreatePost={requireViewer(() => setComposerOpen(true))}
            onRetry={feed.retry}
            canInteract={feed.canInteract}
          />
        </main>

        <div className="hidden min-w-0 xl:block">
          <div className="sticky top-[calc(var(--header-height)+1.25rem)]">
            <CommunityRightRail
              topic={feed.topic}
              onTopicChange={feed.setTopic}
              pulse={pulse.pulse}
              pulseLoading={pulse.state === "loading"}
            />
          </div>
        </div>
      </div>

      <CreatePostModal
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onSubmit={feed.createPost}
        defaultProjectId={feed.projectId}
        defaultProject={scopedProject}
      />
    </CommunityShell>
  )
}
