import type { Workspace, Profile, Resource } from "./workspace"

/** Persistence and machine application boundary. */
export interface WorkspaceRepository {
  load(): Promise<Workspace>
  save(workspace: Workspace): Promise<void>
  apply(profileId: string, skillEditMode?: SkillEditMode): Promise<Workspace>
}

export interface Runtime {
  id(): string
  now(): string
}

export interface ProfileTransfer {
  download(profile: Profile): void
  decode(
    text: string
  ): Pick<Profile, "name" | "description" | "path" | "color" | "resources">
}

export interface ConfigurationDiscovery {
  scan(): Promise<Resource[]>
  importDetected(input: {
    name?: string
    targets: ("claude" | "codex")[]
  }): Promise<Workspace>
  refresh(): Promise<Workspace>
  plan(profileId: string, skillEditMode?: SkillEditMode): Promise<PlannedFile[]>
  testMcp(
    content: string
  ): Promise<{ name: string; version: string; message: string }>
}

export interface PlannedFile {
  path: string
  action: string
  bytes: number
  destination?: string
  source?: string
  sharedTargets?: ("claude" | "codex")[]
}

export type SkillEditMode = "local" | "shared"
