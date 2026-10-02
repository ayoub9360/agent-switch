import { useEffect, useRef, useState } from "react"
import {
  Download,
  Upload,
  Menu,
  Check,
  X,
  AlertCircle,
  LoaderCircle,
  ArrowRight,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { cn } from "@agent-switch/ui/lib/utils"
import {
  changesFor,
  type Assistant,
  type Resource,
  type ResourceKind,
} from "@/domain/workspace"
import { useWorkspace } from "@/presentation/workspace-context"
import { sections, type Page } from "@/presentation/config"
import { Sidebar, AssistantFilter } from "@/presentation/components/sidebar"
import { ReviewDialog } from "@/presentation/components/review-dialog"
import { CommandPalette } from "@/presentation/components/command-palette"
import { OnboardingDialog } from "@/presentation/components/onboarding-dialog"
import { Overview } from "@/presentation/pages/overview"
import {
  ResourcePage,
  CreateResourceDialog,
} from "@/presentation/pages/resources"
import { InstructionsPage } from "@/presentation/pages/instructions"
import { HistoryPage } from "@/presentation/pages/history"
import { SettingsPage } from "@/presentation/pages/settings"

const pageFromHash = (): Page => {
  const key = window.location.hash.slice(1)
  return Object.hasOwn(sections, key) ? (key as Page) : "overview"
}

export function App() {
  const { workspace, controller, error, notice } = useWorkspace()
  const [page, setPage] = useState<Page>(pageFromHash)
  const [assistant, setAssistant] = useState<Assistant | "all">("all")
  const [editorDirty, setEditorDirty] = useState(false)
  const [selection, setSelection] = useState<string | null>(null)
  const [review, setReview] = useState(false)
  const [search, setSearch] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [createResource, setCreateResource] = useState<ResourceKind | null>(
    null
  )
  const importRef = useRef<HTMLInputElement>(null)
  const profile = workspace?.profiles.find(
    (item) => item.id === workspace.activeProfileId
  )

  useEffect(() => {
    const theme = workspace?.theme ?? "dark"
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.style.colorScheme = theme
  }, [workspace?.theme])
  useEffect(() => {
    const hashChange = () => setPage(pageFromHash())
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearch((current) => !current)
      }
    }
    window.addEventListener("hashchange", hashChange)
    window.addEventListener("keydown", shortcut)
    return () => {
      window.removeEventListener("hashchange", hashChange)
      window.removeEventListener("keydown", shortcut)
    }
  }, [])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(controller.dismiss, 4500)
    return () => window.clearTimeout(timer)
  }, [notice, controller])

  useEffect(() => {
    if (!editorDirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [editorDirty])
  const leaveEditor = () =>
    !editorDirty || window.confirm("Discard unsaved changes in the editor?")
  const navigate = (next: Page) => {
    if (next !== page && !leaveEditor()) return
    setPage(next)
    window.location.hash = next
    setMobileOpen(false)
  }
  const edit = (resource: Resource) => {
    setAssistant(
      resource.kind === "instructions" ? resource.targets[0]! : "all"
    )
    setSelection(resource.id)
    navigate(resource.kind)
  }

  if (!workspace || !profile)
    return (
      <div className="loading-screen">
        <span className="brand-icon">
          <LoaderCircle className="spin" size={22} />
        </span>
        <h1>Agent Switch</h1>
        <p>{error || "Preparing your workspace…"}</p>
        {error && (
          <Button
            onClick={() => {
              void controller.initialize()
            }}
          >
            Retry
          </Button>
        )}
      </div>
    )
  const changes = changesFor(profile)
  const resources = profile.resources.filter(
    (resource) => assistant === "all" || resource.targets.includes(assistant)
  )
  const resourcePage = ["skills", "mcp", "hooks"].includes(page)
  const showFilter = page === "overview" || resourcePage

  return (
    <div
      className={cn("app-shell", changes.length > 0 && "has-pending-changes")}
    >
      <Sidebar
        profile={profile}
        page={page}
        navigate={navigate}
        search={() => setSearch(true)}
        close={() => setMobileOpen(false)}
        mobileOpen={mobileOpen}
      />
      <div className="app-main">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="breadcrumbs">
            <span>{sections[page].label}</span>
          </div>
          <div className="topbar-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={14} />
              <span>Import</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                controller.transfer.download(profile)
                controller.notify("Configuration exported as JSON.")
              }}
            >
              <Download size={14} />
              <span>Export</span>
            </Button>
          </div>
        </header>
        <main className="main-scroll" id="main-content">
          <div className="page-content">
            <div className="page-heading">
              <div>
                <h1>{sections[page].label}</h1>
                <p>{sections[page].description}</p>
              </div>
            </div>
            {showFilter && (
              <div className="context-toolbar">
                <AssistantFilter
                  value={assistant}
                  onChange={(next) => {
                    if (leaveEditor()) {
                      setEditorDirty(false)
                      setAssistant(next)
                    }
                  }}
                />
              </div>
            )}
            {page === "overview" && (
              <Overview
                profile={profile}
                resources={resources}
                navigate={navigate}
                review={() => setReview(true)}
                edit={edit}
              />
            )}
            {page === "instructions" && (
              <InstructionsPage
                profile={profile}
                assistant={assistant === "all" ? "claude" : assistant}
                onAssistantChange={setAssistant}
                selection={selection}
                select={setSelection}
                onDirtyChange={setEditorDirty}
              />
            )}
            {resourcePage && (
              <ResourcePage
                key={profile.id + page + assistant}
                onDirtyChange={setEditorDirty}
                kind={page as ResourceKind}
                profile={profile}
                resources={resources}
                selection={selection}
                select={setSelection}
                openEditor={() => setCreateResource(page as ResourceKind)}
              />
            )}
            {page === "history" && (
              <HistoryPage key={profile.id} profile={profile} />
            )}
            {page === "settings" && (
              <SettingsPage
                profile={profile}
                importFile={() => importRef.current?.click()}
                onboarding={() => setOnboarding(true)}
              />
            )}
          </div>
        </main>
        {changes.length > 0 && (
          <footer className="statusbar" aria-label="Pending changes">
            <button onClick={() => setReview(true)} className="pending-action">
              <span className="pending-dot" aria-hidden="true" />
              <span className="pending-summary" aria-live="polite">
                <strong>
                  {changes.length} pending change
                  {changes.length !== 1 ? "s" : ""}
                </strong>
                <span>Review your changes before applying them.</span>
              </span>
              <span className="pending-cta">
                Review <ArrowRight size={14} />
              </span>
            </button>
          </footer>
        )}
      </div>
      <input
        ref={importRef}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept=".json,application/json"
        aria-label="Import a configuration file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          if (file.size > 20_000_000) {
            controller.fail(new Error("The file exceeds the 20 MB limit."))
            return
          }
          void file
            .text()
            .then((text) => {
              const imported = controller.transfer.decode(text)
              return controller.run(
                () => controller.service.importProfile(imported),
                "Configuration imported. No changes have been applied."
              )
            })
            .catch(controller.fail)
        }}
      />
      {(error || notice) && (
        <div
          className={cn("toast", error && "toast-error")}
          role={error ? "alert" : "status"}
        >
          {error ? <AlertCircle size={17} /> : <Check size={17} />}
          <span>{error || notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={controller.dismiss}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {review && (
        <ReviewDialog profile={profile} onClose={() => setReview(false)} />
      )}
      {createResource && (
        <CreateResourceDialog
          kind={createResource}
          profile={profile}
          onClose={() => setCreateResource(null)}
        />
      )}
      {search && (
        <CommandPalette
          profile={profile}
          navigate={navigate}
          edit={edit}
          onClose={() => setSearch(false)}
        />
      )}
      {onboarding && <OnboardingDialog onClose={() => setOnboarding(false)} />}
    </div>
  )
}
