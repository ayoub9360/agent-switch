import { useState } from "react"
import {
  Check,
  ArrowRight,
  Search,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { Input } from "@agent-switch/ui/components/input"
import { Switch } from "@agent-switch/ui/components/switch"
import type { Assistant, Resource } from "@/domain/workspace"
import { assistantNames } from "@/domain/workspace"
import { useWorkspace } from "../workspace-context"
import { AssistantMark, Modal, Pill } from "./primitives"

export function OnboardingDialog({ onClose }: { onClose: () => void }) {
  const { controller, busy } = useWorkspace()
  const [step, setStep] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [resources, setResources] = useState<Resource[]>([])
  const [targets, setTargets] = useState<Assistant[]>(["claude", "codex"])
  const [path, setPath] = useState("")
  const [name, setName] = useState("Configuration importée")
  return (
    <Modal
      title="Retrouvez vos repères"
      description="Importez les configurations présentes sur la machine qui héberge Agent Switch."
      onClose={onClose}
    >
      <div className="onboarding-steps">
        {["Détection", "Sélection", "Profil"].map((label, index) => (
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
          <h3>Tout commence avec l’existant.</h3>
          <p>
            Agent Switch lit les fichiers de vos assistants pour retrouver leurs
            instructions, skills, MCP et hooks.
          </p>
          <Pill tone="violet">Fichiers de la machine</Pill>
          <label className="field-label">
            Dossier du projet (facultatif)
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="Vide pour la configuration globale"
            />
          </label>
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
                  {
                    resources.filter((item) => item.targets.includes(assistant))
                      .length
                  }{" "}
                  éléments détectés
                </p>
              </div>
              <Switch
                aria-label={`Importer ${assistantNames[assistant]}`}
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
            Les éléments partagés sont importés une seule fois. Seuls les
            assistants sélectionnés sont conservés.
          </p>
        </div>
      )}
      {step === 2 && (
        <>
          <label className="field-label">
            Nom de votre profil
            <Input
              autoFocus
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="information-banner">
            <ShieldCheck size={16} />
            <span>
              L’import crée un profil indépendant à partir des fichiers actuels.
              Aucun fichier n’est modifié.
            </span>
          </div>
        </>
      )}
      <div className="dialog-actions">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            Retour
          </Button>
        )}
        {step === 0 ? (
          <Button
            disabled={scanning}
            onClick={() => {
              setScanning(true)
              void controller.discovery.scan(path).then(
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
            {scanning ? "Détection…" : "Détecter la configuration"}
          </Button>
        ) : step === 1 ? (
          <Button disabled={!targets.length} onClick={() => setStep(2)}>
            Continuer <ArrowRight size={14} />
          </Button>
        ) : (
          <Button
            disabled={!name.trim() || busy}
            onClick={() => {
              void controller
                .run(
                  () =>
                    controller.discovery.importDetected({
                      name: name.trim(),
                      path,
                      targets,
                    }),
                  "Configuration importée."
                )
                .then((ok) => {
                  if (ok) onClose()
                })
            }}
          >
            Créer mon profil <ArrowRight size={14} />
          </Button>
        )}
      </div>
    </Modal>
  )
}
