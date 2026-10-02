# Troubleshooting

## The page cannot connect to the service

With `pnpm dev`, both Vite (`4141`) and the API (`4142`) must be running. With
`pnpm start`, run `pnpm build` first and use the printed URL. Check the server's
terminal for the actual error. The CLI can target it with `--url`.

For a remote browser, `127.0.0.1` refers to the browser's machine. Bind the source
server to its private network address and use that address in the browser. See
[private network access](configuration.md#private-network-access).

## The port is occupied

Stop the process that owns the port, or choose another one:

```bash
AGENT_SWITCH_PORT=4200 pnpm start
```

The built launcher also accepts `--port 4200` or `--port 0`. Only the launcher's
implicit default port falls back automatically when occupied.

## Another service is already using this folder

Only one service can own a managed home. Stop the existing Agent Switch process
normally before starting another. The packaged launcher can reuse a verified
local web instance. A lock with a dead PID is cleaned up automatically; a live or
invalid lock is not silently removed. Do not delete a live service's lock.

For a separate sandbox, use `pnpm demo`, which creates its own temporary home.

## Unauthorized host / origin / Agent Switch client required

Check that the browser origin, including scheme and port, is permitted by
`AGENT_SWITCH_ORIGINS`. Values are comma-separated without extra spaces.
Request hosts must match a permitted origin or the local server address.
The service also requires `X-Agent-Switch: 1` on API requests. The bundled UI and
CLI send this header automatically. These checks do not replace authentication.

## Configuration changed in another session

Another browser tab or CLI operation updated the workspace. Reload the page,
then review your changes again. Native file conflicts also require a refresh
from disk so you can compare your draft with the latest contents. Do not force
an overwrite without checking the new file.

## An assistant or resource is missing

Detection means configuration files were found; it does not prove the assistant
executable is installed. Check Settings for discovery warnings and verify the
service account, `AGENT_SWITCH_HOME`, `CODEX_HOME`, and `CLAUDE_CONFIG_DIR`.
Repository-local files, managed administrator settings, and plugin contents are
not discovered. Skills need a `SKILL.md` with `name` and `description` frontmatter.

## A linked skill cannot be restored or edited

A broken link, cycle, outside-home target, or occupied destination can block an
operation. Inspect the destination and warnings before moving anything manually.
Use the default local-copy behavior to isolate edits, or explicitly select
**Edit shared sources** when the common source should change.

External configuration synchronization can recreate links. Refresh after running
it. If your terminal still sees the old shared root, change to your home directory
and re-enter the assistant's skill directory.

## MCP connection test fails

Check the command, executable availability, transport, URL, authentication, and
the environment inherited by the service. Required packages are not installed by
Agent Switch. A connection test initializes the server but does not verify every
tool it exposes. Only test commands and endpoints you trust.

## Copy to clipboard fails on a private server

Browsers require a secure context for clipboard access. Use localhost or HTTPS,
or copy the text manually.

## Recovering after an interrupted apply

Restart the service so its recovery journal can roll back the interrupted
transaction. Inspect any startup error before attempting further writes. Previous
files are saved in `.agent-switch/backups/`; disabled and replaced skill entries
have separate archives. Preserve these directories while investigating.

Restoring a revision from History creates a draft. Review and apply to write it
back to the machine. If reporting a problem, include the error and a minimal
sanitized example, never raw backups or a credential-bearing export.
