import { isDeepStrictEqual } from "node:util"
import { join } from "node:path"
import { mkdir, rm, stat, chmod } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import {
  changesFor,
  recordApplication,
  validateResource,
  type Workspace,
  type Profile,
  type Resource,
} from "@agent-switch/core/workspace"
import { workspaceSchema } from "@agent-switch/core/schemas"
import type { WorkspaceRepository } from "@agent-switch/core/ports"
import { Machine, type Scan, type Plan } from "./machine"
import { atomicWrite, hash, read, writablePath } from "./files"
import {
  moveDirectory,
  undoMoves,
  checkSkillLinks,
  type DirectoryMove,
} from "./skill-storage"

import { retainOpenAiMetadata } from "./skill-files"
import {
  checkMaterialization,
  materialize,
  undoMaterializations,
  type Materialization,
  type SkillTree,
} from "./skill-materialization"

interface State extends Scan {
  revision: number
  currentResources?: Resource[]
}
interface BackupEntry {
  file: string
  before: string | null
  afterHash: string | null
  mode?: number
}
export class LocalRepository implements WorkspaceRepository {
  readonly stateFile: string
  private state!: State
  constructor(
    readonly machine: Machine,
    readonly directory: string
  ) {
    this.stateFile = join(directory, "workspace.json")
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const pending = await read(join(this.directory, "pending.json"))
    if (pending) {
      const journal = JSON.parse(pending.toString()) as
        | BackupEntry[]
        | {
            entries: BackupEntry[]
            moves: DirectoryMove[]
            materializations?: Materialization[]
          }
      const entries = Array.isArray(journal) ? journal : journal.entries
      if (!Array.isArray(journal))
        await undoMoves(this.machine.home, journal.moves)
      for (const entry of entries) {
        await writablePath(this.machine.home, entry.file)
        const current = await read(entry.file)
        const fingerprint = current ? hash(current) : null
        if (
          fingerprint !== entry.afterHash &&
          fingerprint !==
            (entry.before ? hash(Buffer.from(entry.before, "base64")) : null)
        )
          throw new Error(
            "Transaction interrupted with external changes. Check pending.json before restarting."
          )
      }
      await this.rollback(entries)
      if (!Array.isArray(journal))
        await undoMaterializations(
          this.machine.home,
          journal.materializations ?? []
        )
      await rm(join(this.directory, "pending.json"))
    }
    const stored = await read(this.stateFile)
    if (stored) {
      const legacy = JSON.parse(stored.toString()) as State
      const projectProfiles = legacy.workspace.profiles.filter(
        (p) =>
          Boolean(p.path) ||
          [
            ...p.resources,
            ...p.applied,
            ...p.history.flatMap((h) => h.resources),
          ].some((r) => String(r.scope) !== "global")
      )
      if (projectProfiles.length) {
        await atomicWrite(
          join(
            this.directory,
            "backups",
            `before-global-only-${Date.now()}.json`
          ),
          stored
        )
        legacy.workspace.profiles = legacy.workspace.profiles
          .filter((p) => !p.path)
          .map((p) => ({
            ...p,
            resources: p.resources.filter((r) => String(r.scope) === "global"),
            applied: p.applied.filter((r) => String(r.scope) === "global"),
            history: p.history.map((h) => ({
              ...h,
              resources: h.resources.filter(
                (r) => String(r.scope) === "global"
              ),
            })),
          }))
        const global = await this.machine.scan()
        if (!legacy.workspace.profiles.length)
          legacy.workspace.profiles = global.workspace.profiles
        if (
          !legacy.workspace.profiles.some(
            (p) => p.id === legacy.workspace.activeProfileId
          )
        )
          legacy.workspace.activeProfileId = legacy.workspace.profiles[0]!.id
        legacy.bindings = Object.fromEntries(
          Object.entries(legacy.bindings).filter(
            ([, binding]) => !binding.profilePath
          )
        )
        legacy.fingerprints = global.fingerprints
        legacy.currentResources = global.workspace.profiles[0]!.resources
      }
      if (legacy.workspace.profiles.length > 1) {
        await atomicWrite(
          join(
            this.directory,
            "backups",
            `before-single-configuration-${Date.now()}.json`
          ),
          stored
        )
        const selected =
          legacy.workspace.profiles.find(
            (p) => p.id === legacy.workspace.activeProfileId
          ) ?? legacy.workspace.profiles[0]!
        legacy.workspace.profiles = [selected]
        legacy.workspace.activeProfileId = selected.id
      }
      legacy.workspace.profiles[0]!.name = "Global configuration"
      // The card description is an excerpt; the complete skill metadata stays in content.
      for (const resource of [
        ...legacy.workspace.profiles.flatMap((p) => [
          ...p.resources,
          ...p.applied,
          ...p.history.flatMap((h) => h.resources),
        ]),
        ...(legacy.currentResources ?? []),
      ])
        if (resource.kind === "skills")
          resource.description = resource.description.slice(0, 500)
      this.state = legacy
      this.state.workspace = workspaceSchema.parse(this.state.workspace)
      await this.refresh()
    } else {
      const scan = await this.machine.scan()
      this.state = {
        ...scan,
        currentResources: scan.workspace.profiles[0]!.resources,
        revision: 1,
      }
      await this.persist(this.state)
    }
  }
  private async persist(state: State) {
    await atomicWrite(this.stateFile, JSON.stringify(state, null, 2))
    this.state = state
  }
  etag() {
    return `"${this.state.revision}"`
  }
  async load() {
    return structuredClone(this.state.workspace)
  }
  async save(input: Workspace) {
    const workspace = workspaceSchema.parse(input)
    for (const profile of workspace.profiles) {
      const old = this.state.workspace.profiles.find((p) => p.id === profile.id)
      if (
        !isDeepStrictEqual(profile.applied, old?.applied ?? []) ||
        !isDeepStrictEqual(profile.history, old?.history ?? [])
      )
        throw new Error(
          "Applied configurations and history are managed by the server."
        )
      for (const change of changesFor(profile))
        if (change.after) {
          validateResource(change.after)
          if (change.after.kind === "mcp") {
            const config = JSON.parse(change.after.content)
            if ("enabled" in config)
              change.after.content = JSON.stringify(
                { ...config, enabled: change.after.enabled },
                null,
                2
              )
          }
        }
    }
    this.alignProfiles(workspace, this.state.currentResources ?? [])
    workspace.machine = this.state.workspace.machine
    await this.persist({
      ...this.state,
      workspace,
      revision: this.state.revision + 1,
    })
  }
  async refresh() {
    const scan = await this.machine.scan()
    // Keep skill identity stable when enabling a second assistant changes discovery order.
    const known =
      this.state.currentResources ?? this.state.workspace.profiles[0]!.applied
    const profile = this.state.workspace.profiles[0]!
    const scannedSkills = scan.workspace.profiles[0]!.resources.filter(
      (r) => r.kind === "skills"
    )
    const discoveredBindings = { ...scan.bindings }
    for (const resource of scannedSkills) delete scan.bindings[resource.id]
    const assigned = new Set<string>()
    for (const resource of scannedSkills) {
      const discovered = discoveredBindings[resource.id]!
      const paths = new Set(
        discovered.skillLocations?.map((l) => l.file) ?? [discovered.file]
      )
      const existing = known.find(
        (r) =>
          r.kind === "skills" &&
          this.machine
            .destinations(r, profile, this.state.bindings)
            .some((b) => paths.has(b.file))
      )
      if (!existing || assigned.has(existing.id)) {
        if (assigned.has(resource.id))
          resource.id = hash(discovered.file + "distinct-skill").slice(0, 24)
        assigned.add(resource.id)
        scan.bindings[resource.id] = discovered
        continue
      }
      assigned.add(existing.id)
      // When Codex is disabled, discovery sees only the portable Claude copy.
      // Keep Codex settings in the library for a future reactivation/export.
      if (!resource.targets.includes("codex"))
        retainOpenAiMetadata(resource, existing)
      const old = this.state.bindings[existing.id]
      resource.id = existing.id
      resource.source = existing.source
      resource.name = existing.name
      const previousLocations = old?.skillLocations ?? []
      scan.bindings[resource.id] = {
        ...discovered,
        file: old?.file ?? discovered.file,
        skillLocations: [
          ...previousLocations.filter((l) => !paths.has(l.file)),
          ...(discovered.skillLocations ?? []),
        ],
      }
    }
    for (const file of Object.keys(this.state.fingerprints))
      if (!(file in scan.fingerprints)) {
        try {
          const bytes = await read(file)
          scan.fingerprints[file] = bytes ? hash(bytes) : null
        } catch {
          scan.workspace.machine!.warnings.push(`Unable to read: ${file}`)
        }
      }
    const workspace = structuredClone(this.state.workspace)
    const scanned = scan.workspace.profiles[0]!.resources
    // Native file identity is discovery metadata, independent of unsaved text drafts.
    for (const profile of workspace.profiles)
      for (const resource of [...profile.resources, ...profile.applied]) {
        const actual = scanned.find(
          (r) => r.id === resource.id && r.kind === "instructions"
        )
        if (actual) {
          resource.instructionRole = actual.instructionRole
          resource.instructionPaths = actual.instructionPaths
        }
      }
    const currentResources = [
      ...scanned,
      ...(this.state.currentResources ?? []).filter(
        (r) => !r.enabled && !scanned.some((actual) => actual.id === r.id)
      ),
    ]
    const bindings = { ...this.state.bindings, ...scan.bindings }
    const selected = workspace.profiles.find(
      (p) => p.id === workspace.activeProfileId
    )
    // A clean selected profile follows external edits; inactive presets retain their desired configuration.
    if (selected && !changesFor(selected).length) {
      const disabled = selected.resources.filter((r) => !r.enabled)
      selected.resources = [
        ...currentResources.map((actual) => {
          const desired = selected.resources.find(
            (r) => r.id === actual.id && r.kind === "mcp"
          )
          return desired &&
            desired.targets.some((target) => !actual.targets.includes(target))
            ? { ...actual, targets: [...desired.targets] }
            : actual
        }),
        ...disabled.filter((r) => !currentResources.some((c) => c.id === r.id)),
      ]
    }
    this.alignProfiles(workspace, currentResources, bindings)
    workspace.machine = scan.workspace.machine
    await this.persist({
      ...this.state,
      workspace,
      currentResources,
      bindings: { ...this.state.bindings, ...scan.bindings },
      fingerprints: { ...this.state.fingerprints, ...scan.fingerprints },
      revision: this.state.revision + 1,
    })
    return this.load()
  }
  async discover() {
    return (await this.machine.scan()).workspace.profiles[0]!.resources
  }
  private alignProfiles(
    workspace: Workspace,
    current: Resource[],
    bindings = this.state.bindings
  ) {
    const slots = (resource: Resource, profile: Profile) =>
      this.machine
        .destinations(resource, profile, bindings)
        .map((b) => b.file + JSON.stringify(b.keys ?? []))
        .sort()
        .join("\n")
    for (const profile of workspace.profiles) {
      profile.applied = current.map((actual) => {
        const desired = profile.resources.find(
          (r) => slots(r, profile) === slots(actual, profile)
        )
        if (!desired) return structuredClone(actual)
        const baseline = {
          ...structuredClone(desired),
          content: actual.content,
          enabled: actual.enabled,
          targets: [...actual.targets],
        }
        if (actual.files) baseline.files = structuredClone(actual.files)
        else delete baseline.files
        if (actual.fileModes)
          baseline.fileModes = structuredClone(actual.fileModes)
        else delete baseline.fileModes
        return baseline
      })
    }
  }
  async importDetected(input: {
    name?: string
    targets: ("claude" | "codex")[]
  }) {
    if (
      !input.targets?.length ||
      input.targets.some((t) => !["claude", "codex"].includes(t))
    )
      throw new Error("Assistants are required.")
    const scan = await this.machine.scan()
    const workspace = structuredClone(this.state.workspace)
    const profile = workspace.profiles[0]!
    for (const resource of scan.workspace.profiles[0]!.resources)
      if (
        resource.targets.some((t) => input.targets.includes(t)) &&
        !profile.resources.some((r) => r.id === resource.id)
      )
        profile.resources.push(resource)
    this.alignProfiles(workspace, this.state.currentResources ?? [], {
      ...this.state.bindings,
      ...scan.bindings,
    })
    await this.persist({
      ...this.state,
      workspace: workspaceSchema.parse(workspace),
      bindings: { ...this.state.bindings, ...scan.bindings },
      fingerprints: { ...scan.fingerprints, ...this.state.fingerprints },
      revision: this.state.revision + 1,
    })
    return this.load()
  }
  async preview(
    profileId: string,
    skillEditMode: "local" | "shared" = "local"
  ) {
    const profile = this.state.workspace.profiles.find(
      (p) => p.id === profileId
    )
    if (!profile) throw new Error("Profile not found.")
    return this.machine.plan(
      profile,
      this.state.bindings,
      this.state.fingerprints,
      this.directory,
      skillEditMode
    )
  }
  private async rollback(entries: BackupEntry[]) {
    for (const entry of [...entries].reverse()) {
      await writablePath(this.machine.home, entry.file)
      if (entry.before === null) await rm(entry.file, { force: true })
      else {
        await atomicWrite(entry.file, Buffer.from(entry.before, "base64"))
        if (entry.mode !== undefined) await chmod(entry.file, entry.mode)
      }
    }
  }
  private async transaction(plan: Plan) {
    await checkSkillLinks(this.machine.home, plan.links)
    for (const operation of plan.materializations)
      await checkMaterialization(this.machine.home, operation)
    const entries: BackupEntry[] = []
    for (const [file, expected] of plan.expected) {
      const bytes = await read(file)
      if ((bytes ? hash(bytes) : null) !== expected)
        throw new Error(`Concurrent change detected: ${file}`)
    }
    for (const [file, after] of plan) {
      await writablePath(this.machine.home, file)
      const before = await read(file)
      if (
        plan.expected.has(file) &&
        (before ? hash(before) : null) !== plan.expected.get(file)
      )
        throw new Error(`Concurrent change detected: ${file}`)
      entries.push({
        file,
        before: before?.toString("base64") ?? null,
        afterHash: after ? hash(after) : null,
        mode: before ? (await stat(file)).mode & 0o777 : undefined,
      })
    }
    const backup = join(
      this.directory,
      "backups",
      `${Date.now()}-${randomUUID()}.json`
    )
    const journal = JSON.stringify({
      entries,
      moves: plan.moves,
      materializations: plan.materializations,
    })
    await atomicWrite(backup, journal)
    const pending = join(this.directory, "pending.json")
    await atomicWrite(pending, journal)
    const persistentLinks = plan.links.filter(
      (link) =>
        !plan.materializations.some(
          (operation) =>
            link.currentPath === operation.path ||
            link.currentPath.startsWith(operation.path + "/")
        )
    )
    const written: BackupEntry[] = []
    const moved: DirectoryMove[] = []
    try {
      for (const operation of plan.materializations)
        await materialize(this.machine.home, operation)
      for (const [file, after] of plan) {
        await checkSkillLinks(this.machine.home, persistentLinks)
        await writablePath(this.machine.home, file)
        const entry = entries.find((e) => e.file === file)!
        const current = await read(file)
        if (
          (current ? hash(current) : null) !==
          (entry.before ? hash(Buffer.from(entry.before, "base64")) : null)
        )
          throw new Error(`Concurrent change detected: ${file}`)
        written.push(entry)
        if (after === null) await rm(file, { force: true })
        else {
          await atomicWrite(file, after)
          if (plan.modes.has(file)) await chmod(file, plan.modes.get(file)!)
        }
      }
      await checkSkillLinks(this.machine.home, persistentLinks)
      for (const move of plan.moves) {
        for (const [file, original] of plan.expected) {
          if (!file.startsWith(move.from + "/")) continue
          const planned = plan.get(file)
          const expected =
            planned === undefined
              ? original
              : planned === null
                ? null
                : hash(planned)
          const bytes = await read(file)
          if ((bytes ? hash(bytes) : null) !== expected)
            throw new Error(`Concurrent change detected: ${file}`)
        }
        await moveDirectory(this.machine.home, move)
        moved.push(move)
      }
    } catch (error) {
      await undoMoves(this.machine.home, moved)
      await this.rollback(written)
      await undoMaterializations(this.machine.home, plan.materializations)
      await rm(pending, { force: true })
      throw error
    }
    await rm(pending, { force: true })
  }
  async apply(profileId: string, skillEditMode: "local" | "shared" = "local") {
    const plan = await this.preview(profileId, skillEditMode)
    const pending = structuredClone(this.state.workspace)
    const profile = pending.profiles.find((p) => p.id === profileId)!
    for (const resource of profile.resources.filter(
      (r) => r.kind === "skills"
    )) {
      for (const location of this.state.bindings[resource.id]?.skillLocations ??
        []) {
        const file = location.linked?.file ?? location.file
        const content = plan.get(file)
        if (content && plan.shared.has(file))
          resource.content = content.toString()
        const root = location.linked?.root ?? location.assetRoot
        for (const [path, bytes] of plan) {
          if (!plan.shared.has(path) || !path.startsWith(root + "/")) continue
          const name = path.slice(root.length + 1)
          if (name === "SKILL.md") continue
          if (bytes) {
            resource.files ??= {}
            resource.files[name] = bytes.toString("base64")
            if (plan.modes.has(path)) {
              resource.fileModes ??= {}
              resource.fileModes[name] = plan.modes.get(path)!
            }
          } else {
            delete resource.files?.[name]
            delete resource.fileModes?.[name]
          }
        }
      }
    }
    const workspace = recordApplication(
      pending,
      profileId,
      randomUUID(),
      new Date().toISOString()
    )
    const currentResources = structuredClone(
      workspace.profiles.find((p) => p.id === profileId)!.resources
    )
    this.alignProfiles(workspace, currentResources)
    const next: State = {
      ...this.state,
      workspace,
      currentResources,
      revision: this.state.revision + 1,
      fingerprints: { ...this.state.fingerprints },
      bindings: structuredClone(this.state.bindings),
    }
    for (const binding of Object.values(next.bindings)) {
      for (const location of binding.skillLocations ?? []) {
        if (plan.rebindings.has(location.file))
          location.linked = plan.rebindings.get(location.file)
      }
    }
    const fingerprintTree = (path: string, tree: SkillTree) => {
      if (tree.kind === "file")
        next.fingerprints[path] = hash(Buffer.from(tree.data, "base64"))
      else if (tree.kind === "directory")
        for (const [name, child] of Object.entries(tree.children))
          fingerprintTree(join(path, name), child)
    }
    for (const operation of plan.materializations)
      if (operation.kind === "copy-skill")
        fingerprintTree(operation.path, operation.tree)
    for (const [file, content] of plan)
      next.fingerprints[file] = content ? hash(content) : null
    for (const binding of Object.values(next.bindings))
      for (const location of binding.skillLocations ?? []) {
        if (!location.linked) continue
        for (const [file, content] of plan) {
          const alias =
            file === location.linked.file
              ? location.file
              : file.startsWith(location.linked.root + "/")
                ? location.assetRoot + file.slice(location.linked.root.length)
                : null
          if (alias) next.fingerprints[alias] = content ? hash(content) : null
        }
      }
    for (const move of plan.moves)
      for (const [file, fingerprint] of Object.entries(next.fingerprints))
        if (file.startsWith(move.from + "/")) {
          next.fingerprints[move.to + file.slice(move.from.length)] =
            fingerprint
          next.fingerprints[file] = null
        }
    plan.set(this.stateFile, Buffer.from(JSON.stringify(next, null, 2)))
    await this.transaction(plan)
    this.state = next
    return plan.materializations.length ? this.refresh() : this.load()
  }
}
