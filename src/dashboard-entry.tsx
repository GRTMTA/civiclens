import { createRoot } from "react-dom/client"
import { setWorkerUrl } from "maplibre-gl"
import { Dashboard01Page } from "./dashboard-01"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import "maplibre-gl/dist/maplibre-gl.css"
import "./styles (1).css"

setWorkerUrl(workerUrl)

createRoot(document.getElementById("root")!).render(<Dashboard01Page />)
