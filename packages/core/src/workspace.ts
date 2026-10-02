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
  scope: "global"
  files?: Record<string, string>
  fileModes?: Record<string, number>
  source: string
  instructionRole?: "primary" | "override" | "rule"
  instructionPaths?: Partial<Record<Assistant, string>>
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
  path: ""
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
    instructionRoots?: { claude: string; codex: string }
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
  if (resource.scope !== "global")
    throw new Error("Only global resources are supported.")
  if (!resource.name.trim()) throw new Error("Give this item a name.")
  if (!resource.targets.length)
    throw new Error("Select at least one assistant.")
  if (resource.kind !== "instructions" && !resource.content.trim())
    throw new Error("Content cannot be empty.")
  if (resource.kind === "skills") {
    const header = resource.content.match(
      /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
    )
    let metadata: unknown
    try {
      metadata = header ? parseYaml(header[1]!) : null
    } catch {
      throw new Error("The skill YAML header is invalid.")
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
        "A skill must start with a YAML header containing name and description."
      )
  }
  if (resource.kind === "hooks") {
    let value: unknown
    try {
      value = JSON.parse(resource.content)
    } catch {
      throw new Error("Hooks must be a valid JSON object.")
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Hooks must be a JSON object.")
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
        throw new Error("Each event must contain valid hook groups.")
    }
  }
  if (resource.kind === "mcp") {
    let config: unknown
    try {
      config = JSON.parse(resource.content)
    } catch {
      throw new Error("The MCP configuration must be valid JSON.")
    }
    if (
      !config ||
      typeof config !== "object" ||
      Array.isArray(config) ||
      !("command" in config || "url" in config)
    ) {
      throw new Error("The MCP configuration must contain a command or a URL.")
    }
    const entry = config as Record<string, unknown>
    if (
      "command" in entry &&
      (typeof entry.command !== "string" || !entry.command.trim())
    )
      throw new Error("The MCP command must be a non-empty string.")
    if (
      "url" in entry &&
      (typeof entry.url !== "string" || !/^https?:\/\//.test(entry.url))
    )
      throw new Error("An HTTP or HTTPS MCP URL is required.")
    if (
      entry.args !== undefined &&
      (!Array.isArray(entry.args) ||
        entry.args.some((arg) => typeof arg !== "string"))
    )
      throw new Error("MCP arguments must be a list of strings.")
  }
}

export function resourceSummary(resource: Resource): string {
  return `${resource.enabled ? "Enabled" : "Disabled"} · ${resource.targets.map((target) => assistantNames[target]).join(", ")}`
}

export function recordApplication(
  workspace: Workspace,
  profileId: string,
  id: string,
  date: string
): Workspace {
  const next = structuredClone(workspace)
  const profile = next.profiles.find((p) => p.id === profileId)
  if (!profile) throw new Error("Profile not found.")
  const changes = changesFor(profile)
  if (!changes.length) throw new Error("No changes to apply.")
  if (!profile.history.length)
    profile.history.push({
      id: `${id}-before`,
      date,
      label: "Before the first application",
      count: 0,
      resources: structuredClone(profile.applied),
    })
  profile.applied = structuredClone(profile.resources)
  profile.history.unshift({
    id,
    date,
    label: "Configuration applied",
    count: changes.length,
    resources: structuredClone(profile.resources),
  })
  profile.history = profile.history.slice(0, 30)
  return next
}
