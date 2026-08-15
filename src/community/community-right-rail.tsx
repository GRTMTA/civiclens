import { listTopics, type TopicId } from "./community-contract"
import { TopicChip } from "./topic-chip"

const POPULAR_TOPICS: TopicId[] = [
  "roads",
  "bridges",
  "flood-control",
  "transportation",
  "public-buildings",
]

const GUIDELINES = [
  "Stay factual",
  "Be respectful",
  "Distinguish observations from assumptions",
  "Do not post private information",
]

function RailPanel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  )
}

/**
 * Compact information rail. Secondary content only — it is removed from the
 * flow below the `xl` breakpoint so the feed keeps the width it needs.
 */
export function CommunityRightRail({
  topic,
  onTopicChange,
}: {
  topic: TopicId | null
  onTopicChange: (topic: TopicId | null) => void
}) {
  const labels = new Map(listTopics().map((item) => [item.id, item.label]))

  return (
    <aside aria-label="About this community" className="space-y-3">
      <RailPanel title="About CivicLens Community">
        <p className="text-sm leading-6 text-muted-foreground">
          CivicLens Community is a space for residents to discuss public infrastructure, share
          observations, and exchange local knowledge.
        </p>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Discussion here is resident content. Official project records are shown separately on the{" "}
          <a
            href="/map"
            className="rounded-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            map
          </a>
          , with their source attribution.
        </p>
      </RailPanel>

      <RailPanel title="Popular Topics">
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_TOPICS.map((item) => (
            <TopicChip
              key={item}
              topic={item}
              asButton
              active={topic === item}
              onClick={() => onTopicChange(topic === item ? null : item)}
            />
          ))}
        </div>
        {topic && (
          <p className="mt-3 text-xs text-muted-foreground">
            Filtering by{" "}
            <span className="font-medium text-foreground/85">{labels.get(topic)}</span>.{" "}
            <button
              type="button"
              onClick={() => onTopicChange(null)}
              className="rounded-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Clear
            </button>
          </p>
        )}
      </RailPanel>

      <RailPanel title="Community Guidelines">
        <ul className="space-y-2">
          {GUIDELINES.map((rule) => (
            <li
              key={rule}
              className="flex gap-2.5 text-sm leading-6 text-muted-foreground"
            >
              <span aria-hidden="true" className="mt-2.5 size-1 shrink-0 rounded-full bg-primary" />
              {rule}
            </li>
          ))}
        </ul>
      </RailPanel>
    </aside>
  )
}
