import {
  ArrowUpRight,
  ArrowRight,
  Folder,
  GitBranch,
  ShieldCheck,
  Clock3,
  Terminal,
  Check,
  CircleDot,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import type { Assistant, Profile, Resource } from "@/domain/workspace"
import { changesFor, assistantNames } from "@/domain/workspace"
import { dateLabel, kinds, sections, type Page } from "../config"
import {
  AssistantMark,
  Pill,
  SectionHeading,
  TextAction,
} from "../components/primitives"

export function Overview({
  profile,
  resources,
  navigate,
  review,
  edit,
  onboarding,
}: {
  profile: Profile
  resources: Resource[]
  navigate: (page: Page) => void
  review: () => void
  edit: (resource: Resource) => void
  onboarding: () => void
}) {
  const changes = changesFor(profile)
  return (
    <div className="overview-grid">
      <div className="overview-main">
        <div className="metrics-grid">
          {kinds.map((kind) => {
            const Icon = sections[kind].icon
            const items = resources.filter((item) => item.kind === kind)
            return (
              <button
                className="metric"
                key={kind}
                onClick={() => navigate(kind)}
              >
                <div className="metric-top">
                  <Icon size={17} />
                  <ArrowUpRight size={13} />
                </div>
                <div className="metric-value">
                  {items.filter((item) => item.enabled).length}
                  <span>/ {items.length}</span>
                </div>
                <div className="metric-label">
                  {sections[kind].label}
                  <span>actifs</span>
                </div>
              </button>
            )
          })}
        </div>
        <section className="panel changes-panel">
          <SectionHeading
            title="Changements en attente"
            action={
              <Pill tone={changes.length ? "amber" : "green"}>
                {changes.length ? `${changes.length} changements` : "À jour"}
              </Pill>
            }
          />
          <p className="panel-description">
            Brouillons de ce profil, pour tous les assistants.
          </p>
          {changes.length ? (
            <>
              <div className="change-list">
                {changes.slice(0, 3).map((change) => {
                  const Icon = sections[change.kind].icon
                  return (
                    <button
                      className="change-row"
                      key={change.id}
                      onClick={review}
                    >
                      <span className={`change-symbol ${change.type}`}>
                        {change.type === "added"
                          ? "+"
                          : change.type === "removed"
                            ? "−"
                            : "~"}
                      </span>
                      <Icon size={15} />
                      <strong>{change.name}</strong>
                      <span>
                        {change.type === "added"
                          ? "Ajouté"
                          : change.type === "removed"
                            ? "Supprimé"
                            : "Modifié"}
                      </span>
                      <ArrowUpRight size={13} />
                    </button>
                  )
                })}
              </div>
              <div className="panel-bottom">
                <span>
                  <ShieldCheck size={14} />
                  Une sauvegarde à chaque application.
                </span>
                <Button size="sm" onClick={review}>
                  Vérifier les changements <ArrowRight size={14} />
                </Button>
              </div>
            </>
          ) : (
            <div className="synced-message">
              <Check size={20} />
              <div>
                <strong>Aucun changement en attente.</strong>
                <p>Les prochaines modifications apparaîtront ici.</p>
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <SectionHeading
            title="Vos instructions"
            action={
              <TextAction onClick={() => navigate("instructions")}>
                Tout voir
              </TextAction>
            }
          />
          <div className="instruction-preview-list">
            {resources
              .filter((item) => item.kind === "instructions")
              .slice(0, 3)
              .map((resource) => (
                <button
                  className="instruction-preview"
                  key={resource.id}
                  onClick={() => edit(resource)}
                >
                  <span className="resource-icon">
                    <sections.instructions.icon size={17} />
                  </span>
                  <span>
                    <strong>{resource.name}</strong>
                    <small>{resource.description}</small>
                  </span>
                  <Pill>
                    {resource.scope === "global" ? "Global" : "Projet"}
                  </Pill>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            {!resources.some((item) => item.kind === "instructions") && (
              <p className="panel-description">
                Aucune instruction pour cet assistant.
              </p>
            )}
          </div>
        </section>
        <section className="activity-section">
          <SectionHeading
            title="Dernière activité"
            action={
              <TextAction onClick={() => navigate("history")}>
                Historique
              </TextAction>
            }
          />
          {profile.history[0] ? (
            <div className="activity-row">
              <span className="activity-icon">
                <Check size={14} />
              </span>
              <div>
                <strong>{profile.history[0].label}</strong>
                <p>{profile.history[0].count} éléments · application locale</p>
              </div>
              <time>{dateLabel(profile.history[0].date)}</time>
            </div>
          ) : (
            <p className="panel-description">
              Les applications de ce profil apparaîtront ici.
            </p>
          )}
        </section>
      </div>
      <aside className="overview-aside">
        <section className="profile-card">
          <div className="eyebrow">PROFIL SÉLECTIONNÉ</div>
          <div className={`profile-emblem ${profile.color}`}>
            <Folder size={22} />
          </div>
          <h2>{profile.name}</h2>
          <p>{profile.description}</p>
          <div className="profile-meta">
            <Folder size={13} />
            <code>{profile.path || "Configuration globale"}</code>
          </div>
          <div className="profile-meta">
            <GitBranch size={13} />
            <span>{profile.path ? "Portée projet" : "Portée globale"}</span>
          </div>
          <div className="profile-card-footer">
            <span className="status-dot" />
            Profil enregistré
            <TextAction onClick={() => navigate("profiles")}>Gérer</TextAction>
          </div>
        </section>
        <section className="panel assistants-panel">
          <SectionHeading title="Assistants ciblés" />
          {(["claude", "codex"] as Assistant[]).map((assistant) => {
            const count = profile.resources.filter(
              (item) => item.enabled && item.targets.includes(assistant)
            ).length
            return (
              <div className="assistant-row" key={assistant}>
                <AssistantMark assistant={assistant} />
                <div>
                  <strong>{assistantNames[assistant]}</strong>
                  <small>{count} éléments actifs</small>
                </div>
                <CircleDot size={13} />
              </div>
            )
          })}
          <div className="subtle-caption">
            Configurations présentes dans le profil.
          </div>
        </section>
        <button className="import-callout" onClick={onboarding}>
          <span className="import-callout-icon">
            <Terminal size={17} />
          </span>
          <strong>Votre configuration, réunie.</strong>
          <p>Retrouvez les configurations présentes sur cette machine.</p>
          <span>
            Explorer l’import <ArrowRight size={14} />
          </span>
        </button>
        <div className="local-caption">
          <Clock3 size={13} />
          Sauvegardé sur la machine
        </div>
      </aside>
    </div>
  )
}
