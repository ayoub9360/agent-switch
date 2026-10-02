import {
  FileText,
  Sparkles,
  Plug,
  Workflow,
  LayoutGrid,
  Layers,
  History,
  Settings2,
} from "lucide-react"
import type { ResourceKind } from "@/domain/workspace"
export type Page =
  "overview" | ResourceKind | "profiles" | "history" | "settings"
export const sections = {
  overview: {
    label: "Vue d’ensemble",
    icon: LayoutGrid,
    description: "Vos outils, vos règles. Un environnement qui vous ressemble.",
  },
  instructions: {
    label: "Instructions",
    icon: FileText,
    description: "Donnez le bon contexte à vos assistants.",
  },
  skills: {
    label: "Skills",
    icon: Sparkles,
    description: "Les savoir-faire qui accompagnent votre travail.",
  },
  mcp: {
    label: "Serveurs MCP",
    icon: Plug,
    description: "Connectez vos assistants aux outils dont ils ont besoin.",
  },
  hooks: {
    label: "Hooks",
    icon: Workflow,
    description: "Automatisez les étapes de votre workflow.",
  },
  profiles: {
    label: "Tous les profils",
    icon: Layers,
    description: "Le bon environnement, pour chaque contexte.",
  },
  history: {
    label: "Historique",
    icon: History,
    description: "Retrouvez les configurations appliquées à ce profil.",
  },
  settings: {
    label: "Paramètres",
    icon: Settings2,
    description: "Un espace de travail à votre façon.",
  },
}
export const kinds: ResourceKind[] = ["instructions", "skills", "mcp", "hooks"]
export const kindSingular: Record<ResourceKind, string> = {
  instructions: "instruction",
  skills: "skill",
  mcp: "serveur MCP",
  hooks: "hook",
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}
