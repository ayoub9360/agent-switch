import type {
  Profile,
  Resource,
  ResourceKind,
  Workspace,
} from "@/domain/workspace"

const resource = (
  id: string,
  kind: ResourceKind,
  name: string,
  description: string,
  content: string,
  extra: Partial<Resource> = {}
): Resource => ({
  id,
  kind,
  name,
  description,
  content:
    kind === "hooks"
      ? JSON.stringify({
          PostToolUse: [{ hooks: [{ type: "command", command: content }] }],
        })
      : kind === "skills"
        ? `---\nname: ${id}\ndescription: Test skill\n---\n${content}`
        : content,
  enabled: true,
  targets: ["claude", "codex"],
  scope: "global",
  source: "Created in Agent Switch",
  ...extra,
})

export const testResources: Resource[] = [
  resource(
    "instructions-project",
    "instructions",
    "CLAUDE.md",
    "Architecture, code quality, and contribution conventions.",
    "# Project conventions\n\n## Architecture\n\n- Separate the domain, use cases, and adapters.\n- Keep React components focused on presentation.\n- Use TypeScript in strict mode.\n\n## Quality\n\n- Prefer simple, maintainable solutions.\n- Check lint and types before finishing.\n- Preserve existing changes.\n\n## Communication\n\nRespond in English with concise explanations.",
    {
      source: "~/.claude/CLAUDE.md",
      targets: ["claude"],
      instructionRole: "primary",
    }
  ),
  resource(
    "instructions-git",
    "instructions",
    "git.md",
    "Readable commits, small PRs, and structured reviews.",
    "# Git workflow\n\n- Use Conventional Commits.\n- Keep pull requests focused.\n- Explain the problem, solution, and checks.\n- Never commit secrets.",
    {
      source: "~/.claude/rules/git.md",
      targets: ["claude"],
      instructionRole: "rule",
    }
  ),
  resource(
    "instructions-personal",
    "instructions",
    "AGENTS.md",
    "Language, response style, and collaboration.",
    "# Preferences\n\nRespond in English.\nBe direct and concise.\nExplain your choices when they help clarify the solution.",
    {
      scope: "global",
      source: "~/.codex/AGENTS.md",
      targets: ["codex"],
      instructionRole: "primary",
    }
  ),
  resource(
    "instructions-tests",
    "instructions",
    "Testing strategy",
    "Test behavior, not implementation details.",
    "# Tests\n\nTest use cases and domain boundaries.\nKeep tests independent of the UI framework.",
    { enabled: false, targets: ["claude"], instructionRole: "rule" }
  ),
  resource(
    "skill-frontend",
    "skills",
    "Frontend design",
    "Build polished, accessible, and consistent interfaces.",
    "# Frontend design\n\nCreate interfaces that fit the product.\nUse existing shadcn/ui components.\nCheck empty states, errors, and small screens.",
    { source: "Demo library" }
  ),
  resource(
    "skill-review",
    "skills",
    "Code review",
    "A review focused on reliability and maintainability.",
    "# Code review\n\nExamine changes in behavior.\nIdentify regressions and errors at system boundaries.",
    { targets: ["claude"] }
  ),
  resource(
    "skill-docs",
    "skills",
    "Documentation",
    "Write useful documentation close to the code.",
    "# Documentation\n\nDocument decisions and the commands actually available.\nInclude short examples.",
    { scope: "global" }
  ),
  resource(
    "skill-security",
    "skills",
    "Security review",
    "Review inputs, permissions, and sensitive data.",
    "# Security review\n\nValidate external inputs.\nLimit permissions to what each operation needs.",
    { enabled: false, targets: ["codex"] }
  ),
  resource(
    "mcp-github",
    "mcp",
    "GitHub",
    "Repositories, issues, and pull requests in one place.",
    JSON.stringify(
      {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
      },
      null,
      2
    ),
    { source: "Imported configuration (demo)" }
  ),
  resource(
    "mcp-context",
    "mcp",
    "Context7",
    "Library documentation within your assistant’s reach.",
    JSON.stringify(
      { command: "npx", args: ["-y", "@upstash/context7-mcp"] },
      null,
      2
    )
  ),
  resource(
    "mcp-browser",
    "mcp",
    "Playwright",
    "Inspect and verify interfaces in the browser.",
    JSON.stringify(
      { command: "npx", args: ["-y", "@playwright/mcp@latest"] },
      null,
      2
    ),
    { enabled: false, targets: ["claude"] }
  ),
  resource(
    "hook-format",
    "hooks",
    "Format after editing",
    "PostToolUse · Apply formatting conventions.",
    "pnpm format",
    { targets: ["claude"], source: "PostToolUse" }
  ),
  resource(
    "hook-check",
    "hooks",
    "Check at task completion",
    "Stop · Check types before finishing.",
    "pnpm typecheck",
    { targets: ["claude"], source: "Stop" }
  ),
]

export function createTestWorkspace(): Workspace {
  const applied = structuredClone(testResources)
  const draft = structuredClone(applied)
  draft[0]!.content += "\n\n## Interface\n\nPrefer a compact and accessible UI."
  draft.find((item) => item.id === "mcp-context")!.enabled = false
  draft.push(
    resource(
      "skill-hexagonal",
      "skills",
      "Hexagonal architecture",
      "Isolate business logic behind ports and adapters.",
      "# Hexagonal architecture\n\nThe domain does not depend on any framework.\nPorts describe use case requirements.\nAdapters implement inputs and outputs."
    )
  )
  const history = [
    {
      id: "revision-initial",
      date: "2026-10-02T09:30:00.000Z",
      label: "Initial configuration",
      count: applied.length,
      resources: structuredClone(applied),
    },
  ]
  const atlas: Profile = {
    id: "atlas",
    name: "Atlas project",
    description: "The Atlas project workspace.",
    path: "",
    color: "violet",
    resources: draft,
    applied,
    history,
  }
  return {
    version: 1,
    activeProfileId: "atlas",
    theme: "dark",
    profiles: [atlas],
  }
}
