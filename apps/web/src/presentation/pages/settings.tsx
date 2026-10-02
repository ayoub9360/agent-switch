import {
  Moon,
  Sun,
  Download,
  Upload,
  Server,
  Monitor,
  ArrowUpRight,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import { cn } from "@agent-switch/ui/lib/utils"
import type { Profile } from "@/domain/workspace"
import { useWorkspace } from "../workspace-context"
import { Pill, SectionHeading } from "../components/primitives"

export function SettingsPage({
  profile,
  importFile,
  onboarding,
}: {
  profile: Profile
  importFile: () => void
  onboarding: () => void
}) {
  const { workspace, controller } = useWorkspace()
  return (
    <div className="settings-page">
      <section className="panel">
        <SectionHeading
          title="Machine connectée"
          description={`${workspace?.machine?.hostname ?? "Service local"} · ${workspace?.machine?.home ?? ""}`}
        />
        <div className="settings-row">
          <div>
            <strong>Configuration sur disque</strong>
            <p>
              Dernière lecture :{" "}
              {workspace?.machine?.scannedAt
                ? new Date(workspace.machine.scannedAt).toLocaleString("fr-FR")
                : "—"}
              . Actualisez après une modification externe.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void controller.run(
                () => controller.discovery.refresh(),
                "Configuration relue sur disque."
              )
            }}
          >
            Actualiser depuis le disque
          </Button>
        </div>
        {workspace?.machine?.warnings.map((warning) => (
          <p className="form-hint" key={warning}>
            {warning}
          </p>
        ))}
      </section>

      <section className="panel">
        <SectionHeading
          title="Apparence"
          description="Un thème confortable pour votre espace de travail."
        />
        <div className="theme-options">
          {(["dark", "light"] as const).map((theme) => (
            <button
              key={theme}
              className={cn(
                "theme-option",
                workspace?.theme === theme && "selected"
              )}
              aria-pressed={workspace?.theme === theme}
              onClick={() => {
                void controller.run(() => controller.service.setTheme(theme))
              }}
            >
              <div className={`theme-thumbnail ${theme}`}>
                <span />
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <span>
                {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}{" "}
                {theme === "dark" ? "Sombre" : "Clair"}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <SectionHeading
          title="Emporter votre profil"
          description="Un fichier JSON pour retrouver votre configuration sur une autre machine."
        />
        <div className="settings-row">
          <div>
            <strong>Exporter {profile.name}</strong>
            <p>
              Inclut les contenus, fichiers des skills et chemins. Cet export
              peut contenir les secrets présents dans vos configurations.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => controller.transfer.download(profile)}
          >
            <Download size={14} />
            Exporter
          </Button>
        </div>
        <div className="settings-row">
          <div>
            <strong>Importer un profil</strong>
            <p>
              Un nouveau profil est créé, sans remplacer les profils existants.
            </p>
          </div>
          <Button variant="outline" onClick={importFile}>
            <Upload size={14} />
            Importer
          </Button>
        </div>
      </section>
      <section className="panel">
        <SectionHeading
          title="À propos de cette version"
          action={<Pill tone="violet">Local · v0.1.0</Pill>}
        />
        <div className="settings-row">
          <div>
            <strong>
              <Server size={15} />
              Service local
            </strong>
            <p>
              Les profils sont conservés sur la machine. L’application écrit les
              fichiers des assistants et sauvegarde leur état précédent.
            </p>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>
              <Monitor size={15} />
              Importer depuis la machine
            </strong>
            <p>Détectez vos instructions, skills, MCP et hooks existants.</p>
          </div>
          <Button variant="outline" onClick={onboarding}>
            Ouvrir <ArrowUpRight size={14} />
          </Button>
        </div>
      </section>
    </div>
  )
}
