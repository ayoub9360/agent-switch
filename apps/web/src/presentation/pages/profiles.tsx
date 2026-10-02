import { useState } from "react"
import {
  Folder,
  Globe2,
  Plus,
  Copy,
  Download,
  Trash2,
  ArrowUpRight,
  Check,
  Layers,
  Pencil,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { Input } from "@agent-switch/ui/components/input"
import { cn } from "@agent-switch/ui/lib/utils"
import { changesFor, type Profile, type ProfileColor } from "@/domain/workspace"
import { useWorkspace } from "../workspace-context"
import { AssistantMark, Modal, Pill } from "../components/primitives"

export function ProfilesPage({
  create,
  duplicate,
  activate,
  edit,
}: {
  edit: (profile: Profile) => void
  create: () => void
  duplicate: (profile: Profile) => void
  activate: (id: string) => void
}) {
  const { workspace, controller, busy } = useWorkspace()
  const [deleting, setDeleting] = useState<Profile | null>(null)
  if (!workspace) return null
  return (
    <>
      <div className="profiles-toolbar">
        <p>
          {workspace.profiles.length} profils · indépendants, prêts à être
          personnalisés
        </p>
        <Button onClick={create}>
          <Plus size={15} />
          Nouveau profil
        </Button>
      </div>
      <div className="profiles-grid">
        {workspace.profiles.map((profile) => (
          <article
            className={cn(
              "profile-tile",
              profile.id === workspace.activeProfileId && "selected"
            )}
            key={profile.id}
          >
            <div className="profile-tile-top">
              <span className={cn("profile-emblem", profile.color)}>
                {profile.path ? <Folder size={22} /> : <Globe2 size={22} />}
              </span>
              {profile.id === workspace.activeProfileId && (
                <Pill tone="violet">
                  <Check size={11} />
                  Sélectionné
                </Pill>
              )}
            </div>
            <h2>{profile.name}</h2>
            <p>{profile.description || "Un environnement à personnaliser."}</p>
            <div className="profile-meta">
              <Folder size={12} />
              <code>{profile.path || "Configuration globale"}</code>
            </div>
            <div className="profile-tile-stats">
              <span>{profile.resources.length} éléments</span>
              <span>{changesFor(profile).length} changements</span>
              <span className="profile-assistants">
                {(["claude", "codex"] as const)
                  .filter((assistant) =>
                    profile.resources.some((resource) =>
                      resource.targets.includes(assistant)
                    )
                  )
                  .map((assistant) => (
                    <AssistantMark key={assistant} assistant={assistant} />
                  ))}
              </span>
            </div>
            <div className="profile-tile-actions">
              <Button
                variant="outline"
                size="sm"
                onClick={() => activate(profile.id)}
              >
                Ouvrir <ArrowUpRight size={13} />
              </Button>
              <span />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Modifier ${profile.name}`}
                onClick={() => edit(profile)}
              >
                <Pencil size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Dupliquer ${profile.name}`}
                onClick={() => duplicate(profile)}
              >
                <Copy size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Exporter ${profile.name}`}
                onClick={() => {
                  controller.transfer.download(profile)
                  controller.notify("Profil exporté au format JSON.")
                }}
              >
                <Download size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Supprimer le profil ${profile.name}`}
                disabled={workspace.profiles.length === 1}
                onClick={() => setDeleting(profile)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </article>
        ))}
        <button className="new-profile-tile" onClick={create}>
          <span>
            <Plus size={22} />
          </span>
          <strong>Un nouveau contexte ?</strong>
          <p>Créez un profil pour votre prochain projet.</p>
        </button>
      </div>
      <div className="info-banner">
        <Layers size={17} />
        <div>
          <strong>Changer de profil n’applique pas sa configuration.</strong>
          <p>
            Explorez et modifiez vos profils librement. Les changements sont
            appliqués uniquement après votre validation.
          </p>
        </div>
      </div>
      {deleting && (
        <Modal
          title={`Supprimer ${deleting.name} ?`}
          description="Ce profil et son historique seront supprimés d’Agent Switch. Les fichiers des assistants resteront en place."
          onClose={() => setDeleting(null)}
        >
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void controller
                  .run(
                    () => controller.service.deleteProfile(deleting.id),
                    "Profil supprimé."
                  )
                  .then((ok) => {
                    if (ok) setDeleting(null)
                  })
              }}
            >
              Supprimer le profil
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

export function CreateProfileDialog({
  source,
  editing = false,
  onClose,
}: {
  source?: Profile
  editing?: boolean
  onClose: () => void
}) {
  const { controller, busy } = useWorkspace()
  const [name, setName] = useState(
    source ? (editing ? source.name : `${source.name} (copie)`) : ""
  )
  const [description, setDescription] = useState(source?.description ?? "")
  const [path, setPath] = useState(source?.path ?? "")
  const [color, setColor] = useState<ProfileColor>(source?.color ?? "violet")
  return (
    <Modal
      title={
        editing
          ? "Modifier le profil"
          : source
            ? "Dupliquer le profil"
            : "Créer un profil"
      }
      description={
        editing
          ? "Personnalisez les informations de ce profil."
          : source
            ? `Les éléments de ${source.name} seront copiés dans un profil indépendant.`
            : "Un espace indépendant pour vos outils et vos conventions."
      }
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void controller
            .run(
              () =>
                editing && source
                  ? controller.service.editProfile(source.id, {
                      name,
                      description,
                      path,
                      color,
                    })
                  : controller.service.createProfile(
                      { name, description, path, color },
                      source?.id
                    ),
              editing ? "Profil modifié." : "Profil créé."
            )
            .then((ok) => {
              if (ok) onClose()
            })
        }}
      >
        <label className="field-label">
          Nom du profil
          <Input
            required
            autoFocus
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. Mon nouveau projet"
          />
        </label>
        <label className="field-label">
          Description
          <Input
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="À quoi est destiné ce profil ?"
          />
        </label>
        <label className="field-label">
          Dossier du projet <span className="optional">facultatif</span>
          <Input
            maxLength={500}
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="~/projects/mon-projet"
          />
        </label>
        <p className="form-hint">
          Dossier absolu du projet sur la machine qui héberge Agent Switch.
        </p>
        <span className="field-label">Couleur</span>
        <div className="color-options">
          {(["violet", "blue", "amber", "green"] as ProfileColor[]).map(
            (value) => (
              <button
                key={value}
                type="button"
                className={cn("color-choice", value)}
                aria-label={`Couleur ${value}`}
                aria-pressed={value === color}
                onClick={() => setColor(value)}
              >
                {color === value && <Check size={15} />}
              </button>
            )
          )}
        </div>
        <div className="dialog-actions">
          <Button variant="outline" type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy}>
            {editing ? "Enregistrer le profil" : "Créer le profil"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
