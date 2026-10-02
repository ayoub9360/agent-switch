# Agent Switch

**Your coding assistants. One place to configure them.**

Manage Claude Code and Codex instructions, skills, MCP servers, and hooks from a
local browser interface. Review changes before applying them to native files,
with backups and conflict detection.

[Source and screenshots](https://github.com/ayoub9360/agent-switch) ·
[Documentation](https://github.com/ayoub9360/agent-switch/blob/main/docs/README.md) ·
[Issues](https://github.com/ayoub9360/agent-switch/issues)

## Run

Requires Node.js 22.12+ and npm. Use version 0.1.1 or newer:

```bash
npx @ayoub9360/agent-switch@latest
```

The launcher starts the local server and opens the browser. It uses
`127.0.0.1:4141`, choosing a free port if the default is occupied. The URL is
printed in your terminal. A verified running local web instance for the same
home is reused. `Ctrl+C` stops a server started in that terminal.

To run from source or test an unpublished version, follow the repository's setup
or build a local archive with `pnpm pack:cli`.

```bash
npx @ayoub9360/agent-switch@latest --no-open
npx @ayoub9360/agent-switch@latest --port 4200
npx @ayoub9360/agent-switch@latest --help
npx @ayoub9360/agent-switch@latest --version
```

An explicit port must be free; `--port 0` requests a free port.
`AGENT_SWITCH_PORT` also selects a port. The launcher binds only to loopback.

## How it works

Agent Switch discovers the global configuration of the account running the
service. Edits remain drafts in `~/.agent-switch/` until explicitly applied.
It manages one global configuration; the current working directory does not
select a project. `AGENT_SWITCH_HOME`, `CODEX_HOME`, and `CLAUDE_CONFIG_DIR`
override the default paths.

Commands use the service already running in another terminal:

```bash
npx @ayoub9360/agent-switch@latest workspace --json
npx @ayoub9360/agent-switch@latest plan
npx @ayoub9360/agent-switch@latest apply
npx @ayoub9360/agent-switch@latest export --output configuration.json
```

The CLI discovers the endpoint in `~/.agent-switch/endpoint.json`. Pass
`--url http://127.0.0.1:4200` after a subcommand to override it. See the
[CLI reference](https://github.com/ayoub9360/agent-switch/blob/main/docs/cli.md).

## Security and license

The service can modify assistant configuration and has no built-in user
accounts. Keep it on localhost or a trusted private network. Exports may contain
secrets, and testing a stdio MCP starts its configured command. Read the
[security policy](https://github.com/ayoub9360/agent-switch/blob/main/SECURITY.md).

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`. Agent Switch is an independent
project, not affiliated with or endorsed by Anthropic or OpenAI.
