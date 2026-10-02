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
  readdir,
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
import * as storage from "./skill-storage"
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
  source: "Created in Agent Switch",
})

describe("Real filesystem integration", () => {
  it("discovers only global configuration, including skill attachments", async () => {
    const { repository } = await fixture()
    const state = await repository.load()
    expect(state.profiles.map((p) => p.name)).toEqual(["Machine configuration"])
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
    await expect(service.apply("machine")).rejects.toThrow("changed on disk")
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toBe(
      "External edit"
    )
    expect((await repository.load()).profiles[0]!.history).toHaveLength(0)
  })
  it("moves complete disabled skills and restores them after restart", async () => {
    const { home, repository, service, put } = await fixture()
    const root = join(home, ".agents/skills/review")
    const archive = storage.archivedSkill(join(home, ".agent-switch"), root)
    const resource = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "skills"
    )!
    // Preserve files unknown to the snapshot, empty directories, executable modes and links.
    await put(".agents/skills/review/run.sh", "#!/bin/sh\nexit 0")
    await chmod(join(root, "run.sh"), 0o755)
    await mkdir(join(root, "empty"))
    await symlink("references/guide.txt", join(root, "guide-link"))
    await service.saveResource("machine", { ...resource, enabled: false })
    expect(await storage.exists(root)).toBe(true) // draft only
    await service.apply("machine")
    expect(await storage.exists(root)).toBe(false)
    expect(await readFile(join(archive, "SKILL.md"), "utf8")).toBe(
      resource.content
    )
    expect(
      await readFile(join(archive, "references/guide.txt"), "utf8")
    ).toContain("Preserve")
    const reopened = new LocalRepository(
      new Machine(home),
      join(home, ".agent-switch")
    )
    await reopened.initialize()
    const disabled = (await reopened.load()).profiles[0]!.resources.find(
      (r) => r.id === resource.id
    )!
    expect(disabled.enabled).toBe(false)
    expect(changesFor((await reopened.load()).profiles[0]!)).toHaveLength(0)
    const resumed = new WorkspaceService(reopened, {
      id: randomUUID,
      now: () => new Date().toISOString(),
    })
    await resumed.saveResource("machine", { ...disabled, enabled: true })
    await resumed.apply("machine")
    expect(await storage.exists(archive)).toBe(false)
    expect(await readFile(join(root, "SKILL.md"), "utf8")).toBe(
      resource.content
    )
    expect((await stat(join(root, "run.sh"))).mode & 0o777).toBe(0o755)
    expect((await stat(join(root, "empty"))).isDirectory()).toBe(true)
    expect(await readlink(join(root, "guide-link"))).toBe(
      "references/guide.txt"
    )
  })
  it("stores new disabled skills and edits them without exposing them to assistants", async () => {
    const { home, repository, service } = await fixture()
    const content =
      "---\nname: private\ndescription: Private skill\n---\nOriginal"
    await service.createResource("machine", {
      ...draft("skills", "private", content),
      targets: ["codex"],
      enabled: false,
    })
    await service.apply("machine")
    const root = join(home, ".agents/skills/private")
    const archive = storage.archivedSkill(join(home, ".agent-switch"), root)
    expect(await storage.exists(root)).toBe(false)
    expect(await readFile(join(archive, "SKILL.md"), "utf8")).toBe(content)
    const skill = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.name === "private"
    )!
    await service.saveResource("machine", {
      ...skill,
      content: content.replace("Original", "Updated"),
    })
    await service.apply("machine")
    expect(await readFile(join(archive, "SKILL.md"), "utf8")).toContain(
      "Updated"
    )
    expect(await storage.exists(root)).toBe(false)
    await service.saveResource("machine", {
      ...skill,
      enabled: true,
      content: content.replace("Original", "Updated"),
    })
    await service.apply("machine")
    expect(await readFile(join(root, "SKILL.md"), "utf8")).toContain("Updated")
    expect(await storage.exists(archive)).toBe(false)
  })
  it("rejects restore collisions without overwriting either skill directory", async () => {
    const { home, repository, service, put } = await fixture()
    const skill = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "skills"
    )!
    await service.saveResource("machine", { ...skill, enabled: false })
    await service.apply("machine")
    await put(".agents/skills/review/user-file", "Keep me")
    await service.saveResource("machine", skill)
    await expect(service.apply("machine")).rejects.toThrow("Skill conflict")
    expect(
      await readFile(join(home, ".agents/skills/review/user-file"), "utf8")
    ).toBe("Keep me")
  })
  it("rolls back a directory move when a later move fails", async () => {
    const { home, repository, service, put } = await fixture()
    await put(
      ".agents/skills/second/SKILL.md",
      "---\nname: second\ndescription: Second skill\n---\nInstructions"
    )
    await repository.refresh()
    for (const skill of (await repository.load()).profiles[0]!.resources.filter(
      (r) => r.kind === "skills"
    ))
      await service.saveResource("machine", { ...skill, enabled: false })
    const move = storage.moveDirectory
    let calls = 0
    const spy = vi
      .spyOn(storage, "moveDirectory")
      .mockImplementation(async (...args) => {
        if (++calls === 2) throw new Error("Move failed")
        return move(...args)
      })
    try {
      await expect(service.apply("machine")).rejects.toThrow("Move failed")
    } finally {
      spy.mockRestore()
    }
    expect(
      await storage.exists(join(home, ".agents/skills/review/SKILL.md"))
    ).toBe(true)
    expect(
      await storage.exists(join(home, ".agents/skills/second/SKILL.md"))
    ).toBe(true)
    expect((await repository.load()).profiles[0]!.history).toHaveLength(0)
  })
  it("recovers an interrupted directory move", async () => {
    const { home, repository } = await fixture()
    const root = join(home, ".agents/skills/review")
    const to = storage.archivedSkill(join(home, ".agent-switch"), root)
    const move = { from: root, to }
    await writeFile(
      join(home, ".agent-switch/pending.json"),
      JSON.stringify({ entries: [], moves: [move] })
    )
    await storage.moveDirectory(home, move)
    await repository.initialize()
    expect(await storage.exists(join(root, "SKILL.md"))).toBe(true)
    expect(await storage.exists(to)).toBe(false)
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
    await expect(service.apply("machine")).rejects.toThrow("Invalid skill path")
    await service.discard("machine")
    await put("original.md", "Keep me")
    await rm(join(home, ".codex/AGENTS.md"))
    await symlink(join(home, "original.md"), join(home, ".codex/AGENTS.md"))
    const resource = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "instructions"
    )!
    await service.saveResource("machine", { ...resource, content: "overwrite" })
    await expect(service.apply("machine")).rejects.toThrow("symbolic link")
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
  it("imports a global snapshot without reading project files", async () => {
    const { repository } = await fixture()
    const workspace = await repository.importDetected({
      name: "Detected project",
      targets: ["codex"],
    })
    const imported = workspace.profiles.at(-1)!
    expect(imported.path).toBe("")
    expect(
      changesFor(imported).every((change) => change.type === "removed")
    ).toBe(true)
    expect(imported.resources).toHaveLength(5)
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
      expect(listing.stdout).toContain("Machine configuration")
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

describe("Global profiles", () => {
  it("archives extra profiles and retains the selected draft without changing native files", async () => {
    const { home, repository } = await fixture()
    const stored = JSON.parse(await readFile(repository.stateFile, "utf8"))
    const selected = structuredClone(stored.workspace.profiles[0])
    selected.id = "selected"
    selected.name = "Personal"
    selected.resources[0].content = "Unapplied personal draft"
    stored.workspace.profiles.push(selected)
    stored.workspace.activeProfileId = selected.id
    await writeFile(repository.stateFile, JSON.stringify(stored))
    await repository.initialize()
    const workspace = await repository.load()
    expect(workspace.profiles).toHaveLength(1)
    expect(workspace.activeProfileId).toBe("selected")
    expect(workspace.profiles[0]!.resources[0]!.content).toBe(
      "Unapplied personal draft"
    )
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toContain(
      "Real instructions"
    )
    expect(
      (await readdir(join(home, ".agent-switch/backups"))).some((f) =>
        f.startsWith("before-single-configuration-")
      )
    ).toBe(true)
    const invalid = structuredClone(workspace)
    invalid.profiles.push({ ...selected, id: "extra" })
    await expect(repository.save(invalid)).rejects.toThrow()
  })
  it("shares one skill across assistants and keeps its identity through refresh and restart", async () => {
    const { home, repository, service } = await fixture()
    const skill = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "skills"
    )!
    await service.saveResource("machine", {
      ...skill,
      targets: ["claude", "codex"],
    })
    await service.apply("machine")
    const claude = join(home, ".claude/skills/review")
    const codex = join(home, ".agents/skills/review")
    expect(
      await readFile(join(claude, "references/guide.txt"), "utf8")
    ).toContain("Preserve")
    await repository.refresh()
    let skills = (await repository.load()).profiles[0]!.resources.filter(
      (r) => r.kind === "skills"
    )
    expect(skills).toHaveLength(1)
    expect(skills[0]!.id).toBe(skill.id)
    expect(skills[0]!.targets).toEqual(["claude", "codex"])
    await service.saveResource("machine", {
      ...skills[0]!,
      targets: ["claude"],
      content: skill.content + "Updated",
    })
    await service.apply("machine")
    expect(await storage.exists(codex)).toBe(false)
    expect(await readFile(join(claude, "SKILL.md"), "utf8")).toContain(
      "Updated"
    )
    await repository.initialize()
    skills = (await repository.load()).profiles[0]!.resources.filter(
      (r) => r.kind === "skills"
    )
    expect(skills).toHaveLength(1)
    await service.saveResource("machine", {
      ...skills[0]!,
      targets: ["claude", "codex"],
    })
    await service.apply("machine")
    expect(await readFile(join(codex, "SKILL.md"), "utf8")).toContain("Updated")
    await service.saveResource("machine", {
      ...skills[0]!,
      targets: ["claude", "codex"],
      enabled: false,
    })
    await service.apply("machine")
    await repository.initialize()
    expect(await storage.exists(codex)).toBe(false)
    expect(await storage.exists(claude)).toBe(false)
    expect(
      (await repository.load()).profiles[0]!.resources.filter(
        (r) => r.kind === "skills"
      )
    ).toHaveLength(1)
  })
  it("keeps long skill descriptions readable without truncating their content", async () => {
    const { repository, put } = await fixture()
    const content =
      "---\nname: long-description\ndescription: " +
      "x".repeat(800) +
      "\n---\nInstructions"
    await put(".agents/skills/long-description/SKILL.md", content)
    await repository.refresh()
    const state = await repository.load()
    const skill = state.profiles[0]!.resources.find(
      (r) => r.name === "long-description"
    )!
    expect(skill.description).toHaveLength(500)
    expect(skill.content).toBe(content)
    await repository.save(state)
  })
  it("distributes OpenAI metadata only to Codex and retains it across refresh, restart and reactivation", async () => {
    const { home, repository, service, put } = await fixture()
    const metadata =
      'interface:\n  display_name: "Review"\npolicy:\n  allow_implicit_invocation: false\n'
    await put(".agents/skills/review/agents/openai.yaml", metadata)
    await put(".agents/skills/review/agents/helper.yaml", "portable helper")
    await put(".agents/skills/review/assets/icon.svg", "<svg/>")
    await repository.refresh()
    const initial = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "skills"
    )!
    await service.saveResource("machine", {
      ...initial,
      targets: ["claude", "codex"],
    })
    const plan = await repository.preview("machine")
    const claude = join(home, ".claude/skills/review")
    const codex = join(home, ".agents/skills/review")
    expect(plan.has(join(claude, "agents/openai.yaml"))).toBe(false)
    await service.apply("machine")
    expect(await storage.exists(join(claude, "agents/openai.yaml"))).toBe(false)
    expect(await readFile(join(codex, "agents/openai.yaml"), "utf8")).toBe(
      metadata
    )
    expect(await readFile(join(claude, "agents/helper.yaml"), "utf8")).toBe(
      "portable helper"
    )
    expect(await readFile(join(claude, "assets/icon.svg"), "utf8")).toBe(
      "<svg/>"
    )
    await repository.refresh()
    let state = await repository.load()
    expect(
      state.profiles[0]!.resources.filter((r) => r.kind === "skills")
    ).toHaveLength(1)
    expect(changesFor(state.profiles[0]!)).toHaveLength(0)
    let skill = state.profiles[0]!.resources.find((r) => r.kind === "skills")!
    await service.saveResource("machine", { ...skill, targets: ["claude"] })
    await service.apply("machine")
    await repository.initialize()
    state = await repository.load()
    skill = state.profiles[0]!.resources.find((r) => r.kind === "skills")!
    expect(skill.files!["agents/openai.yaml"]).toBe(
      Buffer.from(metadata).toString("base64")
    )
    expect(changesFor(state.profiles[0]!)).toHaveLength(0)
    await service.saveResource("machine", {
      ...skill,
      targets: ["claude", "codex"],
    })
    await service.apply("machine")
    expect(await readFile(join(codex, "agents/openai.yaml"), "utf8")).toBe(
      metadata
    )
    expect(await storage.exists(join(claude, "agents/openai.yaml"))).toBe(false)
  })
  it("cleans legacy Claude metadata on apply with a backup and preserves the global copy", async () => {
    const { home, repository, service, put } = await fixture()
    const codex = join(home, ".agents/skills/review")
    const metadata = 'interface:\n  display_name: "Legacy review"\n'
    await put(".agents/skills/review/agents/openai.yaml", metadata)
    await repository.refresh()
    const skill = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "skills"
    )!
    // Simulate a complete copy produced by the previous version, including an archived Claude installation.
    await put(".claude/skills/review/SKILL.md", skill.content)
    await put(
      ".claude/skills/review/references/guide.txt",
      "Preserve this reference"
    )
    const legacy = await put(
      ".claude/skills/review/agents/openai.yaml",
      metadata
    )
    await repository.refresh()
    let shared = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "skills"
    )!
    await service.saveResource("machine", { ...shared, enabled: false })
    await service.apply("machine")
    await repository.initialize()
    shared = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "skills"
    )!
    await service.saveResource("machine", { ...shared, enabled: true })
    const plan = await repository.preview("machine")
    const archived = join(
      storage.archivedSkill(
        repository.directory,
        join(home, ".claude/skills/review")
      ),
      "agents/openai.yaml"
    )
    expect(plan.get(archived)).toBe(null)
    await service.apply("machine")
    expect(await storage.exists(legacy)).toBe(false)
    expect(await readFile(join(codex, "agents/openai.yaml"), "utf8")).toBe(
      metadata
    )
    const backups = await readdir(join(repository.directory, "backups"))
    const journals = await Promise.all(
      backups.map(async (file) =>
        JSON.parse(
          await readFile(join(repository.directory, "backups", file), "utf8")
        )
      )
    )
    expect(
      journals.some((j) =>
        j.entries?.some(
          (entry: { file: string; before: string | null }) =>
            entry.file === archived &&
            entry.before === Buffer.from(metadata).toString("base64")
        )
      )
    ).toBe(true)
    await repository.refresh()
    expect(
      (await repository.load()).profiles[0]!.resources.filter(
        (r) => r.kind === "skills"
      )
    ).toHaveLength(1)
  })
  it("preserves diverging copies as separate skills without losing either content", async () => {
    const { home, repository, service } = await fixture()
    const skill = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "skills"
    )!
    await service.saveResource("machine", {
      ...skill,
      targets: ["claude", "codex"],
    })
    await service.apply("machine")
    await repository.refresh()
    await writeFile(
      join(home, ".claude/skills/review/SKILL.md"),
      skill.content + "Claude-specific edit"
    )
    await repository.refresh()
    const state = await repository.load()
    const skills = state.profiles[0]!.resources.filter(
      (r) => r.kind === "skills"
    )
    expect(skills).toHaveLength(2)
    expect(new Set(skills.map((r) => r.id)).size).toBe(2)
    expect(skills.some((r) => r.content.includes("Claude-specific edit"))).toBe(
      true
    )
    expect(skills.some((r) => r.content === skill.content)).toBe(true)
    expect(
      state.machine!.warnings.some((w) => w.includes("Multiple versions"))
    ).toBe(true)
    await repository.save(state)
  })
  it("archives legacy repository profiles and leaves their files intact", async () => {
    const { home, repository } = await fixture()
    const stored = JSON.parse(await readFile(repository.stateFile, "utf8"))
    const resource = {
      ...stored.workspace.profiles[0].resources[0],
      id: "project-resource",
      scope: "project",
      source: join(home, "projects/example/AGENTS.md"),
      content: "# Project instruction",
    }
    stored.workspace.profiles.push({
      id: "legacy-project",
      name: "Project",
      path: join(home, "projects/example"),
      description: "",
      color: "blue",
      resources: [resource],
      applied: [resource],
      history: [],
    })
    stored.workspace.activeProfileId = "legacy-project"
    stored.bindings[resource.id] = {
      file: resource.source,
      format: "text",
      profilePath: join(home, "projects/example"),
    }
    await writeFile(repository.stateFile, JSON.stringify(stored))
    const reopened = new LocalRepository(
      repository.machine,
      repository.directory
    )
    await reopened.initialize()
    const workspace = await reopened.load()
    expect(workspace.profiles).toHaveLength(1)
    expect(workspace.activeProfileId).toBe("machine")
    expect(
      workspace.profiles[0]!.resources.every((r) => r.scope === "global")
    ).toBe(true)
    const backup = (await readdir(join(home, ".agent-switch/backups"))).find(
      (name) => name.startsWith("before-global-only-")
    )!
    expect(
      JSON.parse(
        await readFile(join(home, ".agent-switch/backups", backup), "utf8")
      ).workspace.profiles
    ).toHaveLength(2)
    expect(await readFile(resource.source, "utf8")).toBe(
      "# Project instruction"
    )
  })
  it("rejects repository-scoped API payloads and keeps native project MCP entries untouched", async () => {
    const { home, repository, service, put } = await fixture()
    await put(
      ".claude.json",
      JSON.stringify({
        mcpServers: {},
        projects: {
          "/some/repo": { mcpServers: { private: { command: "project-mcp" } } },
        },
      })
    )
    await repository.refresh()
    const workspace = await repository.load()
    expect(
      (await repository.discover()).some((r) => r.name === "private")
    ).toBe(false)
    const invalid = JSON.parse(JSON.stringify(workspace))
    invalid.profiles[0].path = join(home, "projects/example")
    await expect(repository.save(invalid)).rejects.toThrow()
    invalid.profiles[0].path = ""
    invalid.profiles[0].resources[0].scope = "project"
    await expect(repository.save(invalid)).rejects.toThrow()
    await service.createResource("machine", {
      ...draft("mcp", "global-mcp", JSON.stringify({ command: "global-mcp" })),
      targets: ["claude"],
    })
    await service.apply("machine")
    const config = JSON.parse(
      await readFile(join(home, ".claude.json"), "utf8")
    )
    expect(config.projects["/some/repo"].mcpServers.private.command).toBe(
      "project-mcp"
    )
    expect(config.mcpServers["global-mcp"].command).toBe("global-mcp")
  })
})

describe("Native instructions", () => {
  it("creates empty native instruction files and Claude rules without silently dropping them", async () => {
    const { home, repository, service } = await fixture()
    await service.saveInstruction("machine", "claude", "")
    await service.createResource("machine", {
      ...draft("instructions", "code-style.md", ""),
      targets: ["claude"],
      instructionRole: "rule",
    })
    await service.apply("machine")
    expect(await readFile(join(home, ".claude/CLAUDE.md"), "utf8")).toBe("")
    expect(
      await readFile(join(home, ".claude/rules/code-style.md"), "utf8")
    ).toBe("")
    await repository.refresh()
    expect(
      (await repository.load()).profiles[0]!.resources.some(
        (r) => r.name === "code-style.md" && r.instructionRole === "rule"
      )
    ).toBe(true)
  })

  it("creates the native Claude file and copies into Codex only after apply", async () => {
    const { home, repository, service } = await fixture()
    await service.saveInstruction(
      "machine",
      "claude",
      "# Claude preferences\n@./shared.md"
    )
    expect(await storage.exists(join(home, ".claude/CLAUDE.md"))).toBe(false)
    const plan = await repository.preview("machine")
    expect(plan.has(join(home, ".claude/CLAUDE.md"))).toBe(true)
    expect([...plan.keys()].some((p) => p.includes("/rules/"))).toBe(false)
    await service.apply("machine")
    await repository.refresh()
    const claude = (await repository.load()).profiles[0]!.resources.find(
      (r) => r.kind === "instructions" && r.targets.includes("claude")
    )!
    expect(claude.instructionRole).toBe("primary")
    const codexBefore = await readFile(join(home, ".codex/AGENTS.md"), "utf8")
    await service.copyInstructions("machine", claude.id, "codex", "append")
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toBe(
      codexBefore
    )
    await service.apply("machine")
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toBe(
      codexBefore.trimEnd() + "\n\n" + claude.content
    )
    await service.copyInstructions(
      "machine",
      claude.id,
      "codex",
      "replace",
      "# Adapted content"
    )
    await service.apply("machine")
    expect(await readFile(join(home, ".codex/AGENTS.md"), "utf8")).toBe(
      "# Adapted content"
    )
    expect(await readFile(join(home, ".claude/CLAUDE.md"), "utf8")).toBe(
      claude.content
    )
  })
  it("respects configured roots, symbolic links, overrides and rule files", async () => {
    const { home, put } = await fixture()
    const target = await put("shared/codex-instructions.md", "# Existing Codex")
    await mkdir(join(home, "custom-codex"), { recursive: true })
    await symlink(target, join(home, "custom-codex/AGENTS.md"))
    await put("custom-codex/AGENTS.override.md", "# Override")
    await put("custom-claude/CLAUDE.md", "# Claude")
    await put("custom-claude/rules/AGENTS.md", "# Additional rule")
    const repository = new LocalRepository(
      new Machine(
        home,
        join(home, "custom-codex"),
        join(home, "custom-claude")
      ),
      join(home, ".agent-switch-custom")
    )
    await repository.initialize()
    const service = new WorkspaceService(repository, {
      id: randomUUID,
      now: () => new Date().toISOString(),
    })
    const workspace = await repository.load()
    const instructions = workspace.profiles[0]!.resources.filter(
      (r) => r.kind === "instructions"
    )
    const codex = instructions.find(
      (r) => r.targets.includes("codex") && r.instructionRole === "primary"
    )!
    const claude = instructions.find(
      (r) => r.targets.includes("claude") && r.instructionRole === "primary"
    )!
    const override = instructions.find((r) => r.instructionRole === "override")!
    expect(codex.instructionPaths?.codex).toBe(
      join(home, "custom-codex/AGENTS.md")
    )
    expect(codex.source).toBe(target)
    expect(
      instructions.find(
        (r) => r.name === "AGENTS.md" && r.targets.includes("claude")
      )!.instructionRole
    ).toBe("rule")
    expect(workspace.machine!.instructionRoots?.claude).toBe(
      join(home, "custom-claude")
    )
    await service.copyInstructions("machine", claude.id, "codex", "replace")
    await service.apply("machine")
    expect(await readlink(join(home, "custom-codex/AGENTS.md"))).toBe(target)
    expect(await readFile(target, "utf8")).toBe("# Claude")
    expect(
      await readFile(join(home, "custom-codex/AGENTS.override.md"), "utf8")
    ).toBe("# Override")
    await service.saveInstruction("machine", "codex", "", override.id)
    await service.apply("machine")
    expect(
      await readFile(join(home, "custom-codex/AGENTS.override.md"), "utf8")
    ).toBe("")
    expect(await storage.exists(join(home, ".codex/CLAUDE.md"))).toBe(false)
  })
})
