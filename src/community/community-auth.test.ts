import { describe, expect, it } from "vitest"

import { communityActionDecision } from "./community-auth"

describe("Community write-action gate", () => {
  it("allows a signed-in resident", () => {
    expect(communityActionDecision(true, true)).toBe("allow")
  })

  it("directs a resolved guest to sign in", () => {
    expect(communityActionDecision(false, true)).toBe("sign-in")
  })

  it("waits while viewer identity is unresolved", () => {
    expect(communityActionDecision(false, false)).toBe("wait")
  })
})
