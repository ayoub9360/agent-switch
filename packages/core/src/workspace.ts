import { parse as parseYaml } from "yaml"
export type Assistant = "claude" | "codex"
export type ResourceKind = "instructions" | "skills" | "mcp" | "hooks"
export type ProfileColor = "violet" | "blue" | "amber" | "green"

export interface Resource {
  id: string
  kind: ResourceKind
  name: string
  description: string
  content: string
  enabled: boolean
  targets: Assistant[]
  scope: "global" | "project"
  files?: Record<string, string>
  fileModes?: Record<string, number>
  source: string
}

export interface Revision {
  id: string
  date: string
  label: string
  count: number
  resources: Resource[]
}

export interface Profile {
  id: string
  name: string
  description: string
  path: string
  color: ProfileColor
  resources: Resource[]
  applied: Resource[]
  history: Revision[]
}

export interface Workspace {
  version: 1
  activeProfileId: string
  profiles: Profile[]
  machine?: {
    hostname: string
    home: string
    scannedAt: string
    warnings: string[]
  }
  theme: "dark" | "light"
}

export interface Change {
  id: string
  name: string
  kind: ResourceKind
  type: "added" | "updated" | "removed"
  before?: Resource
  after?: Resource
}

export const assistantNames: Record<Assistant, string> = {
  claude: "Claude Code",
  codex: "Codex",
}

export function changesFor(profile: Profile): Change[] {
  const changes: Change[] = []
  for (const resource of profile.resources) {
    const before = profile.applied.find((item) => item.id === resource.id)
    if (!before || JSON.stringify(before) !== JSON.stringify(resource)) {
      changes.push({
        id: resource.id,
        name: resource.name,
        kind: resource.kind,
        type: before ? "updated" : "added",
        before,
        after: resource,
      })
    }
  }
  for (const before of profile.applied) {
    if (!profile.resources.some((item) => item.id === before.id)) {
      changes.push({
        id: before.id,
        name: before.name,
        kind: before.kind,
        type: "removed",
        before,
      })
    }
  }
  return changes
}

export function validateResource(resource: Resource): void {
  if (!resource.name.trim()) throw new Error("Donnez un nom à cet élément.")
  if (!resource.targets.length)
    throw new Error("Sélectionnez au moins un assistant.")
  if (!resource.content.trim())
    throw new Error("Le contenu ne peut pas être vide.")
  if (resource.kind === "skills") {
    const header = resource.content.match(
      /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
    )
    let metadata: unknown
    try {
      metadata = header ? parseYaml(header[1]!) : null
    } catch {
      throw new Error("L’en-tête YAML du skill est invalide.")
    }
    if (
      !metadata ||
      typeof metadata !== "object" ||
      !("name" in metadata) ||
      !("description" in metadata) ||
      typeof metadata.name !== "string" ||
      typeof metadata.description !== "string" ||
      !metadata.name.trim() ||
      !metadata.description.trim()
    )
      throw new Error(
        "Un skill doit commencer par un en-tête YAML avec name et description."
      )
  }
  if (resource.kind === "hooks") {
    let value: unknown
    try {
      value = JSON.parse(resource.content)
    } catch {
      throw new Error("Les hooks doivent être un objet JSON valide.")
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Les hooks doivent être un objet JSON.")
    for (const groups of Object.values(value)) {
      if (
        !Array.isArray(groups) ||
        groups.some(
          (group) =>
            !group ||
            !Array.isArray(group.hooks) ||
            group.hooks.some(
              (hook: { type?: string; command?: string }) =>
                !hook.type || (hook.type === "command" && !hook.command?.trim())
            )
        )
      )
        throw new Error(
          "Chaque événement doit contenir des groupes de hooks valides."
        )
    }
  }
  if (resource.kind === "mcp") {
    let config: unknown
    try {
      config = JSON.parse(resource.content)
    } catch {
      throw new Error("La configuration MCP doit être un JSON valide.")
    }
    if (
      !config ||
      typeof config !== "object" ||
      Array.isArray(config) ||
      !("command" in config || "url" in config)
    ) {
      throw new Error(
        "La configuration MCP doit contenir une commande ou une URL."
      )
    }
    const entry = config as Record<string, unknown>
    if (
      "command" in entry &&
      (typeof entry.command !== "string" || !entry.command.trim())
    )
      throw new Error("La commande MCP doit être une chaîne non vide.")
    if (
      "url" in entry &&
      (typeof entry.url !== "string" || !/^https?:\/\//.test(entry.url))
    )
      throw new Error("Une URL MCP HTTP ou HTTPS est attendue.")
    if (
      entry.args !== undefined &&
      (!Array.isArray(entry.args) ||
        entry.args.some((arg) => typeof arg !== "string"))
    )
      throw new Error("Les arguments MCP doivent être une liste de chaînes.")
  }
}

export function resourceSummary(resource: Resource): string {
  return `${resource.enabled ? "Activé" : "Désactivé"} · ${resource.targets.map((target) => assistantNames[target]).join(", ")} · ${resource.scope === "global" ? "Global" : "Projet"}`
}

export function recordApplication(
  workspace: Workspace,
  profileId: string,
  id: string,
  date: string
): Workspace {
  const next = structuredClone(workspace)
  const profile = next.profiles.find((p) => p.id === profileId)
  if (!profile) throw new Error("Profil introuvable.")
  const changes = changesFor(profile)
  if (!changes.length) throw new Error("Aucun changement à appliquer.")
  if (!profile.history.length)
    profile.history.push({
      id: `${id}-before`,
      date,
      label: "Avant la première application",
      count: 0,
      resources: structuredClone(profile.applied),
    })
  profile.applied = structuredClone(profile.resources)
  profile.history.unshift({
    id,
    date,
    label: "Configuration appliquée",
    count: changes.length,
    resources: structuredClone(profile.resources),
  })
  profile.history = profile.history.slice(0, 30)
  return next
}
