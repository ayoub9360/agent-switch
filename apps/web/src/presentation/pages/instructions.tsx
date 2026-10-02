import { useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import { ArrowRight, Copy, FileText, Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { Input } from "@agent-switch/ui/components/input"
import { cn } from "@agent-switch/ui/lib/utils"
import {
  assistantNames,
  type Assistant,
  type Profile,
  type Resource,
} from "@/domain/workspace"
import {
  instructionRole,
  primaryInstruction,
  primaryInstructionName,
  instructionCopyContent,
  type InstructionCopyMode,
} from "@agent-switch/core/instructions"
import { useWorkspace } from "../workspace-context"
import { AssistantMark, Modal, Pill } from "../components/primitives"

export function InstructionsPage({
  profile,
  assistant,
  onAssistantChange,
  selection,
  select,
  onDirtyChange,
}: {
  profile: Profile
  assistant: Assistant
  onAssistantChange: (assistant: Assistant) => void
  selection: string | null
  select: (id: string | null) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const dirty = useRef(false)
  const [newRule, setNewRule] = useState(false)
  const items = profile.resources.filter(
    (r) => r.kind === "instructions" && r.targets.includes(assistant)
  )
  const primary = primaryInstruction(profile, assistant)
  const selected = items.find((r) => r.id === selection) ?? primary
  const extras = items.filter((r) => r !== primary)
  const canLeave = () =>
    !dirty.current || window.confirm("Discard unsaved editor changes?")
  const choose = (id: string | null) => {
    if (canLeave()) select(id)
  }
  return (
    <div className="instructions-page">
      <div
        className="instructions-tabs"
        role="tablist"
        aria-label="Assistant instructions"
      >
        {(["claude", "codex"] as Assistant[]).map((target) => (
          <button
            key={target}
            role="tab"
            aria-selected={assistant === target}
            onClick={() => {
              if (target !== assistant && canLeave()) {
                select(null)
                onAssistantChange(target)
              }
            }}
          >
            <AssistantMark assistant={target} />
            {assistantNames[target]}
          </button>
        ))}
      </div>
      <div className="instructions-workbench">
        <aside className="instruction-files" aria-label="Instruction files">
          <div className="eyebrow">MAIN INSTRUCTIONS</div>
          <button
            className={cn(
              "instruction-file",
              selected === primary && "selected"
            )}
            onClick={() => choose(primary?.id ?? null)}
          >
            <FileText size={16} />
            <span>
              <strong>{primaryInstructionName(assistant)}</strong>
              <small>
                {primary ? "Personal instructions" : "Not created yet"}
              </small>
            </span>
          </button>
          {(extras.length > 0 || assistant === "claude") && (
            <div className="instruction-files-heading">
              <span className="eyebrow">ADDITIONAL FILES</span>
              {assistant === "claude" && (
                <button
                  className="icon-button"
                  aria-label="New Claude rule"
                  onClick={() => {
                    if (canLeave()) setNewRule(true)
                  }}
                >
                  <Plus size={15} />
                </button>
              )}
            </div>
          )}
          {extras.map((resource) => (
            <button
              key={resource.id}
              className={cn(
                "instruction-file",
                selected?.id === resource.id && "selected"
              )}
              onClick={() => choose(resource.id)}
            >
              <FileText size={16} />
              <span>
                <strong>{resource.name}</strong>
                <small>
                  {instructionRole(resource) === "override"
                    ? "Overrides main instructions"
                    : "Additional rule"}
                </small>
              </span>
            </button>
          ))}
          {assistant === "claude" && !extras.length && (
            <p className="form-hint">
              Keep your main preferences in CLAUDE.md. Add a rule file when you
              need to organize a separate topic.
            </p>
          )}
        </aside>
        <InstructionEditor
          key={`${assistant}:${selected?.id ?? "new"}:${selected?.content}:${selected?.enabled}`}
          profile={profile}
          assistant={assistant}
          resource={selected}
          onCopied={(target) => {
            select(null)
            onAssistantChange(target)
          }}
          onDirtyChange={(value) => {
            dirty.current = value
            onDirtyChange(value)
          }}
        />
      </div>
      {newRule && (
        <NewRule
          profile={profile}
          onClose={() => setNewRule(false)}
          onCreated={(id) => {
            select(id)
            setNewRule(false)
          }}
        />
      )}
    </div>
  )
}

function InstructionEditor({
  profile,
  assistant,
  resource,
  onCopied,
  onDirtyChange,
}: {
  profile: Profile
  assistant: Assistant
  resource?: Resource
  onCopied: (target: Assistant) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const { controller, workspace, busy } = useWorkspace()
  const [content, setContent] = useState(resource?.content ?? "")
  const [preview, setPreview] = useState(false)
  const [copy, setCopy] = useState(false)
  const [remove, setRemove] = useState(false)
  const changed = content !== (resource?.content ?? "")
  const callback = useRef(onDirtyChange)
  useEffect(() => {
    callback.current = onDirtyChange
  }, [onDirtyChange])
  useEffect(() => {
    callback.current(changed)
    return () => callback.current(false)
  }, [changed])
  const role = resource ? instructionRole(resource) : "primary"
  const filename =
    role === "primary" ? primaryInstructionName(assistant) : resource!.name
  const home = workspace?.machine?.home ?? "~"
  const root =
    workspace?.machine?.instructionRoots?.[assistant] ?? `${home}/.${assistant}`
  const path =
    resource?.instructionPaths?.[assistant] ??
    `${root}/${role === "rule" ? "rules/" : ""}${filename}`
  const linked = resource?.source.startsWith("/") && resource.source !== path
  const override =
    assistant === "codex" &&
    profile.resources.find(
      (r) =>
        r.kind === "instructions" &&
        r.targets.includes("codex") &&
        instructionRole(r) === "override" &&
        r.enabled &&
        r.content.trim()
    )
  const appliedOverride =
    assistant === "codex" &&
    profile.applied.some(
      (r) =>
        r.kind === "instructions" &&
        r.targets.includes("codex") &&
        instructionRole(r) === "override" &&
        r.enabled &&
        r.content.trim()
    )
  const applied = profile.applied.find((r) => r.id === resource?.id)
  const pending =
    resource && JSON.stringify(resource) !== JSON.stringify(applied)
  const target = assistant === "claude" ? "codex" : "claude"
  return (
    <section
      className="instruction-editor"
      aria-label={`${assistantNames[assistant]} instruction editor`}
    >
      <div className="instruction-editor-heading">
        <div>
          <h2>{filename}</h2>
          <p>
            {role === "primary"
              ? `Personal instructions for ${assistantNames[assistant]}, across your projects.`
              : role === "override"
                ? "When non-empty, this file replaces AGENTS.md at the user level."
                : "An additional Claude Code rule file. Its front matter and imports are kept as written."}
          </p>
        </div>
        <Pill tone={changed || pending ? "amber" : "neutral"}>
          {changed
            ? "Unsaved"
            : pending
              ? "Draft"
              : applied?.enabled
                ? "On disk"
                : "Not installed"}
        </Pill>
      </div>
      {role === "primary" && (override || appliedOverride) && (
        <div className="information-banner">
          <FileText size={16} />
          <span>
            {override
              ? `${appliedOverride ? "AGENTS.override.md currently takes precedence." : "After applying, AGENTS.override.md will take precedence."} Main instructions are not loaded while the non-empty override is present.`
              : "The override still takes precedence on disk. Applying its pending removal or emptying it will restore AGENTS.md."}
          </span>
        </div>
      )}
      {role === "override" && !content.trim() && (
        <p className="form-hint">An empty override falls back to AGENTS.md.</p>
      )}
      {!resource && (
        <p className="form-hint">
          This file does not exist in your configuration yet. Saving creates a
          draft; the file is created when you apply it.
        </p>
      )}
      {resource && !resource.enabled && (
        <p className="form-hint">
          This file was previously disabled. Saving will prepare its
          restoration.
        </p>
      )}
      <div className="editor instruction-document">
        <div className="editor-toolbar">
          <span>Markdown</span>
          <div>
            <button
              className={cn(!preview && "selected")}
              aria-pressed={!preview}
              onClick={() => setPreview(false)}
            >
              Edit
            </button>
            <button
              className={cn(preview && "selected")}
              aria-pressed={preview}
              onClick={() => setPreview(true)}
            >
              Preview
            </button>
          </div>
        </div>
        {preview ? (
          <div className="markdown-preview instruction-markdown">
            <Markdown>{content || "*No instructions yet.*"}</Markdown>
          </div>
        ) : (
          <textarea
            aria-label="Instruction content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            spellCheck={false}
            maxLength={100000}
            placeholder={`Write your instructions for ${assistantNames[assistant]}…`}
          />
        )}
      </div>
      {resource && resource.targets.length > 1 && (
        <p className="form-hint">
          Both assistants point to this same file. Edits affect both; copying is
          unnecessary.
        </p>
      )}
      <details className="instruction-location">
        <summary>File location{linked ? " · symbolic link" : ""}</summary>
        <code>{path}</code>
        {linked && (
          <>
            <span>Linked to</span>
            <code>{resource?.source}</code>
            <p>The link is preserved when its target is updated.</p>
          </>
        )}
      </details>
      <div className="instruction-actions">
        {role !== "primary" && resource && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setRemove(true)}
          >
            <Trash2 size={14} />
            Remove {role === "override" ? "override" : "rule"}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={
            !resource ||
            !content.trim() ||
            changed ||
            busy ||
            resource.targets.includes(target)
          }
          onClick={() => setCopy(true)}
        >
          <Copy size={14} />
          Copy to {assistantNames[target]}…
        </Button>
        <span className="instruction-action-spacer" />
        {changed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setContent(resource?.content ?? "")}
          >
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          disabled={busy || (!!resource && resource.enabled && !changed)}
          onClick={() => {
            void controller.run(
              () =>
                controller.service.saveInstruction(
                  profile.id,
                  assistant,
                  content,
                  resource?.id
                ),
              "Changes saved to the draft."
            )
          }}
        >
          <Save size={14} />
          {!resource ? "Create instructions" : "Save"}
        </Button>
      </div>
      {copy && resource && (
        <CopyInstructions
          profile={profile}
          source={resource}
          target={target}
          onClose={() => setCopy(false)}
          onCopied={() => {
            setCopy(false)
            onCopied(target)
          }}
        />
      )}
      {remove && resource && (
        <Modal
          title={`Remove ${filename}?`}
          description={
            role === "override"
              ? "This prepares removal of the override. Codex will fall back to AGENTS.md after you apply the change."
              : "This file will be removed after you review and apply the change."
          }
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
                  "Removal saved to the draft."
                )
              }}
            >
              Remove
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}

function CopyInstructions({
  profile,
  source,
  target,
  onClose,
  onCopied,
}: {
  profile: Profile
  source: Resource
  target: Assistant
  onClose: () => void
  onCopied: () => void
}) {
  const { controller, busy } = useWorkspace()
  const [mode, setMode] = useState<InstructionCopyMode>("append")
  const [edited, setEdited] = useState<string | null>(null)
  const destination = primaryInstruction(profile, target)
  const result =
    edited ??
    instructionCopyContent(destination?.content ?? "", source.content, mode)
  const overridden =
    target === "codex" &&
    profile.resources.some(
      (r) =>
        r.kind === "instructions" &&
        r.targets.includes(target) &&
        instructionRole(r) === "override" &&
        r.enabled &&
        r.content.trim()
    )
  return (
    <Modal
      wide
      title={`Copy to ${assistantNames[target]}`}
      description={`Prepare a draft for ${primaryInstructionName(target)}. The two files remain independent.`}
      onClose={onClose}
    >
      <div
        className="instruction-copy-options"
        role="group"
        aria-label="Copy mode"
      >
        {(["append", "replace"] as const).map((value) => (
          <Button
            key={value}
            variant={mode === value ? "default" : "outline"}
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value)
              setEdited(null)
            }}
          >
            {value === "append"
              ? "Append to existing instructions"
              : "Replace content"}
          </Button>
        ))}
      </div>
      <p className="form-hint">
        Review assistant-specific commands, paths and imports. They are copied
        as text, not automatically converted. You can edit the result below.
      </p>
      {overridden && (
        <div className="information-banner">
          Codex currently has an override in the saved draft. AGENTS.md will
          remain superseded until that override is removed.
        </div>
      )}
      <div className="instruction-comparison">
        <label className="field-label">
          Current destination
          <textarea
            readOnly
            aria-label="Current destination"
            value={destination?.content ?? ""}
            placeholder="The destination file will be created."
          />
        </label>
        <label className="field-label">
          Result after copying
          <textarea
            aria-label="Copy result"
            value={result}
            onChange={(event) => setEdited(event.target.value)}
            maxLength={100000}
          />
        </label>
      </div>
      <div className="dialog-actions">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={
            busy ||
            result.length > 100000 ||
            (!!destination &&
              result === destination.content &&
              destination.enabled)
          }
          onClick={() => {
            void controller
              .run(
                () =>
                  controller.service.copyInstructions(
                    profile.id,
                    source.id,
                    target,
                    mode,
                    result
                  ),
                "Copy saved to the draft. Review before applying."
              )
              .then((ok) => {
                if (ok) onCopied()
              })
          }}
        >
          Use as draft <ArrowRight size={14} />
        </Button>
      </div>
    </Modal>
  )
}

function NewRule({
  profile,
  onClose,
  onCreated,
}: {
  profile: Profile
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { controller, busy } = useWorkspace()
  const [name, setName] = useState("")
  return (
    <Modal
      title="New Claude rule"
      description="A separate Markdown file in Claude Code’s rules directory."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const filename = `${name.trim().replace(/\.md$/i, "").toLowerCase()}.md`
          if (!/^[a-z0-9][a-z0-9_-]*\.md$/.test(filename)) {
            controller.fail(
              new Error(
                "Use letters, digits, hyphens or underscores for the file name."
              )
            )
            return
          }
          if (
            profile.resources.some(
              (r) =>
                r.kind === "instructions" &&
                r.targets.includes("claude") &&
                r.name === filename
            )
          ) {
            controller.fail(new Error("This rule already exists."))
            return
          }
          void controller
            .run(
              () =>
                controller.service.createResource(profile.id, {
                  kind: "instructions",
                  name: filename,
                  description: "",
                  content: "",
                  enabled: true,
                  targets: ["claude"],
                  scope: "global",
                  source: "Created in Agent Switch",
                  instructionRole: "rule",
                }),
              "Rule created in the draft."
            )
            .then((ok) => {
              if (ok) {
                const created = controller
                  .getSnapshot()
                  .workspace?.profiles[0]?.resources.find(
                    (r) =>
                      r.kind === "instructions" &&
                      r.name === filename &&
                      r.targets.includes("claude")
                  )
                if (created) onCreated(created.id)
                else onClose()
              }
            })
        }}
      >
        <label className="field-label">
          File name
          <Input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="code-style.md"
          />
        </label>
        <div className="dialog-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Create rule
          </Button>
        </div>
      </form>
    </Modal>
  )
}
