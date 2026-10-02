import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Terminal,
  Check,
} from "lucide-react"
import { Button } from "@agent-switch/ui/components/button"
import type { Assistant, Profile, Resource } from "@/domain/workspace"
import { changesFor, assistantNames } from "@/domain/workspace"
import {
  countLabel,
  savedLabel,
  dateLabel,
  kinds,
  sections,
  type Page,
} from "../config"
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
}: {
  profile: Profile
  resources: Resource[]
  navigate: (page: Page) => void
  review: () => void
  edit: (resource: Resource) => void
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
                  <span className="metric-title">
                    <Icon size={16} />
                    {sections[kind].label}
                  </span>
                  <ArrowUpRight size={13} />
                </div>
                <div className="metric-value">
                  {items.filter((item) => item.enabled).length}
                  <span>enabled</span>
                </div>
                <div className="metric-label">
                  {items.length
                    ? `${items.length} total`
                    : `No ${sections[kind].label.toLowerCase()} configured`}
                </div>
              </button>
            )
          })}
        </div>
        {changes.length ? (
          <section className="panel changes-panel">
            <SectionHeading
              title="Pending changes"
              action={
                <Pill tone="amber">{countLabel(changes.length, "change")}</Pill>
              }
            />
            <p className="panel-description">
              Pending changes across all assistants.
            </p>
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
                        ? "Added"
                        : change.type === "removed"
                          ? "Removed"
                          : "Modified"}
                    </span>
                    <ArrowUpRight size={13} />
                  </button>
                )
              })}
            </div>
            <div className="panel-bottom">
              <span>
                <ShieldCheck size={14} />A backup every time you apply changes.
              </span>
              <Button size="sm" onClick={review}>
                Review changes <ArrowRight size={14} />
              </Button>
            </div>
          </section>
        ) : (
          <div className="panel synced-message" role="status">
            <Check size={17} />
            <strong>All changes applied</strong>
            <span>Across all assistants</span>
          </div>
        )}
        <section className="panel">
          <SectionHeading
            title="Your instructions"
            action={
              <TextAction onClick={() => navigate("instructions")}>
                View all
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
                    <span className="instruction-preview-title">
                      <strong>{resource.name}</strong>
                      {resource.targets.map((target) => (
                        <Pill key={target}>{assistantNames[target]}</Pill>
                      ))}
                    </span>
                    <small title={resource.description}>
                      {resource.description.startsWith("/")
                        ? `…/${resource.description.split("/").slice(-2).join("/")}`
                        : resource.description}
                    </small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            {!resources.some((item) => item.kind === "instructions") && (
              <p className="panel-description">
                No instructions for this assistant.
              </p>
            )}
          </div>
        </section>
        <section
          className={`activity-section${profile.history.length ? "" : "activity-empty"}`}
        >
          <SectionHeading
            title="Recent activity"
            action={
              profile.history.length ? (
                <TextAction onClick={() => navigate("history")}>
                  History
                </TextAction>
              ) : (
                <span className="activity-empty-label">No activity yet</span>
              )
            }
          />
          {profile.history[0] ? (
            <div className="activity-row">
              <span className="activity-icon">
                <Check size={14} />
              </span>
              <div>
                <strong>{savedLabel(profile.history[0].label)}</strong>
                <p>
                  {countLabel(profile.history[0].count, "item")} · applied
                  locally
                </p>
              </div>
              <time>{dateLabel(profile.history[0].date)}</time>
            </div>
          ) : null}
        </section>
      </div>
      <aside className="overview-aside">
        <section className="panel assistants-panel">
          <SectionHeading title="Detected assistants" />
          {(["claude", "codex"] as Assistant[]).map((assistant) => {
            const detected = profile.applied.some((item) =>
              item.targets.includes(assistant)
            )
            return (
              <div className="assistant-row" key={assistant}>
                <AssistantMark assistant={assistant} />
                <div>
                  <strong>{assistantNames[assistant]}</strong>
                  <Pill tone={detected ? "green" : "neutral"}>
                    {detected ? "Configuration detected" : "Not detected"}
                  </Pill>
                </div>
              </div>
            )
          })}
          <div className="assistant-row assistant-coming-soon">
            <span className="assistant-mark" aria-hidden="true">
              <Terminal size={17} />
            </span>
            <div>
              <strong>OpenCode</strong>
              <Pill>Coming soon</Pill>
            </div>
          </div>
        </section>
      </aside>
    </div>
  )
}
