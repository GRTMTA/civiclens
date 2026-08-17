import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const readSource = (name: string) => readFileSync(
  fileURLToPath(new URL(name, import.meta.url)),
  "utf8",
)

const projectMapSource = readSource("./project-map.tsx")
const scanUiSource = readSource("./mock-infrastructure-photo-scan.tsx")
const scanLogicSource = readSource("./mock-photo-scan.ts")

describe("mock infrastructure photo scan UI", () => {
  it("places the scan action at the map top-right and reuses real project selection", () => {
    expect(projectMapSource).toContain('className="absolute right-3 top-3 z-20"')
    expect(projectMapSource).toContain("<MockInfrastructurePhotoScan onMatch={selectProject} />")
    expect(projectMapSource).not.toContain("loadAvailableProjects={loadAvailableScanProjects}")
  })

  it("offers camera and gallery inputs with staged location-only demo feedback", () => {
    expect(scanUiSource.match(/accept="image\/\*"/g)).toHaveLength(2)
    expect(scanUiSource).toContain('capture="environment"')
    expect(scanUiSource).toContain("onClick={() => cameraInputRef.current?.click()}")
    expect(scanUiSource).toContain("onClick={() => galleryInputRef.current?.click()}")
    expect(scanUiSource.match(/tabIndex=\{-1\}/g)).toHaveLength(2)
    expect(scanUiSource).toContain("Choose from gallery")
    expect(scanUiSource).not.toContain("<Button asChild")
    expect(scanUiSource).toContain("createMockPhotoScan(nextFile)")
    expect(scanUiSource).toContain("Simulating photo location metadata…")
    expect(scanUiSource).toContain("Matching DPWH contract 17HH0130…")
    expect(scanUiSource).toContain("Simulated photo location")
    expect(scanLogicSource).toContain('id: "dpwh-17HH0130"')
    expect(scanLogicSource).toContain("CONSTRUCTION / MAINTENANCE OF FLOOD CONTROL MITIGATION STRUCTURES, BRGY. MAMBALING, CEBU CITY")
  })

  it("keeps photos temporary and performs no upload or external scan request", () => {
    expect(scanUiSource).toContain("Browser-only demonstration")
    expect(scanUiSource).toContain("is not uploaded or stored")
    expect(scanUiSource).toContain("URL.createObjectURL(file)")
    expect(scanUiSource).toContain("URL.revokeObjectURL(nextUrl)")
    expect(scanUiSource).toContain("does not read real EXIF metadata")
    expect(scanUiSource).not.toMatch(/supabase|scan-project|fetch\s*\(/i)
    expect(scanLogicSource).not.toMatch(/arrayBuffer|FileReader|fetch\s*\(/)
  })
})
