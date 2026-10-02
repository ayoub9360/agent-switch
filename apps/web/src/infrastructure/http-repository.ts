import type {
  WorkspaceRepository,
  ConfigurationDiscovery,
} from "@/application/ports"
import type { Workspace, Resource } from "@/domain/workspace"
import { workspaceSchema } from "./schemas"

export class LocalApi implements WorkspaceRepository, ConfigurationDiscovery {
  private revision = ""
  private cached: Workspace | null = null
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method,
      headers: {
        "X-Agent-Switch": "1",
        ...(method !== "GET"
          ? { "Content-Type": "application/json", "If-Match": this.revision }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    let data
    try {
      data = await response.json()
    } catch {
      throw new Error(
        "The local Agent Switch service is unavailable. Start it with pnpm dev."
      )
    }
    if (!response.ok)
      throw new Error(data.error ?? "The local service rejected the request.")
    if (
      path === "/workspace" ||
      path === "/refresh" ||
      path === "/import-machine" ||
      path.endsWith("/apply")
    ) {
      this.revision = response.headers.get("etag") ?? this.revision
      this.cached = workspaceSchema.parse(data)
    }
    return data as T
  }
  async load() {
    if (!this.cached) await this.request("/workspace")
    return structuredClone(this.cached!)
  }
  async save(workspace: Workspace) {
    await this.request("/workspace", "PUT", workspace)
  }
  async apply(profileId: string) {
    return workspaceSchema.parse(
      await this.request(
        `/profiles/${encodeURIComponent(profileId)}/apply`,
        "POST"
      )
    )
  }
  async refresh() {
    return workspaceSchema.parse(await this.request("/refresh", "POST"))
  }
  async scan() {
    return this.request<Resource[]>("/discovery")
  }
  async importDetected(input: {
    name?: string
    targets: ("claude" | "codex")[]
  }) {
    return workspaceSchema.parse(
      await this.request("/import-machine", "POST", input)
    )
  }
  async plan(profileId: string) {
    return this.request<{ path: string; action: string; bytes: number }[]>(
      `/profiles/${encodeURIComponent(profileId)}/plan`,
      "POST"
    )
  }
  async testMcp(content: string) {
    return this.request<{ name: string; version: string; message: string }>(
      "/mcp/test",
      "POST",
      { content }
    )
  }
}
