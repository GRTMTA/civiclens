/**
 * Route table for the landing/auth bundle (see src/main.tsx).
 *
 * The application routes on `window.location.pathname` rather than a router
 * library, so the set of paths this bundle owns lives here — separate from the
 * component tree — and anything outside it is treated as not found.
 */

export const LANDING_PATH = "/"
export const LOGIN_PATH = "/login"
export const REGISTER_PATH = "/register"

/** Destination after successful authentication. */
export const POST_LOGIN_PATH = "/community"

const APP_PATHS: readonly string[] = [LANDING_PATH, LOGIN_PATH, REGISTER_PATH]

/** True for the paths this bundle renders a screen for. */
export function isAppPath(pathname: string): boolean {
  return APP_PATHS.includes(pathname)
}
