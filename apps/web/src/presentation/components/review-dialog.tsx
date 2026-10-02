import { useEffect, useState } from "react"
import {
  ArrowRight,
  Check,
  ShieldCheck,
  FileCode2,
  RotateCcw,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { Switch } from "@agent-switch/ui/components/switch"
import {
  assistantNames,
  changesFor,
  resourceSummary,
  type Profile,
} from "@/domain/workspace"
import type { PlannedFile } from "@/application/ports"
import { useWorkspace } from "../workspace-context"
import { EmptyState, Modal, Pill } from "./primitives"
import { ContentDiff } from "./content-diff"

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
  const [sharedEditing, setSharedEditing] = useState(false)
  const [plan, setPlan] = useState<PlannedFile[] | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void controller.discovery
      .plan(profile.id, sharedEditing ? "shared" : "local")
      .then(
        (files) => {
          if (active) setPlan(files)
        },
        (error) => {
          if (active)
            setPlanError(
              error instanceof Error
                ? error.message
                : "Unable to prepare changes for application."
            )
        }
      )
    return () => {
      active = false
    }
  }, [controller, profile, sharedEditing])
  return (
    <Modal
      wide
      title="Review changes"
      description={`${changes.length} change${changes.length !== 1 ? "s" : ""} · all assistants`}
      onClose={onClose}
    >
      <div className="information-banner">
        <ShieldCheck size={16} />
        <span>
          Files on this machine will be modified. A backup is created before
          each application.
        </span>
      </div>
      {changes.some(
        (change) =>
          change.kind === "skills" &&
          change.after &&
          (change.before?.content !== change.after.content ||
            JSON.stringify(change.before?.files) !==
              JSON.stringify(change.after.files))
      ) && (
        <label className="field-label">
          <Switch
            aria-label="Edit shared sources"
            checked={sharedEditing}
            disabled={busy}
            onCheckedChange={(checked) => {
              setPlan(null)
              setPlanError(null)
              setSharedEditing(checked)
            }}
          />
          <span>
            Edit shared sources (affects every assistant linked to them)
          </span>
        </label>
      )}
      {planError && (
        <p role="alert" className="form-hint">
          {planError}
        </p>
      )}
      {plan && (
        <div className="diff-list">
          {plan.map((file) => (
            <section className="diff-file" key={file.path}>
              <div className="diff-file-header">
                <FileCode2 size={14} />
                <code>{file.path}</code>
                <Pill tone={file.action === "delete" ? "amber" : "green"}>
                  {file.action === "delete"
                    ? "Delete"
                    : file.action === "isolate-root"
                      ? "Separate folder"
                      : file.action === "copy-skill"
                        ? "Local copy"
                        : file.action === "move-link"
                          ? "Move link"
                          : file.action === "move"
                            ? "Move folder"
                            : "Write"}
                </Pill>
              </div>
              {file.action === "copy-skill" && (
                <p className="form-hint">
                  An independent copy will be created here. The shared source
                  stays unchanged.
                </p>
              )}
              {file.action === "isolate-root" && (
                <p className="form-hint">
                  This assistant gets its own folder. Other skills remain linked
                  to their existing sources. The original folder link is backed
                  up.
                </p>
              )}
              {file.destination && (
                <div className="diff-line">
                  <code>Destination: {file.destination}</code>
                </div>
              )}
              {file.action === "move-link" && (
                <p className="form-hint">
                  Only the discovery link is moved. Its shared contents stay in
                  place.
                </p>
              )}
              {file.sharedTargets && (
                <p className="form-hint">
                  This edits the shared source. All assistants linked to it
                  receive the change, including{" "}
                  {file.sharedTargets
                    .map((target) => assistantNames[target])
                    .join(" and ")}
                  .
                </p>
              )}
            </section>
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
                    ? "Addition"
                    : change.type === "removed"
                      ? "Removal"
                      : "Change"}
                </Pill>
              </div>
              {change.before &&
              change.after &&
              resourceSummary(change.before) ===
                resourceSummary(change.after) ? (
                <div className="diff-line">
                  <code>{resourceSummary(change.after)}</code>
                </div>
              ) : (
                <>
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
                </>
              )}
              {change.before?.content !== change.after?.content && (
                <>
                  <div className="diff-label">Content</div>
                  <ContentDiff
                    before={change.before?.content ?? ""}
                    after={change.after?.content ?? ""}
                  />
                </>
              )}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Check}
          title="Everything is up to date"
          description="There are no changes to apply."
        />
      )}
      {discard && (
        <div className="discard-confirm">
          <p>Discard all drafts for this configuration?</p>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              void controller
                .run(
                  () => controller.service.discard(profile.id),
                  "Drafts discarded."
                )
                .then((ok) => {
                  if (ok) onClose()
                })
            }}
          >
            Confirm discard
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDiscard(false)}>
            Keep
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
          Discard
        </Button>
        <span />
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button
          disabled={!changes.length || busy || !plan || !!planError}
          onClick={() => {
            void controller
              .run(
                () =>
                  controller.service.apply(
                    profile.id,
                    sharedEditing ? "shared" : "local"
                  ),
                "Configuration applied on this machine. Backup created."
              )
              .then((ok) => {
                if (ok) onClose()
              })
          }}
        >
          Apply to this machine <ArrowRight size={14} />
        </Button>
      </div>
    </Modal>
  )
}
