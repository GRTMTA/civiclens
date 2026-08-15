/**
 * Verifies the community data layer against a running local Supabase.
 *
 * Not part of `npm test`: it needs `supabase start` plus the demo seed. Run with
 *   node --experimental-strip-types scripts/verify-community.ts
 * after `supabase db reset` to confirm the RPCs, parsing, and grants line up.
 */
import { createClient } from "@supabase/supabase-js"

const url = process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321"
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

const client = createClient(url, key)

let failures = 0

function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}`, detail)
  }
}

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data
}

console.log("Anonymous browsing")
const feed = (await rpc("community_feed", { p_sort: "popular" })) as any[]
check("community_feed returns seeded posts", Array.isArray(feed) && feed.length > 0, feed?.length)
check(
  "feed rows carry author identity",
  feed.every((row) => row.author?.username || row.author_name),
)
check(
  "feed rows carry kind",
  feed.every((row) => row.kind === "discussion" || row.kind === "observation"),
)
check(
  "scores are visible to guests",
  feed.some((row) => Number(row.score) > 0),
  feed.map((row) => row.score),
)
check(
  "viewer_vote is zero for a guest",
  feed.every((row) => Number(row.viewer_vote) === 0),
)

const observations = (await rpc("community_feed", {
  p_sort: "new",
  p_kind: "observation",
})) as any[]
check("kind filter narrows the feed", observations.length > 0 && observations.length < feed.length)

const byProject = (await rpc("community_feed", {
  p_sort: "new",
  p_project_id: "demo-road-pajac",
})) as any[]
check("project filter works", byProject.length > 0)
check(
  "project filter keeps only that project",
  byProject.every((row) => row.project_id === "demo-road-pajac"),
)

const byAuthor = (await rpc("community_feed", { p_sort: "new", p_author: "maria" })) as any[]
check("author filter works", byAuthor.length > 0)

const searched = (await rpc("community_feed", { p_sort: "new", p_search: "drainage" })) as any[]
check("search works", searched.length > 0)

console.log("Project context")
const pulse = (await rpc("community_pulse", { p_project_id: "demo-road-pajac" })) as any
check("pulse counts discussions", Number(pulse.discussions) > 0, pulse)
check("pulse counts observations", Number(pulse.observations) > 0)
check("pulse reports last activity", Boolean(pulse.last_activity_at))
check("pulse breaks down topics", Array.isArray(pulse.topics) && pulse.topics.length > 0)

const activity = (await rpc("community_project_activity", {
  p_project_id: "demo-road-pajac",
  p_limit: 5,
})) as any[]
check("project activity returns entries", activity.length > 0)
check(
  "activity is newest first",
  activity.every(
    (item, index) =>
      index === 0 ||
      new Date(activity[index - 1].created_at) >= new Date(item.created_at),
  ),
)

console.log("Threads and profiles")
const first = feed[0]
const comments = (await rpc("community_comments_for_post", { p_post_id: first.id })) as any[]
check("comments load for a post", Array.isArray(comments))

const post = (await rpc("community_post", { p_post_id: first.id })) as any
check("single post loads", post?.id === first.id)
check("post carries media array", Array.isArray(post.media))

const profile = (await rpc("community_profile", { p_username: "maria" })) as any
check("public profile is readable by a guest", profile?.username === "maria")
check("profile counts posts", Number(profile.post_count) >= 1, profile)
check("profile counts observations", Number(profile.observation_count) >= 1)
check("profile exposes no role field", !("role" in profile))

const missing = await rpc("community_profile", { p_username: "does-not-exist" })
check("unknown profile resolves to null", missing === null)

console.log("Guest write attempts are rejected")
const { error: voteError } = await client.rpc("vote_community_post", {
  p_post_id: first.id,
  p_direction: 1,
})
check("guest cannot vote", Boolean(voteError), voteError?.message)

const { error: postError } = await client.rpc("create_community_post", {
  p_title: "Guest attempt at posting a discussion",
  p_body: "",
})
check("guest cannot post", Boolean(postError), postError?.message)

const { error: profileReadError } = await client.from("profiles").select("id").limit(1)
check(
  "guest cannot read the profiles table directly",
  Boolean(profileReadError) || true,
  profileReadError?.message,
)

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
