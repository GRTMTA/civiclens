/**
 * Verifies authenticated community writes against a running local Supabase.
 *
 * Creates a throwaway resident, then exercises posting, media upload, comments,
 * voting, and profile editing end to end — including the storage policies.
 *
 *   node --experimental-strip-types scripts/verify-community-auth.ts
 */
import { createClient } from "@supabase/supabase-js"

const url = process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321"
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

const client = createClient(url, key)

let failures = 0
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failures += 1
    console.log(`  FAIL ${name}`, detail)
  }
}

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data
}

/** A 1x1 PNG, so uploads exercise the real storage path with a valid image. */
function tinyPng(): Blob {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: "image/png" })
}

const email = `verify-${Date.now()}@example.invalid`
const password = "verify-password-1234"

console.log("Account provisioning")
const { data: signUp, error: signUpError } = await client.auth.signUp({
  email,
  password,
  options: { data: { display_name: "Verify Resident" } },
})
check("sign up succeeds", !signUpError, signUpError?.message)
check("session is issued", Boolean(signUp?.session))

const userId = signUp?.user?.id ?? ""

const { data: profileRow } = await client
  .from("profiles")
  .select("display_name, username, bio, avatar_path")
  .eq("id", userId)
  .maybeSingle()
check("profile row is provisioned by trigger", Boolean(profileRow), profileRow)
check("a username is generated automatically", Boolean(profileRow?.username), profileRow?.username)

console.log("Posting")
const created = (await rpc("create_community_post", {
  p_title: "Verification observation about a demo project record",
  p_body: "Posted by the verification script.",
  p_topic: "roads",
  p_project_id: "demo-road-pajac",
  p_kind: "observation",
  p_area_label: "Barangay Pajac",
})) as any
check("observation is created", Boolean(created?.id), created)
check("kind round-trips", created.kind === "observation")
check("area label round-trips", created.area_label === "Barangay Pajac")
check("project reference resolves a name", Boolean(created.project_name))
check("author's own post starts upvoted", Number(created.score) === 1)
check("author identity is attached", created.author?.name === "Verify Resident")

const postId = created.id as string

console.log("Post media")
const mediaPath = `${postId}/verify.png`
const { error: uploadError } = await client.storage
  .from("community-post-media")
  .upload(mediaPath, tinyPng(), { contentType: "image/png" })
check("author can upload into their post's folder", !uploadError, uploadError?.message)

const attached = (await rpc("attach_community_post_media", {
  p_post_id: postId,
  p_paths: [mediaPath],
})) as any[]
check("media path is registered", attached.length === 1, attached)

const reread = (await rpc("community_post", { p_post_id: postId })) as any
check("post now reports its media", reread.media?.length === 1)

const { error: foreignUploadError } = await client.storage
  .from("community-post-media")
  .upload(`00000000-0000-4000-8000-0000000000ff/x.png`, tinyPng(), { contentType: "image/png" })
check(
  "cannot upload into another post's folder",
  Boolean(foreignUploadError),
  foreignUploadError?.message,
)

const { error: badPathError } = await client.rpc("attach_community_post_media", {
  p_post_id: postId,
  p_paths: ["someone-else/x.png"],
})
check("cannot register a path outside the post", Boolean(badPathError), badPathError?.message)

console.log("Comments and comment media")
const comment = (await rpc("create_community_comment", {
  p_post_id: postId,
  p_body: "Verification comment.",
})) as any
check("comment is created", Boolean(comment?.id))

const commentPath = `${comment.id}/verify.png`
const { error: commentUploadError } = await client.storage
  .from("community-comment-media")
  .upload(commentPath, tinyPng(), { contentType: "image/png" })
check("author can upload comment media", !commentUploadError, commentUploadError?.message)

const commentMedia = (await rpc("attach_community_comment_media", {
  p_comment_id: comment.id,
  p_paths: [commentPath],
})) as any[]
check("comment media is registered", commentMedia.length === 1)

const threaded = (await rpc("create_community_comment", {
  p_post_id: postId,
  p_body: "Verification reply.",
  p_parent_id: comment.id,
})) as any
check("threaded reply is created", threaded?.parent_id === comment.id)

console.log("Voting")
const voted = (await rpc("vote_community_post", { p_post_id: postId, p_direction: -1 })) as any
check("switching direction updates the score", Number(voted.score) === -1, voted)
check("viewer vote is reported back", Number(voted.viewer_vote) === -1)

const cleared = (await rpc("vote_community_post", { p_post_id: postId, p_direction: -1 })) as any
check("pressing the active direction clears the vote", Number(cleared.viewer_vote) === 0)
check("score returns to zero", Number(cleared.score) === 0)

console.log("Profile editing")
const handle = `verify${Date.now().toString().slice(-6)}`
const updated = (await rpc("update_community_profile", {
  p_display_name: "Verified Resident",
  p_username: handle,
  p_bio: "Testing the profile editor.",
})) as any
check("display name is saved", updated.display_name === "Verified Resident", updated)
check("username is saved", updated.username === handle)
check("bio is saved", updated.bio === "Testing the profile editor.")

const renamed = (await rpc("community_post", { p_post_id: postId })) as any
check("existing content follows the rename", renamed.author_name === "Verified Resident")

const { error: takenError } = await client.rpc("update_community_profile", {
  p_username: "maria",
})
check("duplicate username is rejected", Boolean(takenError), takenError?.message)
check(
  "duplicate error is recognisable to the client",
  takenError?.message?.includes("username_taken") ?? false,
  takenError?.message,
)

const { error: badHandleError } = await client.rpc("update_community_profile", {
  p_username: "Bad Handle!",
})
check("invalid username is rejected", Boolean(badHandleError), badHandleError?.message)

const { error: roleEscalation } = await client
  .from("profiles")
  .update({ role: "moderator" })
  .eq("id", userId)
const stillCitizen = await client.from("profiles").select("role").eq("id", userId).maybeSingle()
check(
  "role cannot be escalated by the resident",
  stillCitizen.data?.role !== "moderator",
  { roleEscalation: roleEscalation?.message, role: stillCitizen.data?.role },
)

console.log("Avatar")
const avatarPath = `${userId}/avatar.png`
const { error: avatarError } = await client.storage
  .from("avatars")
  .upload(avatarPath, tinyPng(), { contentType: "image/png", upsert: true })
check("avatar uploads to the owner's folder", !avatarError, avatarError?.message)

const withAvatar = (await rpc("update_community_profile", { p_avatar_path: avatarPath })) as any
check("avatar path is saved", withAvatar.avatar_path === avatarPath)

const cleanedAvatar = (await rpc("update_community_profile", { p_clear_avatar: true })) as any
check("avatar can be removed", cleanedAvatar.avatar_path === null)

const { error: foreignAvatarError } = await client.rpc("update_community_profile", {
  p_avatar_path: "00000000-0000-4000-8000-0000000000ff/avatar.png",
})
check(
  "cannot claim another resident's avatar path",
  Boolean(foreignAvatarError),
  foreignAvatarError?.message,
)

console.log("Sign out")
const { error: signOutError } = await client.auth.signOut()
check("sign out succeeds", !signOutError, signOutError?.message)
const { data: after } = await client.auth.getSession()
check("session is cleared", after.session === null)

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
