/**
 * Sign-in entry point for the community surface.
 *
 * The auth forms live in the application bundle (see src/main.tsx), so this is a
 * document navigation rather than an in-bundle route change. That bundle sends
 * residents to `POST_LOGIN_PATH` (`/community`) once authentication succeeds,
 * which is why no `returnTo` parameter is threaded through here.
 */

import { LOGIN_PATH } from "@/app-routes"

export { LOGIN_PATH }

/** Sends a guest into the existing login flow. */
export function requestSignIn(): void {
  window.location.assign(LOGIN_PATH)
}
