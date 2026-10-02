import { readdir, stat, realpath, lstat, readlink } from "node:fs/promises"
import { join, basename, dirname, resolve } from "node:path"
import { hostname } from "node:os"
import * as TOML from "@iarna/toml"
import type {
  Assistant,
  Resource,
  Profile,
  Workspace,
} from "@agent-switch/core/workspace"
import { changesFor, validateResource } from "@agent-switch/core/workspace"
import { read, hash, inside, writablePath } from "./files"

type Document = Record<string, unknown>
export interface Binding {
  file: string
  alias?: string
  linkTarget?: string
  keys?: string[]
  format: "text" | "json" | "toml"
  profilePath?: string
  assetRoot?: string
}
export interface Scan {
  workspace: Workspace
  bindings: Record<string, Binding>
  fingerprints: Record<string, string | null>
}
export class Plan extends Map<string, Buffer | null> {
  modes = new Map<string, number>()
  expected = new Map<string, string | null>()
}
export function object(value: unknown): Document {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Un objet de configuration est attendu.")
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
  async scan(projectPaths: string[] = []): Promise<Scan> {
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
        throw new Error(`Lien hors du compte utilisateur : ${file}`)
      return { file: target, alias: file, linkTarget: await readlink(file) }
    }
    const roots = new Set(
      projectPaths
        .filter(Boolean)
        .map((p) => resolve(p.replace(/^~(?=\/)/, this.home)))
    )
    const claudeFile = join(this.home, ".claude.json")
    for (const [file, format] of [
      [join(this.codexHome, "config.toml"), "toml"],
      [claudeFile, "json"],
    ] as const) {
      try {
        const bytes = await load(file)
        if (bytes)
          for (const root of Object.keys(
            object(parseDocument(bytes.toString(), format).projects ?? {})
          ))
            roots.add(root)
      } catch {
        warnings.push(`Configuration illisible : ${file}`)
      }
    }
    try {
      for (const d of await readdir(join(this.home, "projects"), {
        withFileTypes: true,
      }))
        if (d.isDirectory()) roots.add(join(this.home, "projects", d.name))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    const profiles: Profile[] = []
    for (const root of ["", ...roots]) {
      if (
        root &&
        (!inside(this.home, root) ||
          !(await stat(root).catch(() => null))?.isDirectory())
      ) {
        warnings.push(`Projet inaccessible : ${root}`)
        continue
      }
      const resources: Resource[] = []
      const scope = root ? "project" : "global"
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
        if (binding.assetRoot) {
          resource.files = {}
          resource.fileModes = {}
          const walk = async (dir: string) => {
            for (const entry of await readdir(dir, { withFileTypes: true })) {
              const file = join(dir, entry.name)
              if (entry.isSymbolicLink()) {
                warnings.push(`Lien de skill ignoré : ${file}`)
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
                else
                  throw new Error(`Fichier de skill trop volumineux : ${file}`)
              }
            }
          }
          await walk(binding.assetRoot)
        }
        bindings[id] = { ...binding, profilePath: root }
        const shared = resources.find((r) => r.id === id)
        if (shared) {
          if (!shared.targets.includes(target)) shared.targets.push(target)
        } else resources.push(resource)
      }
      const readTextFile = async (
        file: string,
        target: Assistant,
        kind: Resource["kind"] = "instructions"
      ) => {
        const location = await resolveFile(file)
        const bytes = await load(location.file)
        if (bytes)
          await add(
            {
              ...location,
              format: "text",
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
          error instanceof Error ? error.message : "Lecture impossible."
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
            warnings.push(`Dossier hors du compte ignoré : ${dir}`)
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
              warnings.push(`Lien non géré : ${path}`)
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
          warnings.push(`Configuration illisible : ${file}`)
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
      const claude = root ? join(root, ".claude") : this.claudeHome
      const codex = root ? join(root, ".codex") : this.codexHome
      try {
        await textFile(
          root ? join(root, "CLAUDE.md") : join(claude, "CLAUDE.md"),
          "claude"
        )
        if (root) await textFile(join(claude, "CLAUDE.md"), "claude")
        await textFile(
          root ? join(root, "AGENTS.md") : join(codex, "AGENTS.md"),
          "codex"
        )
        await textFile(
          root
            ? join(root, "AGENTS.override.md")
            : join(codex, "AGENTS.override.md"),
          "codex"
        )
        await directory(join(claude, "rules"), "claude", "instructions")
        await directory(join(claude, "skills"), "claude", "skills")
        await directory(
          join(root || this.home, ".agents/skills"),
          "codex",
          "skills"
        )
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
        if (root)
          await config(
            join(claude, "settings.local.json"),
            "json",
            "claude",
            ["mcpServers"],
            ["hooks"]
          )
        await config(
          claudeFile,
          "json",
          "claude",
          root ? ["projects", root, "mcpServers"] : ["mcpServers"]
        )
        if (root)
          await config(join(root, ".mcp.json"), "json", "claude", [
            "mcpServers",
          ])
      } catch (error) {
        warnings.push(
          `${root || this.home} : ${error instanceof Error ? error.message : "lecture impossible"}`
        )
      }
      if (!root || resources.length || projectPaths.includes(root))
        profiles.push({
          id: root ? `project-${hash(root).slice(0, 16)}` : "machine",
          name: root ? basename(root) : "Configuration de la machine",
          description: root
            ? `Configuration du projet ${basename(root)}`
            : `Configuration locale de ${hostname()}`,
          path: root,
          color: root ? "blue" : "violet",
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
    const old = bindings[resource.id]
    // Source bindings are generated by discovery, never accepted from portable files.
    if (
      old &&
      (resource.scope === "global" || old.profilePath === profile.path) &&
      resource.source === old.file + (old.keys ? `#${old.keys.join(".")}` : "")
    )
      return [
        resource.kind === "mcp"
          ? { ...old, keys: [...old.keys!.slice(0, -1), resource.name] }
          : old,
      ]
    const root = resource.scope === "project" ? profile.path : this.home
    if (!root)
      throw new Error(
        "Renseignez le dossier du profil pour une ressource de projet."
      )
    if (!inside(this.home, root))
      throw new Error("Le projet doit se trouver dans le dossier utilisateur.")
    const slug =
      resource.name
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-|-$/g, "") || resource.id
    const destinations: Binding[] = resource.targets.map((target): Binding => {
      const configDir =
        resource.scope === "global"
          ? target === "codex"
            ? this.codexHome
            : this.claudeHome
          : join(root, target === "codex" ? ".codex" : ".claude")
      if (resource.kind === "mcp")
        return target === "codex"
          ? {
              file: join(configDir, "config.toml"),
              format: "toml",
              keys: ["mcp_servers", resource.name],
            }
          : {
              file:
                resource.scope === "global"
                  ? join(this.home, ".claude.json")
                  : join(root, ".mcp.json"),
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
      if (resource.kind === "skills") {
        const assetRoot = join(
          target === "codex"
            ? join(root, ".agents/skills")
            : join(configDir, "skills"),
          slug
        )
        return { file: join(assetRoot, "SKILL.md"), assetRoot, format: "text" }
      }
      return {
        file:
          target === "claude"
            ? join(configDir, "rules", `${slug}.md`)
            : resource.scope === "global"
              ? join(this.codexHome, "AGENTS.md")
              : join(root, "AGENTS.md"),
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

  /** Read physical slots back into a profile baseline without changing its desired resources. */
  async baseline(
    profile: Profile,
    bindings: Scan["bindings"],
    plan: Plan = new Plan()
  ): Promise<Resource[]> {
    const result: Resource[] = []
    for (const resource of profile.applied) {
      const values: { content: string; enabled: boolean }[] = []
      for (const binding of this.destinations(resource, profile, bindings)) {
        const bytes = plan.has(binding.file)
          ? plan.get(binding.file)
          : await read(binding.file)
        if (!bytes) continue
        if (binding.format === "text")
          values.push({ content: bytes.toString(), enabled: true })
        else {
          const doc = parseDocument(bytes.toString(), binding.format)
          const value = binding.keys!.reduce<unknown>(
            (node, key) =>
              node && typeof node === "object"
                ? (node as Document)[key]
                : undefined,
            doc
          )
          if (value !== undefined)
            values.push({
              content: JSON.stringify(value, null, 2),
              enabled:
                typeof value === "object" &&
                value !== null &&
                "enabled" in value
                  ? value.enabled !== false
                  : true,
            })
        }
      }
      const changed =
        values.find(
          (v) =>
            v.content !== resource.content || v.enabled !== resource.enabled
        ) ?? values[0]
      result.push({ ...resource, ...(changed ?? { enabled: false }) })
    }
    return result
  }
  async plan(
    profile: Profile,
    bindings: Scan["bindings"],
    fingerprints: Scan["fingerprints"]
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
          `Le lien a changé : ${binding.alias}. Actualisez la configuration.`
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
          `Le fichier a changé sur disque : ${binding.file}. Actualisez avant d’appliquer.`
        )
      const identity = binding.file + JSON.stringify(binding.keys ?? [])
      if (value !== null && touched.has(identity))
        throw new Error(
          `Plusieurs éléments ciblent le même emplacement : ${binding.file}`
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
            `Le fichier existe déjà : ${binding.file}. Modifiez l’élément détecté.`
          )
        plan.set(binding.file, value === null ? null : Buffer.from(value))
        return
      }
      const bytes = await current(binding.file)
      const doc = bytes ? parseDocument(bytes.toString(), binding.format) : {}
      let node = doc
      for (const key of binding.keys!.slice(0, -1)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
          throw new Error("Clé interdite.")
        node[key] ??= {}
        node = object(node[key])
      }
      const key = binding.keys!.at(-1)!
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("Clé interdite.")
      if (value === null) delete node[key]
      else {
        if (node[key] !== undefined && !allowExisting && expected === undefined)
          throw new Error(
            `La configuration ${key} existe déjà dans ${binding.file}.`
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
            `Plusieurs éléments ciblent ${binding.file}. Modifiez l’élément existant ou choisissez un autre assistant.`
          )
        destinations.add(slot)
      }
    }
    for (const change of changesFor(profile)) {
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
          "Pour déplacer un élément détecté vers un autre assistant ou une autre portée, créez une copie."
        )
      const previous = before
        ? this.destinations(before, profile, bindings)
        : []
      for (const binding of previous)
        if (before!.enabled) await patch(binding, null, true)
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
          if (binding.assetRoot)
            for (const [name, base64] of Object.entries(after.files ?? {})) {
              const file = resolve(binding.assetRoot, name)
              if (!inside(binding.assetRoot, file) || file === binding.file)
                throw new Error("Chemin de fichier de skill invalide.")
              await writablePath(this.home, file)
              const bytes = await read(file)
              plan.expected.set(file, bytes ? hash(bytes) : null)
              if (bytes && fingerprints[file] === undefined)
                throw new Error(`Un fichier de skill existe déjà : ${file}`)
              if (
                fingerprints[file] !== undefined &&
                (bytes ? hash(bytes) : null) !== fingerprints[file]
              )
                throw new Error(`Fichier de skill modifié : ${file}`)
              plan.set(file, Buffer.from(base64, "base64"))
              plan.modes.set(file, after.fileModes?.[name] ?? 0o600)
            }
        }
      // Disabling removes SKILL.md; helper files stay intact and remain available for re-enabling.
    }
    for (const [file, bytes] of plan) {
      const old = await read(file)
      if (
        bytes?.equals(old ?? Buffer.alloc(0)) ||
        (bytes === null && old === null)
      )
        plan.delete(file)
    }
    return plan
  }
}
