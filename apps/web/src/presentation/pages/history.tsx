import { useState } from "react"
import { History, RotateCcw, Check, GitCommitHorizontal } from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import type { Profile, Revision } from "@/domain/workspace"
import { countLabel, savedLabel, dateLabel } from "../config"
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
                  <h2>{savedLabel(item.label)}</h2>
                  {index === 0 && (
                    <Pill tone="green">
                      <Check size={11} />
                      Last applied
                    </Pill>
                  )}
                  <time>{dateLabel(item.date)}</time>
                </div>
                <p>
                  {countLabel(item.count, "change")} ·{" "}
                  {countLabel(item.resources.length, "item")} backed up
                </p>
                <div className="history-card-footer">
                  <span>Applied locally</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRevision(item)}
                  >
                    <RotateCcw size={13} />
                    Restore as draft
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={History}
          title="Your history starts here"
          description="Apply your first configuration to create a backup."
        />
      )}
      {revision && (
        <Modal
          title="Restore this version?"
          description={`The version from ${dateLabel(revision.date)} will replace the current drafts. Review the changes before applying it.`}
          onClose={() => setRevision(null)}
        >
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setRevision(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void controller
                  .run(
                    () => controller.service.restore(profile.id, revision.id),
                    "Version restored as a draft. Review the changes before applying."
                  )
                  .then((ok) => {
                    if (ok) setRevision(null)
                  })
              }}
            >
              Restore draft
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
