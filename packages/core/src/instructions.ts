import type { Assistant, Profile, Resource } from "./workspace"

export type InstructionRole = "primary" | "override" | "rule"
export type InstructionCopyMode = "append" | "replace"

export function instructionRole(resource: Resource): InstructionRole {
  if (resource.instructionRole) return resource.instructionRole
  if (resource.name === "AGENTS.override.md") return "override"
  if (resource.name === "AGENTS.md" || resource.name === "CLAUDE.md")
    return "primary"
  return resource.targets.includes("codex") ? "primary" : "rule"
}

export function primaryInstruction(profile: Profile, assistant: Assistant) {
  return profile.resources.find(
    (r) =>
      r.kind === "instructions" &&
      r.targets.includes(assistant) &&
      instructionRole(r) === "primary"
  )
}

export const primaryInstructionName = (assistant: Assistant) =>
  assistant === "claude" ? "CLAUDE.md" : "AGENTS.md"

export function instructionCopyContent(
  current: string,
  incoming: string,
  mode: InstructionCopyMode
) {
  if (mode === "replace" || !current.trim()) return incoming
  return `${current.trimEnd()}\n\n${incoming.trimStart()}`
}
