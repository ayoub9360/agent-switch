# Agent Switch

Interface locale pour gérer les configurations globales de Claude Code et Codex :
instructions, skills, serveurs MCP et hooks.

Node.js 22.12 ou plus récent est requis.

Le paquet npm se nomme `@ayoub9360/agent-switch`. Après publication :

```bash
npx @ayoub9360/agent-switch@latest
```

La commande démarre le serveur sur `127.0.0.1:4141` et ouvre le navigateur.
Si le port par défaut est occupé, un port libre est choisi. L’adresse est toujours
affichée. Si une instance web locale existe déjà pour ce compte, elle est réutilisée.
Arrêter le serveur avec `Ctrl+C` dans le terminal qui l’a démarré.

```bash
npx @ayoub9360/agent-switch@latest --no-open
npx @ayoub9360/agent-switch@latest --port 4200
npx @ayoub9360/agent-switch@latest --help
npx @ayoub9360/agent-switch@latest --version
```

Un port explicitement choisi doit être libre ; `--port 0` demande un port libre.
`AGENT_SWITCH_PORT` permet également de choisir le port. Le lanceur npm écoute
uniquement sur la boucle locale. Sans navigateur disponible, ouvrir manuellement
l’adresse affichée.

Les changements sont enregistrés en brouillon dans `~/.agent-switch/`.
Les configurations des assistants sont modifiées après application explicite,
avec sauvegarde. Le dossier courant n’a pas d’incidence : seules les configurations
globales du compte sont gérées. `AGENT_SWITCH_HOME`, `CODEX_HOME` et
`CLAUDE_CONFIG_DIR` permettent de remplacer les dossiers par défaut.

Les commandes suivantes utilisent le service déjà lancé dans un autre terminal :

```bash
npx @ayoub9360/agent-switch@latest workspace --json
npx @ayoub9360/agent-switch@latest plan
npx @ayoub9360/agent-switch@latest apply
npx @ayoub9360/agent-switch@latest export --output configuration.json
```

La CLI retrouve son adresse dans `~/.agent-switch/endpoint.json`.
Utiliser `--url http://127.0.0.1:4200` après une sous-commande pour la remplacer.
