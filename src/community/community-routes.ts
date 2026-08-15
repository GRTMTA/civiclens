/**
 * Community route parsing.
 *
 * The application routes on `window.location.pathname` rather than a router
 * library (see src/app-entry.ts), so these helpers keep the path shapes for
 * `/community`, `/community/post/:postId`, and `/community/profile/:username`
 * in one place.
 */

export const COMMUNITY_PATH = "/community"

export type CommunityRoute =
  | { kind: "feed" }
  | { kind: "post"; postId: string }
  | { kind: "profile"; username: string }

/** True for any path the community bundle is responsible for rendering. */
export function isCommunityPath(pathname: string): boolean {
  return pathname === COMMUNITY_PATH || pathname.startsWith(`${COMMUNITY_PATH}/`)
}

export function readCommunityRoute(pathname: string): CommunityRoute {
  const profileMatch = /^\/community\/profile\/([^/]+)\/?$/.exec(pathname)
  if (profileMatch) {
    const username = decodeURIComponent(profileMatch[1]).trim().toLowerCase()
    if (username) return { kind: "profile", username }
  }

  const postMatch = /^\/community\/post\/([^/]+)\/?$/.exec(pathname)
  if (postMatch) {
    const postId = decodeURIComponent(postMatch[1]).trim()
    if (postId) return { kind: "post", postId }
  }

  return { kind: "feed" }
}

/** Canonical path for a resident's public profile. */
export function profilePath(username: string): string {
  return `${COMMUNITY_PATH}/profile/${encodeURIComponent(username)}`
}

/** Canonical path for one discussion. */
export function postPath(postId: string): string {
  return `${COMMUNITY_PATH}/post/${encodeURIComponent(postId)}`
}

/** Feed filtered to discussion about one Official-source record. */
export function projectDiscussionPath(projectId: string): string {
  return `${COMMUNITY_PATH}?project=${encodeURIComponent(projectId)}`
}

/** The existing map surface, focused on one Official-source record. */
export function projectMapPath(projectId: string): string {
  return `/map?project=${encodeURIComponent(projectId)}`
}
