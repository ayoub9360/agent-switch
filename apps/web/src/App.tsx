import { useEffect, useRef, useState } from "react"
import {
  ChevronRight,
  Download,
  Upload,
  Folder,
  Menu,
  Check,
  X,
  AlertCircle,
  LoaderCircle,
  ArrowRight,
  Plus,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { cn } from "@agent-switch/ui/lib/utils"
import {
  changesFor,
  type Assistant,
  type Profile,
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
import {
  ProfilesPage,
  CreateProfileDialog,
} from "@/presentation/pages/profiles"
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
  const [createProfile, setCreateProfile] = useState<{
    source?: Profile
    editing?: boolean
  } | null>(null)
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
    !editorDirty ||
    window.confirm(
      "Abandonner les modifications non enregistrées dans l’éditeur ?"
    )
  const navigate = (next: Page) => {
    if (next !== page && !leaveEditor()) return
    setPage(next)
    window.location.hash = next
    setMobileOpen(false)
  }
  const selectProfile = (id: string) => {
    if (!leaveEditor()) return
    setEditorDirty(false)
    void controller
      .run(() => controller.service.selectProfile(id))
      .then((ok) => {
        if (ok) {
          setSelection(null)
          navigate("overview")
        }
      })
  }
  const edit = (resource: Resource) => {
    setAssistant("all")
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
        <p>{error || "Préparation de votre espace…"}</p>
        {error && (
          <Button
            onClick={() => {
              void controller.initialize()
            }}
          >
            Réessayer
          </Button>
        )}
      </div>
    )
  const changes = changesFor(profile)
  const resources = profile.resources.filter(
    (resource) => assistant === "all" || resource.targets.includes(assistant)
  )
  const resourcePage = ["instructions", "skills", "mcp", "hooks"].includes(page)
  const showFilter = page === "overview" || resourcePage

  return (
    <div className="app-shell">
      <Sidebar
        workspace={workspace}
        profile={profile}
        page={page}
        navigate={navigate}
        selectProfile={selectProfile}
        createProfile={() => setCreateProfile({})}
        search={() => setSearch(true)}
        close={() => setMobileOpen(false)}
        mobileOpen={mobileOpen}
      />
      <div className="app-main">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Ouvrir le menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="breadcrumbs">
            <Folder size={14} />
            <button onClick={() => navigate("profiles")}>{profile.name}</button>
            <ChevronRight size={13} />
            <span>{sections[page].label}</span>
          </div>
          <div className="topbar-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={14} />
              <span>Importer</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                controller.transfer.download(profile)
                controller.notify("Profil exporté au format JSON.")
              }}
            >
              <Download size={14} />
              <span>Exporter</span>
            </Button>
          </div>
        </header>
        <main className="main-scroll" id="main-content">
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="page-eyebrow">
                  <span className={cn("profile-dot", profile.color)} />
                  {profile.name}
                  <span>/</span>
                  {profile.path ? "PROJET" : "GLOBAL"}
                </div>
                <h1>{sections[page].label}</h1>
                <p>{sections[page].description}</p>
              </div>
              {page === "overview" && (
                <Button
                  variant="outline"
                  onClick={() => setCreateProfile({ source: profile })}
                >
                  <Plus size={14} />
                  Dupliquer le profil
                </Button>
              )}
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
                <span className="scope-caption">
                  <Folder size={12} />
                  {profile.path || "Configuration globale"}
                </span>
              </div>
            )}
            {page === "overview" && (
              <Overview
                profile={profile}
                resources={resources}
                navigate={navigate}
                review={() => setReview(true)}
                edit={edit}
                onboarding={() => setOnboarding(true)}
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
            {page === "profiles" && (
              <ProfilesPage
                edit={(source) => setCreateProfile({ source, editing: true })}
                create={() => setCreateProfile({})}
                duplicate={(source) => setCreateProfile({ source })}
                activate={selectProfile}
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
        <footer className="statusbar">
          <button
            onClick={() => setReview(true)}
            className={cn(
              "pending-action",
              changes.length > 0 && "has-changes"
            )}
          >
            {changes.length ? (
              <>
                <span className="pending-dot" />
                {changes.length} changements en attente
                <span className="status-divider" />
                Vérifier <ArrowRight size={13} />
              </>
            ) : (
              <>
                <Check size={13} />
                Aucun changement en attente
              </>
            )}
          </button>
        </footer>
      </div>
      <input
        ref={importRef}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept=".json,application/json"
        aria-label="Importer un fichier de profil"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          if (file.size > 20_000_000) {
            controller.fail(new Error("Le fichier dépasse la limite de 20 Mo."))
            return
          }
          void file
            .text()
            .then((text) => {
              const imported = controller.transfer.decode(text)
              return controller.run(
                () => controller.service.importProfile(imported),
                "Profil importé. Aucun changement n’a été appliqué."
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
            aria-label="Fermer la notification"
            onClick={controller.dismiss}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {review && (
        <ReviewDialog profile={profile} onClose={() => setReview(false)} />
      )}
      {createProfile && (
        <CreateProfileDialog
          editing={createProfile.editing}
          source={createProfile.source}
          onClose={() => {
            setCreateProfile(null)
            navigate("overview")
          }}
        />
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
          workspace={workspace}
          profile={profile}
          navigate={navigate}
          selectProfile={selectProfile}
          edit={edit}
          onClose={() => setSearch(false)}
        />
      )}
      {onboarding && <OnboardingDialog onClose={() => setOnboarding(false)} />}
    </div>
  )
}
