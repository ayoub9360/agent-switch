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
    expect(repository.value.profiles[1]).toEqual(original.profiles[1])
    expect(changesFor(repository.value.profiles[0]!)).toHaveLength(3)
  })
  it("switching a profile never applies its draft", async () => {
    const { service, repository } = setup()
    const before = structuredClone(repository.value.profiles)
    await service.selectProfile("personal")
    expect(repository.value.activeProfileId).toBe("personal")
    expect(repository.value.profiles).toEqual(before)
  })
  it("rejects invalid MCP JSON without writing", () => {
    const { service, repository } = setup()
    const mcp = repository.value.profiles[0]!.resources.find(
      (item) => item.kind === "mcp"
    )!
    const before = structuredClone(repository.value)
    expect(() =>
      service.saveResource("atlas", { ...mcp, content: "{" })
    ).toThrow("JSON valide")
    expect(repository.value).toEqual(before)
    expect(() =>
      service.saveResource("atlas", { ...mcp, content: "[]" })
    ).toThrow("commande ou une URL")
  })
  it("requires a name, content and at least one assistant", () => {
    const { service, repository } = setup()
    const item = repository.value.profiles[0]!.resources[0]!
    expect(() =>
      service.saveResource("atlas", { ...item, name: " " })
    ).toThrow()
    expect(() =>
      service.saveResource("atlas", { ...item, content: " " })
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
    await expect(service.apply("personal")).rejects.toThrow("Aucun changement")
    expect(repository.value.profiles[2]!.history).toHaveLength(0)
  })
  it("duplicates resources independently without copying applied state", async () => {
    const { service, repository } = setup()
    const source = structuredClone(repository.value.profiles[0]!)
    await service.createProfile(
      { name: "Copie", description: "", path: "", color: "blue" },
      "atlas"
    )
    const copy = repository.value.profiles[3]!
    expect(copy.resources).toEqual(source.resources)
    expect(copy.applied).toEqual([])
    expect(copy.history).toEqual([])
    await service.deleteResource(copy.id, copy.resources[0]!.id)
    expect(repository.value.profiles[0]).toEqual(source)
  })
  it("handles deletion of selected profile and protects the last one", async () => {
    const { service, repository } = setup()
    await service.deleteProfile("atlas")
    expect(repository.value.activeProfileId).toBe("professional")
    await service.deleteProfile("professional")
    await expect(service.deleteProfile("personal")).rejects.toThrow(
      "au moins un profil"
    )
    expect(repository.value.profiles).toHaveLength(1)
  })
  it("imports duplicates under a new name without replacing data", async () => {
    const { service, repository } = setup()
    const original = structuredClone(repository.value.profiles)
    await service.importProfile(original[0]!)
    expect(repository.value.profiles.slice(0, 3)).toEqual(original)
    expect(repository.value.profiles[3]!.name).toBe("Projet Atlas (importé)")
    expect(repository.value.profiles[3]!.applied).toHaveLength(0)
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
