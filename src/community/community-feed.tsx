import { useEffect, useRef, useState } from "react"
import { AlertCircle, Plus, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  SORT_LABELS,
  SORT_OPTIONS,
  topicLabel,
  type CommunityPost,
  type SortOption,
  type TopicId,
} from "./community-contract"
import { PostCard } from "./post-card"

function CommunityHeader({ onCreatePost }: { onCreatePost: () => void }) {
  return (
    <header className="rounded-lg border border-border bg-card px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Resident discussion
          </p>
          <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.015em] sm:text-[1.4rem]">
            CivicLens Community
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
            Discuss public infrastructure, share observations, and learn from other residents.
          </p>
        </div>
        <Button size="lg" onClick={onCreatePost} className="shrink-0">
          <Plus aria-hidden="true" />
          Create Post
        </Button>
      </div>
    </header>
  )
}

function SearchField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the field in step when the query is cleared elsewhere.
  useEffect(() => {
    setDraft(value)
  }, [value])

  // Debounce so a long feed is not re-sorted on every keystroke.
  useEffect(() => {
    if (draft === value) return
    const timer = window.setTimeout(() => onChange(draft), 180)
    return () => window.clearTimeout(timer)
  }, [draft, onChange, value])

  return (
    <div className="relative w-full sm:w-64">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Search community"
        aria-label="Search community discussions"
        className="h-8 w-full rounded-md border border-border bg-input/50 pr-8 pl-8 text-sm text-foreground transition-colors duration-150 outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:bg-input/70 focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft("")
            onChange("")
            inputRef.current?.focus()
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function FeedControls({
  sort,
  onSortChange,
  search,
  onSearchChange,
  topic,
  onTopicChange,
}: {
  sort: SortOption
  onSortChange: (sort: SortOption) => void
  search: string
  onSearchChange: (search: string) => void
  topic: TopicId | null
  onTopicChange: (topic: TopicId | null) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/*
          A group of toggle buttons rather than a tablist: there is no tab panel
          here, and `aria-pressed` describes the selected sort accurately
          without promising the arrow-key behaviour a tablist implies.
        */}
        <div
          role="group"
          aria-label="Sort discussions"
          className="flex items-center gap-1 overflow-x-auto"
        >
          {SORT_OPTIONS.map((option) => {
            const active = sort === option
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => onSortChange(option)}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  active
                    ? "bg-primary/15 text-foreground shadow-[inset_0_0_0_1px_var(--primary)]"
                    : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                )}
              >
                {SORT_LABELS[option]}
              </button>
            )
          })}
        </div>
        <SearchField value={search} onChange={onSearchChange} />
      </div>

      {topic && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5 text-xs text-muted-foreground">
          <span>
            Topic: <span className="font-medium text-foreground/85">{topicLabel(topic)}</span>
          </span>
          <button
            type="button"
            onClick={() => onTopicChange(null)}
            className="inline-flex items-center gap-1 rounded px-1 font-medium text-primary transition-colors duration-150 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <X className="size-3" aria-hidden="true" />
            Clear filter
          </button>
        </div>
      )}
    </div>
  )
}

function PostSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex gap-3">
        <Skeleton className="h-16 w-8 rounded-md" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-5 w-48 rounded-md" />
        </div>
      </div>
    </div>
  )
}

/**
 * Centre column: community header, feed controls, and the discussion list.
 */
export function CommunityFeed({
  posts,
  state,
  error,
  sort,
  onSortChange,
  search,
  onSearchChange,
  topic,
  onTopicChange,
  onVote,
  onCreatePost,
}: {
  posts: CommunityPost[]
  state: "loading" | "ready" | "error"
  error: string | null
  sort: SortOption
  onSortChange: (sort: SortOption) => void
  search: string
  onSearchChange: (search: string) => void
  topic: TopicId | null
  onTopicChange: (topic: TopicId | null) => void
  onVote: (postId: string, direction: 1 | -1) => void
  onCreatePost: () => void
}) {
  return (
    <div className="space-y-3">
      <CommunityHeader onCreatePost={onCreatePost} />

      <FeedControls
        sort={sort}
        onSortChange={onSortChange}
        search={search}
        onSearchChange={onSearchChange}
        topic={topic}
        onTopicChange={onTopicChange}
      />

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="space-y-2.5" aria-live="polite" aria-busy={state === "loading"}>
        {state === "loading" && posts.length === 0 ? (
          <>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </>
        ) : posts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
            <Search className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">No discussions match this view</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              Try a different search term or topic, or start the discussion yourself.
            </p>
            <Button variant="outline" size="lg" className="mt-4" onClick={onCreatePost}>
              <Plus aria-hidden="true" />
              Create Post
            </Button>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} onVote={(direction) => onVote(post.id, direction)} />
          ))
        )}
      </div>
    </div>
  )
}
