import { afterEach, expect, it, vi } from "vitest"
import { LocalApi } from "./http-repository"
import { createTestWorkspace } from "@/test/fixtures"

afterEach(() => vi.unstubAllGlobals())
it("retains the workspace revision across discovery so stale edits are rejected", async () => {
  const workspace = createTestWorkspace()
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify(workspace), { headers: { ETag: '"1"' } })
    )
    .mockResolvedValueOnce(new Response("[]", { headers: { ETag: '"2"' } }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Autre session" }), { status: 409 })
    )
  vi.stubGlobal("fetch", fetcher)
  const api = new LocalApi()
  await api.load()
  await api.scan()
  await api.load()
  expect(fetcher).toHaveBeenCalledTimes(2)
  await expect(api.save(workspace)).rejects.toThrow("Autre session")
  expect(fetcher.mock.calls[2]![1].headers["If-Match"]).toBe('"1"')
})
it("uses the server's authoritative saved workspace for subsequent mutations", async () => {
  const original = createTestWorkspace(),
    saved = structuredClone(original)
  saved.theme = "light"
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify(original), { headers: { ETag: '"1"' } })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(saved), { headers: { ETag: '"2"' } })
    )
  vi.stubGlobal("fetch", fetcher)
  const api = new LocalApi()
  await api.load()
  await api.save(saved)
  expect((await api.load()).theme).toBe("light")
  expect(fetcher).toHaveBeenCalledTimes(2)
})
