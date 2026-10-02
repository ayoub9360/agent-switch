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
import { kindSingular, sections } from "../config"
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
    !dirty.current ||
    window.confirm(
      "Abandonner les modifications non enregistrées dans l’éditeur ?"
    )
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
            aria-label={`Rechercher dans ${sections[kind].label}`}
            placeholder={`Rechercher ${kind === "mcp" ? "un serveur" : `une ${kindSingular[kind]}`}…`}
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
          <span>Actifs uniquement</span>
        </label>
        <span className="result-count">{items.length} éléments</span>
        <Button onClick={openEditor}>
          <Plus size={15} />
          Ajouter
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
                      {resource.targets.map((target) => (
                        <AssistantMark key={target} assistant={target} />
                      ))}
                      <span>
                        {resource.scope === "global" ? "Global" : "Projet"}
                      </span>
                      {kind === "mcp" && <span>Configuré</span>}
                    </span>
                  </span>
                </button>
                <Switch
                  aria-label={`Activer ${resource.name}`}
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
                      "Brouillon enregistré."
                    )
                  }}
                />
              </div>
            ))}
          </div>
          {selected && (
            <ResourceDetail
              key={selected.id + selected.content + selected.enabled}
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
              ? "Aucun résultat"
              : `Aucun ${kindSingular[kind]}`
          }
          description={
            query || enabledOnly
              ? "Essayez une autre recherche ou retirez le filtre."
              : "Ajoutez votre premier élément à ce profil."
          }
          action={
            <Button variant="outline" onClick={openEditor}>
              <Plus size={15} />
              Ajouter un élément
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
            ? "Non enregistré"
            : pending
              ? "Brouillon"
              : resource.enabled
                ? "Actif"
                : "Désactivé"}
        </Pill>
      </div>
      <div className="detail-content">
        <label className="field-label">
          Nom
          <Input
            value={draft.name}
            maxLength={120}
            aria-label="Nom de l’élément"
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
            <span className="field-label">Assistants</span>
            <div className="target-options">
              {(["claude", "codex"] as Assistant[]).map((assistant) => (
                <button
                  key={assistant}
                  aria-pressed={draft.targets.includes(assistant)}
                  className={cn(
                    "target-button",
                    draft.targets.includes(assistant) && "selected"
                  )}
                  onClick={() =>
                    update({
                      targets: draft.targets.includes(assistant)
                        ? draft.targets.filter((target) => target !== assistant)
                        : [...draft.targets, assistant],
                    })
                  }
                >
                  <AssistantMark assistant={assistant} />
                  {assistantNames[assistant]}
                  {draft.targets.includes(assistant) && <Check size={12} />}
                </button>
              ))}
            </div>
          </div>
          <label className="field-label">
            Portée
            <select
              value={draft.scope}
              onChange={(event) =>
                update({ scope: event.target.value as Resource["scope"] })
              }
            >
              <option value="project">Projet</option>
              <option value="global">Globale</option>
            </select>
          </label>
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
                  {preview ? "Éditer" : "Aperçu"}
                </button>
              )}
              <button
                aria-label="Copier le contenu"
                onClick={() => {
                  if (!navigator.clipboard) {
                    controller.fail(
                      new Error(
                        "La copie automatique nécessite HTTPS ou localhost. Sélectionnez et copiez le contenu de l’éditeur."
                      )
                    )
                    return
                  }
                  void navigator.clipboard.writeText(draft.content).then(
                    () => controller.notify("Contenu copié."),
                    () =>
                      controller.fail(
                        new Error("Le presse-papiers n’est pas accessible.")
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
                aria-label="Contenu de l’élément"
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
        <div className="detail-source">
          <Folder size={12} />
          Origine : {resource.source}
        </div>
        {resource.kind === "mcp" && (
          <div className="connection-test">
            <div>
              <strong>{tested ? tested : "Tester la configuration"}</strong>
              <p>
                Le test démarre la commande ou contacte l’URL configurée, puis
                initialise une connexion MCP.
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
                      setTested(`${result.name} ${result.version} · connecté`),
                    controller.fail
                  )
                  .finally(() => setTesting(false))
              }}
            >
              {testing ? (
                "Test…"
              ) : tested ? (
                <>
                  <Check size={13} />
                  Connecté
                </>
              ) : (
                <>
                  <Play size={13} />
                  Tester
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
          aria-label={`Supprimer ${resource.name}`}
          onClick={() => setRemove(true)}
        >
          <Trash2 size={15} />
        </Button>
        <span />
        {changed && (
          <Button variant="ghost" size="sm" onClick={() => setDraft(resource)}>
            Annuler
          </Button>
        )}
        <Button
          size="sm"
          disabled={!changed || busy}
          onClick={() => {
            void controller.run(
              () => controller.service.saveResource(profile.id, draft),
              "Modifications enregistrées dans le brouillon."
            )
          }}
        >
          <Save size={14} />
          Enregistrer
        </Button>
      </div>
      {remove && (
        <Modal
          title="Supprimer cet élément ?"
          description={`${resource.name} sera retiré du brouillon. La configuration appliquée reste disponible dans l’historique.`}
          onClose={() => setRemove(false)}
        >
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setRemove(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void controller.run(
                  () =>
                    controller.service.deleteResource(profile.id, resource.id),
                  "Élément retiré du brouillon."
                )
              }}
            >
              Supprimer
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
  const [targets, setTargets] = useState<Assistant[]>(
    kind === "hooks" ? ["claude"] : ["claude", "codex"]
  )
  const [scope, setScope] = useState<Resource["scope"]>(
    profile.path ? "project" : "global"
  )
  const [description, setDescription] = useState("")
  const [content, setContent] = useState(
    kind === "mcp"
      ? '{\n  "command": "npx",\n  "args": []\n}'
      : kind === "hooks"
        ? '{\n  "PostToolUse": [{"hooks": [{"type": "command", "command": ""}]}]\n}'
        : kind === "skills"
          ? "---\nname: my-skill\ndescription: Décrivez quand utiliser ce skill.\n---\n\n# Instructions\n"
          : ""
  )
  return (
    <Modal
      title={`Ajouter un ${kindSingular[kind]}`}
      description={`Cet élément sera ajouté au brouillon de ${profile.name}.`}
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
                  scope,
                  source: "Créé dans Agent Switch",
                }),
              "Élément ajouté."
            )
            .then((ok) => {
              if (ok) onClose()
            })
        }}
      >
        <label className="field-label">
          Nom
          <Input
            autoFocus
            required
            maxLength={120}
            placeholder={kind === "mcp" ? "Mon serveur" : "Nom de l’élément"}
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
            placeholder="À quoi sert cet élément ?"
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
          <label className="field-label">
            Portée
            <select
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as Resource["scope"])
              }
            >
              <option value="global">Globale</option>
              <option value="project" disabled={!profile.path}>
                Projet
              </option>
            </select>
          </label>
        </div>
        {kind === "instructions" && (
          <p className="form-hint">
            Codex utilise AGENTS.md pour chaque portée : modifiez l’instruction
            existante si elle est déjà présente.
          </p>
        )}
        <label className="field-label">
          {kind === "mcp"
            ? "Configuration JSON"
            : kind === "hooks"
              ? "Configuration des hooks (JSON)"
              : "Contenu Markdown"}
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
            Annuler
          </Button>
          <Button disabled={busy} type="submit">
            <Plus size={14} />
            Ajouter au profil
          </Button>
        </div>
      </form>
    </Modal>
  )
}
