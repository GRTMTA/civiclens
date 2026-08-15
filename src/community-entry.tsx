import { createRoot } from "react-dom/client"
import { CommunityPage } from "./community/community-page"
import { PostDetailPage } from "./community/post-detail-page"
import { readCommunityRoute } from "./community/community-routes"
import "./dashboard.css"

const route = readCommunityRoute(window.location.pathname)

document.title =
  route.kind === "post" ? "Discussion — CivicLens Community" : "Community — CivicLens"

createRoot(document.getElementById("root")!).render(
  route.kind === "post" ? <PostDetailPage postId={route.postId} /> : <CommunityPage />,
)
