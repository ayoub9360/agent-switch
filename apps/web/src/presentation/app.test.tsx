// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { recordApplication } from "@/domain/workspace"
import { App } from "@/App"
import { WorkspaceService } from "@/application/workspace-service"
import { createTestWorkspace, testResources } from "@/test/fixtures"
import { BrowserProfileTransfer } from "@/infrastructure/browser-transfer"
import { WorkspaceController, WorkspaceProvider } from "./workspace-context"

beforeEach(() => {
  window.location.hash = ""
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function setup(
  mutate?: (workspace: ReturnType<typeof createTestWorkspace>) => void
) {
  let workspace = createTestWorkspace()
  mutate?.(workspace)
  const transfer = {
    decode: new BrowserProfileTransfer().decode,
    download: vi.fn(),
  }
  let count = 0
  const service = new WorkspaceService(
    {
      apply: async (id) => {
        workspace = recordApplication(
          workspace,
          id,
          `revision-${++count}`,
          "2026-10-02T14:00:00.000Z"
        )
        return workspace
      },
      load: async () => structuredClone(workspace),
      save: async (next) => {
        workspace = next
      },
    },
    { id: () => `created-${++count}`, now: () => "2026-10-02T14:00:00.000Z" }
  )
  const controller = new WorkspaceController(service, transfer, {
    scan: async () => structuredClone(testResources),
    importDetected: async (input) =>
      service.importProfile({
        ...input,
        name: "Global configuration",
        path: "",
        description: "",
        color: "green",
        resources: testResources
          .filter((r) => r.targets.some((t) => input.targets.includes(t)))
          .map((r) => ({
            ...r,
            targets: r.targets.filter((t) => input.targets.includes(t)),
          })),
      }),
    refresh: async () => workspace,
    plan: async () => [],
    testMcp: async () => ({ name: "test", version: "1", message: "ok" }),
  })
  await controller.initialize()
  render(
    <WorkspaceProvider controller={controller}>
      <App />
    </WorkspaceProvider>
  )
  return {
    user: userEvent.setup(),
    controller,
    transfer,
    state: () => workspace,
  }
}

describe("Frontend user journeys", () => {
  it("shows one global configuration without profile controls", async () => {
    const { state } = await setup()
    expect(
      screen.getByRole("heading", { name: "Overview", level: 1 })
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /profil/i })
    ).not.toBeInTheDocument()
    expect(state().profiles).toHaveLength(1)
  })
  it("edits content as a draft and applies only after review", async () => {
    const { user, state } = await setup()
    await user.click(screen.getByRole("button", { name: "Instructions" }))
    const editor = screen.getByRole("textbox", { name: "Instruction content" })
    await user.clear(editor)
    await user.type(editor, "# An updated instruction")
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Changes saved to the draft.")).toBeVisible()
    expect(state().profiles[0]!.applied[0]!.content).not.toContain(
      "An updated instruction"
    )
    await user.click(screen.getByRole("button", { name: /3 pending changes/ }))
    const dialog = screen.getByRole("dialog")
    expect(
      within(dialog).getByText(/Files on this machine will be modified/)
    ).toBeVisible()
    await user.click(
      within(dialog).getByRole("button", { name: "Apply to this machine" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(state().profiles[0]!.applied[0]!.content).toBe(
      "# An updated instruction"
    )
    expect(state().profiles[0]!.history).toHaveLength(2)
  })
  it("copies instructions through an editable comparison without applying them", async () => {
    const { user, state } = await setup()
    const before = structuredClone(state().profiles[0]!.applied)
    await user.click(screen.getByRole("button", { name: "Instructions" }))
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("textbox", { name: "Item name" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Copy to Codex…" }))
    const dialog = screen.getByRole("dialog")
    const result = within(dialog).getByRole("textbox", { name: "Copy result" })
    expect((result as HTMLTextAreaElement).value).toContain("# Preferences")
    await user.click(
      within(dialog).getByRole("button", { name: "Replace content" })
    )
    expect((result as HTMLTextAreaElement).value).not.toContain("# Preferences")
    await user.clear(result)
    await user.type(result, "# Adapted for Codex")
    await user.click(
      within(dialog).getByRole("button", { name: "Use as draft" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(screen.getByRole("tab", { name: "Codex" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(
      screen.getByRole("textbox", { name: "Instruction content" })
    ).toHaveValue("# Adapted for Codex")
    expect(state().profiles[0]!.applied).toEqual(before)
    expect(state().profiles[0]!.resources[0]!.content).not.toBe(
      "# Adapted for Codex"
    )
  })
  it("shows Codex override precedence and renders Markdown", async () => {
    const { user } = await setup((workspace) => {
      const primary = workspace.profiles[0]!.resources.find(
        (r) => r.name === "AGENTS.md"
      )!
      const override = {
        ...primary,
        id: "override",
        name: "AGENTS.override.md",
        instructionRole: "override" as const,
        content: "# Temporary override",
      }
      workspace.profiles[0]!.resources.push(override)
      workspace.profiles[0]!.applied.push(structuredClone(override))
    })
    await user.click(screen.getByRole("button", { name: "Instructions" }))
    await user.click(screen.getByRole("tab", { name: "Codex" }))
    expect(screen.getByText(/currently takes precedence/)).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Preview" }))
    expect(screen.getByRole("heading", { name: "Preferences" })).toBeVisible()
  })
  it("creates a missing primary file as a draft", async () => {
    const { user, state } = await setup((workspace) => {
      workspace.profiles[0]!.resources =
        workspace.profiles[0]!.resources.filter((r) => r.name !== "CLAUDE.md")
      workspace.profiles[0]!.applied = workspace.profiles[0]!.applied.filter(
        (r) => r.name !== "CLAUDE.md"
      )
    })
    await user.click(screen.getByRole("button", { name: "Instructions" }))
    await user.type(
      screen.getByRole("textbox", { name: "Instruction content" }),
      "# Personal preferences"
    )
    await user.click(
      screen.getByRole("button", { name: "Create instructions" })
    )
    await waitFor(() =>
      expect(
        state().profiles[0]!.resources.some(
          (r) => r.name === "CLAUDE.md" && r.instructionRole === "primary"
        )
      ).toBe(true)
    )
    expect(
      state().profiles[0]!.applied.some((r) => r.name === "CLAUDE.md")
    ).toBe(false)
  })
  it("exports the global configuration", async () => {
    const { user, state, transfer } = await setup()
    await user.click(screen.getByRole("button", { name: "Export" }))
    expect(transfer.download).toHaveBeenCalledWith(state().profiles[0])
  })
  it("chooses all, one or no assistants for a global skill", async () => {
    const { user, state } = await setup()
    await user.click(screen.getByRole("button", { name: "Skills" }))
    const detail = () =>
      document.querySelector(".resource-detail") as HTMLElement
    await user.click(within(detail()).getByRole("button", { name: "None" }))
    await user.click(within(detail()).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(
        state().profiles[0]!.resources.find((r) => r.id === "skill-frontend")!
          .enabled
      ).toBe(false)
    )
    await user.click(within(detail()).getByRole("button", { name: "Codex" }))
    await user.click(within(detail()).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(
        state().profiles[0]!.resources.find((r) => r.id === "skill-frontend")!
          .targets
      ).toEqual(["codex"])
    )
  })
  it("filters resources and shows an empty search result", async () => {
    const { user } = await setup()
    await user.click(screen.getByRole("button", { name: "MCP servers" }))
    await user.type(
      screen.getByRole("textbox", { name: "Search in MCP servers" }),
      "absent"
    )
    expect(screen.getByText("No results")).toBeVisible()
  })
  it("opens the search palette with the keyboard", async () => {
    const { user } = await setup()
    await user.keyboard("{Control>}k{/Control}")
    const dialog = screen.getByRole("dialog")
    await user.type(
      within(dialog).getByRole("textbox", { name: "Global search" }),
      "GitHub"
    )
    await user.click(within(dialog).getByRole("button", { name: "GitHub" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(
      screen.getByRole("heading", { name: "MCP servers", level: 1 })
    ).toBeVisible()
    expect(screen.getByRole("textbox", { name: "Item name" })).toHaveValue(
      "GitHub"
    )
  })
  it("completes onboarding without applying imported data", async () => {
    const { user, state } = await setup()
    await user.click(screen.getByRole("button", { name: "Settings" }))
    await user.click(screen.getByRole("button", { name: "Open" }))
    let dialog = screen.getByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: "Detect configuration" })
    )
    await user.click(
      await within(dialog).findByRole("button", { name: "Continue" })
    )
    dialog = screen.getByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: "Import configuration" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(state().profiles).toHaveLength(1)
    expect(state().profiles[0]!.applied).toEqual(testResources)
  })
})
