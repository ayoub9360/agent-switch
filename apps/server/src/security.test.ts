import { afterEach, describe, expect, it } from "vitest"
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { request, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { Machine } from "./machine"
import { LocalRepository } from "./store"
import { createApi } from "./http"
import { validateResource, type Resource } from "@agent-switch/core/workspace"

const directories: string[] = []
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})
async function directory() {
  const path = await realpath(
    await mkdtemp(join(tmpdir(), "agent-switch-security-"))
  )
  directories.push(path)
  return path
}
async function serve() {
  const home = await directory()
  const web = join(home, "web")
  await mkdir(web)
  await writeFile(
    join(web, "index.html"),
    "<!doctype html><title>Agent Switch</title>"
  )
  const repository = new LocalRepository(
    new Machine(home),
    join(home, ".agent-switch")
  )
  await repository.initialize()
  const origins: string[] = []
  const server = createApi(repository, origins, web)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  origins.push(url)
  return { home, web, url }
}
function get(url: string, headers: Record<string, string>) {
  return new Promise<number>((resolve, reject) => {
    const req = request(url, { headers }, (res) => {
      res.resume()
      res.on("end", () => resolve(res.statusCode!))
    })
    req.on("error", reject)
    req.end()
  })
}

describe("Security boundaries", () => {
  it("rejects rebinding hosts without an Origin, including static pages", async () => {
    const { url } = await serve()
    for (const path of ["/", "/api/workspace"])
      expect(
        await get(url + path, {
          Host: "attacker.example:4141",
          "X-Agent-Switch": "1",
        })
      ).toBe(403)
    expect(await get(url + "/api/workspace", { "X-Agent-Switch": "1" })).toBe(
      200
    )
    expect(
      await get(url + "/api/workspace", {
        Host: `localhost:${new URL(url).port}`,
        "X-Agent-Switch": "1",
      })
    ).toBe(200)
  })
  it("blocks framing, untrusted origins and static symlinks outside the web root", async () => {
    const { home, web, url } = await serve()
    await writeFile(join(home, "private.json"), '{"private":true}')
    await symlink(join(home, "private.json"), join(web, "exposed.json"))
    expect((await fetch(url + "/exposed.json")).status).toBe(403)
    expect(
      (await fetch(url, { headers: { Origin: "https://attacker.example" } }))
        .status
    ).toBe(403)
    const response = await fetch(url)
    expect(response.status).toBe(200)
    expect(response.headers.get("x-frame-options")).toBe("DENY")
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    )
  })
  it("does not read instructions or configuration through parent links outside home", async () => {
    const home = await directory()
    const outside = await directory()
    await writeFile(join(outside, "AGENTS.md"), "private outside instructions")
    await writeFile(
      join(outside, "config.toml"),
      '[mcp_servers.private]\ncommand = "private-command"\n'
    )
    await symlink(outside, join(home, ".codex"))
    const scan = await new Machine(home).scan()
    expect(scan.workspace.profiles[0]!.resources).toEqual([])
    expect(scan.workspace.machine!.warnings.join("\n")).toContain(
      "outside the home directory"
    )
    expect(JSON.stringify(scan)).not.toContain("private-command")
    expect(JSON.stringify(scan)).not.toContain("private outside instructions")
  })
  it("keeps imported instruction IDs out of destination paths", async () => {
    const home = await directory()
    const machine = new Machine(home)
    const scan = await machine.scan()
    const profile = scan.workspace.profiles[0]!
    profile.resources.push({
      id: "../../escaped",
      name: "!!!",
      kind: "instructions",
      content: "instruction",
      description: "",
      enabled: true,
      targets: ["claude"],
      scope: "global",
      source: "",
    })
    const plan = await machine.plan(profile, scan.bindings, scan.fingerprints)
    expect([...plan.keys()]).toHaveLength(1)
    expect([...plan.keys()][0]).toMatch(/\/\.claude\/rules\/[a-f0-9]{24}\.md$/)
  })
  it.each([
    "../escape",
    "a/../../escape",
    "/absolute",
    "a\\..\\escape",
    "C:escape",
    "SKILL.md",
    "./SKILL.md",
  ])("rejects unsafe skill attachment %s", (path) => {
    const resource: Resource = {
      id: "skill",
      name: "skill",
      kind: "skills",
      description: "",
      enabled: true,
      targets: ["codex"],
      scope: "global",
      source: "",
      content: "---\nname: skill\ndescription: A skill\n---\nSafe content",
      files: { [path]: Buffer.from("replacement").toString("base64") },
    }
    expect(() => validateResource(resource)).toThrow(
      "Invalid skill attachment path"
    )
  })
})
