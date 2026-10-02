import { describe, expect, it } from "vitest"
import { createBrowserRuntime } from "./browser-runtime"

describe("Browser runtime on HTTP private-network origins", () => {
  it("creates UUIDs without the secure-context-only randomUUID API", () => {
    const random = {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(17),
    } as unknown as Crypto
    const runtime = createBrowserRuntime(random)
    expect(runtime.id()).toBe("11111111-1111-4111-9111-111111111111")
  })
  it("produces unique RFC 4122 version 4 identifiers", () => {
    const runtime = createBrowserRuntime()
    const ids = Array.from({ length: 100 }, () => runtime.id())
    expect(new Set(ids).size).toBe(100)
    ids.forEach((id) =>
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
    )
  })
})
