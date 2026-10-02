import type { Workspace, Profile, Resource } from "./workspace"

/** Persistence and machine application boundary. */
export interface WorkspaceRepository {
  load(): Promise<Workspace>
  save(workspace: Workspace): Promise<void>
  apply(profileId: string): Promise<Workspace>
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
  scan(path?: string): Promise<Resource[]>
  importDetected(input: {
    name: string
    path: string
    targets: ("claude" | "codex")[]
  }): Promise<Workspace>
  refresh(): Promise<Workspace>
  plan(
    profileId: string
  ): Promise<{ path: string; action: string; bytes: number }[]>
  testMcp(
    content: string
  ): Promise<{ name: string; version: string; message: string }>
}
