import { isDeepStrictEqual } from "node:util"
import { resolve, join, isAbsolute } from "node:path"
import { mkdir, rm, stat, chmod } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import {
  changesFor,
  recordApplication,
  validateResource,
  type Workspace,
} from "@agent-switch/core/workspace"
import { workspaceSchema } from "@agent-switch/core/schemas"
import type { WorkspaceRepository } from "@agent-switch/core/ports"
import { Machine, type Scan, type Plan } from "./machine"
import { atomicWrite, hash, read, writablePath, inside } from "./files"

interface State extends Scan {
  revision: number
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
      const entries = JSON.parse(pending.toString()) as BackupEntry[]
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
            "Transaction interrompue avec modifications externes. Consultez pending.json avant de redémarrer."
          )
      }
      await this.rollback(entries)
      await rm(join(this.directory, "pending.json"))
    }
    const stored = await read(this.stateFile)
    if (stored) {
      this.state = JSON.parse(stored.toString())
      this.state.workspace = workspaceSchema.parse(this.state.workspace)
      await this.refresh()
    } else {
      this.state = { ...(await this.machine.scan()), revision: 1 }
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
      if (profile.path.trim()) {
        const expanded = profile.path
          .trim()
          .replace(/^~(?=\/|$)/, this.machine.home)
        if (!isAbsolute(expanded))
          throw new Error(
            "Utilisez un chemin de projet absolu ou commençant par ~/."
          )
        profile.path = resolve(expanded)
        if (!inside(this.machine.home, profile.path)) {
          if (
            !old &&
            profile.resources.every(
              (r) => r.source === "Importé dans Agent Switch"
            )
          )
            profile.path = ""
          else
            throw new Error(
              "Le dossier du projet doit se trouver dans le compte utilisateur."
            )
        }
      } else profile.path = ""

      if (
        !isDeepStrictEqual(profile.applied, old?.applied ?? []) ||
        !isDeepStrictEqual(profile.history, old?.history ?? [])
      )
        throw new Error(
          "Les configurations appliquées et l’historique sont gérés par le serveur."
        )
      if (old?.applied.length && old.path !== profile.path)
        throw new Error(
          "Dupliquez le profil pour changer son dossier après une application."
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
    workspace.machine = this.state.workspace.machine
    await this.persist({
      ...this.state,
      workspace,
      revision: this.state.revision + 1,
    })
  }
  async refresh() {
    const scan = await this.machine.scan(
      this.state.workspace.profiles.map((p) => p.path)
    )
    for (const file of Object.keys(this.state.fingerprints))
      if (!(file in scan.fingerprints)) {
        try {
          const bytes = await read(file)
          scan.fingerprints[file] = bytes ? hash(bytes) : null
        } catch {
          scan.workspace.machine!.warnings.push(`Lecture impossible : ${file}`)
        }
      }
    const workspace = structuredClone(this.state.workspace)
    for (const discovered of scan.workspace.profiles) {
      const existing = workspace.profiles.find((p) => p.id === discovered.id)
      if (existing && !changesFor(existing).length) {
        const disabled = existing.resources.filter(
          (r) => !r.enabled && !discovered.resources.some((d) => d.id === r.id)
        )
        existing.resources = [...discovered.resources, ...disabled]
        existing.applied = structuredClone(existing.resources)
      } else if (!existing) workspace.profiles.push(discovered)
    }
    for (const profile of workspace.profiles) {
      profile.applied = await this.machine.baseline(profile, {
        ...this.state.bindings,
        ...scan.bindings,
      })
    }
    workspace.machine = scan.workspace.machine
    await this.persist({
      ...this.state,
      workspace,
      bindings: { ...this.state.bindings, ...scan.bindings },
      fingerprints: { ...this.state.fingerprints, ...scan.fingerprints },
      revision: this.state.revision + 1,
    })
    return this.load()
  }
  private async scanScope(path = "") {
    const root = path
      ? resolve(path.replace(/^~(?=\/)/, this.machine.home))
      : ""
    if (
      root &&
      (!inside(this.machine.home, root) ||
        !(await stat(root).catch(() => null))?.isDirectory())
    )
      throw new Error(
        "Dossier de projet introuvable dans le compte utilisateur."
      )
    const scan = await this.machine.scan(root ? [root] : [])
    const profile = scan.workspace.profiles.find((p) => p.path === root)
    if (!profile)
      throw new Error("Aucune configuration détectée dans ce dossier.")
    return { scan, profile }
  }
  async discover(path?: string) {
    return (await this.scanScope(path)).profile.resources
  }
  async importDetected(input: {
    name: string
    path: string
    targets: ("claude" | "codex")[]
  }) {
    if (
      !input.name?.trim() ||
      !input.targets?.length ||
      input.targets.some((t) => !["claude", "codex"].includes(t))
    )
      throw new Error("Nom et assistants requis.")
    if (this.state.workspace.profiles.some((p) => p.name === input.name.trim()))
      throw new Error("Un profil porte déjà ce nom.")
    const { scan, profile } = await this.scanScope(input.path)
    const workspace = structuredClone(this.state.workspace)
    const resources = profile.resources.filter((r) =>
      r.targets.some((t) => input.targets.includes(t))
    )
    const id = randomUUID()
    workspace.profiles.push({
      ...profile,
      id,
      name: input.name.trim(),
      resources,
      applied: structuredClone(resources),
    })
    workspace.activeProfileId = id
    await this.persist({
      ...this.state,
      workspace: workspaceSchema.parse(workspace),
      bindings: { ...this.state.bindings, ...scan.bindings },
      fingerprints: { ...scan.fingerprints, ...this.state.fingerprints },
      revision: this.state.revision + 1,
    })
    return this.load()
  }
  async preview(profileId: string) {
    const profile = this.state.workspace.profiles.find(
      (p) => p.id === profileId
    )
    if (!profile) throw new Error("Profil introuvable.")
    return this.machine.plan(
      profile,
      this.state.bindings,
      this.state.fingerprints
    )
  }
  private async rollback(entries: BackupEntry[]) {
    for (const entry of [...entries].reverse()) {
      if (entry.before === null) await rm(entry.file, { force: true })
      else {
        await atomicWrite(entry.file, Buffer.from(entry.before, "base64"))
        if (entry.mode !== undefined) await chmod(entry.file, entry.mode)
      }
    }
  }
  private async transaction(plan: Plan) {
    const entries: BackupEntry[] = []
    for (const [file, after] of plan) {
      await writablePath(this.machine.home, file)
      const before = await read(file)
      if (
        plan.expected.has(file) &&
        (before ? hash(before) : null) !== plan.expected.get(file)
      )
        throw new Error(`Modification concurrente détectée : ${file}`)
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
    await atomicWrite(backup, JSON.stringify(entries))
    const pending = join(this.directory, "pending.json")
    await atomicWrite(pending, JSON.stringify(entries))
    const written: BackupEntry[] = []
    try {
      for (const [file, after] of plan) {
        const entry = entries.find((e) => e.file === file)!
        const current = await read(file)
        if (
          (current ? hash(current) : null) !==
          (entry.before ? hash(Buffer.from(entry.before, "base64")) : null)
        )
          throw new Error(`Modification concurrente détectée : ${file}`)
        written.push(entry)
        if (after === null) await rm(file, { force: true })
        else {
          await atomicWrite(file, after)
          if (plan.modes.has(file)) await chmod(file, plan.modes.get(file)!)
        }
      }
    } catch (error) {
      await this.rollback(written)
      await rm(pending, { force: true })
      throw error
    }
    await rm(pending, { force: true })
  }
  async apply(profileId: string) {
    const plan = await this.preview(profileId)
    const workspace = recordApplication(
      this.state.workspace,
      profileId,
      randomUUID(),
      new Date().toISOString()
    )
    for (const profile of workspace.profiles)
      if (profile.id !== profileId) {
        profile.applied = await this.machine.baseline(
          profile,
          this.state.bindings,
          plan
        )
      }
    const next: State = {
      ...this.state,
      workspace,
      revision: this.state.revision + 1,
      fingerprints: { ...this.state.fingerprints },
    }
    for (const [file, content] of plan)
      next.fingerprints[file] = content ? hash(content) : null
    plan.set(this.stateFile, Buffer.from(JSON.stringify(next, null, 2)))
    await this.transaction(plan)
    this.state = next
    return this.load()
  }
}
