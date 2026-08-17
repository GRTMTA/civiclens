import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const migrationPath = fileURLToPath(
  new URL("../../supabase/migrations/20260816030000_automatic_project_estimates.sql", import.meta.url),
)
const sql = readFileSync(migrationPath, "utf8")

describe("automatic project estimate migration", () => {
  it("keeps browser roles away from local OSM staging and guards automatic provenance", () => {
    expect(sql).toContain("revoke all on table public.osm_estimate_features from public, anon, authenticated")
    expect(sql).toContain("revoke all on function public.refresh_all_project_automatic_estimates() from public, anon, authenticated")
    expect(sql).toContain("automatic_project_estimate_is_operator_managed")
    expect(sql).toContain("before update of automatic_estimate_geometry")
  })

  it("enforces the 50 metre nearest match and fallback-circle radius", () => {
    expect(sql).toContain("st_dwithin(feature.geometry::extensions.geography, project_point, 50)")
    expect(sql).toContain("extensions.st_buffer(p_point, 50)::extensions.geometry")
  })

  it("casts enum categories and persists circular fallback estimates for existing projects", () => {
    expect(sql).toContain("public.project_estimate_class(p.category::text)")
    expect(sql).toContain("update public.projects p")
    expect(sql).toContain("automatic_estimate_method = 'radius_circle'")
  })

  it("uses official, reviewed, automatic, then circular fallback display precedence", () => {
    const official = sql.indexOf("when p.official_geometry is not null then p.official_geometry")
    const reviewed = sql.indexOf("when p.reviewed_estimate_geometry is not null then p.reviewed_estimate_geometry", official)
    const automatic = sql.indexOf("when p.automatic_estimate_geometry is not null then p.automatic_estimate_geometry", reviewed)
    const circle = sql.indexOf("else public.project_estimate_circle", automatic)

    expect(official).toBeGreaterThan(-1)
    expect(reviewed).toBeGreaterThan(official)
    expect(automatic).toBeGreaterThan(reviewed)
    expect(circle).toBeGreaterThan(automatic)
  })
})
