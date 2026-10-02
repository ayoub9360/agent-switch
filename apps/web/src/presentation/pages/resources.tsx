import { useEffect, useRef, useState } from "react"
import {
  Code2,
  FileCode2,
  Plus,
  Save,
  Search,
  Trash2,
  Check,
  Play,
  Copy,
  Folder,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { Input } from "@agent-switch/ui/components/input"
import { Switch } from "@agent-switch/ui/components/switch"
import { cn } from "@agent-switch/ui/lib/utils"
import {
  assistantNames,
  changesFor,
  type Assistant,
  type Profile,
  type Resource,
  type ResourceKind,
} from "@/domain/workspace"
import { countLabel, kindSingular, sections, savedLabel } from "../config"
import { useWorkspace } from "../workspace-context"
import {
  AssistantMark,
  EmptyState,
  Modal,
  Pill,
} from "../components/primitives"

export function ResourcePage({
  kind,
  profile,
  resources,
  openEditor,
  selection,
  select,
  onDirtyChange,
}: {
  kind: ResourceKind
  profile: Profile
  resources: Resource[]
  openEditor: () => void
  selection: string | null
  select: (id: string | null) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const dirty = useRef(false)
  const reportDirty = (value: boolean) => {
    dirty.current = value
    onDirtyChange(value)
  }
  const canLeave = () =>
    !dirty.current || window.confirm("Discard unsaved changes in the editor?")
  const [query, setQuery] = useState("")
  const [enabledOnly, setEnabledOnly] = useState(false)
  const { controller, busy } = useWorkspace()
  const items = resources.filter(
    (item) =>
      item.kind === kind &&
      (!enabledOnly || item.enabled) &&
      `${item.name} ${item.description}`
        .toLowerCase()
        .includes(query.toLowerCase())
  )
  const selected = items.find((item) => item.id === selection) ?? items[0]
  const Icon = sections[kind].icon
  return (
    <>
      <div className="list-toolbar">
        <div className="search-field">
          <Search size={15} />
          <Input
            aria-label={`Search in ${sections[kind].label}`}
            placeholder={`Search ${sections[kind].label.toLowerCase()}…`}
            value={query}
            onChange={(event) => {
              if (canLeave()) setQuery(event.target.value)
            }}
          />
        </div>
        <label className="filter-toggle">
          <Switch
            size="sm"
            checked={enabledOnly}
            onCheckedChange={(value) => {
              if (canLeave()) setEnabledOnly(value)
            }}
          />
          <span>Enabled only</span>
        </label>
        <span className="result-count">{countLabel(items.length, "item")}</span>
        <Button onClick={openEditor}>
          <Plus size={15} />
          Add
        </Button>
      </div>
      {items.length ? (
        <div className="resource-workbench">
          <div className="resource-list" aria-label={sections[kind].label}>
            {items.map((resource) => (
              <div
                className={cn(
                  "resource-list-row",
                  selected?.id === resource.id && "selected"
                )}
                key={resource.id}
              >
                <button
                  className="resource-select"
                  onClick={() => {
                    if (resource.id === selected?.id || canLeave())
                      select(resource.id)
                  }}
                  aria-pressed={selected?.id === resource.id}
                >
                  <span
                    className={cn(
                      "resource-icon",
                      !resource.enabled && "muted"
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="resource-summary">
                    <strong>{resource.name}</strong>
                    <small>{resource.description}</small>
                    <span className="resource-tags">
                      {(kind !== "skills" || resource.enabled) &&
                        resource.targets.map((target) => (
                          <AssistantMark key={target} assistant={target} />
                        ))}
                      {kind === "skills" && !resource.enabled && (
                        <span>Disabled everywhere</span>
                      )}
                      {kind === "mcp" && <span>Configured</span>}
                    </span>
                  </span>
                </button>
                <Switch
                  aria-label={`Enable ${resource.name}`}
                  title={
                    kind === "skills"
                      ? "When applied, disabling moves the entire folder to ~/.agent-switch; enabling restores it."
                      : undefined
                  }
                  checked={resource.enabled}
                  disabled={busy}
                  onCheckedChange={(enabled) => {
                    if (resource.id === selected?.id && !canLeave()) return
                    void controller.run(
                      () =>
                        controller.service.saveResource(profile.id, {
                          ...resource,
                          enabled,
                        }),
                      "Draft saved."
                    )
                  }}
                />
              </div>
            ))}
          </div>
          {selected && (
            <ResourceDetail
              key={
                selected.id +
                selected.content +
                selected.enabled +
                selected.targets.join()
              }
              profile={profile}
              resource={selected}
              onDirtyChange={reportDirty}
            />
          )}
        </div>
      ) : (
        <EmptyState
          icon={Icon}
          title={
            query || enabledOnly
              ? "No results"
              : `No ${sections[kind].label.toLowerCase()}`
          }
          description={
            query || enabledOnly
              ? "Try another search or remove the filter."
              : "Add your first item to your configuration."
          }
          action={
            <Button variant="outline" onClick={openEditor}>
              <Plus size={15} />
              Add an item
            </Button>
          }
        />
      )}
    </>
  )
}

function ResourceDetail({
  profile,
  resource,
  onDirtyChange,
}: {
  profile: Profile
  resource: Resource
  onDirtyChange: (dirty: boolean) => void
}) {
  const { controller, busy } = useWorkspace()
  const [draft, setDraft] = useState(resource)
  const [remove, setRemove] = useState(false)
  const [tested, setTested] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const changed = JSON.stringify(draft) !== JSON.stringify(resource)
  const pending = changesFor(profile).some(
    (change) => change.id === resource.id
  )
  const dirtyCallback = useRef(onDirtyChange)
  useEffect(() => {
    dirtyCallback.current = onDirtyChange
  }, [onDirtyChange])
  useEffect(() => {
    dirtyCallback.current(changed)
    return () => dirtyCallback.current(false)
  }, [changed])
  const [preview, setPreview] = useState(false)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const update = (patch: Partial<Resource>) =>
    setDraft((current) => ({ ...current, ...patch }))
  return (
    <section className="resource-detail">
      <div className="detail-header">
        <span>
          <FileCode2 size={15} />
          {resource.kind === "mcp"
            ? "configuration.json"
            : resource.kind === "hooks"
              ? "hooks.json"
              : resource.kind === "skills"
                ? "SKILL.md"
                : "instructions.md"}
        </span>
        <Pill
          tone={
            changed || pending
              ? "amber"
              : resource.enabled
                ? "green"
                : "neutral"
          }
        >
          {changed
            ? "Unsaved"
            : pending
              ? "Draft"
              : resource.enabled
                ? "Enabled"
                : "Disabled"}
        </Pill>
      </div>
      <div className="detail-content">
        <label className="field-label">
          Name
          <Input
            value={draft.name}
            maxLength={120}
            aria-label="Item name"
            onChange={(event) => update({ name: event.target.value })}
          />
        </label>
        <label className="field-label">
          Description
          <Input
            value={draft.description}
            maxLength={500}
            aria-label="Description"
            onChange={(event) => update({ description: event.target.value })}
          />
        </label>
        <div className="detail-options">
          <div>
            <span className="field-label">
              {resource.kind === "skills" ? "Available to" : "Assistants"}
            </span>
            <div className="target-options">
              {resource.kind === "skills" && (
                <>
                  <button
                    type="button"
                    className={cn(
                      "target-button",
                      draft.enabled && draft.targets.length === 2 && "selected"
                    )}
                    aria-pressed={draft.enabled && draft.targets.length === 2}
                    onClick={() =>
                      update({ targets: ["claude", "codex"], enabled: true })
                    }
                  >
                    All assistants
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "target-button",
                      !draft.enabled && "selected"
                    )}
                    aria-pressed={!draft.enabled}
                    onClick={() => update({ enabled: false })}
                  >
                    None
                  </button>
                </>
              )}
              {(["claude", "codex"] as Assistant[]).map((assistant) => (
                <button
                  key={assistant}
                  aria-pressed={
                    draft.targets.includes(assistant) &&
                    (resource.kind !== "skills" || draft.enabled)
                  }
                  className={cn(
                    "target-button",
                    draft.targets.includes(assistant) &&
                      (resource.kind !== "skills" || draft.enabled) &&
                      "selected"
                  )}
                  onClick={() => {
                    const active = resource.kind !== "skills" || draft.enabled
                    const targets =
                      draft.targets.includes(assistant) && active
                        ? draft.targets.filter((target) => target !== assistant)
                        : [
                            ...new Set([
                              ...draft.targets.filter(() => active),
                              assistant,
                            ]),
                          ]
                    update(
                      resource.kind === "skills"
                        ? {
                            targets: targets.length ? targets : draft.targets,
                            enabled: targets.length > 0,
                          }
                        : { targets }
                    )
                  }}
                >
                  <AssistantMark assistant={assistant} />
                  {assistantNames[assistant]}
                  {draft.targets.includes(assistant) &&
                    (resource.kind !== "skills" || draft.enabled) && (
                      <Check size={12} />
                    )}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="editor">
          <div className="editor-toolbar">
            <span>
              <Code2 size={13} />
              {["mcp", "hooks"].includes(resource.kind) ? "JSON" : "Markdown"}
            </span>
            <div>
              {["instructions", "skills"].includes(resource.kind) && (
                <button
                  className={cn(preview && "selected")}
                  onClick={() => setPreview(!preview)}
                >
                  {preview ? "Edit" : "Preview"}
                </button>
              )}
              <button
                aria-label="Copy content"
                onClick={() => {
                  if (!navigator.clipboard) {
                    controller.fail(
                      new Error(
                        "Automatic copying requires HTTPS or localhost. Select and copy the editor content."
                      )
                    )
                    return
                  }
                  void navigator.clipboard.writeText(draft.content).then(
                    () => controller.notify("Content copied."),
                    () =>
                      controller.fail(
                        new Error("The clipboard is unavailable.")
                      )
                  )
                }}
              >
                <Copy size={13} />
              </button>
            </div>
          </div>
          {preview ? (
            <div className="markdown-preview">
              {draft.content
                .split("\n")
                .map((line, index) =>
                  line.startsWith("# ") ? (
                    <h2 key={index}>{line.slice(2)}</h2>
                  ) : line.startsWith("## ") ? (
                    <h3 key={index}>{line.slice(3)}</h3>
                  ) : (
                    <p key={index}>{line || "\u00a0"}</p>
                  )
                )}
            </div>
          ) : (
            <div className="code-area">
              <div
                ref={lineNumbersRef}
                className="line-numbers"
                aria-hidden="true"
              >
                {draft.content.split("\n").map((_, index) => (
                  <span key={index}>{index + 1}</span>
                ))}
              </div>
              <textarea
                spellCheck={false}
                aria-label="Item content"
                value={draft.content}
                maxLength={100_000}
                onScroll={(event) => {
                  if (lineNumbersRef.current) {
                    lineNumbersRef.current.style.transform = `translateY(-${event.currentTarget.scrollTop}px)`
                  }
                }}
                onChange={(event) => {
                  update({ content: event.target.value })
                  setTested(null)
                }}
              />
            </div>
          )}
        </div>
        {resource.kind !== "skills" && (
          <div className="detail-source">
            <Folder size={12} />
            Source: {savedLabel(resource.source)}
          </div>
        )}
        {resource.kind === "mcp" && (
          <div className="connection-test">
            <div>
              <strong>{tested ? tested : "Test configuration"}</strong>
              <p>
                The test runs the command or contacts the configured URL, then
                initializes an MCP connection.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={testing || changed}
              onClick={() => {
                setTesting(true)
                void controller.discovery
                  .testMcp(draft.content)
                  .then(
                    (result) =>
                      setTested(`${result.name} ${result.version} · connected`),
                    controller.fail
                  )
                  .finally(() => setTesting(false))
              }}
            >
              {testing ? (
                "Testing…"
              ) : tested ? (
                <>
                  <Check size={13} />
                  Connected
                </>
              ) : (
                <>
                  <Play size={13} />
                  Test
                </>
              )}
            </Button>
          </div>
        )}
      </div>
      <div className="detail-footer">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${resource.name}`}
          onClick={() => setRemove(true)}
        >
          <Trash2 size={15} />
        </Button>
        <span />
        {changed && (
          <Button variant="ghost" size="sm" onClick={() => setDraft(resource)}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          disabled={!changed || busy}
          onClick={() => {
            void controller.run(
              () => controller.service.saveResource(profile.id, draft),
              "Changes saved to the draft."
            )
          }}
        >
          <Save size={14} />
          Save
        </Button>
      </div>
      {remove && (
        <Modal
          title="Delete this item?"
          description={`${resource.name} will be removed from the draft. The applied configuration remains available in history.`}
          onClose={() => setRemove(false)}
        >
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setRemove(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void controller.run(
                  () =>
                    controller.service.deleteResource(profile.id, resource.id),
                  "Item removed from the draft."
                )
              }}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}

export function CreateResourceDialog({
  kind,
  profile,
  onClose,
}: {
  kind: ResourceKind
  profile: Profile
  onClose: () => void
}) {
  const { controller, busy } = useWorkspace()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [targets, setTargets] = useState<Assistant[]>(
    kind === "hooks" ? ["claude"] : ["claude", "codex"]
  )
  const [content, setContent] = useState(
    kind === "mcp"
      ? '{\n  "command": "npx",\n  "args": []\n}'
      : kind === "hooks"
        ? '{\n  "PostToolUse": [{"hooks": [{"type": "command", "command": ""}]}]\n}'
        : kind === "skills"
          ? "---\nname: my-skill\ndescription: Describe when to use this skill.\n---\n\n# Instructions\n"
          : ""
  )
  return (
    <Modal
      title={`Add ${kind === "instructions" || kind === "mcp" ? "an" : "a"} ${kindSingular[kind]}`}
      description="This item will be added to the draft."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void controller
            .run(
              () =>
                controller.service.createResource(profile.id, {
                  kind,
                  name,
                  description,
                  content,
                  enabled: true,
                  targets,
                  scope: "global",
                  source: "Created in Agent Switch",
                }),
              "Item added."
            )
            .then((ok) => {
              if (ok) onClose()
            })
        }}
      >
        <label className="field-label">
          Name
          <Input
            autoFocus
            required
            maxLength={120}
            placeholder={kind === "mcp" ? "My server" : "Item name"}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field-label">
          Description
          <Input
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this item for?"
          />
        </label>
        <div className="detail-options">
          <div>
            <span className="field-label">Assistants</span>
            <div className="target-options">
              {(["claude", "codex"] as Assistant[]).map((target) => (
                <button
                  type="button"
                  key={target}
                  aria-pressed={targets.includes(target)}
                  className={cn(
                    "target-button",
                    targets.includes(target) && "selected"
                  )}
                  onClick={() =>
                    setTargets((current) =>
                      current.includes(target)
                        ? current.filter((t) => t !== target)
                        : [...current, target]
                    )
                  }
                >
                  <AssistantMark assistant={target} />
                  {assistantNames[target]}
                </button>
              ))}
            </div>
          </div>
        </div>
        {kind === "instructions" && (
          <p className="form-hint">
            Codex uses AGENTS.md: edit the existing instruction if it is already
            present.
          </p>
        )}
        <label className="field-label">
          {kind === "mcp"
            ? "JSON configuration"
            : kind === "hooks"
              ? "Hook configuration (JSON)"
              : "Markdown content"}
          <textarea
            className="form-code"
            required
            value={content}
            maxLength={100_000}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} type="submit">
            <Plus size={14} />
            Add to configuration
          </Button>
        </div>
      </form>
    </Modal>
  )
}
