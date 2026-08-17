import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const readSource = (name: string) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8")

const panelSource = readSource("./project-intelligence-panel.tsx")
const engineSource = readSource("./project-intelligence.ts")
const detailSource = readSource("./project-map.tsx")

describe("CivicLens Intelligence panel", () => {
  it("sits inside the project detail view, above the geometry and community sections", () => {
    expect(detailSource).toContain("<ProjectIntelligencePanel detail={detail} />")
    expect(detailSource.indexOf("<ProjectIntelligencePanel")).toBeLessThan(
      detailSource.indexOf("<ProjectCommunityContext"),
    )
    expect(detailSource.indexOf("<ProjectIntelligencePanel")).toBeGreaterThan(
      detailSource.indexOf("Official status"),
    )
  })

  it("orders the reading confidence, assessment, gaps, community signals, then evidence", () => {
    const order = [
      "CivicLens Intelligence",
      "<ConfidenceBlock",
      "<TransparencyGaps",
      "<CommunitySignals",
      "<EvidenceBreakdown",
    ].map((marker) => panelSource.lastIndexOf(marker))

    expect(order).toEqual([...order].sort((left, right) => left - right))
    expect(order.every((index) => index > 0)).toBe(true)
  })

  it("uses the existing design system rather than bespoke styling", () => {
    expect(panelSource).toContain('from "@/components/ui/progress"')
    expect(panelSource).toContain('from "@/components/ui/badge"')
    expect(panelSource).toContain('from "@/components/ui/collapsible"')
    expect(panelSource).toContain('from "@/lib/utils"')
    expect(panelSource).toContain("font-heading text-sm font-semibold")
    expect(panelSource).not.toMatch(/style=\{\{\s*(background|color|border)/)
  })

  it("exposes an accessible confidence indicator with an explanation on interaction", () => {
    expect(panelSource).toContain('aria-label="CivicLens assessment confidence"')
    expect(panelSource).toContain("aria-valuetext={`${intelligence.confidence}%")
    expect(panelSource).toContain("How this was scored")
    expect(panelSource).toContain("{intelligence.confidenceSummary}")
  })

  it("renders source chips that reveal supporting information", () => {
    expect(panelSource).toContain("function SourceChip")
    expect(panelSource).toContain("{source.facts.map((fact)")
    expect(panelSource).toContain("{source.urlLabel ?? \"Open source\"}")
    expect(panelSource).toContain("{intelligence.sources.map((source)")
  })

  it("labels resident accounts as reports rather than verified findings", () => {
    expect(panelSource).toContain("not verified")
    expect(panelSource).toContain("does not allege wrongdoing")
  })

  it("keeps prototype vocabulary out of the rendered interface", () => {
    // Comments and identifiers aside, no user-visible string may read as a demo.
    const visibleText = panelSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")

    for (const forbidden of [
      "Mock",
      "Simulated",
      "Demo data",
      "Placeholder",
      "Fake",
      "This is a prototype",
    ]) {
      expect(visibleText).not.toContain(forbidden)
    }
  })

  it("derives its reading from the shared engine instead of hardcoded copy", () => {
    expect(panelSource).toContain("analyzeProject({")
    expect(panelSource).toContain("listPostsForProject(projectId)")
    expect(panelSource).toContain("communityAvailable: state === \"ready\"")
    expect(panelSource).not.toMatch(/appears to be progressing according to official records/i)
    expect(engineSource).not.toMatch(/Math\.random|Date\.now\(\)/)
  })
})
