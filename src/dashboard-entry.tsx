import { createRoot } from "react-dom/client"
import { Dashboard01Page } from "./dashboard-01"
import "maplibre-gl/dist/maplibre-gl.css"
import "./dashboard.css"
import "./route-transitions.css"

createRoot(document.getElementById("root")!).render(<Dashboard01Page />)
