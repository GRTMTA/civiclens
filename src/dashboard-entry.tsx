import { createRoot } from "react-dom/client"
import { Dashboard01Page } from "./dashboard-01"
import "maplibre-gl/dist/maplibre-gl.css"
import "./dashboard.css"

createRoot(document.getElementById("root")!).render(<Dashboard01Page />)
