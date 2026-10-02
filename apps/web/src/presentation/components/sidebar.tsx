import { ArrowLeftRight, Search, PanelLeftClose } from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { cn } from "@agent-switch/ui/lib/utils"
import type { Profile } from "@/domain/workspace"
import { kinds, sections, type Page } from "../config"
import { AssistantLogo } from "./primitives"

interface Props {
  profile: Profile
  page: Page
  mobileOpen: boolean
  navigate: (page: Page) => void
  search: () => void
  close: () => void
}
export function Sidebar({
  profile,
  page,
  navigate,
  search,
  close,
  mobileOpen,
}: Props) {
  return (
    <>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={close}
        />
      )}
      <aside className={cn("sidebar", mobileOpen && "sidebar-open")}>
        <div className="brand">
          <span className="brand-icon">
            <ArrowLeftRight size={17} />
          </span>
          <span>Agent Switch</span>
          <button
            className="mobile-close icon-button"
            aria-label="Close menu"
            onClick={close}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <button className="sidebar-search" onClick={search}>
          <Search size={14} />
          <span>Search…</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
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
      aria-label="Filter by assistant"
    >
      {(
        [
          ["all", "All assistants"],
          ["claude", "Claude Code"],
          ["codex", "Codex"],
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
          {key !== "all" && <AssistantLogo assistant={key} />}
          {label}
        </Button>
      ))}
    </div>
  )
}
