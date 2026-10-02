import { describe, it, expect } from "vitest"
import type { WorkspaceRepository } from "./ports"
import { WorkspaceService } from "./workspace-service"
import { createTestWorkspace } from "@/test/fixtures"
import {
  changesFor,
  recordApplication,
  type Workspace,
} from "@/domain/workspace"

class MemoryRepository implements WorkspaceRepository {
  value = createTestWorkspace()
  async apply(id: string) {
    this.value = recordApplication(
      this.value,
      id,
      "test-revision",
      "2026-10-02T12:00:00.000Z"
    )
    return structuredClone(this.value)
  }
  async load() {
    return structuredClone(this.value)
  }
  async save(value: Workspace) {
    this.value = structuredClone(value)
  }
}
function setup() {
  const repository = new MemoryRepository()
  let counter = 0
  const service = new WorkspaceService(repository, {
    id: () => `new-${++counter}`,
    now: () => "2026-10-02T12:00:00.000Z",
  })
  return { repository, service }
}

describe("Workspace use cases", () => {
  it("keeps drafts separate from applied configuration and other profiles", async () => {
    const { service, repository } = setup()
    const original = structuredClone(repository.value)
    await service.saveResource("atlas", {
      ...original.profiles[0]!.resources[0]!,
      name: "Nouvelle instruction",
    })
    expect(repository.value.profiles[0]!.applied).toEqual(
      original.profiles[0]!.applied
    )
    expect(changesFor(repository.value.profiles[0]!)).toHaveLength(3)
  })
  it("rejects invalid MCP JSON without writing", () => {
    const { service, repository } = setup()
    const mcp = repository.value.profiles[0]!.resources.find(
      (item) => item.kind === "mcp"
    )!
    const before = structuredClone(repository.value)
    expect(() =>
      service.saveResource("atlas", { ...mcp, content: "{" })
    ).toThrow("valid JSON")
    expect(repository.value).toEqual(before)
    expect(() =>
      service.saveResource("atlas", { ...mcp, content: "[]" })
    ).toThrow("command or a URL")
  })
  it("requires a name, content and at least one assistant", () => {
    const { service, repository } = setup()
    const item = repository.value.profiles[0]!.resources[0]!
    expect(() =>
      service.saveResource("atlas", { ...item, name: " " })
    ).toThrow()
    expect(() =>
      service.saveResource("atlas", { ...item, targets: [] })
    ).toThrow()
  })
  it("creates snapshots on apply and restores only into drafts", async () => {
    const { service, repository } = setup()
    const initial = structuredClone(repository.value.profiles[0]!.applied)
    await service.apply("atlas")
    const applied = structuredClone(repository.value.profiles[0]!.applied)
    expect(changesFor(repository.value.profiles[0]!)).toHaveLength(0)
    expect(repository.value.profiles[0]!.history).toHaveLength(2)
    await service.restore("atlas", "revision-initial")
    expect(repository.value.profiles[0]!.resources).toEqual(initial)
    expect(repository.value.profiles[0]!.applied).toEqual(applied)
    expect(changesFor(repository.value.profiles[0]!)).toHaveLength(3)
  })
  it("does not create a history entry when there are no changes", async () => {
    const { service, repository } = setup()
    await service.discard("atlas")
    await expect(service.apply("atlas")).rejects.toThrow("No changes")
    expect(repository.value.profiles[0]!.history).toHaveLength(1)
  })
  it("merges imports in the sole draft and preserves applied state", async () => {
    const { service, repository } = setup()
    const original = structuredClone(repository.value.profiles[0]!)
    await service.importProfile({
      ...original,
      resources: [
        { ...original.resources[0]!, content: "Imported instructions" },
      ],
    })
    expect(repository.value.profiles).toHaveLength(1)
    expect(repository.value.profiles[0]!.resources).toHaveLength(
      original.resources.length
    )
    expect(repository.value.profiles[0]!.resources[0]!.content).toBe(
      "Imported instructions"
    )
    expect(repository.value.profiles[0]!.applied).toEqual(original.applied)
  })
  it("can discard additions, removals and modifications together", async () => {
    const { service, repository } = setup()
    await service.deleteResource("atlas", "instructions-git")
    expect(
      changesFor(repository.value.profiles[0]!).some(
        (change) => change.type === "removed"
      )
    ).toBe(true)
    await service.discard("atlas")
    expect(changesFor(repository.value.profiles[0]!)).toHaveLength(0)
  })
})
