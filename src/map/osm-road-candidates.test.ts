import { describe, expect, it, vi } from "vitest"

import {
  fetchOsmRoadCandidates,
  parseOverpassRoadCandidates,
} from "./osm-road-candidates"

const CENTER = [123.9, 10.3] as [number, number]

function roadWay(id: number, name: string, offset = 0) {
  return {
    type: "way",
    id,
    tags: { highway: "primary", name },
    geometry: [
      { lon: 123.897, lat: 10.3 + offset },
      { lon: 123.9, lat: 10.3 + offset },
      { lon: 123.903, lat: 10.3 + offset },
    ],
  }
}

describe("OSM road candidate lookup", () => {
  it("sorts nearby ways and clips long roads around the DPWH point", () => {
    const candidates = parseOverpassRoadCandidates(
      { elements: [roadWay(22, "Second Road", 0.0003), roadWay(11, "Nearest Road")] },
      CENTER,
    )

    expect(candidates.map((candidate) => candidate.osmWayId)).toEqual([11, 22])
    expect(candidates[0]).toMatchObject({
      name: "Nearest Road",
      highway: "primary",
      distanceMeters: 0,
      sourceUrl: "https://www.openstreetmap.org/way/11",
      geometry: { type: "LineString" },
    })
    expect(candidates[0].geometry.coordinates.length).toBeGreaterThanOrEqual(2)
    expect(candidates[0].geometry.coordinates[0][0]).toBeGreaterThan(123.897)
    expect(candidates[0].geometry.coordinates.at(-1)?.[0]).toBeLessThan(123.903)
  })

  it("drops malformed, non-way, and distant results", () => {
    const candidates = parseOverpassRoadCandidates({
      elements: [
        { type: "node", id: 1, geometry: [] },
        { type: "way", id: "bad", geometry: [] },
        roadWay(2, "Too far", 0.002),
      ],
    }, CENTER)

    expect(candidates).toEqual([])
  })

  it("sends only a bounded coordinate query and parses the response", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      new Response(JSON.stringify({ elements: [roadWay(33, "Candidate")] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch

    const result = await fetchOsmRoadCandidates(10.3, 123.9, {
      endpoint: "https://overpass.example/api/interpreter",
      fetcher,
    })

    expect(result[0].osmWayId).toBe(33)
    expect(fetcher).toHaveBeenCalledOnce()
    const [, init] = vi.mocked(fetcher).mock.calls[0]
    expect(String(init?.body)).toContain("way%28around%3A100%2C10.3%2C123.9%29")
    expect(String(init?.body)).not.toContain("Candidate")
  })

  it("surfaces provider failures without inventing road geometry", async () => {
    const fetcher = vi.fn(async () => new Response("busy", { status: 429 })) as unknown as typeof fetch

    await expect(
      fetchOsmRoadCandidates(10.3, 123.9, { fetcher }),
    ).rejects.toThrow("OpenStreetMap road lookup failed (429)")
  })
})
