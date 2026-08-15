import { describe, expect, it } from "vitest"

import { isAppPath, POST_LOGIN_PATH } from "./app-routes"

describe("app routes", () => {
  it("owns the landing and auth paths", () => {
    expect(isAppPath("/")).toBe(true)
    expect(isAppPath("/login")).toBe(true)
    expect(isAppPath("/register")).toBe(true)
  })

  it("no longer resolves the removed scan route", () => {
    expect(isAppPath("/scan")).toBe(false)
  })

  it("treats unknown paths as not found", () => {
    expect(isAppPath("/nope")).toBe(false)
  })

  it("sends residents to the community after authentication", () => {
    expect(POST_LOGIN_PATH).toBe("/community")
  })
})
