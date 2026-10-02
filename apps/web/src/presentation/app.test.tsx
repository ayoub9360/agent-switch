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

async function setup() {
  let workspace = createTestWorkspace()
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
  it("switches profiles without applying drafts", async () => {
    const { user, state } = await setup()
    expect(
      screen.getByRole("heading", { name: "Vue d’ensemble", level: 1 })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: /3 changements en attente/ })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Personnel" }))
    expect(
      await screen.findByRole("button", { name: "Aucun changement en attente" })
    ).toBeVisible()
    expect(state().profiles[0]!.history).toHaveLength(1)
  })
  it("edits content as a draft and applies only after review", async () => {
    const { user, state } = await setup()
    await user.click(screen.getByRole("button", { name: "Instructions" }))
    const editor = screen.getByRole("textbox", { name: "Contenu de l’élément" })
    await user.clear(editor)
    await user.type(editor, "# Une instruction modifiée")
    await user.click(screen.getByRole("button", { name: "Enregistrer" }))
    expect(
      await screen.findByText("Modifications enregistrées dans le brouillon.")
    ).toBeVisible()
    expect(state().profiles[0]!.applied[0]!.content).not.toContain(
      "Une instruction modifiée"
    )
    await user.click(
      screen.getByRole("button", { name: /3 changements en attente/ })
    )
    const dialog = screen.getByRole("dialog")
    expect(
      within(dialog).getByText(/Les fichiers de la machine seront modifiés/)
    ).toBeVisible()
    await user.click(
      within(dialog).getByRole("button", { name: "Appliquer sur la machine" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(state().profiles[0]!.applied[0]!.content).toBe(
      "# Une instruction modifiée"
    )
    expect(state().profiles[0]!.history).toHaveLength(2)
  })
  it("creates a profile and exports the selected profile", async () => {
    const { user, state, transfer } = await setup()
    await user.click(screen.getByRole("button", { name: "Créer un profil" }))
    const dialog = screen.getByRole("dialog")
    await user.type(
      within(dialog).getByRole("textbox", { name: "Nom du profil" }),
      "Projet démo"
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Créer le profil" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(state().profiles).toHaveLength(4)
    await user.click(screen.getByRole("button", { name: "Exporter" }))
    expect(transfer.download).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Projet démo", resources: [] })
    )
  })
  it("filters resources and shows an empty search result", async () => {
    const { user } = await setup()
    await user.click(screen.getByRole("button", { name: "Serveurs MCP" }))
    await user.type(
      screen.getByRole("textbox", { name: "Rechercher dans Serveurs MCP" }),
      "absent"
    )
    expect(screen.getByText("Aucun résultat")).toBeVisible()
  })
  it("opens the search palette with the keyboard", async () => {
    const { user } = await setup()
    await user.keyboard("{Control>}k{/Control}")
    const dialog = screen.getByRole("dialog")
    await user.type(
      within(dialog).getByRole("textbox", { name: "Recherche globale" }),
      "GitHub"
    )
    await user.click(within(dialog).getByRole("button", { name: "GitHub" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(
      screen.getByRole("heading", { name: "Serveurs MCP", level: 1 })
    ).toBeVisible()
    expect(
      screen.getByRole("textbox", { name: "Nom de l’élément" })
    ).toHaveValue("GitHub")
  })
  it("completes onboarding without applying imported data", async () => {
    const { user, state } = await setup()
    await user.click(
      screen.getByRole("button", { name: /Votre configuration, réunie/ })
    )
    let dialog = screen.getByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: "Détecter la configuration" })
    )
    await user.click(
      await within(dialog).findByRole("button", { name: "Continuer" })
    )
    dialog = screen.getByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: "Créer mon profil" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(state().profiles.at(-1)?.name).toBe("Configuration importée")
    expect(state().profiles.at(-1)?.applied).toHaveLength(0)
  })
})
