import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  PROJECT_INDICATOR_COLOR,
  PROJECT_OVERVIEW_COLOR,
  PROJECT_OVERVIEW_STROKE_COLOR,
} from "./project-map-style"

const projectMapSource = readFileSync(
  fileURLToPath(new URL("./project-map.tsx", import.meta.url)),
  "utf8",
)

describe("project map palette", () => {
  it("keeps overview markers dark blue and detailed indicators red", () => {
    expect(PROJECT_OVERVIEW_COLOR).toBe("#1e3a8a")
    expect(PROJECT_OVERVIEW_STROKE_COLOR).toBe("#bfdbfe")
    expect(PROJECT_INDICATOR_COLOR).toBe("#dc2626")
    expect(PROJECT_OVERVIEW_COLOR).not.toBe(PROJECT_INDICATOR_COLOR)
  })

  it("uses one interactive detailed indicator stack instead of source-geometry layers", () => {
    expect(projectMapSource).toContain('"project-location-indicator-fill"')
    expect(projectMapSource).toContain('"project-location-indicator-outline"')
    expect(projectMapSource).not.toContain('id="project-area-official"')
    expect(projectMapSource).not.toContain('id="project-area-reviewed"')
    expect(projectMapSource).not.toContain('id="project-area-automatic"')
    expect(projectMapSource).not.toContain('id="project-area-estimated-outline"')
    expect(projectMapSource.match(/"circle-color": PROJECT_OVERVIEW_COLOR/g)).toHaveLength(3)
    expect(projectMapSource).toMatch(
      /id="project-selected-point"[\s\S]*?"circle-color": PROJECT_OVERVIEW_COLOR[\s\S]*?"circle-stroke-color": PROJECT_OVERVIEW_STROKE_COLOR/,
    )
    expect(projectMapSource).toContain('paint={{ "text-color": "#ffffff" }}')
  })

  it("renders the uploaded pin above each detailed location indicator", () => {
    expect(projectMapSource).toContain('import locationPin from "@/assets/location-pin.png"')
    expect(projectMapSource).toContain('{camera.zoom >= 15 && response.features.map((feature) => (')
    expect(projectMapSource).toContain('longitude={feature.coordinates[0]}')
    expect(projectMapSource).toContain('latitude={feature.coordinates[1]}')
    expect(projectMapSource).toContain('anchor="bottom"')
    expect(projectMapSource).toContain('style={{ pointerEvents: "none" }}')
    expect(projectMapSource).toContain('src={locationPin}')
    expect(projectMapSource.indexOf('id="project-location-indicator-outline"')).toBeLessThan(
      projectMapSource.indexOf('{camera.zoom >= 15 && response.features.map((feature) => ('),
    )
  })
})
