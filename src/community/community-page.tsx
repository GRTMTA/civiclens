import { useState } from "react"

import { CommunityFeed } from "./community-feed"
import { CommunityRightRail } from "./community-right-rail"
import { CommunityShell } from "./community-shell"
import { CreatePostModal } from "./create-post-modal"
import { useCommunityFeed } from "./use-community"

/**
 * `/community` — the global CivicLens community experience.
 *
 * Desktop lays out a three-part grid: shell navigation, the dominant feed, and
 * a compact information rail. The rail drops out below `xl` and the navigation
 * collapses to a drawer on mobile, leaving the feed single-column.
 */
export function CommunityPage() {
  const feed = useCommunityFeed()
  const [composerOpen, setComposerOpen] = useState(false)

  return (
    <CommunityShell
      headerTitle="Community"
      sort={feed.sort}
      onSortChange={feed.setSort}
      topic={feed.topic}
      onTopicChange={feed.setTopic}
      showSignInNotice={feed.viewerReady && !feed.canInteract && feed.state !== "unconfigured"}
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
            onVote={feed.vote}
            onCreatePost={() => setComposerOpen(true)}
            onRetry={feed.retry}
            canInteract={feed.canInteract}
          />
        </main>

        <div className="hidden min-w-0 xl:block">
          <div className="sticky top-[calc(var(--header-height)+1.25rem)]">
            <CommunityRightRail topic={feed.topic} onTopicChange={feed.setTopic} />
          </div>
        </div>
      </div>

      <CreatePostModal
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onSubmit={feed.createPost}
      />
    </CommunityShell>
  )
}
