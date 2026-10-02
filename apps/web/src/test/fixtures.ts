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
  scope: "project",
  source: "Créé dans Agent Switch",
  ...extra,
})

export const testResources: Resource[] = [
  resource(
    "instructions-project",
    "instructions",
    "Conventions du projet",
    "Architecture, qualité du code et conventions de contribution.",
    "# Conventions du projet\n\n## Architecture\n\n- Séparer le domaine, les cas d’usage et les adaptateurs.\n- Garder les composants React centrés sur la présentation.\n- Utiliser TypeScript en mode strict.\n\n## Qualité\n\n- Préférer les solutions simples et maintenables.\n- Vérifier le lint et les types avant de terminer.\n- Préserver les modifications existantes.\n\n## Communication\n\nRépondre en français, avec des explications concises.",
    { source: "AGENTS.md" }
  ),
  resource(
    "instructions-git",
    "instructions",
    "Workflow Git",
    "Commits lisibles, petites PR et revues structurées.",
    "# Workflow Git\n\n- Utiliser les Conventional Commits.\n- Garder les pull requests ciblées.\n- Expliquer le problème, la solution et les vérifications.\n- Ne jamais versionner de secrets.",
    { source: "instructions/git.md" }
  ),
  resource(
    "instructions-personal",
    "instructions",
    "Préférences personnelles",
    "Langue, style de réponse et collaboration.",
    "# Préférences\n\nRéponds en français.\nSois direct et concis.\nExplique tes choix lorsqu’ils aident à comprendre la solution.",
    { scope: "global", source: "Profil professionnel" }
  ),
  resource(
    "instructions-tests",
    "instructions",
    "Stratégie de tests",
    "Tester les comportements, pas les détails d’implémentation.",
    "# Tests\n\nTester les cas d’usage et les limites du domaine.\nGarder les tests indépendants du framework UI.",
    { enabled: false }
  ),
  resource(
    "skill-frontend",
    "skills",
    "Frontend design",
    "Construire des interfaces soignées, accessibles et cohérentes.",
    "# Frontend design\n\nCréer des interfaces adaptées au produit.\nUtiliser les composants shadcn/ui existants.\nVérifier les états vides, les erreurs et les petits écrans.",
    { source: "Bibliothèque de démonstration" }
  ),
  resource(
    "skill-review",
    "skills",
    "Code review",
    "Une revue ciblée sur la fiabilité et la maintenabilité.",
    "# Code review\n\nExaminer les changements de comportement.\nRepérer les régressions et les erreurs aux frontières du système.",
    { targets: ["claude"] }
  ),
  resource(
    "skill-docs",
    "skills",
    "Documentation",
    "Rédiger une documentation utile et proche du code.",
    "# Documentation\n\nDocumenter les décisions et les commandes réellement disponibles.\nInclure des exemples courts.",
    { scope: "global" }
  ),
  resource(
    "skill-security",
    "skills",
    "Security review",
    "Vérifier les entrées, les permissions et les données sensibles.",
    "# Security review\n\nValider les entrées externes.\nLimiter les droits au besoin de chaque opération.",
    { enabled: false, targets: ["codex"] }
  ),
  resource(
    "mcp-github",
    "mcp",
    "GitHub",
    "Dépôts, issues et pull requests au même endroit.",
    JSON.stringify(
      {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
      },
      null,
      2
    ),
    { source: "Configuration importée (démo)" }
  ),
  resource(
    "mcp-context",
    "mcp",
    "Context7",
    "La documentation des bibliothèques, à portée de l’assistant.",
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
    "Inspecter et vérifier les interfaces dans le navigateur.",
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
    "Formater après modification",
    "PostToolUse · Appliquer les conventions de formatage.",
    "pnpm format",
    { targets: ["claude"], source: "PostToolUse" }
  ),
  resource(
    "hook-check",
    "hooks",
    "Vérifier en fin de tâche",
    "Stop · Contrôler les types avant de terminer.",
    "pnpm typecheck",
    { targets: ["claude"], source: "Stop" }
  ),
]

export function createTestWorkspace(): Workspace {
  const applied = structuredClone(testResources)
  const draft = structuredClone(applied)
  draft[0]!.content +=
    "\n\n## Interface\n\nPrivilégier une UI compacte et accessible."
  draft.find((item) => item.id === "mcp-context")!.enabled = false
  draft.push(
    resource(
      "skill-hexagonal",
      "skills",
      "Architecture hexagonale",
      "Isoler le métier derrière des ports et des adaptateurs.",
      "# Architecture hexagonale\n\nLe domaine ne dépend d’aucun framework.\nLes ports décrivent les besoins des cas d’usage.\nLes adaptateurs implémentent les entrées et sorties."
    )
  )
  const history = [
    {
      id: "revision-initial",
      date: "2026-10-02T09:30:00.000Z",
      label: "Configuration initiale",
      count: applied.length,
      resources: structuredClone(applied),
    },
  ]
  const atlas: Profile = {
    id: "atlas",
    name: "Projet Atlas",
    description: "L’environnement de travail du projet Atlas.",
    path: "~/projects/atlas",
    color: "violet",
    resources: draft,
    applied,
    history,
  }
  const personal = structuredClone(
    testResources.filter((item) =>
      ["instructions-personal", "skill-frontend", "mcp-github"].includes(
        item.id
      )
    )
  )
  const pro = structuredClone(
    testResources.filter((item) =>
      [
        "instructions-personal",
        "instructions-git",
        "skill-review",
        "mcp-github",
        "mcp-context",
      ].includes(item.id)
    )
  )
  return {
    version: 1,
    activeProfileId: "atlas",
    theme: "dark",
    profiles: [
      atlas,
      {
        id: "professional",
        name: "Professionnel",
        description: "Mes conventions et outils pour le travail.",
        path: "",
        color: "blue",
        resources: pro,
        applied: structuredClone(pro),
        history: [],
      },
      {
        id: "personal",
        name: "Personnel",
        description: "Un espace pour explorer et expérimenter.",
        path: "",
        color: "amber",
        resources: personal,
        applied: structuredClone(personal),
        history: [],
      },
    ],
  }
}
