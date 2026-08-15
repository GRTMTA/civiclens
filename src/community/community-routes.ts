/**
 * Community route parsing.
 *
 * The application routes on `window.location.pathname` rather than a router
 * library (see src/app-entry.ts), so these helpers keep the path shapes for
 * `/community` and `/community/post/:postId` in one place.
 */

export const COMMUNITY_PATH = "/community"

export type CommunityRoute =
  | { kind: "feed" }
  | { kind: "post"; postId: string }

/** True for any path the community bundle is responsible for rendering. */
export function isCommunityPath(pathname: string): boolean {
  return pathname === COMMUNITY_PATH || pathname.startsWith(`${COMMUNITY_PATH}/`)
}

export function readCommunityRoute(pathname: string): CommunityRoute {
  const match = /^\/community\/post\/([^/]+)\/?$/.exec(pathname)
  const postId = match ? decodeURIComponent(match[1]).trim() : ""
  return postId ? { kind: "post", postId } : { kind: "feed" }
}
