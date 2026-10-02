import { readdir, stat, realpath, lstat, readlink } from "node:fs/promises"
import { join, basename, dirname, resolve } from "node:path"
import { hostname } from "node:os"
import { isDeepStrictEqual } from "node:util"
import * as TOML from "@iarna/toml"
import type {
  Assistant,
  Resource,
  Profile,
  Workspace,
} from "@agent-switch/core/workspace"
import { instructionRole } from "@agent-switch/core/instructions"
import { changesFor, validateResource } from "@agent-switch/core/workspace"
import { read, hash, inside, writablePath } from "./files"
import { archivedSkill, exists, type DirectoryMove } from "./skill-storage"

import {
  distributeSkillFile,
  sharedSkillFiles,
  retainOpenAiMetadata,
  OPENAI_SKILL_METADATA,
} from "./skill-files"

type Document = Record<string, unknown>
export interface Binding {
  file: string
  alias?: string
  linkTarget?: string
  keys?: string[]
  format: "text" | "json" | "toml"
  profilePath?: string
  assetRoot?: string
  target?: Assistant
  instructionRole?: Resource["instructionRole"]
  skillLocations?: { target: Assistant; file: string; assetRoot: string }[]
}
export interface Scan {
  workspace: Workspace
  bindings: Record<string, Binding>
  fingerprints: Record<string, string | null>
}
export class Plan extends Map<string, Buffer | null> {
  moves: DirectoryMove[] = []
  modes = new Map<string, number>()
  expected = new Map<string, string | null>()
}
export function object(value: unknown): Document {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("A configuration object is required.")
  return value as Document
}
export function parseDocument(text: string, format: Binding["format"]) {
  return object(format === "toml" ? TOML.parse(text) : JSON.parse(text))
}
export class Machine {
  constructor(
    readonly home: string,
    readonly codexHome = join(home, ".codex"),
    readonly claudeHome = join(home, ".claude")
  ) {}
  async scan(): Promise<Scan> {
    const bindings: Scan["bindings"] = {},
      fingerprints: Scan["fingerprints"] = {},
      warnings: string[] = []
    const load = async (file: string) => {
      const data = await read(file)
      fingerprints[file] = data ? hash(data) : null
      return data
    }
    const resolveFile = async (file: string) => {
      const info = await lstat(file).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      })
      if (!info?.isSymbolicLink()) return { file }
      const target = await realpath(file)
      if (!inside(this.home, target))
        throw new Error(`Symlink outside the home directory: ${file}`)
      return { file: target, alias: file, linkTarget: await readlink(file) }
    }
    const claudeFile = join(this.home, ".claude.json")
    const profiles: Profile[] = []
    {
      const resources: Resource[] = []
      const scope = "global" as const
      const add = async (
        binding: Binding,
        kind: Resource["kind"],
        target: Assistant,
        name: string,
        content: string,
        enabled = true
      ) => {
        const id = hash(
          binding.file + JSON.stringify(binding.keys ?? [])
        ).slice(0, 24)
        const resource: Resource = {
          id,
          kind,
          name,
          description: binding.file,
          content,
          enabled,
          targets: [target],
          scope,
          source:
            binding.file + (binding.keys ? `#${binding.keys.join(".")}` : ""),
        }
        if (kind === "instructions") {
          resource.instructionRole = binding.instructionRole ?? "rule"
          resource.instructionPaths = {
            [target]: binding.alias ?? binding.file,
          }
        }
        if (binding.assetRoot) {
          resource.files = {}
          resource.fileModes = {}
          const walk = async (dir: string) => {
            for (const entry of await readdir(dir, { withFileTypes: true })) {
              const file = join(dir, entry.name)
              if (entry.isSymbolicLink()) {
                warnings.push(`Skipped skill symlink: ${file}`)
                continue
              }
              if (entry.isDirectory()) await walk(file)
              else if (entry.isFile() && file !== binding.file) {
                resource.fileModes![file.slice(binding.assetRoot!.length + 1)] =
                  (await stat(file)).mode & 0o777
                const bytes = await load(file)
                if (bytes && bytes.length <= 5_000_000)
                  resource.files![file.slice(binding.assetRoot!.length + 1)] =
                    bytes.toString("base64")
                else throw new Error(`Skill file too large: ${file}`)
              }
            }
          }
          await walk(binding.assetRoot)
        }
        if (kind === "skills") {
          binding.skillLocations = [
            { target, file: binding.file, assetRoot: binding.assetRoot! },
          ]
          const same = resources.find(
            (r) =>
              r.kind === "skills" &&
              r.name === name &&
              r.content === content &&
              isDeepStrictEqual(
                sharedSkillFiles(r.files),
                sharedSkillFiles(resource.files)
              ) &&
              isDeepStrictEqual(
                sharedSkillFiles(r.fileModes),
                sharedSkillFiles(resource.fileModes)
              )
          )
          if (same) {
            const previous = bindings[same.id]!
            // Codex owns these settings; keep them in the global resource even though Claude has no copy.
            if (target === "codex" || !same.targets.includes("codex"))
              retainOpenAiMetadata(same, resource)
            if (!same.targets.includes(target)) same.targets.push(target)
            previous.skillLocations!.push(...binding.skillLocations)
            return
          }
          if (resources.some((r) => r.kind === "skills" && r.name === name))
            warnings.push(
              `Multiple versions of the skill ${name} were found; they are kept separately.`
            )
          resource.description =
            content
              .match(/^description:\s*(.+)$/m)?.[1]
              ?.replace(/^["']|["']$/g, "")
              .slice(0, 500) ?? "Global skill"
        }
        bindings[id] = { ...binding, profilePath: "" }
        const shared = resources.find((r) => r.id === id)
        if (shared) {
          if (!shared.targets.includes(target)) shared.targets.push(target)
          if (kind === "instructions")
            shared.instructionPaths = {
              ...shared.instructionPaths,
              ...resource.instructionPaths,
            }
        } else resources.push(resource)
      }
      const readTextFile = async (
        file: string,
        target: Assistant,
        kind: Resource["kind"] = "instructions",
        role: Resource["instructionRole"] = "rule"
      ) => {
        const location = await resolveFile(file)
        const bytes = await load(location.file)
        if (bytes)
          await add(
            {
              ...location,
              format: "text",
              ...(kind === "instructions" ? { instructionRole: role } : {}),
              ...(kind === "skills"
                ? { assetRoot: dirname(location.file) }
                : {}),
            },
            kind,
            target,
            kind === "skills" ? basename(dirname(file)) : basename(file),
            bytes.toString()
          )
      }
      const warn = (error: unknown) => {
        warnings.push(
          error instanceof Error ? error.message : "Unable to read."
        )
      }
      const textFile = (...args: Parameters<typeof readTextFile>) =>
        readTextFile(...args).catch(warn)
      const directory = async (
        dir: string,
        target: Assistant,
        kind: "skills" | "instructions",
        depth = 0
      ) => {
        if (depth > 8) return
        try {
          const actual = await realpath(dir)
          if (!inside(this.home, actual)) {
            warnings.push(`Skipped folder outside the home directory: ${dir}`)
            return
          }
          for (const entry of await readdir(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name)
            if (entry.isDirectory())
              await directory(path, target, kind, depth + 1)
            else if (
              entry.isFile() &&
              (kind === "skills"
                ? entry.name === "SKILL.md"
                : entry.name.endsWith(".md"))
            )
              await textFile(path, target, kind)
            else if (entry.isSymbolicLink())
              warnings.push(`Unsupported symlink: ${path}`)
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
      }
      const readConfig = async (
        file: string,
        format: "json" | "toml",
        target: Assistant,
        mcpPath: string[],
        hookPath?: string[]
      ) => {
        const location = await resolveFile(file)
        const bytes = await load(location.file)
        if (!bytes) return
        let doc: Document
        try {
          doc = parseDocument(bytes.toString(), format)
        } catch {
          warnings.push(`Unreadable configuration: ${file}`)
          return
        }
        const get = (keys: string[]) =>
          keys.reduce<unknown>(
            (v, k) =>
              v && typeof v === "object" ? (v as Document)[k] : undefined,
            doc
          )
        const servers = get(mcpPath)
        if (servers && typeof servers === "object")
          for (const [name, config] of Object.entries(servers)) {
            await add(
              { ...location, format, keys: [...mcpPath, name] },
              "mcp",
              target,
              name,
              JSON.stringify(config, null, 2),
              object(config).enabled !== false
            )
          }
        if (hookPath && get(hookPath))
          await add(
            { ...location, format, keys: hookPath },
            "hooks",
            target,
            `Hooks ${target}`,
            JSON.stringify(get(hookPath), null, 2)
          )
      }
      const config = (...args: Parameters<typeof readConfig>) =>
        readConfig(...args).catch(warn)
      const claude = this.claudeHome
      const codex = this.codexHome
      await textFile(
        join(claude, "CLAUDE.md"),
        "claude",
        "instructions",
        "primary"
      )
      await textFile(
        join(codex, "AGENTS.md"),
        "codex",
        "instructions",
        "primary"
      )
      await textFile(
        join(codex, "AGENTS.override.md"),
        "codex",
        "instructions",
        "override"
      )
      await directory(join(claude, "rules"), "claude", "instructions")
      await directory(join(claude, "skills"), "claude", "skills")
      await directory(join(this.home, ".agents/skills"), "codex", "skills")
      await directory(join(codex, "skills"), "codex", "skills")
      await config(
        join(codex, "hooks.json"),
        "json",
        "codex",
        ["mcpServers"],
        ["hooks"]
      )
      await config(
        join(codex, "config.toml"),
        "toml",
        "codex",
        ["mcp_servers"],
        ["hooks"]
      )
      await config(
        join(claude, "settings.json"),
        "json",
        "claude",
        ["mcpServers"],
        ["hooks"]
      )
      await config(claudeFile, "json", "claude", ["mcpServers"])
      profiles.push({
        id: "machine",
        name: "Machine configuration",
        description: `Global configuration for ${hostname()}`,
        path: "",
        color: "violet",
        resources,
        applied: structuredClone(resources),
        history: [],
      })
    }
    return {
      workspace: {
        version: 1,
        activeProfileId: "machine",
        profiles,
        theme: "dark",
        machine: {
          instructionRoots: { claude: this.claudeHome, codex: this.codexHome },
          hostname: hostname(),
          home: this.home,
          scannedAt: new Date().toISOString(),
          warnings,
        },
      },
      bindings,
      fingerprints,
    }
  }
  destinations(
    resource: Resource,
    profile: Profile,
    bindings: Scan["bindings"]
  ): Binding[] {
    if (profile.path || resource.scope !== "global")
      throw new Error("Only global configuration is supported.")
    const old = bindings[resource.id]
    if (resource.kind === "skills") {
      const slug =
        resource.name
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "-")
          .replace(/^-|-$/g, "") || hash(resource.id).slice(0, 24)
      return resource.targets.flatMap<Binding>((target) => {
        const locations = old?.skillLocations?.filter(
          (l) => l.target === target
        )
        if (locations?.length)
          return locations.map((l) => ({
            file: l.file,
            assetRoot: l.assetRoot,
            target,
            format: "text" as const,
          }))
        // Bind legacy discoveries to their original assistant, while allowing new destinations.
        if (
          old?.assetRoot &&
          !old.skillLocations &&
          (target === "claude"
            ? inside(this.claudeHome, old.file)
            : !inside(this.claudeHome, old.file))
        )
          return [{ ...old, target }]
        const assetRoot = join(
          target === "codex"
            ? join(this.home, ".agents/skills")
            : join(this.claudeHome, "skills"),
          slug
        )
        return [
          {
            file: join(assetRoot, "SKILL.md"),
            assetRoot,
            target,
            format: "text" as const,
          },
        ]
      })
    }
    // Source bindings are generated by discovery, never accepted from portable files.
    if (
      old &&
      !old.profilePath &&
      resource.source === old.file + (old.keys ? `#${old.keys.join(".")}` : "")
    )
      return [
        resource.kind === "mcp"
          ? { ...old, keys: [...old.keys!.slice(0, -1), resource.name] }
          : old,
      ]
    const slug =
      resource.name
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-|-$/g, "") || resource.id
    const destinations: Binding[] = resource.targets.map((target): Binding => {
      const configDir = target === "codex" ? this.codexHome : this.claudeHome
      if (resource.kind === "mcp")
        return target === "codex"
          ? {
              file: join(configDir, "config.toml"),
              format: "toml",
              keys: ["mcp_servers", resource.name],
            }
          : {
              file: join(this.home, ".claude.json"),
              format: "json",
              keys: ["mcpServers", resource.name],
            }
      if (resource.kind === "hooks")
        return {
          file: join(
            configDir,
            target === "codex" ? "config.toml" : "settings.json"
          ),
          format: target === "codex" ? "toml" : "json",
          keys: ["hooks"],
        }
      return {
        file:
          target === "claude"
            ? instructionRole(resource) === "primary"
              ? join(configDir, "CLAUDE.md")
              : join(configDir, "rules", `${slug.replace(/-md$/, "")}.md`)
            : join(
                this.codexHome,
                instructionRole(resource) === "override"
                  ? "AGENTS.override.md"
                  : "AGENTS.md"
              ),
        format: "text",
      }
    })
    return destinations.map((binding) => {
      const known = Object.values(bindings).find(
        (value) => value.alias === binding.file
      )
      return known
        ? {
            ...binding,
            file: known.file,
            alias: known.alias,
            linkTarget: known.linkTarget,
          }
        : binding
    })
  }

  async plan(
    profile: Profile,
    bindings: Scan["bindings"],
    fingerprints: Scan["fingerprints"],
    storage = join(this.home, ".agent-switch")
  ): Promise<Plan> {
    const plan: Plan = new Plan(),
      touched = new Set<string>()
    const current = async (file: string) =>
      plan.has(file) ? plan.get(file)! : await read(file)
    const patch = async (
      binding: Binding,
      value: string | null,
      allowExisting: boolean
    ) => {
      if (
        binding.alias &&
        (await readlink(binding.alias)) !== binding.linkTarget
      )
        throw new Error(
          `The symlink has changed: ${binding.alias}. Refresh the configuration.`
        )
      await writablePath(this.home, binding.file)
      const original = await read(binding.file)
      plan.expected.set(binding.file, original ? hash(original) : null)
      const expected = fingerprints[binding.file]
      if (
        expected !== undefined &&
        (original ? hash(original) : null) !== expected
      )
        throw new Error(
          `The file has changed on disk: ${binding.file}. Refresh before applying.`
        )
      const identity = binding.file + JSON.stringify(binding.keys ?? [])
      if (value !== null && touched.has(identity))
        throw new Error(
          `Multiple items target the same location: ${binding.file}`
        )
      if (value !== null) touched.add(identity)
      if (binding.format === "text") {
        if (
          value !== null &&
          original &&
          !allowExisting &&
          expected === undefined
        )
          throw new Error(
            `The file already exists: ${binding.file}. Edit the detected item.`
          )
        plan.set(binding.file, value === null ? null : Buffer.from(value))
        return
      }
      const bytes = await current(binding.file)
      const doc = bytes ? parseDocument(bytes.toString(), binding.format) : {}
      let node = doc
      for (const key of binding.keys!.slice(0, -1)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
          throw new Error("Forbidden key.")
        node[key] ??= {}
        node = object(node[key])
      }
      const key = binding.keys!.at(-1)!
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("Forbidden key.")
      if (value === null) delete node[key]
      else {
        if (node[key] !== undefined && !allowExisting && expected === undefined)
          throw new Error(
            `Configuration ${key} already exists in ${binding.file}.`
          )
        node[key] = JSON.parse(value)
      }
      plan.set(
        binding.file,
        Buffer.from(
          binding.format === "toml"
            ? TOML.stringify(doc as TOML.JsonMap)
            : JSON.stringify(doc, null, 2) + "\n"
        )
      )
    }
    const destinations = new Set<string>()
    for (const resource of profile.resources.filter((r) => r.enabled)) {
      for (const binding of this.destinations(resource, profile, bindings)) {
        const slot = binding.file + JSON.stringify(binding.keys ?? [])
        if (destinations.has(slot))
          throw new Error(
            `Multiple items target ${binding.file}. Edit the existing item or choose another assistant.`
          )
        destinations.add(slot)
      }
    }
    const changes = changesFor(profile)
    // Skills are stored as complete directories outside the assistants' discovery roots.
    const skillSlots = new Map<
      string,
      { binding: Binding; before?: Resource; after?: Resource }
    >()
    for (const [side, resources] of [
      ["before", profile.applied],
      ["after", profile.resources],
    ] as const)
      for (const resource of resources.filter((r) => r.kind === "skills"))
        for (const binding of this.destinations(resource, profile, bindings)) {
          const slot = skillSlots.get(binding.file) ?? { binding }
          slot[side] = resource
          skillSlots.set(binding.file, slot)
        }
    for (const { binding, before, after } of skillSlots.values()) {
      if (
        !changes.some(
          (c) =>
            (before && c.before?.id === before.id) ||
            (after && c.after?.id === after.id)
        )
      )
        continue
      const root = binding.assetRoot!
      const archive = archivedSkill(storage, root)
      const archived = await exists(archive)
      const active = await exists(root)
      if (archived && active)
        throw new Error(
          `Skill conflict: both ${root} and its archive exist. Refresh the configuration.`
        )
      for (const [file, expected] of Object.entries(fingerprints)) {
        if (file.startsWith((archived ? archive : root) + "/")) {
          const bytes = await read(file)
          plan.expected.set(file, expected)
          if ((bytes ? hash(bytes) : null) !== expected)
            throw new Error(
              `Skill file changed: ${file}. Refresh before applying.`
            )
        }
      }
      const location = archived
        ? archive
        : active
          ? root
          : after?.enabled
            ? root
            : archive
      if (after) {
        validateResource(after)
        const write = async (name: string, bytes: Buffer, mode?: number) => {
          const file = resolve(location, name)
          if (!inside(location, file)) throw new Error("Invalid skill path.")
          await writablePath(this.home, file)
          const old = await read(file)
          const expected = fingerprints[file]
          if (expected !== undefined && (old ? hash(old) : null) !== expected)
            throw new Error(`Skill file changed: ${file}`)
          if (old && !before && !archived)
            throw new Error(`A skill file already exists: ${file}`)
          plan.expected.set(file, old ? hash(old) : null)
          plan.set(file, bytes)
          if (mode !== undefined) plan.modes.set(file, mode)
        }
        // A simple toggle moves the original bytes, including untracked files and links.
        if (
          !before ||
          before.content !== after.content ||
          !(await exists(join(location, "SKILL.md")))
        )
          await write("SKILL.md", Buffer.from(after.content))
        for (const [name, data] of Object.entries(after.files ?? {}))
          if (
            distributeSkillFile(name, binding.target!) &&
            (!before ||
              before.files?.[name] !== data ||
              before.fileModes?.[name] !== after.fileModes?.[name])
          )
            await write(
              name,
              Buffer.from(data, "base64"),
              after.fileModes?.[name] ?? 0o600
            )
      }
      // Clean up older complete copies only when applying this skill. The transaction backs up the file.
      if (after?.enabled && binding.target === "claude") {
        const metadata = join(location, OPENAI_SKILL_METADATA)
        await writablePath(this.home, metadata)
        const bytes = await read(metadata)
        if (bytes) {
          plan.expected.set(metadata, hash(bytes))
          plan.set(metadata, null)
        }
      }
      if (after?.enabled && archived)
        plan.moves.push({ from: archive, to: root })
      else if (!after?.enabled && active)
        plan.moves.push({ from: root, to: archive })
    }
    // Remove old slots before writing new slots, including when IDs differ between profiles.
    for (const change of changes)
      if (change.before?.enabled && change.before.kind !== "skills") {
        for (const binding of this.destinations(
          change.before,
          profile,
          bindings
        ))
          await patch(binding, null, true)
      }
    for (const change of changes) {
      if ((change.after ?? change.before)?.kind === "skills") continue
      const before = change.before,
        after = change.after
      if (after) validateResource(after)
      if (
        before &&
        after &&
        bindings[before.id] &&
        (JSON.stringify(before.targets) !== JSON.stringify(after.targets) ||
          before.scope !== after.scope)
      )
        throw new Error(
          "To move a detected item to another assistant or scope, create a copy."
        )
      const previous = before
        ? this.destinations(before, profile, bindings)
        : []
      if (after?.enabled)
        for (const binding of this.destinations(after, profile, bindings)) {
          await patch(
            binding,
            after.content,
            previous.some(
              (p) =>
                p.file === binding.file &&
                JSON.stringify(p.keys) === JSON.stringify(binding.keys)
            )
          )
        }
    }
    for (const [file, bytes] of plan) {
      const old = await read(file)
      if (
        (bytes !== null && old !== null && bytes.equals(old)) ||
        (bytes === null && old === null)
      )
        plan.delete(file)
    }
    return plan
  }
}
