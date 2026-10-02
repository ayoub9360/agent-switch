# Configuration reference

## Native files

Paths are relative to the service account's home by default.

| Resource                | Claude Code                           | Codex                                                         |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------- |
| Main instructions       | `~/.claude/CLAUDE.md`                 | `~/.codex/AGENTS.md`                                          |
| Additional instructions | `~/.claude/rules/**/*.md`             | `~/.codex/AGENTS.override.md`                                 |
| Skills                  | `~/.claude/skills/**/SKILL.md`        | `~/.agents/skills/**/SKILL.md`, `~/.codex/skills/**/SKILL.md` |
| MCP                     | Root `mcpServers` in `~/.claude.json` | `mcp_servers` in `~/.codex/config.toml`                       |
| Hooks                   | `hooks` in `~/.claude/settings.json`  | `hooks` in `~/.codex/config.toml` and `~/.codex/hooks.json`   |

These are the files Agent Switch supports, not a complete reference for each
assistant's configuration format. Existing unrelated JSON/TOML settings and
native `projects` entries are preserved. TOML formatting and comments may be
normalized when the document is serialized.

Managed administrator settings, plugin contents, and repository-local
configurations are outside the current scope. Discovery warnings appear in
Settings. File and skill links within the managed home are followed, including
links into repositories. Broken links, cycles, and targets outside the home are
reported. Writes are limited to the managed home.

## Environment variables

| Variable                | Default                                           | Purpose                                                     |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `AGENT_SWITCH_HOME`     | Service account's home                            | Home to discover and manage; also contains `.agent-switch/` |
| `CODEX_HOME`            | `$AGENT_SWITCH_HOME/.codex`                       | Codex configuration directory                               |
| `CLAUDE_CONFIG_DIR`     | `$AGENT_SWITCH_HOME/.claude`                      | Claude configuration directory                              |
| `AGENT_SWITCH_HOST`     | `127.0.0.1`                                       | Bind address for `pnpm start`                               |
| `AGENT_SWITCH_PORT`     | `4141`                                            | Web service / launcher port                                 |
| `AGENT_SWITCH_API_PORT` | `4142`                                            | Development API port                                        |
| `AGENT_SWITCH_ORIGINS`  | `http://127.0.0.1:4141,http://localhost:4141`     | Comma-separated permitted browser origins                   |
| `AGENT_SWITCH_API_URL`  | Discovered endpoint, then `http://127.0.0.1:4142` | CLI service address; overridden by `--url`                  |

If `AGENT_SWITCH_HOME` is unset, the two assistant directories fall back to the
actual home. An existing `CODEX_HOME` or `CLAUDE_CONFIG_DIR` in your shell still
overrides those defaults. For isolated use, explicitly set all three paths or
use [the demo command](development.md#isolated-demo).

Claude's root `.claude.json` and Codex's `.agents/skills/` stay relative to the
managed home even when their assistant configuration directory is overridden.
Custom destinations must remain within the managed home for writes.

The packaged launcher always binds to `127.0.0.1`; `AGENT_SWITCH_HOST` applies
to the source server's `--web` mode, not that launcher. With the launcher, the
default port can fall back to a free port. An explicit port must be available;
`--port 0` asks for a free one. `pnpm start` does not automatically fall back.

## Local state

| Location under `~/.agent-switch/` | Purpose                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `workspace.json`                  | Draft and saved workspace state                               |
| `backups/`                        | Previous file contents and migration snapshots                |
| `disabled-skills/`                | Archived local skill entries                                  |
| `replaced-skills/`                | Entries replaced during linked-skill materialization          |
| `endpoint.json`                   | Address used by the CLI to find the running service           |
| `server.lock`                     | Process lock preventing concurrent services for the same home |

The state can contain sensitive configuration. New state directories and files
use private permissions; backups are not automatically deleted.

## Development ports

```bash
pnpm dev
```

Starts the API at `127.0.0.1:4142` and Vite at `127.0.0.1:4141`. Vite proxies
`/api` to the API. Its proxy target is configured in `apps/web/vite.config.ts`;
changing the API port also requires matching that target.

For the built interface and API in one process:

```bash
pnpm build
pnpm start
```

## Private network access

The service edits the files of the account running it. It has **no login or
multi-user authorization**. Use localhost or a trusted private network, not an
unprotected public endpoint. Request headers and origin checks are not authentication.

For example, with a private Tailscale address:

```bash
AGENT_SWITCH_HOST=100.x.y.z pnpm start
```

Replace the placeholder with the host's actual address and open that exact
origin. If accessing through a private hostname or HTTPS proxy, permit the
browser's origin explicitly:

```bash
AGENT_SWITCH_HOST=100.x.y.z \
AGENT_SWITCH_ORIGINS=https://your-private-host.example \
pnpm start
```

Restrict access through your network or authenticated proxy. Browser clipboard
copying requires HTTPS or localhost. For development on a private address,
start the API with the permitted origin and Vite with
`pnpm --filter @agent-switch/web exec vite --host YOUR_PRIVATE_ADDRESS`.
