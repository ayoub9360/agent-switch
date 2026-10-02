import { useState } from "react"
import { History, RotateCcw, Check, GitCommitHorizontal } from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import type { Profile, Revision } from "@/domain/workspace"
import { dateLabel } from "../config"
import { useWorkspace } from "../workspace-context"
import { EmptyState, Modal, Pill } from "../components/primitives"

export function HistoryPage({ profile }: { profile: Profile }) {
  const { controller, busy } = useWorkspace()
  const [revision, setRevision] = useState<Revision | null>(null)
  return (
    <>
      {profile.history.length ? (
        <div className="history-list">
          {profile.history.map((item, index) => (
            <article className="history-entry" key={item.id}>
              <div className="history-track">
                <span>
                  <GitCommitHorizontal size={18} />
                </span>
              </div>
              <div className="history-card">
                <div className="history-card-header">
                  <h2>{item.label}</h2>
                  {index === 0 && (
                    <Pill tone="green">
                      <Check size={11} />
                      Dernière application
                    </Pill>
                  )}
                  <time>{dateLabel(item.date)}</time>
                </div>
                <p>
                  {item.count} changements · {item.resources.length} éléments
                  sauvegardés · {profile.name}
                </p>
                <div className="history-card-footer">
                  <span>Application locale</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRevision(item)}
                  >
                    <RotateCcw size={13} />
                    Restaurer en brouillon
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={History}
          title="L’histoire commence ici"
          description="Appliquez une première configuration pour créer une sauvegarde."
        />
      )}
      {revision && (
        <Modal
          title="Restaurer cette version ?"
          description={`La version du ${dateLabel(revision.date)} remplacera les brouillons actuels. Vérifiez ensuite les changements avant de l’appliquer.`}
          onClose={() => setRevision(null)}
        >
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setRevision(null)}>
              Annuler
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void controller
                  .run(
                    () => controller.service.restore(profile.id, revision.id),
                    "Version restaurée en brouillon. Vérifiez les changements avant application."
                  )
                  .then((ok) => {
                    if (ok) setRevision(null)
                  })
              }}
            >
              Restaurer le brouillon
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
