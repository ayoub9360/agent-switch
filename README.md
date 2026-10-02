# Agent Switch

Gestionnaire local de configurations pour assistants IA : instructions, skills,
serveurs MCP, hooks et profils.

## État du projet

Le dépôt contient le socle de l’interface web. La gestion des configurations,
l’onboarding, l’import/export, le serveur local et la CLI métier restent à implémenter.
Aucune configuration d’assistant n’est lue ou modifiée à ce stade.

## Prérequis

- Node.js 22.12 ou supérieur (version de référence dans `.node-version`).
- pnpm 12.8.1, fixé dans `package.json`.

## Développement

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Interface : http://127.0.0.1:4141. Le serveur de développement écoute uniquement
sur la boucle locale et échoue si le port est déjà utilisé.

Depuis un autre ordinateur, ouvrir un tunnel vers le VPS :

```bash
ssh -L 4141:127.0.0.1:4141 utilisateur@vps
```

Ouvrir ensuite http://127.0.0.1:4141 dans le navigateur de cet ordinateur.

## Structure

```text
apps/web/       Interface React et Vite
packages/ui/    Composants shadcn/ui, utilitaires et styles Tailwind partagés
```

Les workspaces utilisent le préfixe `@agent-switch/`. Turborepo orchestre les commandes.
Le futur moteur métier sera partagé par la CLI et l’API locale ; la logique métier
ne doit pas être placée dans les composants d’interface.

## Vérifications

```bash
pnpm check         # Formatage, lint, TypeScript et compilation
pnpm format        # Appliquer le formatage
pnpm build         # Compiler dans apps/web/dist
pnpm --filter @agent-switch/web preview
```

`preview` permet d’inspecter la compilation ; ce n’est pas le futur serveur applicatif.

## Composants UI

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Les composants partagés vont dans `packages/ui/src/components`. Les fichiers
`components.json` définissent leurs alias. La police Geist est incluse localement.

## Données locales

Ne pas versionner de secrets, de fichiers `.env` ou de configurations personnelles.
Les données applicatives locales et les artefacts de compilation sont ignorés par Git.
