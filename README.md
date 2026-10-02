# Agent Switch

Gestionnaire local de configurations Claude Code et Codex : instructions, skills,
serveurs MCP, hooks et profils. L’interface lit les fichiers de la machine qui
héberge le service, et non ceux de l’ordinateur qui ouvre le navigateur.

## Démarrer

Node.js 22.12+ et pnpm 12.8.1 sont requis.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Le développement lance l’API sur `127.0.0.1:4142` et Vite sur
`127.0.0.1:4141`, avec un proxy `/api`. Les ports doivent être libres.

Pour utiliser l’application compilée avec un seul processus :

```bash
pnpm build
pnpm start
```

L’interface et l’API sont alors servies sur `http://127.0.0.1:4141`.
Pour un VPS, écouter explicitement sur son adresse Tailscale :

```bash
AGENT_SWITCH_HOST=100.x.y.z pnpm start
```

Le service permet de modifier les configurations du compte qui l’exécute : son
adresse doit rester accessible uniquement aux personnes autorisées sur votre
réseau privé. Il n’inclut pas de système de comptes multiutilisateur. Les requêtes
API exigent un en-tête dédié et les origines des navigateurs sont vérifiées.

Variables disponibles :

| Variable                                  | Usage                                                        |
| ----------------------------------------- | ------------------------------------------------------------ |
| `AGENT_SWITCH_HOME`                       | Dossier utilisateur à gérer ; défaut : compte courant        |
| `CODEX_HOME`                              | Dossier de configuration Codex ; défaut : `~/.codex`         |
| `CLAUDE_CONFIG_DIR`                       | Dossier de configuration Claude ; défaut : `~/.claude`       |
| `AGENT_SWITCH_HOST` / `AGENT_SWITCH_PORT` | Écoute de la version compilée                                |
| `AGENT_SWITCH_API_PORT`                   | Port de l’API en développement, défaut `4142`                |
| `AGENT_SWITCH_ORIGINS`                    | Origines de navigateur autorisées, séparées par des virgules |
| `AGENT_SWITCH_API_URL`                    | URL du service utilisée par la CLI                           |

En développement via Tailscale, définir `AGENT_SWITCH_ORIGINS` pour l’API et lancer
Vite avec `pnpm --filter @agent-switch/web exec vite --host ADRESSE_TAILSCALE`.
La copie automatique dans le presse-papiers nécessite HTTPS ou localhost.

## Configurations prises en charge

Au premier démarrage, les profils sont construits depuis les fichiers existants.
Aucun profil d’exemple n’est chargé et aucun fichier d’assistant n’est écrit lors
de cette détection. Les projets présents dans `~/projects`, référencés dans les
configurations natives, ou ajoutés via l’import sont inspectés.

| Type         | Claude Code                                                                      | Codex                                                     |
| ------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Instructions | `~/.claude/CLAUDE.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/**/*.md` | `~/.codex/AGENTS.md`, `AGENTS.md`, `AGENTS.override.md`   |
| Skills       | `.claude/skills/**/SKILL.md`                                                     | `.agents/skills/**/SKILL.md`, `.codex/skills/**/SKILL.md` |
| MCP          | `~/.claude.json`, ses entrées de projet et `.mcp.json`                           | Table `mcp_servers` de `config.toml`                      |
| Hooks        | Clé `hooks` de `settings.json` et `settings.local.json`                          | Table `hooks` de `config.toml` et `.codex/hooks.json`     |

Les fichiers globaux et de projet sont distincts. Les profils affichent les
configurations présentes, sans prétendre reproduire toutes les règles de priorité
et d’approbation des assistants. Les configurations administrateur hors du compte,
les contenus des plugins ne sont pas gérés.
Les erreurs de lecture sont visibles dans Réglages. Les liens de fichiers vers une
cible dans le compte sont conservés ; les liens de dossiers de skills sont signalés
et ne sont pas parcourus. Les écritures sont limitées au dossier utilisateur.

Les hooks sont édités dans leur format JSON natif (événements et groupes de
handlers). Agent Switch les configure ; leur exécution appartient à l’assistant.
Le bouton de test MCP effectue une vraie initialisation stdio, HTTP ou SSE, ferme
la connexion et ne lance aucun outil métier. Tester un MCP stdio démarre sa commande.
Les exécutables, paquets et authentifications nécessaires doivent être installés.

Les skills doivent avoir un en-tête YAML contenant `name` et `description`.
L’export inclut leurs fichiers associés, y compris les fichiers binaires et les
permissions d’exécution. Les scripts externes référencés par les hooks et les
paquets des serveurs MCP ne sont pas embarqués.

## Brouillons, sauvegardes et profils

- Les éditions sont enregistrées dans `~/.agent-switch/workspace.json`, avec des
  permissions privées. Les anciens brouillons de démonstration du navigateur ne
  sont jamais importés dans la configuration réelle.
- Sélectionner un profil ne l’applique pas. La revue montre les différences et les
  chemins qui seront écrits ou supprimés avant « Appliquer sur la machine ».
- Les écritures utilisent des fichiers temporaires et des renommages atomiques.
  Les réglages voisins des documents JSON/TOML sont conservés. La mise en forme et
  les commentaires TOML peuvent être normalisés lors de la sérialisation.
- Les fichiers précédents sont sauvegardés dans `~/.agent-switch/backups/`.
  Un journal permet d’annuler une transaction interrompue au prochain démarrage.
  Une erreur d’écriture annule les écritures déjà effectuées.
- Les empreintes des fichiers et les révisions HTTP empêchent d’écraser silencieusement
  une modification externe ou un état périmé d’une autre session.
- « Actualiser depuis le disque » relit les configurations et conserve les brouillons.
  Relire après un conflit permet de comparer le brouillon à la nouvelle version disque.
- L’historique garde 30 révisions par profil, avec un point de restauration avant
  sa première application. Restaurer prépare un brouillon, à appliquer explicitement.
- Supprimer un profil ne supprime pas ses fichiers. Désactiver une ressource retire
  son entrée ou son fichier principal ; les fichiers auxiliaires d’un skill restent
  disponibles pour sa réactivation. Pour un fichier lié, c’est la cible qui est sauvegardée
  et modifiée ; le lien reste en place.
- Un emplacement natif ne peut pas être ciblé par deux ressources activées d’un même
  profil. Pour Codex, éditer l’instruction AGENTS.md existante plutôt qu’en ajouter
  une deuxième sur la même portée.

L’import depuis la machine crée un instantané fidèle sans modifier les fichiers.
L’import JSON crée un profil indépendant à appliquer après revue ; adapter son
chemin de projet à la nouvelle machine (un chemin hors du compte est vidé à l’import). Un export peut contenir les secrets présents
dans les configurations. La limite d’import est de 20 Mo ; chaque fichier de skill
est limité à 5 Mo. Les sauvegardes disque ne sont pas supprimées automatiquement.

## CLI

L’interface et la CLI utilisent la même API et les mêmes cas d’usage. La CLI retrouve
l’adresse du service dans `~/.agent-switch/endpoint.json` ; `--url` la remplace.

```bash
pnpm cli help
pnpm cli profiles
pnpm cli workspace --json
pnpm cli scan
pnpm cli refresh
pnpm cli import-machine --input ./configuration.json
pnpm cli plan --profile machine
pnpm cli apply --profile machine
pnpm cli export --profile machine --output ./profil.json
pnpm cli import --file ./profil.json
pnpm cli mcp-test --file ./serveur.json
pnpm cli run createProfile --input ./arguments.json
```

`run` expose `selectProfile`, `setTheme`, `createProfile`, `editProfile`,
`deleteProfile`, `createResource`, `saveResource`, `deleteResource`, `discard` et
`restore`. Son fichier contient un tableau d’arguments. Par exemple :

```json
[
  {
    "name": "Travail",
    "description": "Mon profil",
    "path": "",
    "color": "blue"
  }
]
```

Pour travailler sans interface graphique, démarrer uniquement l’API :
`pnpm --filter @agent-switch/server exec tsx src/main.ts`.

## Architecture

```text
packages/core/src/   Domaine, validation, cas d’usage et ports indépendants de React/Node
packages/ui/         Composants shadcn/ui partagés
apps/web/src/
  infrastructure/    Client HTTP et transfert JSON du navigateur
  presentation/      Pages React et contrôleur observable
  app/bootstrap.ts   Injection des adaptateurs
apps/server/src/
  machine.ts         Détection, résolution des destinations et préparation des écritures
  files.ts           Primitives de fichiers et vérification des chemins
  store.ts           Persistance, transactions, sauvegardes et historique
  http.ts            Adaptateur HTTP et service des assets compilés
  mcp.ts             Connexion MCP réelle avec fermeture et délai limite
  cli.ts             Adaptateur CLI des mêmes cas d’usage
  main.ts            Composition et verrou d’instance
```

## Vérifier

```bash
pnpm check   # Formatage, lint, types, tests et compilation
pnpm test
```

Les tests couvrent les cas d’usage, l’interface, de vrais fichiers dans des dossiers
isolés, les conflits, les liens symboliques, les sauvegardes et retours arrière,
les imports de skills entre machines, la CLI et un vrai processus MCP de test.
Ils ne modifient pas les configurations du compte courant.

Formats natifs : [configuration Codex](https://learn.chatgpt.com/docs/config-file/config-reference),
[skills Codex](https://learn.chatgpt.com/docs/build-skills),
[réglages Claude Code](https://code.claude.com/docs/en/settings),
[MCP Claude Code](https://code.claude.com/docs/en/mcp).
