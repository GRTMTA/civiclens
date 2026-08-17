import { createRoot } from "react-dom/client"
import { CommunityPage } from "./community/community-page"
import { PostDetailPage } from "./community/post-detail-page"
import { ProfilePage } from "./community/profile-page"
import { readCommunityRoute } from "./community/community-routes"
import "./dashboard.css"
import "./route-transitions.css"

const route = readCommunityRoute(window.location.pathname)

document.title =
  route.kind === "post"
    ? "Discussion — CivicLens Community"
    : route.kind === "profile"
      ? "Profile — CivicLens Community"
      : "Community — CivicLens"

createRoot(document.getElementById("root")!).render(
  route.kind === "post" ? (
    <PostDetailPage postId={route.postId} />
  ) : route.kind === "profile" ? (
    <ProfilePage username={route.username} />
  ) : (
    <CommunityPage />
  ),
)
