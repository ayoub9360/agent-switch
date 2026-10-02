import { useState } from "react"
import {
  Check,
  ArrowRight,
  Search,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { Switch } from "@agent-switch/ui/components/switch"
import type { Assistant, Resource } from "@/domain/workspace"
import { countLabel } from "../config"
import { assistantNames } from "@/domain/workspace"
import { useWorkspace } from "../workspace-context"
import { AssistantMark, Modal, Pill } from "./primitives"

export function OnboardingDialog({ onClose }: { onClose: () => void }) {
  const { controller, busy } = useWorkspace()
  const [step, setStep] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [resources, setResources] = useState<Resource[]>([])
  const [targets, setTargets] = useState<Assistant[]>(["claude", "codex"])
  return (
    <Modal
      title="Bring your configuration together"
      description="Import configurations from the machine running Agent Switch."
      onClose={onClose}
    >
      <div className="onboarding-steps">
        {["Detection", "Selection", "Confirmation"].map((label, index) => (
          <span className={step >= index ? "active" : ""} key={label}>
            <i>{step > index ? <Check size={12} /> : index + 1}</i>
            {label}
          </span>
        ))}
      </div>
      {step === 0 && (
        <div className="onboarding-intro">
          <span className="onboarding-icon">
            <Search size={28} />
          </span>
          <h3>Start with what you already have.</h3>
          <p>
            Agent Switch reads your assistant files to find their instructions,
            skills, MCP servers, and hooks.
          </p>
          <Pill tone="violet">Files on this machine</Pill>
        </div>
      )}
      {step === 1 && (
        <div className="detected-list">
          {(["claude", "codex"] as Assistant[]).map((assistant) => (
            <div className="detected-row" key={assistant}>
              <AssistantMark assistant={assistant} />
              <div>
                <strong>{assistantNames[assistant]}</strong>
                <p>
                  {countLabel(
                    resources.filter((item) => item.targets.includes(assistant))
                      .length,
                    "item"
                  )}{" "}
                  detected
                </p>
              </div>
              <Switch
                aria-label={`Import ${assistantNames[assistant]}`}
                checked={targets.includes(assistant)}
                onCheckedChange={(checked) =>
                  setTargets((current) =>
                    checked
                      ? [...current, assistant]
                      : current.filter((target) => target !== assistant)
                  )
                }
              />
            </div>
          ))}
          <p className="form-hint">
            Shared items are imported only once. Only the selected assistants
            are kept.
          </p>
        </div>
      )}
      {step === 2 && (
        <>
          <div className="information-banner">
            <ShieldCheck size={16} />
            <span>
              Missing detected items are added to the configuration. Your drafts
              are preserved. No files are modified.
            </span>
          </div>
        </>
      )}
      <div className="dialog-actions">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step === 0 ? (
          <Button
            disabled={scanning}
            onClick={() => {
              setScanning(true)
              void controller.discovery.scan().then(
                (items) => {
                  setResources(items)
                  setScanning(false)
                  setStep(1)
                },
                (error: unknown) => {
                  controller.fail(error)
                  setScanning(false)
                }
              )
            }}
          >
            {scanning ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Search size={15} />
            )}{" "}
            {scanning ? "Detection…" : "Detect configuration"}
          </Button>
        ) : step === 1 ? (
          <Button disabled={!targets.length} onClick={() => setStep(2)}>
            Continue <ArrowRight size={14} />
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={() => {
              void controller
                .run(
                  () =>
                    controller.discovery.importDetected({
                      name: "Global configuration",
                      targets,
                    }),
                  "Configuration imported."
                )
                .then((ok) => {
                  if (ok) onClose()
                })
            }}
          >
            Import configuration <ArrowRight size={14} />
          </Button>
        )}
      </div>
    </Modal>
  )
}
