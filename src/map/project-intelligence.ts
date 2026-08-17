/**
 * Project intelligence: an analytical layer over one Official-source record.
 *
 * This module derives a structured assessment of a single project from evidence
 * CivicLens actually holds — the DPWH-recorded fields, resident discussion
 * explicitly linked to the record, and the geographic/imagery references the
 * map already uses. It is deliberately deterministic: the same inputs always
 * produce the same confidence, wording, gaps, and evidence list, so the reading
 * is reproducible and auditable rather than generated anew on each view.
 *
 * Two rules constrain everything below:
 *
 * 1. Resident accounts are *reported*, never *established*. The assessment
 *    attributes every community-derived claim to residents and never restates
 *    it as a fact about the project.
 * 2. CivicLens surfaces verification gaps. It does not allege wrongdoing, so no
 *    output may characterise a project, agency, or contractor as fraudulent,
 *    corrupt, anomalous, or dishonest.
 */

import type { CommunityPost, CommunityPulse } from "@/community/community-contract"
import { projectDiscussionPath } from "@/community/community-routes"
import type { ProjectDetail } from "./map-contract"

export type ConfidenceBand = "high" | "moderate" | "low"
export type GapSeverity = "low" | "moderate" | "high"
/** How well one evidence line supports the assessment. */
export type EvidenceStatus = "supported" | "partial" | "gap"
export type SourceId = "dpwh" | "community" | "openstreetmap" | "imagery" | "procurement"

export type SourceFact = {
  label: string
  value: string
}

export type IntelligenceSource = {
  id: SourceId
  /** Compact chip label. */
  label: string
  /** What the source is, in one line. */
  detail: string
  status: EvidenceStatus
  facts: SourceFact[]
  /** Real, resolvable location for the source. Never a fabricated citation. */
  url?: string
  urlLabel?: string
}

export type TransparencyGap = {
  id: string
  severity: GapSeverity
  title: string
  detail: string
  sources: SourceId[]
}

export type EvidenceItem = {
  id: string
  status: EvidenceStatus
  title: string
  detail: string
  source: SourceId
}

export type CommunityThemeId =
  | "existence"
  | "incomplete"
  | "delay"
  | "quality"
  | "flooding"
  | "documentation"
  | "cost"
  | "usage"
  | "improvement"

export type CommunityStance = "supportive" | "concern" | "neutral"

export type CommunityTheme = {
  id: CommunityThemeId
  label: string
  stance: Exclude<CommunityStance, "neutral">
  /** Posts mentioning the theme. */
  mentions: number
  /** Distinct residents mentioning it — one person repeating is not a pattern. */
  residents: number
  recurring: boolean
}

export type CommunityExcerpt = {
  postId: string
  stance: CommunityStance
  authorName: string
  createdAt: string
  text: string
}

/**
 * Weight of the community signal.
 *
 * A single account, several independent accounts, and a concern raised by many
 * residents are different kinds of evidence and are never presented alike.
 */
export type CommunityStrength = "none" | "single" | "several" | "recurring"

export type CommunitySignals = {
  available: boolean
  observations: number
  supportive: number
  concerns: number
  neutral: number
  residents: number
  photos: number
  comments: number
  lastActivityAt: string | null
  strength: CommunityStrength
  strengthLabel: string
  themes: CommunityTheme[]
  excerpts: CommunityExcerpt[]
}

export type ConfidenceFactor = {
  id: string
  label: string
  detail: string
  /** Share of the confidence score this factor can contribute. */
  weight: number
  /** 0–1 quality of this factor for this project. */
  score: number
}

export type ProjectIntelligence = {
  projectId: string
  confidence: number
  band: ConfidenceBand
  bandLabel: string
  confidenceSummary: string
  factors: ConfidenceFactor[]
  assessment: string
  transparencyGaps: TransparencyGap[]
  communitySignals: CommunitySignals
  evidence: EvidenceItem[]
  sources: IntelligenceSource[]
  /** Newest evidence timestamp behind this assessment. */
  lastAnalyzed: string
}

export type IntelligenceInput = {
  detail: ProjectDetail
  posts?: readonly CommunityPost[]
  pulse?: CommunityPulse | null
  /** False when resident discussion could not be read at all. */
  communityAvailable?: boolean
  now?: Date
}

const DAY_MS = 86_400_000

const BAND_LABELS: Record<ConfidenceBand, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
}

const STRENGTH_LABELS: Record<CommunityStrength, string> = {
  none: "No resident accounts yet",
  single: "Single resident account",
  several: "Several independent accounts",
  recurring: "Recurring community concern",
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatPeso(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "Not recorded"
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value)
}

/** Prose-friendly amount, e.g. "₱24.8 million". */
export function formatPesoInProse(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "an unrecorded amount"
  if (value >= 1_000_000_000) return `₱${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")} billion`
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")} million`
  return formatPeso(value)
}

export function formatRecordDate(value?: string): string {
  if (!value) return "Not recorded"
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(date)
}

function parseTime(value?: string | null): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function daysSince(value: string | null | undefined, now: Date): number | null {
  const time = parseTime(value)
  return time === null ? null : Math.floor((now.valueOf() - time) / DAY_MS)
}

function sentence(text: string): string {
  const trimmed = text.trim()
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ── Community signal extraction ───────────────────────────────────────────────

type ThemeDefinition = {
  id: CommunityThemeId
  label: string
  stance: Exclude<CommunityStance, "neutral">
  /** Lowercase substrings, including common Cebuano/Tagalog phrasing. */
  terms: readonly string[]
}

/**
 * Theme vocabulary for resident text.
 *
 * Labels are written as attributed reports ("Reported as…") so a theme can
 * never be read as a CivicLens finding about the project.
 */
const THEMES: readonly ThemeDefinition[] = [
  {
    id: "existence",
    label: "Reported as not found on site",
    stance: "concern",
    terms: [
      "does not exist",
      "doesn't exist",
      "no such project",
      "no project here",
      "cannot find",
      "can't find",
      "could not find",
      "nothing was built",
      "nothing built",
      "no sign of any work",
      "walay project",
      "wala man project",
      "walang proyekto",
    ],
  },
  {
    id: "incomplete",
    label: "Reported as incomplete on site",
    stance: "concern",
    terms: [
      "unfinished",
      "not finished",
      "still incomplete",
      "incomplete",
      "half done",
      "halfway",
      "partially finished",
      "still under construction",
      "wala pa nahuman",
      "wala pa humana",
      "hindi pa tapos",
      "di pa tapos",
    ],
  },
  {
    id: "delay",
    label: "Reported delays or stalled work",
    stance: "concern",
    terms: [
      "delay",
      "delayed",
      "stalled",
      "abandoned",
      "no workers",
      "work stopped",
      "months late",
      "years late",
      "dugay",
      "matagal",
    ],
  },
  {
    id: "quality",
    label: "Reported surface or structural damage",
    stance: "concern",
    terms: [
      "crack",
      "cracked",
      "cracking",
      "pothole",
      "potholes",
      "crumbl",
      "eroded",
      "erosion",
      "exposed rebar",
      "substandard",
      "poor quality",
      "deteriorat",
      "damaged",
      "gubaon",
      "guba na",
      "sira na",
      "lubak",
    ],
  },
  {
    id: "flooding",
    label: "Reported drainage or flooding issues",
    stance: "concern",
    terms: [
      "still floods",
      "still flooding",
      "flooded",
      "flooding",
      "knee deep",
      "clogged",
      "silted",
      "stagnant water",
      "water pools",
      "overflow",
      "baha",
      "nagbaha",
      "lubog",
    ],
  },
  {
    id: "documentation",
    label: "No project signboard reported on site",
    stance: "concern",
    terms: [
      "no signboard",
      "no sign board",
      "no billboard",
      "missing signage",
      "no project sign",
      "walay signboard",
      "walang signboard",
    ],
  },
  {
    id: "cost",
    label: "Questions raised about the recorded cost",
    stance: "concern",
    terms: [
      "overpriced",
      "too expensive for",
      "cost seems high",
      "price seems high",
      "mahal kaayo",
      "sobrang mahal",
    ],
  },
  {
    id: "usage",
    label: "Reported as in use",
    stance: "supportive",
    terms: [
      "in use",
      "now passable",
      "passable",
      "being used",
      "we use it",
      "commuters use",
      "traffic flows",
      "operational",
      "open to traffic",
      "gamiton",
      "magamit na",
      "nagamit na",
    ],
  },
  {
    id: "improvement",
    label: "Reported improvement after the work",
    stance: "supportive",
    terms: [
      "no more flooding",
      "flooding stopped",
      "much better",
      "improved",
      "smoother",
      "smooth now",
      "faster commute",
      "safer now",
      "well built",
      "maayo na",
      "mas maayo",
      "ayos na",
    ],
  },
]

function postText(post: CommunityPost): string {
  return `${post.title} ${post.body}`.toLowerCase()
}

function residentKey(post: CommunityPost): string {
  return post.author.username ?? post.authorName
}

function matchedThemes(text: string): ThemeDefinition[] {
  return THEMES.filter((theme) => theme.terms.some((term) => text.includes(term)))
}

function stanceOf(themes: readonly ThemeDefinition[]): CommunityStance {
  const concerns = themes.filter((theme) => theme.stance === "concern").length
  const supportive = themes.filter((theme) => theme.stance === "supportive").length
  if (concerns === 0 && supportive === 0) return "neutral"
  if (concerns > supportive) return "concern"
  if (supportive > concerns) return "supportive"
  // A post describing both use and damage is a concern account with context.
  return "concern"
}

function excerptFrom(post: CommunityPost): string {
  const body = post.body.trim().replace(/\s+/g, " ")
  const source = body.length >= 40 ? body : post.title.trim().replace(/\s+/g, " ")
  return source.length > 150 ? `${source.slice(0, 147).trimEnd()}…` : source
}

function readCommunitySignals(
  posts: readonly CommunityPost[],
  pulse: CommunityPulse | null,
  available: boolean,
): CommunitySignals {
  const classified = posts.map((post) => {
    const themes = matchedThemes(postText(post))
    return { post, themes, stance: stanceOf(themes) }
  })

  const residents = new Set(posts.map(residentKey))
  const themeResidents = new Map<CommunityThemeId, Set<string>>()
  const themeMentions = new Map<CommunityThemeId, number>()

  for (const entry of classified) {
    for (const theme of entry.themes) {
      themeMentions.set(theme.id, (themeMentions.get(theme.id) ?? 0) + 1)
      const seen = themeResidents.get(theme.id) ?? new Set<string>()
      seen.add(residentKey(entry.post))
      themeResidents.set(theme.id, seen)
    }
  }

  const themes: CommunityTheme[] = THEMES.filter((theme) => themeMentions.has(theme.id))
    .map((theme) => {
      const residentCount = themeResidents.get(theme.id)?.size ?? 0
      return {
        id: theme.id,
        label: theme.label,
        stance: theme.stance,
        mentions: themeMentions.get(theme.id) ?? 0,
        residents: residentCount,
        recurring: residentCount >= 3,
      }
    })
    .sort(
      (left, right) =>
        right.residents - left.residents ||
        right.mentions - left.mentions ||
        left.id.localeCompare(right.id),
    )

  const supportive = classified.filter((entry) => entry.stance === "supportive").length
  const concerns = classified.filter((entry) => entry.stance === "concern").length
  const neutral = classified.length - supportive - concerns

  const pick = (stance: CommunityStance) =>
    classified
      .filter((entry) => entry.stance === stance)
      .sort(
        (left, right) =>
          right.post.score - left.post.score ||
          Date.parse(right.post.createdAt) - Date.parse(left.post.createdAt) ||
          left.post.id.localeCompare(right.post.id),
      )[0]

  const excerpts = [pick("concern"), pick("supportive"), pick("neutral")]
    .filter((entry): entry is (typeof classified)[number] => Boolean(entry))
    .slice(0, 2)
    .map((entry) => ({
      postId: entry.post.id,
      stance: entry.stance,
      authorName: entry.post.authorName,
      createdAt: entry.post.createdAt,
      text: excerptFrom(entry.post),
    }))

  const residentCount = residents.size
  const strength: CommunityStrength =
    residentCount === 0
      ? "none"
      : themes.some((theme) => theme.recurring)
        ? "recurring"
        : residentCount === 1
          ? "single"
          : "several"

  const lastActivityAt =
    pulse?.lastActivityAt ??
    posts.reduce<string | null>((latest, post) => {
      const time = parseTime(post.createdAt)
      if (time === null) return latest
      const latestTime = parseTime(latest)
      return latestTime === null || time > latestTime ? post.createdAt : latest
    }, null)

  return {
    available,
    observations: posts.length,
    supportive,
    concerns,
    neutral,
    residents: residentCount,
    photos: pulse?.photos ?? posts.reduce((total, post) => total + post.media.length, 0),
    comments: pulse?.comments ?? posts.reduce((total, post) => total + post.commentCount, 0),
    lastActivityAt,
    strength,
    strengthLabel: STRENGTH_LABELS[strength],
    themes,
    excerpts,
  }
}

// ── Record analysis ──────────────────────────────────────────────────────────

const RECORD_FIELDS: readonly { label: string; present: (detail: ProjectDetail) => boolean }[] = [
  { label: "contract ID", present: (detail) => Boolean(detail.contractId) },
  { label: "contractor", present: (detail) => Boolean(detail.contractor) },
  { label: "implementing office", present: (detail) => detail.agency !== "Not provided" && Boolean(detail.agency) },
  { label: "contract amount", present: (detail) => detail.budget !== undefined },
  { label: "amount paid", present: (detail) => detail.amountPaid !== undefined },
  { label: "start date", present: (detail) => Boolean(detail.startDate) },
  { label: "completion date", present: (detail) => Boolean(detail.completionDate) },
  { label: "reported completion", present: (detail) => detail.progress !== undefined },
  { label: "project description", present: (detail) => detail.description.trim().length > 0 },
  { label: "source of funds", present: (detail) => Boolean(detail.sourceOfFunds) },
  { label: "programme", present: (detail) => Boolean(detail.programName) },
  { label: "infrastructure year", present: (detail) => Boolean(detail.infrastructureYear) },
]

function missingFields(detail: ProjectDetail): string[] {
  return RECORD_FIELDS.filter((field) => !field.present(detail)).map((field) => field.label)
}

/** Field-level disagreements inside the record itself, phrased descriptively. */
function recordInconsistencies(detail: ProjectDetail, now: Date): string[] {
  const notes: string[] = []
  const completed = detail.displayStatus === "completed"

  if (completed && detail.progress !== undefined && detail.progress < 100) {
    notes.push(
      `the record reads “${detail.status}” while reported completion is ${detail.progress}%`,
    )
  }
  if (detail.progress === 100 && !completed) {
    notes.push(`reported completion is 100% while the status reads “${detail.status}”`)
  }
  if (completed && !detail.completionDate) {
    notes.push("no completion date accompanies the completed status")
  }
  if (
    detail.budget !== undefined &&
    detail.amountPaid !== undefined &&
    detail.amountPaid > detail.budget * 1.001
  ) {
    notes.push("the amount paid is recorded above the contract amount")
  }
  const start = parseTime(detail.startDate)
  const completion = parseTime(detail.completionDate)
  if (start !== null && completion !== null && start > completion) {
    notes.push("the recorded start date falls after the recorded completion date")
  }
  if (completed && completion !== null && completion > now.valueOf()) {
    notes.push("the recorded completion date is in the future")
  }
  return notes
}

function geometryScore(detail: ProjectDetail): number {
  if (detail.geometryKind === "official") return 0.95
  if (detail.geometryKind === "reviewed_estimate") return 0.78
  if (detail.geometryKind === "automatic_estimate") return 0.58
  return 0.34
}

function geometryDescription(detail: ProjectDetail): string {
  if (detail.geometryKind === "official") {
    return `Project extent supplied by ${detail.geometrySource ?? "an official source"}.`
  }
  if (detail.geometryKind === "reviewed_estimate") {
    return "A moderator matched the recorded point to an OpenStreetMap segment. It remains an estimate."
  }
  if (detail.geometryKind === "automatic_estimate") {
    return "Extent estimated from the nearest eligible OpenStreetMap feature within 50 m of the recorded point."
  }
  return "No nearby OpenStreetMap feature matched; only the recorded coordinate anchors the location."
}

function recencyScore(days: number | null): number {
  if (days === null) return 0.35
  if (days <= 30) return 0.95
  if (days <= 90) return 0.82
  if (days <= 180) return 0.64
  if (days <= 365) return 0.46
  if (days <= 730) return 0.32
  return 0.22
}

function observationScore(residents: number, available: boolean): number {
  if (!available) return 0.2
  if (residents === 0) return 0.15
  if (residents === 1) return 0.4
  if (residents === 2) return 0.6
  if (residents <= 4) return 0.78
  return 0.92
}

function communityAgreementScore(signals: CommunitySignals): number {
  const stated = signals.supportive + signals.concerns
  if (stated <= 1) return 0.45
  const agreement = Math.max(signals.supportive, signals.concerns) / stated
  return clamp(0.35 + 0.6 * agreement, 0.35, 0.95)
}

function recordVersusCommunityScore(
  detail: ProjectDetail,
  signals: CommunitySignals,
): number {
  const stated = signals.supportive + signals.concerns
  if (stated === 0) return 0.4

  const concernRatio = signals.concerns / stated
  const base =
    detail.displayStatus === "completed"
      ? 0.95 - 0.75 * concernRatio
      : 0.9 - 0.45 * concernRatio
  const existence = signals.themes.find((theme) => theme.id === "existence")
  const penalty = existence ? (existence.residents >= 2 ? 0.2 : 0.1) : 0
  return clamp(base - penalty, 0.15, 0.95)
}

function referenceScore(detail: ProjectDetail): number {
  let score = 0.25
  if (detail.sourceUrl) score += 0.35
  if (detail.geometrySourceUrl) score += 0.2
  if (detail.programName || detail.sourceOfFunds) score += 0.1
  if (detail.contractId) score += 0.1
  return clamp(score, 0, 1)
}

// ── Confidence ───────────────────────────────────────────────────────────────

function buildFactors(
  detail: ProjectDetail,
  signals: CommunitySignals,
  now: Date,
): ConfidenceFactor[] {
  const missing = missingFields(detail)
  const completeness = (RECORD_FIELDS.length - missing.length) / RECORD_FIELDS.length
  const inconsistencies = recordInconsistencies(detail, now)
  const checkedDays = daysSince(detail.lastChecked, now)

  return [
    {
      id: "record-completeness",
      label: "DPWH record completeness",
      detail:
        missing.length === 0
          ? "Every tracked contract field is populated."
          : `${plural(missing.length, "field")} not populated: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}.`,
      weight: 0.2,
      score: clamp(0.1 + 0.9 * completeness, 0.1, 1),
    },
    {
      id: "record-consistency",
      label: "Internal consistency of the record",
      detail:
        inconsistencies.length === 0
          ? "Status, reported completion, dates, and amounts read consistently."
          : `${plural(inconsistencies.length, "field disagreement")} found: ${inconsistencies[0]}.`,
      weight: 0.16,
      score: clamp(1 - 0.25 * inconsistencies.length, 0.15, 1),
    },
    {
      id: "record-recency",
      label: "Recency of the record",
      detail:
        checkedDays === null
          ? "No refresh date accompanies the record."
          : `Record last refreshed ${plural(checkedDays, "day")} ago.`,
      weight: 0.11,
      score: recencyScore(checkedDays),
    },
    {
      id: "independent-observation",
      label: "Independent local observation",
      detail: !signals.available
        ? "Resident discussion could not be read for this record."
        : signals.residents === 0
          ? "No resident has posted about this record."
          : `${plural(signals.residents, "resident")} posted ${plural(signals.observations, "account")}.`,
      weight: 0.16,
      score: observationScore(signals.residents, signals.available),
    },
    {
      id: "community-agreement",
      label: "Agreement among resident accounts",
      detail:
        signals.supportive + signals.concerns <= 1
          ? "Too few stated accounts to compare against one another."
          : `${signals.supportive} supportive and ${signals.concerns} raising concerns.`,
      weight: 0.11,
      score: communityAgreementScore(signals),
    },
    {
      id: "record-community-agreement",
      label: "Record against resident accounts",
      detail:
        signals.supportive + signals.concerns === 0
          ? "No resident account to compare with the recorded status."
          : signals.concerns > signals.supportive
            ? `Resident accounts mostly raise concerns about the recorded status “${detail.status}”.`
            : `Resident accounts mostly align with the recorded status “${detail.status}”.`,
      weight: 0.13,
      score: recordVersusCommunityScore(detail, signals),
    },
    {
      id: "geographic-reference",
      label: "Geographic corroboration",
      detail: geometryDescription(detail),
      weight: 0.08,
      score: geometryScore(detail),
    },
    {
      id: "external-references",
      label: "External reference availability",
      detail: detail.sourceUrl
        ? "The published source record is linkable from CivicLens."
        : "No published source record link accompanies this project.",
      weight: 0.05,
      score: referenceScore(detail),
    },
  ]
}

function confidenceFrom(factors: readonly ConfidenceFactor[]): number {
  const weighted = factors.reduce((total, factor) => total + factor.weight * factor.score, 0)
  return Math.round(clamp(weighted, 0.28, 0.96) * 100)
}

function bandFrom(confidence: number): ConfidenceBand {
  if (confidence >= 78) return "high"
  if (confidence >= 58) return "moderate"
  return "low"
}

function confidenceSummary(factors: readonly ConfidenceFactor[]): string {
  const contributions = [...factors].sort(
    (left, right) => right.weight * right.score - left.weight * left.score,
  )
  const strongest = contributions.filter((factor) => factor.score >= 0.6).slice(0, 3)
  const weakest = [...factors]
    .sort((left, right) => left.score - right.score)
    .filter((factor) => factor.score < 0.5)[0]

  const strengthText =
    strongest.length > 0
      ? `Based on ${strongest.map((factor) => factor.label.toLowerCase()).join(", ")}`
      : "Based on limited evidence across every category tracked"
  const limitText = weakest ? ` Limited by ${weakest.label.toLowerCase()}.` : ""
  return `${sentence(strengthText)}${limitText}`
}

// ── Assessment ───────────────────────────────────────────────────────────────

function recordSentence(detail: ProjectDetail): string {
  const category = detail.category && detail.category !== "unknown"
    ? detail.category.toLowerCase()
    : "infrastructure"
  const amount =
    detail.budget !== undefined ? ` worth ${formatPesoInProse(detail.budget)}` : ""
  const progress =
    detail.progress !== undefined ? ` at ${detail.progress}% reported completion` : ""
  const completion = detail.completionDate
    ? `, with a recorded completion date of ${formatRecordDate(detail.completionDate)}`
    : ""
  const office = detail.agency && detail.agency !== "Not provided" ? ` by ${detail.agency}` : ""
  return sentence(
    `${detail.source} records this ${category} contract${amount} as “${detail.status}”${progress}${completion}, implemented${office}`,
  )
}

function communitySentence(signals: CommunitySignals, detail: ProjectDetail): string {
  if (!signals.available) {
    return "Resident discussion for this record could not be read, so no local account is factored into this reading."
  }
  if (signals.observations === 0) {
    return sentence(
      `No resident has posted about this record, so the reported scope has no independent local account in CivicLens`,
    )
  }

  const who = `${plural(signals.residents, "resident")} posted ${plural(signals.observations, "account")}`
  const split =
    signals.supportive > 0 && signals.concerns > 0
      ? `${signals.supportive} broadly supportive of the recorded work and ${signals.concerns} raising concerns`
      : signals.concerns > 0
        ? `all of them raising concerns`
        : signals.supportive > 0
          ? `all of them broadly supportive of the recorded work`
          : `none of them stating a view on its condition`
  const topConcern = signals.themes.find((theme) => theme.stance === "concern")
  const attributed = topConcern
    ? `; ${plural(topConcern.residents, "resident")} describe ${topConcern.label.replace(/^Reported /, "").replace(/^No /, "no ").toLowerCase()}`
    : ""

  const singleCaveat =
    signals.strength === "single"
      ? " A single account is not treated as a community pattern."
      : ""

  return `${sentence(`${who}, ${split}${attributed}`)}${singleCaveat}${
    detail.displayStatus === "completed" && signals.concerns > signals.supportive
      ? " These are resident reports, not verified findings about the delivered scope."
      : ""
  }`
}

function interpretationSentence(
  detail: ProjectDetail,
  signals: CommunitySignals,
  band: ConfidenceBand,
  gapCount: number,
): string {
  const stated = signals.supportive + signals.concerns
  const conflicting = stated > 0 && signals.concerns > signals.supportive

  if (conflicting && detail.displayStatus === "completed") {
    return signals.strength === "single"
      ? "One resident account differs from the recorded completion status, which is not enough to establish a discrepancy but is worth further verification."
      : "The reported completion status is not fully corroborated by the available resident accounts, and additional verification may be warranted."
  }
  if (conflicting) {
    return "Resident accounts raise concerns that the recorded status does not address; the difference is unverified either way."
  }
  if (band === "high") {
    return "Available records, resident accounts, and geographic references are broadly consistent with the reported status."
  }
  if (band === "moderate") {
    return gapCount > 0
      ? "Supporting evidence exists, but documentation gaps mean the reported scope cannot be fully verified from what is published."
      : "Supporting evidence exists and no contradiction was found, though the evidence base is thin in places."
  }
  return "Available evidence is insufficient to independently verify whether the documented project scope has been delivered as recorded."
}

// ── Transparency gaps ─────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<GapSeverity, number> = { high: 0, moderate: 1, low: 2 }

function buildGaps(
  detail: ProjectDetail,
  signals: CommunitySignals,
  now: Date,
): TransparencyGap[] {
  const gaps: TransparencyGap[] = []
  const completed = detail.displayStatus === "completed"
  const inconsistencies = recordInconsistencies(detail, now)
  const missing = missingFields(detail)
  const checkedDays = daysSince(detail.lastChecked, now)
  const existence = signals.themes.find((theme) => theme.id === "existence")

  if (existence && existence.residents >= 2) {
    gaps.push({
      id: "site-presence",
      severity: "high",
      title: "Residents report being unable to locate the recorded project",
      detail: `${plural(existence.residents, "resident")} state they could not find the work described in this record at the recorded location. This is a resident report and has not been independently confirmed.`,
      sources: ["community", "dpwh"],
    })
  }

  if (completed && signals.concerns >= 2 && signals.concerns > signals.supportive) {
    gaps.push({
      id: "status-conflict",
      severity: "high",
      title: "Resident accounts differ from the recorded status",
      detail: `${plural(signals.concerns, "account")} describe incomplete or degraded conditions, while the record reads “${detail.status}”. This difference has not been independently verified in either direction.`,
      sources: ["community", "dpwh"],
    })
  }

  if (completed) {
    const completionDays = daysSince(detail.completionDate, now)
    const observedAfterCompletion = signals.lastActivityAt
      ? (parseTime(signals.lastActivityAt) ?? 0) > (parseTime(detail.completionDate) ?? 0)
      : false
    if (!observedAfterCompletion || (checkedDays !== null && checkedDays > 180)) {
      gaps.push({
        id: "completion-evidence",
        severity: "moderate",
        title: "Recent completion evidence unavailable",
        detail: `The project is recorded as completed${completionDays !== null ? ` about ${plural(completionDays, "day")} ago` : ""}, but no recent independent documentation confirming the completed scope is available in CivicLens.`,
        sources: ["dpwh", "imagery"],
      })
    }
  }

  if (inconsistencies.length > 0) {
    gaps.push({
      id: "record-inconsistency",
      severity: "moderate",
      title: "Recorded fields do not read consistently",
      detail: `${inconsistencies.map((note) => note).join("; ")}. The difference may be a recording lag rather than a substantive change.`,
      sources: ["dpwh"],
    })
  }

  const criticalMissing = missing.filter((field) =>
    ["contractor", "contract ID", "contract amount", "completion date"].includes(field),
  )
  if (criticalMissing.length > 0) {
    gaps.push({
      id: "contract-fields",
      severity: "moderate",
      title: "Contract information incomplete",
      detail: `The published record does not include ${criticalMissing.join(", ")}, which limits independent cross-checking.`,
      sources: ["dpwh", "procurement"],
    })
  }

  if (detail.geometryKind !== "official") {
    gaps.push({
      id: "extent-undelineated",
      severity: detail.geometryKind === "estimated" ? "moderate" : "low",
      title: "Project extent not officially delineated",
      detail: `${geometryDescription(detail)} The recorded point locates the project but does not describe how much was built.`,
      sources: ["openstreetmap", "dpwh"],
    })
  }

  if (signals.available && signals.observations === 0) {
    gaps.push({
      id: "no-local-observation",
      severity: "low",
      title: "No independent local observation available",
      detail:
        "No resident has posted about this record, so nothing in CivicLens corroborates or questions the published status.",
      sources: ["community"],
    })
  }

  if (signals.available && signals.strength === "single") {
    gaps.push({
      id: "thin-observation",
      severity: "low",
      title: "Local observation limited to one resident",
      detail:
        "Only one resident has posted about this record. A single account is context, not a community pattern.",
      sources: ["community"],
    })
  }

  if (checkedDays !== null && checkedDays > 365) {
    gaps.push({
      id: "stale-record",
      severity: "low",
      title: "Record not recently refreshed",
      detail: `The published record was last refreshed about ${plural(checkedDays, "day")} ago, so later changes would not appear here.`,
      sources: ["dpwh"],
    })
  }

  gaps.push({
    id: "procurement-crosscheck",
    severity: "low",
    title: "Procurement award not cross-referenced",
    detail:
      "CivicLens does not yet match this contract against a published procurement award, so award details are unchecked here.",
    sources: ["procurement"],
  })

  if (gaps.every((gap) => gap.severity === "low") && gaps.length <= 2) {
    const clean: TransparencyGap = {
      id: "no-significant-gaps",
      severity: "low",
      title: "No significant gaps detected",
      detail:
        "Status, location, contract information, and available documentation read consistently, and no resident account contradicts them.",
      sources: ["dpwh", "community", "openstreetmap"],
    }
    return [clean, ...gaps].slice(0, 5)
  }

  return gaps
    .sort(
      (left, right) =>
        SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 5)
}

// ── Evidence and sources ──────────────────────────────────────────────────────

function buildEvidence(
  detail: ProjectDetail,
  signals: CommunitySignals,
  now: Date,
): EvidenceItem[] {
  const evidence: EvidenceItem[] = []
  const missing = missingFields(detail)
  const checkedDays = daysSince(detail.lastChecked, now)

  evidence.push({
    id: "dpwh-record",
    status: missing.length <= 3 ? "supported" : "partial",
    title: "DPWH project record",
    detail: [
      `Status: ${detail.status || "Unknown"}`,
      detail.progress !== undefined ? `Reported completion: ${detail.progress}%` : null,
      `Contract amount: ${formatPeso(detail.budget)}`,
    ]
      .filter(Boolean)
      .join(" · "),
    source: "dpwh",
  })

  evidence.push({
    id: "disbursement",
    status:
      detail.budget !== undefined && detail.amountPaid !== undefined ? "supported" : "gap",
    title: "Contract and disbursement figures",
    detail:
      detail.budget !== undefined && detail.amountPaid !== undefined
        ? `${formatPeso(detail.amountPaid)} recorded as paid against ${formatPeso(detail.budget)} contracted.`
        : "The record does not publish both the contract amount and the amount paid, so disbursement cannot be compared.",
    source: "dpwh",
  })

  evidence.push({
    id: "community-observation",
    status:
      signals.observations === 0
        ? "gap"
        : signals.residents >= 2 && signals.concerns <= signals.supportive
          ? "supported"
          : "partial",
    title: "Resident accounts",
    detail:
      signals.observations === 0
        ? signals.available
          ? "No resident has posted about this record."
          : "Resident discussion could not be read for this record."
        : `${plural(signals.observations, "account")} from ${plural(signals.residents, "resident")} · ${signals.supportive} supportive · ${signals.concerns} raising concerns.`,
    source: "community",
  })

  evidence.push({
    id: "geographic-reference",
    status:
      detail.geometryKind === "official"
        ? "supported"
        : detail.geometryKind === "estimated"
          ? "gap"
          : "partial",
    title: "Geographic reference",
    detail: geometryDescription(detail),
    source: "openstreetmap",
  })

  evidence.push({
    id: "imagery-reference",
    status: "partial",
    title: "Aerial imagery context",
    detail:
      "Basemap imagery gives approximately 10 m aerial context for the recorded location, which is not detailed enough to confirm structure-level completion.",
    source: "imagery",
  })

  evidence.push({
    id: "recency",
    status: checkedDays === null ? "gap" : checkedDays <= 180 ? "supported" : "partial",
    title: "Record currency",
    detail:
      checkedDays === null
        ? "No refresh date accompanies the published record."
        : `Record refreshed about ${plural(checkedDays, "day")} ago.`,
    source: "dpwh",
  })

  evidence.push({
    id: "procurement-reference",
    status: "gap",
    title: "Procurement cross-reference",
    detail:
      "No published procurement award is matched to this contract in CivicLens, so award and bidding details are unchecked here.",
    source: "procurement",
  })

  return evidence
}

function buildSources(
  detail: ProjectDetail,
  signals: CommunitySignals,
  evidence: readonly EvidenceItem[],
): IntelligenceSource[] {
  const statusOf = (id: SourceId): EvidenceStatus => {
    const related = evidence.filter((item) => item.source === id)
    if (related.length === 0) return "partial"
    if (related.some((item) => item.status === "gap")) {
      return related.every((item) => item.status === "gap") ? "gap" : "partial"
    }
    return related.every((item) => item.status === "supported") ? "supported" : "partial"
  }

  return [
    {
      id: "dpwh",
      label: "DPWH Record",
      detail: `Published project record from ${detail.source}.`,
      status: statusOf("dpwh"),
      facts: [
        { label: "Contract ID", value: detail.contractId ?? "Not recorded" },
        { label: "Status", value: detail.status || "Unknown" },
        {
          label: "Reported completion",
          value: detail.progress !== undefined ? `${detail.progress}%` : "Not recorded",
        },
        { label: "Contract amount", value: formatPeso(detail.budget) },
        { label: "Amount paid", value: formatPeso(detail.amountPaid) },
        { label: "Contractor", value: detail.contractor ?? "Not recorded" },
        { label: "Implementing office", value: detail.agency || "Not recorded" },
        { label: "Completion date", value: formatRecordDate(detail.completionDate) },
        { label: "Record refreshed", value: formatRecordDate(detail.lastChecked) },
      ],
      url: detail.sourceUrl || undefined,
      urlLabel: "Open official record",
    },
    {
      id: "community",
      label: signals.observations > 0
        ? `Community · ${plural(signals.observations, "account")}`
        : "Community",
      detail:
        "Resident discussion explicitly linked to this record. Resident reports, not verified findings.",
      status: statusOf("community"),
      facts: [
        { label: "Linked accounts", value: String(signals.observations) },
        { label: "Distinct residents", value: String(signals.residents) },
        { label: "Broadly supportive", value: String(signals.supportive) },
        { label: "Raising concerns", value: String(signals.concerns) },
        { label: "Supporting photos", value: String(signals.photos) },
        { label: "Signal weight", value: signals.strengthLabel },
      ],
      url: projectDiscussionPath(detail.id),
      urlLabel: "Open community discussion",
    },
    {
      id: "openstreetmap",
      label: "OpenStreetMap",
      detail: "Open geographic reference used to place and estimate the project extent.",
      status: statusOf("openstreetmap"),
      facts: [
        {
          label: "Geometry provenance",
          value:
            detail.geometryKind === "official"
              ? "Official geometry"
              : detail.geometryKind === "reviewed_estimate"
                ? "Moderator-reviewed OSM estimate"
                : detail.geometryKind === "automatic_estimate"
                  ? "Automatic OSM estimate"
                  : "Fallback 50 m indicator",
        },
        {
          label: "Estimate type",
          value: detail.geometryEstimateClass?.replace(/_/g, " ") ?? "Not applicable",
        },
        {
          label: "Recorded point",
          value: `${detail.latitude.toFixed(5)}, ${detail.longitude.toFixed(5)}`,
        },
        { label: "Attribution", value: "© OpenStreetMap contributors, ODbL" },
      ],
      url:
        detail.geometrySourceUrl ||
        `https://www.openstreetmap.org/?mlat=${detail.latitude.toFixed(5)}&mlon=${detail.longitude.toFixed(5)}#map=18/${detail.latitude.toFixed(5)}/${detail.longitude.toFixed(5)}`,
      urlLabel: "View location reference",
    },
    {
      id: "imagery",
      label: "Aerial imagery",
      detail: "Basemap aerial context for the recorded location.",
      status: statusOf("imagery"),
      facts: [
        { label: "Reference", value: "Sentinel-2 cloudless mosaic (EOX)" },
        { label: "Approximate resolution", value: "10 m per pixel" },
        {
          label: "What it can show",
          value: "Broad site context; not structure-level completion",
        },
      ],
      url: "https://www.s2maps.eu/",
      urlLabel: "About the imagery",
    },
    {
      id: "procurement",
      label: "Procurement lookup",
      detail:
        "Public procurement is not yet cross-referenced in CivicLens for this contract.",
      status: statusOf("procurement"),
      facts: [
        { label: "Matched award record", value: "None in CivicLens" },
        {
          label: "Where awards are published",
          value: "PhilGEPS, the government electronic procurement system",
        },
        {
          label: "Search reference",
          value: detail.contractId ? `Contract ID ${detail.contractId}` : "No contract ID recorded",
        },
      ],
      url: "https://www.philgeps.gov.ph/",
      urlLabel: "Open PhilGEPS",
    },
  ]
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Derives the full intelligence reading for one project.
 *
 * Deterministic for a given set of inputs: every number and sentence is a
 * function of the record fields, the linked resident accounts, and the
 * geographic provenance already stored for the project.
 */
export function analyzeProject(input: IntelligenceInput): ProjectIntelligence {
  const { detail } = input
  const now = input.now ?? new Date()
  const posts = input.posts ?? []
  const communityAvailable = input.communityAvailable ?? true
  const signals = readCommunitySignals(posts, input.pulse ?? null, communityAvailable)

  const factors = buildFactors(detail, signals, now)
  const confidence = confidenceFrom(factors)
  const band = bandFrom(confidence)
  const gaps = buildGaps(detail, signals, now)
  const evidence = buildEvidence(detail, signals, now)
  const sources = buildSources(detail, signals, evidence)

  const substantiveGaps = gaps.filter(
    (gap) => gap.id !== "no-significant-gaps" && gap.severity !== "low",
  ).length

  const assessment = [
    recordSentence(detail),
    communitySentence(signals, detail),
    interpretationSentence(detail, signals, band, substantiveGaps),
  ].join(" ")

  const lastAnalyzed = [detail.lastChecked, signals.lastActivityAt]
    .map((value) => parseTime(value))
    .filter((time): time is number => time !== null)
    .reduce<number | null>((latest, time) => (latest === null || time > latest ? time : latest), null)

  return {
    projectId: detail.id,
    confidence,
    band,
    bandLabel: BAND_LABELS[band],
    confidenceSummary: confidenceSummary(factors),
    factors,
    assessment,
    transparencyGaps: gaps,
    communitySignals: signals,
    evidence,
    sources,
    lastAnalyzed: new Date(lastAnalyzed ?? now.valueOf()).toISOString(),
  }
}
