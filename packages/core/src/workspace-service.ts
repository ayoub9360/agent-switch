import {
  validateResource,
  type Profile,
  type Resource,
  type Workspace,
} from "./workspace"
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
    if (!profile) throw new Error("Ce profil n’existe plus.")
    return profile
  }

  selectProfile(id: string) {
    return this.update((workspace) => {
      this.profile(workspace, id)
      workspace.activeProfileId = id
    })
  }

  setTheme(theme: Workspace["theme"]) {
    return this.update((workspace) => {
      workspace.theme = theme
    })
  }

  createResource(profileId: string, resource: Omit<Resource, "id">) {
    return this.saveResource(profileId, { ...resource, id: this.runtime.id() })
  }

  editProfile(
    id: string,
    input: Pick<Profile, "name" | "description" | "path" | "color">
  ) {
    if (!input.name.trim()) throw new Error("Donnez un nom au profil.")
    return this.update((workspace) => {
      if (
        workspace.profiles.some(
          (profile) =>
            profile.id !== id &&
            profile.name.toLowerCase() === input.name.trim().toLowerCase()
        )
      )
        throw new Error("Un profil porte déjà ce nom.")
      Object.assign(this.profile(workspace, id), input, {
        name: input.name.trim(),
      })
    })
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

  deleteResource(profileId: string, id: string) {
    return this.update((workspace) => {
      const profile = this.profile(workspace, profileId)
      profile.resources = profile.resources.filter((item) => item.id !== id)
    })
  }

  createProfile(
    input: Pick<Profile, "name" | "description" | "path" | "color">,
    fromId?: string
  ) {
    if (!input.name.trim()) throw new Error("Donnez un nom au profil.")
    return this.update((workspace) => {
      if (
        workspace.profiles.some(
          (profile) =>
            profile.name.toLowerCase() === input.name.trim().toLowerCase()
        )
      )
        throw new Error("Un profil porte déjà ce nom.")
      const source = fromId ? this.profile(workspace, fromId).resources : []
      const profile: Profile = {
        ...input,
        name: input.name.trim(),
        id: this.runtime.id(),
        resources: structuredClone(source),
        applied: [],
        history: [],
      }
      workspace.profiles.push(profile)
      workspace.activeProfileId = profile.id
    })
  }

  deleteProfile(id: string) {
    return this.update((workspace) => {
      if (workspace.profiles.length === 1)
        throw new Error("Conservez au moins un profil.")
      workspace.profiles = workspace.profiles.filter(
        (profile) => profile.id !== id
      )
      if (workspace.activeProfileId === id)
        workspace.activeProfileId = workspace.profiles[0]!.id
    })
  }

  apply(profileId: string) {
    return this.repository.apply(profileId)
  }

  restore(profileId: string, revisionId: string) {
    return this.update((workspace) => {
      const profile = this.profile(workspace, profileId)
      const revision = profile.history.find((item) => item.id === revisionId)
      if (!revision) throw new Error("Cette sauvegarde n’existe plus.")
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
      let name = input.name
      while (workspace.profiles.some((profile) => profile.name === name))
        name += " (importé)"
      const profile: Profile = {
        ...structuredClone(input),
        resources: input.resources.map((resource) => ({
          ...structuredClone(resource),
          id: this.runtime.id(),
          source: "Importé dans Agent Switch",
        })),
        name,
        id: this.runtime.id(),
        applied: [],
        history: [],
      }
      workspace.profiles.push(profile)
      workspace.activeProfileId = profile.id
    })
  }
}
