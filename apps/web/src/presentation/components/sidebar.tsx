import {
  ArrowLeftRight,
  ChevronsUpDown,
  Folder,
  Plus,
  Search,
  PanelLeftClose,
  Monitor,
  Server,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { cn } from "@agent-switch/ui/lib/utils"
import type { Profile, Workspace } from "@/domain/workspace"
import { kinds, sections, type Page } from "../config"

interface Props {
  workspace: Workspace
  profile: Profile
  page: Page
  mobileOpen: boolean
  navigate: (page: Page) => void
  selectProfile: (id: string) => void
  createProfile: () => void
  search: () => void
  close: () => void
}
export function Sidebar({
  workspace,
  profile,
  page,
  navigate,
  selectProfile,
  createProfile,
  search,
  close,
  mobileOpen,
}: Props) {
  return (
    <>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Fermer le menu"
          onClick={close}
        />
      )}
      <aside className={cn("sidebar", mobileOpen && "sidebar-open")}>
        <div className="brand">
          <span className="brand-icon">
            <ArrowLeftRight size={17} />
          </span>
          <span>Agent Switch</span>
          <span className="version">α</span>
          <button
            className="mobile-close icon-button"
            aria-label="Fermer le menu"
            onClick={close}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <button
          className="workspace-picker"
          onClick={() => navigate("profiles")}
        >
          <span className="workspace-avatar">A</span>
          <span>
            <strong>Mon espace de travail</strong>
            <small>Configuration locale</small>
          </span>
          <ChevronsUpDown size={14} />
        </button>
        <button className="sidebar-search" onClick={search}>
          <Search size={14} />
          <span>Rechercher…</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="nav-label">ESPACE DE TRAVAIL</div>
        <nav aria-label="Navigation principale">
          {(["overview", ...kinds] as Page[]).map((key) => {
            const { icon: Icon, label } = sections[key]
            const count = profile.resources.filter(
              (resource) => resource.kind === key
            ).length
            return (
              <button
                key={key}
                aria-label={label}
                className={cn("nav-item", page === key && "active")}
                aria-current={page === key ? "page" : undefined}
                onClick={() => navigate(key)}
              >
                <Icon size={16} />
                <span>{label}</span>
                {count > 0 && <span className="nav-count">{count}</span>}
              </button>
            )
          })}
        </nav>
        <div className="nav-label profiles-label">
          <span>MES PROFILS</span>
          <button
            className="icon-button"
            aria-label="Créer un profil"
            onClick={createProfile}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="profile-nav">
          {workspace.profiles.map((item) => (
            <button
              key={item.id}
              className={cn(
                "profile-item",
                item.id === profile.id && "selected"
              )}
              onClick={() => selectProfile(item.id)}
              aria-pressed={item.id === profile.id}
            >
              <span className={cn("profile-dot", item.color)} />
              <span>{item.name}</span>
              {item.path && <Folder size={12} />}
            </button>
          ))}
          <button className="all-profiles" onClick={() => navigate("profiles")}>
            Gérer les profils <span>↗</span>
          </button>
        </div>
        <div className="sidebar-bottom">
          {(["history", "settings"] as Page[]).map((key) => {
            const { icon: Icon, label } = sections[key]
            return (
              <button
                key={key}
                aria-label={label}
                className={cn("nav-item", page === key && "active")}
                onClick={() => navigate(key)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            )
          })}
          <div className="local-note">
            <Server size={15} />
            <div>
              <strong>Configuration locale</strong>
              <p>Brouillons avant application.</p>
            </div>
          </div>
          <div className="machine">
            <Monitor size={13} />
            <span>Machine connectée</span>
            <span className="status-dot" />
            <span>v0.1.0</span>
          </div>
        </div>
      </aside>
    </>
  )
}

export function AssistantFilter({
  value,
  onChange,
}: {
  value: "all" | "claude" | "codex"
  onChange: (value: "all" | "claude" | "codex") => void
}) {
  return (
    <div
      className="assistant-filter"
      role="group"
      aria-label="Filtrer par assistant"
    >
      {(
        [
          ["all", "Tous les assistants"],
          ["claude", "✳ Claude Code"],
          ["codex", "⌘ Codex"],
        ] as const
      ).map(([key, label]) => (
        <Button
          key={key}
          variant="ghost"
          size="sm"
          aria-pressed={value === key}
          className={cn(value === key && "filter-active")}
          onClick={() => onChange(key)}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}
