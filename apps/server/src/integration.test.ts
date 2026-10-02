import { afterEach, describe, expect, it, vi } from "vitest"
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  stat,
  readlink,
  chmod,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"
import * as TOML from "@iarna/toml"
import { Machine } from "./machine"
import { LocalRepository } from "./store"
import { WorkspaceService } from "@agent-switch/core/workspace-service"
import { changesFor, type Resource } from "@agent-switch/core/workspace"
import { createApi } from "./http"
import { testMcp } from "./mcp"
import * as files from "./files"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const homes: string[] = []
afterEach(async () => {
  for (const home of homes.splice(0))
    await rm(home, { recursive: true, force: true })
})
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "agent-switch-test-"))
  homes.push(home)
  const put = async (path: string, text: string) => {
    const file = join(home, path)
    await mkdir(join(file, ".."), { recursive: true })
    await writeFile(file, text)
    return file
  }
  await put(".codex/AGENTS.md", "# Real instructions\nKeep user changes.\n")
  await put(
    ".codex/config.toml",
    'model = "example"\n[mcp_servers.local]\ncommand = "node"\nargs = ["server.js"]\n[projects."/safe"]\ntrust_level = "trusted"\n'
  )
  await put(
    ".claude/settings.json",
    JSON.stringify({
      permissions: { allow: ["Read"] },
      hooks: {
        PostToolUse: [{ hooks: [{ type: "command", command: "echo ok" }] }],
      },
    })
  )
  await put(
    ".claude.json",
    JSON.stringify({
      theme: "dark",
      mcpServers: { docs: { type: "http", url: "http://127.0.0.1:5555/mcp" } },
    })
  )
  await put(
    ".agents/skills/review/SKILL.md",
    "---\nname: review\ndescription: Review changes\n---\nRead references/guide.txt\n"
  )
  await put(
    ".agents/skills/review/references/guide.txt",
    "Preserve this reference"
  )
  await put("projects/example/AGENTS.md", "# Project instruction")
  const repository = new LocalRepository(
    new Machine(home),
    join(home, ".agent-switch")
  )
  await repository.initialize()
  const service = new WorkspaceService(repository, {
    id: randomUUID,
    now: () => new Date().toISOString(),
  })
  return { home, put, repository, service }
}
const draft = (
  kind: Resource["kind"],
  name: string,
  content: string
): Omit<Resource, "id"> => ({
  kind,
  name,
  content,
  description: "",
  enabled: true,
  targets: ["codex"],
  scope: "global",
  source: "Créé dans Agent Switch",
})

describe("Real filesystem integration", () => {
  it("discovers actual global and project configuration, including skill attachments", async () => {
    const { repository } = await fixture()
    const state = await repository.load()
    expect(state.profiles.map((p) => p.name)).toEqual([
      "Configuration de la machine",
      "example",
    ])
    const global = state.profiles[0]!
    expect(changesFor(global)).toEqual([])
    expect(
      global.resources.find((r) => r.kind === "skills")?.files?.[
        "references/guide.txt"
      ]
    ).toBe(Buffer.from("Preserve this reference").toString("base64"))
    expect(global.resources.filter((r) => r.kind === "mcp")).toHaveLength(2)
    expect(global.resources.find((r) => r.kind === "hooks")?.content).toContain(
      "PostToolUse"
    )
  })
  it("persists drafts without writing machine config, then applies with a backup", async () => {
    const { home, repository, service } = await fixture()
    const resource = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "instructions"
    )!
    await service.saveResource("machine", {
      ...resource,
      content: "# Changed for real",
    })
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toContain(
      "Real instructions"
    )
    const reopened = new LocalRepository(
      new Machine(home),
      join(home, ".agent-switch")
    )
    await reopened.initialize()
    expect(
      (await reopened.load()).profiles[0]!.resources.find(
        (r) => r.id === resource.id
      )?.content
    ).toBe("# Changed for real")
    const plan = await repository.preview("machine")
    expect([...plan.keys()]).toEqual([join(home, ".codex/AGENTS.md")])
    const applied = await service.apply("machine")
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toBe(
      "# Changed for real"
    )
    expect(applied.profiles[0]!.history).toHaveLength(2)
    expect(changesFor(applied.profiles[0]!)).toEqual([])
    expect(
      (await stat(join(home, ".agent-switch/workspace.json"))).mode & 0o777
    ).toBe(0o600)
  })
  it("merges MCP and hooks without changing unrelated settings", async () => {
    const { home, repository, service } = await fixture()
    const profile = (await repository.load()).profiles[0]!
    const mcp = profile.resources.find(
      (r) => r.kind === "mcp" && r.targets[0] === "codex"
    )!
    const hook = profile.resources.find((r) => r.kind === "hooks")!
    await service.saveResource("machine", {
      ...mcp,
      content: JSON.stringify({ command: "node", args: ["other.js"] }),
    })
    await service.saveResource("machine", {
      ...hook,
      content: JSON.stringify({
        Stop: [{ hooks: [{ type: "command", command: "echo stopped" }] }],
      }),
    })
    await service.apply("machine")
    const config = TOML.parse(
      await readFile(join(home, ".codex/config.toml"), "utf8")
    )
    expect(config.model).toBe("example")
    expect(config.projects).toEqual({ "/safe": { trust_level: "trusted" } })
    const claude = JSON.parse(
      await readFile(join(home, ".claude/settings.json"), "utf8")
    )
    expect(claude.permissions.allow).toEqual(["Read"])
    expect(claude.hooks.Stop).toHaveLength(1)
  })
  it("refuses external modifications and retains the draft", async () => {
    const { home, repository, service } = await fixture()
    const resource = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "instructions"
    )!
    await service.saveResource("machine", {
      ...resource,
      content: "Agent Switch draft",
    })
    await writeFile(join(home, ".codex/AGENTS.md"), "External edit")
    await expect(service.apply("machine")).rejects.toThrow("changé sur disque")
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toBe(
      "External edit"
    )
    expect((await repository.load()).profiles[0]!.history).toHaveLength(0)
  })
  it("disables and re-enables a skill while keeping all references", async () => {
    const { home, repository, service } = await fixture()
    const resource = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "skills"
    )!
    await service.saveResource("machine", { ...resource, enabled: false })
    await service.apply("machine")
    await expect(
      readFile(join(home, ".agents/skills/review/SKILL.md"))
    ).rejects.toThrow()
    expect(
      await readFile(
        join(home, ".agents/skills/review/references/guide.txt"),
        "utf8"
      )
    ).toContain("Preserve")
    await repository.refresh()
    await service.saveResource("machine", resource)
    await service.apply("machine")
    expect(
      await readFile(join(home, ".agents/skills/review/SKILL.md"), "utf8")
    ).toBe(resource.content)
  })
  it("creates new files and rejects traversal and symbolic-link writes", async () => {
    const { home, repository, service, put } = await fixture()
    await service.createResource("machine", {
      ...draft("instructions", "New rule", "Follow this rule"),
      targets: ["claude"],
    })
    await service.apply("machine")
    expect(
      await readFile(join(home, ".claude/rules/new-rule.md"), "utf8")
    ).toBe("Follow this rule")
    await service.createResource("machine", {
      ...draft(
        "skills",
        "Bad skill",
        "---\nname: bad\ndescription: bad\n---\n# skill"
      ),
      files: { "../outside.txt": Buffer.from("bad").toString("base64") },
    })
    await expect(service.apply("machine")).rejects.toThrow("Chemin")
    await service.discard("machine")
    await put("original.md", "Keep me")
    await rm(join(home, ".codex/AGENTS.md"))
    await symlink(join(home, "original.md"), join(home, ".codex/AGENTS.md"))
    const resource = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "instructions"
    )!
    await service.saveResource("machine", { ...resource, content: "overwrite" })
    await expect(service.apply("machine")).rejects.toThrow("symbolique")
    expect(await readFile(join(home, "original.md"), "utf8")).toBe("Keep me")
  })
  it("refreshes external edits while retaining drafts", async () => {
    const { home, repository, service } = await fixture()
    await writeFile(join(home, ".codex/AGENTS.md"), "Changed outside")
    await repository.refresh()
    const resource = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "instructions"
    )!
    expect(resource.content).toBe("Changed outside")
    await service.saveResource("machine", { ...resource, content: "draft" })
    await repository.refresh()
    expect(
      (await repository.load()).profiles[0]!.resources.find(
        (r) => r.id === resource.id
      )?.content
    ).toBe("draft")
  })
  it("restores history as a draft and writes it only on application", async () => {
    const { home, repository, service } = await fixture()
    const resource = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "instructions"
    )!
    await service.saveResource("machine", {
      ...resource,
      content: "Version one",
    })
    await service.apply("machine")
    const revision = (await repository.load()).profiles[0]!.history[0]!.id
    await service.saveResource("machine", {
      ...resource,
      content: "Version two",
    })
    await service.apply("machine")
    await service.restore("machine", revision)
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toBe(
      "Version two"
    )
    await service.apply("machine")
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toBe(
      "Version one"
    )
  })
})

describe("Profile portability and transaction recovery", () => {
  it("updates linked instructions while preserving their link", async () => {
    const { home, put, repository, service } = await fixture()
    const target = await put("generated/AGENTS.md", "Linked instructions")
    const link = join(home, ".codex/AGENTS.md")
    await rm(link)
    await symlink(target, link)
    await repository.refresh()
    const resource = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "instructions"
    )!
    expect(resource.source).toBe(target)
    await service.saveResource("machine", {
      ...resource,
      content: "Updated linked instructions",
    })
    await service.apply("machine")
    expect(await readlink(link)).toBe(target)
    expect(await readFile(target, "utf8")).toBe("Updated linked instructions")
  })
  it("keeps profiles reusable after another profile changes shared files", async () => {
    const { home, repository, service } = await fixture()
    const initial = (await repository.load()).profiles[0]!
    await service.createProfile(
      { name: "Alternative", description: "", path: "", color: "blue" },
      "machine"
    )
    const workspace = await repository.load()
    const other = workspace.profiles.find((p) => p.name === "Alternative")!
    const resource = other.resources.find((r) => r.kind === "instructions")!
    await service.saveResource(other.id, {
      ...resource,
      content: "Alternative instructions",
    })
    await service.apply(other.id)
    const original = (await repository.load()).profiles[0]!
    expect(changesFor(original).some((c) => c.id === resource.id)).toBe(true)
    await service.apply("machine")
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toBe(
      initial.resources.find((r) => r.id === resource.id)!.content
    )
  })
  it("imports skills including executable assets into a second home", async () => {
    const first = await fixture()
    await first.put(
      ".agents/skills/review/scripts/check.sh",
      "#!/bin/sh\nexit 0\n"
    )
    await chmod(
      join(first.home, ".agents/skills/review/scripts/check.sh"),
      0o755
    )
    await first.repository.refresh()
    const profile = (await first.repository.load()).profiles[0]!
    const second = await fixture()
    await rm(join(second.home, ".agents/skills/review"), { recursive: true })
    await second.repository.refresh()
    await second.service.importProfile({
      ...profile,
      name: "Imported skill",
      resources: profile.resources.filter((r) => r.kind === "skills"),
    })
    const imported = (await second.repository.load()).profiles.at(-1)!
    await second.service.apply(imported.id)
    const script = join(second.home, ".agents/skills/review/scripts/check.sh")
    expect(await readFile(script, "utf8")).toContain("exit 0")
    expect((await stat(script)).mode & 0o777).toBe(0o755)
  })
  it("rolls back already written files if a later write fails", async () => {
    const { home, repository, service } = await fixture()
    const profile = (await repository.load()).profiles[0]!
    const instruction = profile.resources.find(
      (r) => r.kind === "instructions"
    )!
    const mcp = profile.resources.find(
      (r) => r.kind === "mcp" && r.targets[0] === "codex"
    )!
    await service.saveResource("machine", {
      ...instruction,
      content: "Temporary write",
    })
    await service.saveResource("machine", {
      ...mcp,
      content: JSON.stringify({ command: "replacement" }),
    })
    const atomic = files.atomicWrite
    let failed = false
    const spy = vi
      .spyOn(files, "atomicWrite")
      .mockImplementation(async (path, value) => {
        if (path === join(home, ".codex/config.toml") && !failed) {
          failed = true
          throw new Error("Injected disk failure")
        }
        return atomic(path, value)
      })
    try {
      await expect(service.apply("machine")).rejects.toThrow(
        "Injected disk failure"
      )
    } finally {
      spy.mockRestore()
    }
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toBe(
      instruction.content
    )
    expect((await repository.load()).profiles[0]!.history).toHaveLength(0)
    await expect(
      readFile(join(home, ".agent-switch/pending.json"))
    ).rejects.toThrow()
  })
  it("recovers an interrupted transaction before serving any data", async () => {
    const { home, repository } = await fixture()
    const target = join(home, ".codex/AGENTS.md")
    const before = await readFile(target)
    await writeFile(target, "Interrupted write")
    await writeFile(
      join(home, ".agent-switch/pending.json"),
      JSON.stringify([
        {
          file: target,
          before: before.toString("base64"),
          afterHash: files.hash("Interrupted write"),
          mode: 0o600,
        },
      ])
    )
    const reopened = new LocalRepository(
      repository.machine,
      repository.directory
    )
    await reopened.initialize()
    expect(await readFile(target, "utf8")).toBe(before.toString())
    await expect(
      readFile(join(home, ".agent-switch/pending.json"))
    ).rejects.toThrow()
  })
  it("imports a detected project as an applied snapshot without writing files", async () => {
    const { home, repository } = await fixture()
    const workspace = await repository.importDetected({
      name: "Detected project",
      path: join(home, "projects/example"),
      targets: ["codex"],
    })
    const imported = workspace.profiles.at(-1)!
    expect(imported.path).toBe(join(home, "projects/example"))
    expect(changesFor(imported)).toEqual([])
    expect(imported.resources).toHaveLength(1)
    expect(imported.history).toEqual([])
  })
  it("runs CLI profile listing and export against the same real API", async () => {
    const { home, repository } = await fixture()
    const server = createApi(repository, [])
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const run = promisify(execFile)
      const args = ["--import", "tsx", join(import.meta.dirname, "cli.ts")]
      const listing = await run(process.execPath, [
        ...args,
        "profiles",
        "--url",
        url,
      ])
      expect(listing.stdout).toContain("Configuration de la machine")
      const output = join(home, "export.json")
      await run(process.execPath, [
        ...args,
        "export",
        "--url",
        url,
        "--output",
        output,
      ])
      const exported = JSON.parse(await readFile(output, "utf8"))
      expect(
        exported.profile.resources.find((r: Resource) => r.kind === "skills")
          .files["references/guide.txt"]
      ).toBeTruthy()
      expect((await stat(output)).mode & 0o777).toBe(0o600)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })
})

describe("HTTP boundary and real MCP transport", () => {
  it("rejects cross-origin and stale writes, never accepts forged applied state", async () => {
    const { repository } = await fixture()
    const server = createApi(repository, ["http://localhost:4141"])
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/workspace`
    try {
      expect((await fetch(url)).status).toBe(403)
      expect(
        (
          await fetch(url, {
            headers: { "X-Agent-Switch": "1", Origin: "https://evil.example" },
          })
        ).status
      ).toBe(403)
      const response = await fetch(url, { headers: { "X-Agent-Switch": "1" } })
      const workspace = await response.json()
      const etag = response.headers.get("etag")!
      expect(
        (
          await fetch(url, {
            method: "PUT",
            headers: { "X-Agent-Switch": "1", "If-Match": "old" },
            body: JSON.stringify(workspace),
          })
        ).status
      ).toBe(409)
      workspace.profiles[0].applied = []
      expect(
        (
          await fetch(url, {
            method: "PUT",
            headers: { "X-Agent-Switch": "1", "If-Match": etag },
            body: JSON.stringify(workspace),
          })
        ).status
      ).toBe(400)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })
  it("initializes a real stdio MCP process and closes it", async () => {
    const { put } = await fixture()
    const path = await put(
      "mcp-fixture.cjs",
      `let buffer='';process.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\\n'))!==-1){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);const message=JSON.parse(line);if(message.method==='initialize')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2024-11-05',capabilities:{},serverInfo:{name:'real-fixture',version:'1.0'}}})+'\\n')}});`
    )
    const result = await testMcp(
      JSON.stringify({ command: process.execPath, args: [path] })
    )
    expect(result.name).toBe("real-fixture")
    await expect(
      testMcp(JSON.stringify({ command: "/does-not-exist-agent-switch" }))
    ).rejects.toThrow()
  })
})
