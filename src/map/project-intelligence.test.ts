import { describe, expect, it } from "vitest"

import type { CommunityPost } from "@/community/community-contract"
import type { ProjectDetail } from "./map-contract"
import { analyzeProject, formatPesoInProse } from "./project-intelligence"

const NOW = new Date("2026-08-17T00:00:00Z")

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "dpwh-17HH0130",
    source: "DPWH Transparency Portal",
    sourceUrl: "https://example.gov.ph/records/17HH0130",
    name: "CONSTRUCTION OF FLOOD CONTROL STRUCTURES, BRGY. MAMBALING, CEBU CITY",
    category: "Flood Control and Drainage",
    description: "Construction of flood control mitigation structures.",
    agency: "DPWH Cebu City District Engineering Office",
    contractor: "Example Builders Corp.",
    budget: 24_800_000,
    amountPaid: 24_800_000,
    status: "Completed",
    displayStatus: "completed",
    progress: 100,
    location: "Brgy. Mambaling, Cebu City",
    latitude: 10.2894062,
    longitude: 123.8754864,
    lastChecked: "2026-08-10T00:00:00Z",
    contractId: "17HH0130",
    startDate: "2025-01-15T00:00:00Z",
    completionDate: "2025-11-30T00:00:00Z",
    infrastructureYear: "2025",
    programName: "Flood Management Program",
    sourceOfFunds: "GAA 2025",
    geometryKind: "official",
    geometrySource: "DPWH",
    geometrySourceUrl: "https://example.gov.ph/geometry/17HH0130",
    ...overrides,
  }
}

function post(
  id: string,
  author: string,
  title: string,
  body: string,
  createdAt = "2026-08-01T00:00:00Z",
): CommunityPost {
  return {
    id,
    kind: "observation",
    title,
    body,
    authorName: author,
    author: { name: author, username: author.toLowerCase(), avatarPath: null, avatarUrl: null },
    createdAt,
    topic: "infrastructure",
    score: 3,
    commentCount: 1,
    viewerVote: 0,
    project: { id: "dpwh-17HH0130", name: "Flood control" },
    areaLabel: "Brgy. Mambaling",
    media: [],
  }
}

const SUPPORTIVE = [
  post("p1", "Ana", "Drainage is working", "The canal is in use and there is no more flooding on our street."),
  post("p2", "Ben", "Passable again", "The road is now passable and much better after the work."),
  post("p3", "Cara", "Operational", "Structure is operational, commuters use it daily."),
]

const CONCERNED = [
  post("c1", "Dina", "Still unfinished", "Portions remain unfinished despite the listing; wala pa nahuman."),
  post("c2", "Elmo", "Cracked already", "The concrete is cracked and crumbling near the outfall."),
  post("c3", "Fay", "Still floods", "It still floods knee deep during heavy rain, drainage is clogged."),
]

describe("project intelligence confidence", () => {
  it("is deterministic for the same inputs", () => {
    const first = analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW })
    const second = analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW })

    expect(second.confidence).toBe(first.confidence)
    expect(second.assessment).toBe(first.assessment)
    expect(second.transparencyGaps.map((gap) => gap.id)).toEqual(
      first.transparencyGaps.map((gap) => gap.id),
    )
  })

  it("scores agreeing evidence higher than conflicting evidence", () => {
    const agreeing = analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW })
    const conflicting = analyzeProject({ detail: project(), posts: CONCERNED, now: NOW })
    const sparse = analyzeProject({
      detail: project({
        contractor: undefined,
        contractId: undefined,
        budget: undefined,
        amountPaid: undefined,
        completionDate: undefined,
        progress: undefined,
        description: "",
        sourceUrl: "",
        geometryKind: "estimated",
        geometrySource: undefined,
        geometrySourceUrl: undefined,
        lastChecked: "2023-01-01T00:00:00Z",
      }),
      posts: [],
      now: NOW,
    })

    expect(agreeing.band).toBe("high")
    expect(agreeing.confidence).toBeGreaterThan(conflicting.confidence)
    expect(conflicting.confidence).toBeGreaterThan(sparse.confidence)
    expect(sparse.band).toBe("low")
  })

  it("produces different readings for different projects rather than one template", () => {
    const readings = [
      analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW }),
      analyzeProject({ detail: project(), posts: CONCERNED, now: NOW }),
      analyzeProject({
        detail: project({ status: "Ongoing", displayStatus: "ongoing", progress: 42, completionDate: undefined }),
        posts: [],
        now: NOW,
      }),
    ]

    expect(new Set(readings.map((reading) => reading.assessment)).size).toBe(3)
    expect(new Set(readings.map((reading) => reading.confidence)).size).toBe(3)
  })

  it("weights factors to a bounded percentage", () => {
    const reading = analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW })
    const totalWeight = reading.factors.reduce((total, factor) => total + factor.weight, 0)

    expect(totalWeight).toBeCloseTo(1, 5)
    expect(reading.confidence).toBeGreaterThanOrEqual(28)
    expect(reading.confidence).toBeLessThanOrEqual(96)
  })
})

describe("project intelligence assessment language", () => {
  it("attributes resident claims instead of restating them as established fact", () => {
    const reading = analyzeProject({ detail: project(), posts: CONCERNED, now: NOW })

    expect(reading.assessment).toMatch(/residents? posted/i)
    expect(reading.assessment).toMatch(/not fully corroborated|raise concerns/i)
    expect(reading.assessment).not.toMatch(/\bthe project is unfinished\b/i)
    expect(reading.assessment).not.toMatch(/\bis incomplete\b/i)
  })

  it("never alleges wrongdoing anywhere in the reading", () => {
    const readings = [
      analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW }),
      analyzeProject({ detail: project(), posts: CONCERNED, now: NOW }),
      analyzeProject({
        detail: project({ geometryKind: "estimated", amountPaid: 30_000_000 }),
        posts: [
          post("x1", "Gil", "No project here", "We cannot find any project at this spot, walay project."),
          post("x2", "Hana", "Nothing built", "Nothing was built here as far as we can see."),
        ],
        now: NOW,
      }),
    ]

    const text = readings
      .flatMap((reading) => [
        reading.assessment,
        reading.confidenceSummary,
        ...reading.transparencyGaps.flatMap((gap) => [gap.title, gap.detail]),
        ...reading.evidence.flatMap((item) => [item.title, item.detail]),
        ...reading.factors.flatMap((factor) => [factor.label, factor.detail]),
        ...reading.sources.flatMap((source) => [source.label, source.detail]),
        ...reading.communitySignals.themes.map((theme) => theme.label),
      ])
      .join(" ")
      .toLowerCase()

    for (const forbidden of [
      "fraud",
      "corrupt",
      "stole",
      "theft",
      "falsif",
      "anomal",
      "ghost project",
      "scam",
      "criminal",
      "embezzl",
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  it("keeps prototype vocabulary out of every user-visible string", () => {
    const reading = analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW })
    const text = [
      reading.assessment,
      reading.confidenceSummary,
      reading.bandLabel,
      ...reading.transparencyGaps.flatMap((gap) => [gap.title, gap.detail]),
      ...reading.evidence.flatMap((item) => [item.title, item.detail]),
      ...reading.sources.flatMap((source) => [
        source.label,
        source.detail,
        ...source.facts.map((fact) => `${fact.label} ${fact.value}`),
      ]),
    ]
      .join(" ")
      .toLowerCase()

    for (const forbidden of [
      "mock",
      "simulat",
      "demo",
      "placeholder",
      "fake",
      "prototype",
      "sample data",
      "generated example",
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  it("summarises the record with its own figures", () => {
    const reading = analyzeProject({ detail: project(), posts: [], now: NOW })

    expect(reading.assessment).toContain("₱24.8 million")
    expect(reading.assessment).toContain("100% reported completion")
    expect(reading.assessment).toContain("“Completed”")
    expect(formatPesoInProse(1_250_000_000)).toBe("₱1.3 billion")
    expect(formatPesoInProse(undefined)).toBe("an unrecorded amount")
  })
})

describe("transparency gap detection", () => {
  it("raises a high-concern gap when several residents contradict a completed status", () => {
    const reading = analyzeProject({ detail: project(), posts: CONCERNED, now: NOW })
    const gap = reading.transparencyGaps.find((entry) => entry.id === "status-conflict")

    expect(gap?.severity).toBe("high")
    expect(gap?.detail).toMatch(/not been independently verified/i)
    expect(reading.transparencyGaps[0].severity).toBe("high")
  })

  it("raises a site-presence gap only when more than one resident reports it", () => {
    const single = analyzeProject({
      detail: project(),
      posts: [post("s1", "Gil", "No project here", "We cannot find any project at this spot.")],
      now: NOW,
    })
    const several = analyzeProject({
      detail: project(),
      posts: [
        post("s1", "Gil", "No project here", "We cannot find any project at this spot."),
        post("s2", "Hana", "Nothing built", "Nothing was built here as far as we can see."),
      ],
      now: NOW,
    })

    expect(single.transparencyGaps.map((gap) => gap.id)).not.toContain("site-presence")
    expect(several.transparencyGaps.map((gap) => gap.id)).toContain("site-presence")
  })

  it("reports internal record disagreements descriptively", () => {
    const reading = analyzeProject({
      detail: project({ progress: 62 }),
      posts: SUPPORTIVE,
      now: NOW,
    })
    const gap = reading.transparencyGaps.find((entry) => entry.id === "record-inconsistency")

    expect(gap?.detail).toContain("reported completion is 62%")
    expect(gap?.detail).toMatch(/recording lag/i)
  })

  it("flags an undelineated extent for every non-official geometry", () => {
    const reading = analyzeProject({
      detail: project({ geometryKind: "automatic_estimate", geometryEstimateMethod: "osm_nearest" }),
      posts: SUPPORTIVE,
      now: NOW,
    })

    expect(reading.transparencyGaps.map((gap) => gap.id)).toContain("extent-undelineated")
  })

  it("states that no significant gaps were detected on a clean, corroborated record", () => {
    const reading = analyzeProject({
      detail: project({ lastChecked: "2026-08-16T00:00:00Z" }),
      posts: SUPPORTIVE,
      now: NOW,
    })

    expect(reading.transparencyGaps[0].id).toBe("no-significant-gaps")
    expect(reading.transparencyGaps.every((gap) => gap.severity === "low")).toBe(true)
  })

  it("caps the gap list so the panel stays scannable", () => {
    const reading = analyzeProject({
      detail: project({
        contractor: undefined,
        contractId: undefined,
        budget: undefined,
        progress: 40,
        geometryKind: "estimated",
        lastChecked: "2022-01-01T00:00:00Z",
      }),
      posts: CONCERNED,
      now: NOW,
    })

    expect(reading.transparencyGaps.length).toBeLessThanOrEqual(5)
  })
})

describe("community signal weighting", () => {
  it("separates a single account from several independent accounts", () => {
    const single = analyzeProject({ detail: project(), posts: [SUPPORTIVE[0]], now: NOW })
    const several = analyzeProject({ detail: project(), posts: SUPPORTIVE.slice(0, 2), now: NOW })

    expect(single.communitySignals.strength).toBe("single")
    expect(single.communitySignals.strengthLabel).toBe("Single resident account")
    expect(single.assessment).toContain("single account is not treated as a community pattern")
    expect(several.communitySignals.strength).toBe("several")
  })

  it("treats a repeated concern from three residents as recurring", () => {
    const reading = analyzeProject({
      detail: project(),
      posts: [
        post("r1", "Ivy", "Cracks", "The surface is cracked near the corner."),
        post("r2", "Jon", "Cracked too", "More cracked sections appeared this month."),
        post("r3", "Kit", "Cracking", "Cracking is spreading along the canal wall."),
      ],
      now: NOW,
    })

    expect(reading.communitySignals.strength).toBe("recurring")
    const theme = reading.communitySignals.themes.find((entry) => entry.id === "quality")
    expect(theme?.residents).toBe(3)
    expect(theme?.recurring).toBe(true)
  })

  it("does not multiply one resident's repeated posts into a pattern", () => {
    const reading = analyzeProject({
      detail: project(),
      posts: [
        post("m1", "Lia", "Cracks", "The surface is cracked."),
        post("m2", "Lia", "Still cracked", "Still cracked and crumbling this week."),
        post("m3", "Lia", "Cracking more", "Cracking is worse now."),
      ],
      now: NOW,
    })

    expect(reading.communitySignals.observations).toBe(3)
    expect(reading.communitySignals.residents).toBe(1)
    expect(reading.communitySignals.strength).toBe("single")
  })

  it("classifies supportive and concerned accounts separately", () => {
    const reading = analyzeProject({
      detail: project(),
      posts: [...SUPPORTIVE, ...CONCERNED],
      now: NOW,
    })

    expect(reading.communitySignals.supportive).toBe(3)
    expect(reading.communitySignals.concerns).toBe(3)
    expect(reading.communitySignals.residents).toBe(6)
  })

  it("counts a post with no stated view as neutral rather than either side", () => {
    const reading = analyzeProject({
      detail: project(),
      posts: [post("n1", "Mika", "Question about schedule", "Does anyone know who to contact about this record?")],
      now: NOW,
    })

    expect(reading.communitySignals.neutral).toBe(1)
    expect(reading.communitySignals.supportive).toBe(0)
    expect(reading.communitySignals.concerns).toBe(0)
  })

  it("reports the absence of resident accounts without exaggerating it", () => {
    const reading = analyzeProject({ detail: project(), posts: [], now: NOW })

    expect(reading.communitySignals.strength).toBe("none")
    expect(reading.assessment).toContain("No resident has posted about this record")
    expect(reading.transparencyGaps.map((gap) => gap.id)).toContain("no-local-observation")
  })

  it("degrades rather than fails when resident discussion is unavailable", () => {
    const reading = analyzeProject({
      detail: project(),
      posts: [],
      communityAvailable: false,
      now: NOW,
    })

    expect(reading.communitySignals.available).toBe(false)
    expect(reading.assessment).toContain("could not be read")
    expect(reading.confidence).toBeGreaterThan(0)
  })

  it("limits excerpts to a couple of representative accounts", () => {
    const reading = analyzeProject({
      detail: project(),
      posts: [...SUPPORTIVE, ...CONCERNED],
      now: NOW,
    })

    expect(reading.communitySignals.excerpts.length).toBeLessThanOrEqual(2)
    expect(new Set(reading.communitySignals.excerpts.map((entry) => entry.stance)).size).toBe(
      reading.communitySignals.excerpts.length,
    )
  })
})

describe("evidence and source attribution", () => {
  it("attributes every evidence line to a declared source", () => {
    const reading = analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW })
    const sourceIds = new Set(reading.sources.map((source) => source.id))

    expect(reading.evidence.length).toBeGreaterThan(0)
    for (const item of reading.evidence) expect(sourceIds.has(item.source)).toBe(true)
    for (const gap of reading.transparencyGaps) {
      for (const id of gap.sources) expect(sourceIds.has(id)).toBe(true)
    }
  })

  it("uses only real, resolvable source locations", () => {
    const reading = analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW })

    for (const source of reading.sources) {
      if (!source.url) continue
      expect(source.url).toMatch(/^(https:\/\/|\/)/)
      expect(source.url).not.toMatch(/example\.(com|org|invalid)/)
    }
    expect(reading.sources.find((source) => source.id === "community")?.url).toBe(
      "/community?project=dpwh-17HH0130",
    )
  })

  it("marks an uncorroborated category as a gap rather than as support", () => {
    const reading = analyzeProject({
      detail: project({ amountPaid: undefined, geometryKind: "estimated" }),
      posts: [],
      now: NOW,
    })

    const byId = new Map(reading.evidence.map((item) => [item.id, item]))
    expect(byId.get("disbursement")?.status).toBe("gap")
    expect(byId.get("geographic-reference")?.status).toBe("gap")
    expect(byId.get("community-observation")?.status).toBe("gap")
    expect(byId.get("procurement-reference")?.status).toBe("gap")
  })

  it("keeps imagery framed as context rather than proof of completion", () => {
    const reading = analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW })
    const imagery = reading.evidence.find((item) => item.id === "imagery-reference")

    expect(imagery?.status).toBe("partial")
    expect(imagery?.detail).toMatch(/not detailed enough to confirm/i)
  })

  it("explains the confidence score in terms of evidence, not model certainty", () => {
    const reading = analyzeProject({ detail: project(), posts: SUPPORTIVE, now: NOW })

    expect(reading.confidenceSummary).toMatch(/^Based on /)
    expect(reading.confidenceSummary).not.toMatch(/\bi (?:am|feel)\b|\bthe (?:ai|model)\b/i)
  })

  it("anchors lastAnalyzed to the newest evidence timestamp", () => {
    const reading = analyzeProject({
      detail: project({ lastChecked: "2026-08-10T00:00:00Z" }),
      posts: [post("t1", "Nia", "Recent look", "The canal is in use.", "2026-08-15T00:00:00Z")],
      now: NOW,
    })

    expect(reading.lastAnalyzed).toBe("2026-08-15T00:00:00.000Z")
  })
})
