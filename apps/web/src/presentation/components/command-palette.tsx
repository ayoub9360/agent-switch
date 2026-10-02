import { useState } from "react"
import { Search, ArrowUpRight } from "lucide-react"
import { Input } from "@agent-switch/ui/components/input"
import type { Profile, Resource } from "@/domain/workspace"
import { sections, type Page } from "../config"
import { Modal } from "./primitives"

export function CommandPalette({
  profile,
  navigate,
  edit,
  onClose,
}: {
  profile: Profile
  navigate: (page: Page) => void
  edit: (resource: Resource) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const matches = (value: string) =>
    value.toLowerCase().includes(query.toLowerCase())
  const pages = (Object.keys(sections) as Page[]).filter((key) =>
    matches(sections[key].label)
  )
  const resources = profile.resources
    .filter((item) => matches(item.name))
    .slice(0, 8)
  return (
    <Modal
      title="Search your workspace"
      description="Pages and items in your configuration."
      onClose={onClose}
    >
      <div className="search-field palette-search">
        <Search size={16} />
        <Input
          autoFocus
          aria-label="Global search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="An instruction, a skill, a server…"
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
        {resources.length > 0 && <div className="eyebrow">ITEMS</div>}
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
        {!pages.length && !resources.length && (
          <p className="no-results">No results for “{query}”.</p>
        )}
      </div>
      <div className="palette-hint">
        <kbd>Tab</kbd> navigate <kbd>↵</kbd> open <kbd>esc</kbd> close
      </div>
    </Modal>
  )
}
