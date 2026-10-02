# Agent Switch

Gestionnaire local de configurations Claude Code et Codex : instructions, skills,
serveurs MCP et hooks. L’interface lit les fichiers de la machine qui
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

Au premier démarrage, la configuration est construite à partir de la configuration globale
existante. Les dossiers et les configurations des dépôts ne sont ni détectés ni
gérés. Les éventuelles entrées `projects` des documents natifs sont conservées.

| Type         | Claude Code                                      | Codex                                                            |
| ------------ | ------------------------------------------------ | ---------------------------------------------------------------- |
| Instructions | `~/.claude/CLAUDE.md`, `~/.claude/rules/**/*.md` | `~/.codex/AGENTS.md`, `~/.codex/AGENTS.override.md`              |
| Skills       | `~/.claude/skills/**/SKILL.md`                   | `~/.agents/skills/**/SKILL.md`, `~/.codex/skills/**/SKILL.md`    |
| MCP          | `mcpServers` à la racine de `~/.claude.json`     | Table `mcp_servers` de `~/.codex/config.toml`                    |
| Hooks        | Clé `hooks` de `~/.claude/settings.json`         | Table `hooks` de `~/.codex/config.toml` et `~/.codex/hooks.json` |

Agent Switch gère une seule configuration globale. Il n’y a ni création, ni
sélection, ni duplication de profils. Les anciens profils sont archivés dans
`~/.agent-switch/backups/before-single-configuration-*.json` ; la configuration
sélectionnée et son brouillon sont conservés, sans écrire dans les assistants.
Le conteneur `profiles` reste interne au format v1 et contient exactement une entrée.

Un skill est une ressource globale : sa fiche permet de choisir tous les assistants,
un seul ou aucun. Agent Switch synchronise son contenu et ses fichiers avec les
assistants choisis. Les copies identiques détectées chez plusieurs assistants sont
regroupées ; les versions différentes restent séparées avec un avertissement.
Les emplacements d’origine sont conservés en interne, sans définir l’identité visible du skill.
`agents/openai.yaml` est conservé dans les données globales et distribué uniquement
à Codex. Les autres fichiers (scripts, références, assets et fichiers auxiliaires)
sont partagés. Les anciennes copies de ce YAML chez Claude sont retirées avec
sauvegarde lors de la prochaine application d’un changement sur le skill.

Désactiver un skill puis appliquer déplace son dossier complet dans
`~/.agent-switch/disabled-skills/<identifiant-emplacement>/`. Il reste visible et
modifiable dans la bibliothèque. Réactiver puis appliquer restaure le dossier à son
emplacement initial. Fichiers annexes, permissions, dossiers vides et liens sont
conservés. Les skills retirés de la configuration sont également mis de côté.
Un conflit avec un dossier existant bloque la restauration sans l’écraser.
Les déplacements font partie de la transaction récupérable au redémarrage.

La migration archive l’ancien état dans `~/.agent-switch/backups/before-global-only-*.json`
avant de retirer les anciens profils de dépôts de l’interface. Aucun fichier de
ces dépôts n’est modifié. Les exports de profils de projet sont refusés ; les
champs de compatibilité du format v1 restent fixés à `path: ""` et `scope: "global"`.

Les configurations administrateur hors du compte et les contenus des plugins ne
sont pas gérés. Les erreurs de lecture sont visibles dans Paramètres. Les liens
de fichiers vers une cible dans le compte sont conservés, même si leur cible est
dans un dépôt ; les liens de dossiers de skills sont signalés et non parcourus.
Les écritures sont limitées au dossier utilisateur.

Les hooks sont édités dans leur format JSON natif (événements et groupes de
handlers). Agent Switch les configure ; leur exécution appartient à l’assistant.
Le bouton de test MCP effectue une vraie initialisation stdio, HTTP ou SSE, ferme
la connexion et ne lance aucun outil métier. Tester un MCP stdio démarre sa commande.
Les exécutables, paquets et authentifications nécessaires doivent être installés.

Les skills doivent avoir un en-tête YAML contenant `name` et `description`.
L’export inclut leurs fichiers associés, y compris les fichiers binaires et les
permissions d’exécution. Les scripts externes référencés par les hooks et les
paquets des serveurs MCP ne sont pas embarqués.

## Instructions par assistant

La page Instructions présente un onglet Claude Code et un onglet Codex. Chaque
assistant garde ses propres fichiers. Le fichier principal est `CLAUDE.md` pour
Claude et `AGENTS.md` pour Codex, sous leurs répertoires configurés (y compris
`CLAUDE_CONFIG_DIR` et `CODEX_HOME`). Les règles Claude et les overrides Codex
existants apparaissent séparément. Un override Codex non vide remplace le fichier
principal ; l’interface distingue son état sur disque du brouillon.

L’éditeur propose une édition Markdown et un aperçu. Les fichiers principaux
n’ont ni nom libre, ni sélecteur de fournisseurs, ni interrupteur d’activation.
Les liens symboliques restent en place, avec leur cible visible dans les détails.
Un fichier manquant est créé au bon emplacement après revue et application.

« Copy to… » permet d’ajouter le contenu à la fin des instructions de l’autre
assistant ou de le remplacer. Le résultat est comparé au texte existant et reste
modifiable avant d’être enregistré comme brouillon. Cette copie ne crée aucune
synchronisation permanente. Les imports, chemins et commandes propres à un assistant
ne sont pas convertis automatiquement. Les règles supplémentaires de Claude sont
créées dans `rules/` ; un override existant peut être vidé ou retiré pour rétablir
les instructions principales de Codex.

## Brouillons et sauvegardes

- Les éditions sont enregistrées dans `~/.agent-switch/workspace.json`, avec des
  permissions privées. Les anciens brouillons de démonstration du navigateur ne
  sont jamais importés dans la configuration réelle.
- Les éditions restent des brouillons jusqu’à « Appliquer sur la machine ».
  La commande `plan` expose les écritures, suppressions et déplacements prévus.
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
- L’historique garde 30 révisions, avec un point de restauration avant
  sa première application. Restaurer prépare un brouillon, à appliquer explicitement.
- Désactiver un skill déplace son dossier complet. Pour les autres ressources,
  la désactivation retire l’entrée native ou le fichier principal. Pour un fichier
  lié, sa cible est sauvegardée et modifiée ; le lien reste en place.
- Un emplacement natif ne peut pas être ciblé par deux ressources activées.
  Pour Codex, modifier l’instruction AGENTS.md existante plutôt qu’en ajouter une deuxième.

L’import depuis la machine ajoute les éléments détectés manquants et conserve les brouillons.
L’import JSON fusionne les éléments dans le brouillon global, à appliquer après revue.
Les éléments de même nom, type et assistants (même nom pour les skills) sont mis à jour.

Un export peut contenir les secrets présents
dans les configurations. La limite d’import est de 20 Mo ; chaque fichier de skill
est limité à 5 Mo. Les sauvegardes disque ne sont pas supprimées automatiquement.

## CLI

L’interface et la CLI utilisent la même API et les mêmes cas d’usage. La CLI retrouve
l’adresse du service dans `~/.agent-switch/endpoint.json` ; `--url` la remplace.

```bash
pnpm cli help
pnpm cli workspace --json
pnpm cli scan
pnpm cli refresh
pnpm cli import-machine --input ./configuration.json
pnpm cli plan
pnpm cli apply
pnpm cli export --output ./configuration.json
pnpm cli import --file ./configuration.json
pnpm cli mcp-test --file ./serveur.json
pnpm cli run deleteResource --input ./arguments.json
```

`run` expose `setTheme`, `createResource`, `saveResource`, `deleteResource`, `saveInstruction`, `copyInstructions`,
`discard` et `restore`. Son fichier contient les arguments de la méthode sans
identifiant de profil. Par exemple, pour `deleteResource` :

```json
["identifiant-de-la-ressource"]
```

Pour `import-machine`, le fichier contient `{"targets":["claude","codex"]}`.

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

Exemples de tableaux d’arguments CLI pour les instructions :

- `saveInstruction` : `["claude", "# Mes instructions"]` (fichier principal) ou
  `["codex", "# Override modifié", "identifiant-du-fichier"]` (fichier existant).
- `copyInstructions` : `["identifiant-source", "codex", "append"]` ou `"replace"`
  comme troisième argument ; un quatrième argument facultatif remplace le résultat
  par un texte adapté manuellement. Ces commandes enregistrent un brouillon.
