import { describe, it, expect } from "vitest"
import { BrowserProfileTransfer } from "./browser-transfer"
import { createTestWorkspace } from "@/test/fixtures"

const transfer = new BrowserProfileTransfer()
const payload = () => ({
  format: "agent-switch-profile",
  version: 1,
  profile: createTestWorkspace().profiles[0],
})

describe("Browser boundaries", () => {
  it("decodes portable profile data without importing history or identifiers", () => {
    const decoded = transfer.decode(JSON.stringify(payload()))
    expect(decoded.name).toBe("Projet Atlas")
    expect(decoded).not.toHaveProperty("history")
    expect(decoded).not.toHaveProperty("applied")
    expect(decoded).not.toHaveProperty("id")
  })
  it("rejects malformed, incompatible and oversized imports", () => {
    for (const text of [
      "not json",
      "{}",
      JSON.stringify({ ...payload(), version: 2 }),
      "x".repeat(20_000_001),
    ])
      expect(() => transfer.decode(text)).toThrow()
    const invalid = payload()
    invalid.profile!.resources[0]!.targets = []
    expect(() => transfer.decode(JSON.stringify(invalid))).toThrow()
  })
  it("rejects duplicated resource identifiers", () => {
    const invalid = payload()
    invalid.profile!.resources.push(invalid.profile!.resources[0]!)
    expect(() => transfer.decode(JSON.stringify(invalid))).toThrow()
  })
})
