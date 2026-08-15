import { isCommunityPath } from "./community/community-routes"

const path = window.location.pathname

/**
 * Route-level bundle selection.
 *
 * Each surface owns its own entry so it loads only the CSS and dependencies it
 * needs: the community shell, the map shell, or the landing/auth application.
 * Specifiers are written out literally so Vite can statically split them.
 */
if (isCommunityPath(path)) {
  void import("./community-entry")
} else if (path === "/map") {
  void import("./dashboard-entry")
} else {
  void import("./main")
}
