import { posix } from "node:path"
import type { Assistant, Resource } from "@agent-switch/core/workspace"

export const OPENAI_SKILL_METADATA = "agents/openai.yaml"

export function isOpenAiSkillMetadata(path: string) {
  return posix.normalize(path) === OPENAI_SKILL_METADATA
}

export function distributeSkillFile(path: string, target: Assistant) {
  return target === "codex" || !isOpenAiSkillMetadata(path)
}

// Provider metadata does not make two otherwise identical skills distinct.
export function sharedSkillFiles<T>(files: Record<string, T> = {}) {
  return Object.fromEntries(
    Object.entries(files).filter(([name]) => !isOpenAiSkillMetadata(name))
  )
}

export function retainOpenAiMetadata(resource: Resource, source: Resource) {
  for (const [name, content] of Object.entries(source.files ?? {})) {
    if (!isOpenAiSkillMetadata(name)) continue
    resource.files ??= {}
    resource.files[name] = content
    const mode = source.fileModes?.[name]
    if (mode !== undefined) {
      resource.fileModes ??= {}
      resource.fileModes[name] = mode
    }
  }
}
