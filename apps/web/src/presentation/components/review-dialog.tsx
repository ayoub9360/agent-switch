import { useEffect, useState } from "react"
import {
  ArrowRight,
  Check,
  ShieldCheck,
  FileCode2,
  RotateCcw,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { changesFor, resourceSummary, type Profile } from "@/domain/workspace"
import { useWorkspace } from "../workspace-context"
import { EmptyState, Modal, Pill } from "./primitives"

export function ReviewDialog({
  profile,
  onClose,
}: {
  profile: Profile
  onClose: () => void
}) {
  const changes = changesFor(profile)
  const { controller, busy } = useWorkspace()
  const [discard, setDiscard] = useState(false)
  const [plan, setPlan] = useState<
    { path: string; action: string; bytes: number }[] | null
  >(null)
  const [planError, setPlanError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void controller.discovery.plan(profile.id).then(
      (files) => {
        if (active) setPlan(files)
      },
      (error) => {
        if (active)
          setPlanError(
            error instanceof Error
              ? error.message
              : "Impossible de préparer l’application."
          )
      }
    )
    return () => {
      active = false
    }
  }, [controller, profile])
  return (
    <Modal
      wide
      title="Vérifier les changements"
      description={`${profile.name} · ${changes.length} changement${changes.length > 1 ? "s" : ""} · tous les assistants`}
      onClose={onClose}
    >
      <div className="information-banner">
        <ShieldCheck size={16} />
        <span>
          Les fichiers de la machine seront modifiés. Une sauvegarde est créée
          avant chaque application.
        </span>
      </div>
      {planError && (
        <p role="alert" className="form-hint">
          {planError}
        </p>
      )}
      {plan && (
        <div className="diff-list">
          {plan.map((file) => (
            <div className="diff-file-header" key={file.path}>
              <FileCode2 size={14} />
              <code>{file.path}</code>
              <Pill tone={file.action === "delete" ? "amber" : "green"}>
                {file.action === "delete" ? "Supprimer" : "Écrire"}
              </Pill>
            </div>
          ))}
        </div>
      )}
      {changes.length ? (
        <div className="diff-list">
          {changes.map((change) => (
            <section className="diff-file" key={change.id}>
              <div className="diff-file-header">
                <FileCode2 size={14} />
                <strong>{change.name}</strong>
                <Pill tone={change.type === "added" ? "green" : "amber"}>
                  {change.type === "added"
                    ? "Ajout"
                    : change.type === "removed"
                      ? "Suppression"
                      : "Modification"}
                </Pill>
              </div>
              {change.before && (
                <div className="diff-line removed">
                  <span>−</span>
                  <code>{resourceSummary(change.before)}</code>
                </div>
              )}
              {change.after && (
                <div className="diff-line added">
                  <span>+</span>
                  <code>{resourceSummary(change.after)}</code>
                </div>
              )}
              {change.before?.content !== change.after?.content && (
                <>
                  <div className="diff-label">
                    Contenu {change.type === "updated" && "· avant / après"}
                  </div>
                  {change.before && (
                    <pre className="diff-code removed">
                      {change.before.content}
                    </pre>
                  )}
                  {change.after && (
                    <pre className="diff-code added">
                      {change.after.content}
                    </pre>
                  )}
                </>
              )}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Check}
          title="Tout est à jour"
          description="Il n’y a aucun changement à appliquer."
        />
      )}
      {discard && (
        <div className="discard-confirm">
          <p>Abandonner tous les brouillons de ce profil ?</p>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              void controller
                .run(
                  () => controller.service.discard(profile.id),
                  "Brouillons abandonnés."
                )
                .then((ok) => {
                  if (ok) onClose()
                })
            }}
          >
            Confirmer l’abandon
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDiscard(false)}>
            Conserver
          </Button>
        </div>
      )}
      <div className="review-footer">
        <Button
          variant="ghost"
          size="sm"
          disabled={!changes.length || busy}
          onClick={() => setDiscard(true)}
        >
          <RotateCcw size={13} />
          Abandonner
        </Button>
        <span />
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
        <Button
          disabled={!changes.length || busy || !plan || !!planError}
          onClick={() => {
            void controller
              .run(
                () => controller.service.apply(profile.id),
                "Configuration appliquée sur la machine. Sauvegarde créée."
              )
              .then((ok) => {
                if (ok) onClose()
              })
          }}
        >
          Appliquer sur la machine <ArrowRight size={14} />
        </Button>
      </div>
    </Modal>
  )
}
