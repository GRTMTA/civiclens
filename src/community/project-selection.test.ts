import { describe, expect, it } from "vitest"

import {
  initialProjectSelection,
  projectOptionsWithSelection,
} from "./project-selection"

describe("community composer project selection", () => {
  const selected = { id: "dpwh-42", name: "Mandaue road rehabilitation" }

  it("prefers the display reference supplied by a selected map project", () => {
    expect(initialProjectSelection(selected, "different-id")).toEqual(selected)
  })

  it("retains compatibility with an ID-only default", () => {
    expect(initialProjectSelection(null, "  dpwh-42  ")).toEqual({
      id: "dpwh-42",
      name: "dpwh-42",
    })
  })

  it("keeps a selected project visible when it is outside current search results", () => {
    expect(
      projectOptionsWithSelection([{ id: "dpwh-7", name: "Bridge works" }], selected),
    ).toEqual([selected, { id: "dpwh-7", name: "Bridge works" }])
  })

  it("does not duplicate a selected project returned by search", () => {
    expect(projectOptionsWithSelection([selected], selected)).toEqual([selected])
    expect(projectOptionsWithSelection([selected], null)).toEqual([selected])
  })
})
