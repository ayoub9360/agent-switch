import { useState } from "react"
import { Search, ArrowUpRight, Folder } from "lucide-react"
import { Input } from "@agent-switch/ui/components/input"
import type { Profile, Resource, Workspace } from "@/domain/workspace"
import { sections, type Page } from "../config"
import { Modal } from "./primitives"

export function CommandPalette({
  workspace,
  profile,
  navigate,
  selectProfile,
  edit,
  onClose,
}: {
  workspace: Workspace
  profile: Profile
  navigate: (page: Page) => void
  selectProfile: (id: string) => void
  edit: (resource: Resource) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const matches = (value: string) =>
    value.toLowerCase().includes(query.toLowerCase())
  const pages = (Object.keys(sections) as Page[]).filter((key) =>
    matches(sections[key].label)
  )
  const profiles = workspace.profiles.filter((item) => matches(item.name))
  const resources = profile.resources
    .filter((item) => matches(item.name))
    .slice(0, 8)
  return (
    <Modal
      title="Rechercher dans votre espace"
      description="Pages, profils et éléments du profil sélectionné."
      onClose={onClose}
    >
      <div className="search-field palette-search">
        <Search size={16} />
        <Input
          autoFocus
          aria-label="Recherche globale"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Une instruction, un profil, un serveur…"
        />
      </div>
      <div className="command-results">
        {pages.length > 0 && <div className="eyebrow">NAVIGATION</div>}
        {pages.map((key) => {
          const Icon = sections[key].icon
          return (
            <button
              key={key}
              onClick={() => {
                navigate(key)
                onClose()
              }}
            >
              <Icon size={15} />
              {sections[key].label}
              <ArrowUpRight size={12} />
            </button>
          )
        })}
        {profiles.length > 0 && <div className="eyebrow">PROFILS</div>}
        {profiles.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              selectProfile(item.id)
              onClose()
            }}
          >
            <Folder size={15} />
            {item.name}
            <ArrowUpRight size={12} />
          </button>
        ))}
        {resources.length > 0 && (
          <div className="eyebrow">DANS {profile.name.toUpperCase()}</div>
        )}
        {resources.map((item) => {
          const Icon = sections[item.kind].icon
          return (
            <button
              key={item.id}
              onClick={() => {
                edit(item)
                onClose()
              }}
            >
              <Icon size={15} />
              {item.name}
              <ArrowUpRight size={12} />
            </button>
          )
        })}
        {!pages.length && !profiles.length && !resources.length && (
          <p className="no-results">Aucun résultat pour « {query} ».</p>
        )}
      </div>
      <div className="palette-hint">
        <kbd>Tab</kbd> naviguer <kbd>↵</kbd> ouvrir <kbd>esc</kbd> fermer
      </div>
    </Modal>
  )
}
