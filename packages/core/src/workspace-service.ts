import {
  validateResource,
  type Profile,
  type Resource,
  type Workspace,
} from "./workspace"
import {
  primaryInstruction,
  primaryInstructionName,
  instructionCopyContent,
  type InstructionCopyMode,
} from "./instructions"
import type { Assistant } from "./workspace"
import type { Runtime, WorkspaceRepository } from "./ports"

export class WorkspaceService {
  private readonly repository: WorkspaceRepository
  private readonly runtime: Runtime
  constructor(repository: WorkspaceRepository, runtime: Runtime) {
    this.repository = repository
    this.runtime = runtime
  }

  load() {
    return this.repository.load()
  }

  private async update(mutate: (workspace: Workspace) => void) {
    const workspace = structuredClone(await this.repository.load())
    mutate(workspace)
    await this.repository.save(workspace)
    return this.repository.load()
  }

  private profile(workspace: Workspace, id: string) {
    const profile = workspace.profiles.find((item) => item.id === id)
    if (!profile) throw new Error("This profile no longer exists.")
    return profile
  }

  setTheme(theme: Workspace["theme"]) {
    return this.update((workspace) => {
      workspace.theme = theme
    })
  }

  createResource(profileId: string, resource: Omit<Resource, "id">) {
    return this.saveResource(profileId, { ...resource, id: this.runtime.id() })
  }

  saveResource(profileId: string, resource: Resource) {
    validateResource(resource)
    return this.update((workspace) => {
      const profile = this.profile(workspace, profileId)
      const index = profile.resources.findIndex(
        (item) => item.id === resource.id
      )
      const next = { ...structuredClone(resource), name: resource.name.trim() }
      if (index === -1) profile.resources.push(next)
      else profile.resources[index] = next
    })
  }

  saveInstruction(
    profileId: string,
    assistant: Assistant,
    content: string,
    resourceId?: string
  ) {
    return this.update((workspace) => {
      const profile = this.profile(workspace, profileId)
      const existing = resourceId
        ? profile.resources.find((r) => r.id === resourceId)
        : primaryInstruction(profile, assistant)
      if (
        resourceId &&
        (!existing ||
          existing.kind !== "instructions" ||
          !existing.targets.includes(assistant))
      )
        throw new Error("Instruction file not found for this assistant.")
      if (existing) {
        existing.content = content
        existing.enabled = true
        validateResource(existing)
      } else {
        const resource: Resource = {
          id: this.runtime.id(),
          kind: "instructions",
          name: primaryInstructionName(assistant),
          description: "",
          content,
          enabled: true,
          targets: [assistant],
          scope: "global",
          source: "Created in Agent Switch",
          instructionRole: "primary",
        }
        validateResource(resource)
        profile.resources.push(resource)
      }
    })
  }

  copyInstructions(
    profileId: string,
    sourceId: string,
    target: Assistant,
    mode: InstructionCopyMode,
    editedContent?: string
  ) {
    return this.update((workspace) => {
      if (mode !== "append" && mode !== "replace")
        throw new Error("Invalid copy mode.")
      const profile = this.profile(workspace, profileId)
      const source = profile.resources.find(
        (r) => r.id === sourceId && r.kind === "instructions"
      )
      if (!source) throw new Error("Source instruction file not found.")
      const destination = primaryInstruction(profile, target)
      if (
        source.id === destination?.id ||
        (destination &&
          source.source.startsWith("/") &&
          source.source === destination.source)
      )
        throw new Error(
          "These assistants already share the same instruction file."
        )
      const content =
        editedContent ??
        instructionCopyContent(destination?.content ?? "", source.content, mode)
      if (destination) {
        destination.content = content
        destination.enabled = true
        validateResource(destination)
      } else {
        const resource: Resource = {
          id: this.runtime.id(),
          kind: "instructions",
          name: primaryInstructionName(target),
          description: "",
          content,
          enabled: true,
          targets: [target],
          scope: "global",
          source: "Copied in Agent Switch",
          instructionRole: "primary",
        }
        validateResource(resource)
        profile.resources.push(resource)
      }
    })
  }

  deleteResource(profileId: string, id: string) {
    return this.update((workspace) => {
      const profile = this.profile(workspace, profileId)
      profile.resources = profile.resources.filter((item) => item.id !== id)
    })
  }

  apply(profileId: string, skillEditMode: "local" | "shared" = "local") {
    return this.repository.apply(profileId, skillEditMode)
  }

  restore(profileId: string, revisionId: string) {
    return this.update((workspace) => {
      const profile = this.profile(workspace, profileId)
      const revision = profile.history.find((item) => item.id === revisionId)
      if (!revision) throw new Error("This backup no longer exists.")
      profile.resources = structuredClone(revision.resources)
    })
  }

  discard(profileId: string) {
    return this.update((workspace) => {
      const profile = this.profile(workspace, profileId)
      profile.resources = structuredClone(profile.applied)
    })
  }

  importProfile(
    input: Pick<
      Profile,
      "name" | "description" | "path" | "color" | "resources"
    >
  ) {
    input.resources.forEach(validateResource)
    return this.update((workspace) => {
      const profile = this.profile(workspace, workspace.activeProfileId)
      for (const resource of input.resources) {
        const existing = profile.resources.find(
          (r) =>
            r.kind === resource.kind &&
            r.name === resource.name &&
            (r.kind === "skills" ||
              [...r.targets].sort().join() ===
                [...resource.targets].sort().join())
        )
        const imported = {
          ...structuredClone(resource),
          id: existing?.id ?? this.runtime.id(),
          source: existing?.source ?? "Imported into Agent Switch",
        }
        delete imported.instructionPaths
        if (existing) Object.assign(existing, imported)
        else profile.resources.push(imported)
      }
    })
  }
}
