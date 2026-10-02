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
          title="Connected machine"
          description={`${workspace?.machine?.hostname ?? "Local service"} · ${workspace?.machine?.home ?? ""}`}
        />
        <div className="settings-row">
          <div>
            <strong>Configuration on disk</strong>
            <p>
              Last read:{" "}
              {workspace?.machine?.scannedAt
                ? new Date(workspace.machine.scannedAt).toLocaleString("en-US")
                : "—"}
              . Refresh after external changes.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void controller.run(
                () => controller.discovery.refresh(),
                "Configuration reloaded from disk."
              )
            }}
          >
            Refresh from disk
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
          title="Appearance"
          description="A comfortable theme for your workspace."
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
                {theme === "dark" ? "Dark" : "Light"}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <SectionHeading
          title="Take your configuration with you"
          description="A JSON file to transfer your configuration to another machine."
        />
        <div className="settings-row">
          <div>
            <strong>Export configuration</strong>
            <p>
              Includes content, skill files, and paths. This export may contain
              secrets from your configurations.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => controller.transfer.download(profile)}
          >
            <Download size={14} />
            Export
          </Button>
        </div>
        <div className="settings-row">
          <div>
            <strong>Import a configuration</strong>
            <p>
              Items are merged into the draft, then reviewed before being
              applied.
            </p>
          </div>
          <Button variant="outline" onClick={importFile}>
            <Upload size={14} />
            Import
          </Button>
        </div>
      </section>
      <section className="panel">
        <SectionHeading
          title="About this version"
          action={<Pill tone="violet">Local · v0.1.0</Pill>}
        />
        <div className="settings-row">
          <div>
            <strong>
              <Server size={15} />
              Local service
            </strong>
            <p>
              Configuration is stored on this machine. The app writes assistant
              files and backs up their previous state.
            </p>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>
              <Monitor size={15} />
              Import from this machine
            </strong>
            <p>
              Detect your existing instructions, skills, MCP servers, and hooks.
            </p>
          </div>
          <Button variant="outline" onClick={onboarding}>
            Open <ArrowUpRight size={14} />
          </Button>
        </div>
      </section>
    </div>
  )
}
