# Development

## Setup

Use Node.js 22.12+ (the repository pins a version in `.node-version`) and
pnpm 12.8.1, as declared by `packageManager`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Vite serves the UI at `http://127.0.0.1:4141`; the API listens on port `4142`.
Development normally reads your real global configuration. Use the isolated demo
for screenshots and exploration.

## Checks

```bash
pnpm check
```

Runs formatting, ESLint, TypeScript, tests, and the production build. Individual
commands are `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
`pnpm build`. Format edited files with `pnpm exec prettier --write PATH...`.

Tests cover domain operations, the interface, HTTP adapters, real filesystem
transactions, conflicts, links, rollback, portable skills, CLI startup, and a
real MCP test process. Filesystem tests use isolated temporary directories.

The GitHub Actions workflow runs the same checks and a dependency audit on
Linux with Node.js 22.12 and 24. It also scans Git history with Gitleaks. Other operating
systems are not currently covered by that workflow; filesystem and symlink
behavior should be checked before claiming additional platform support.

## Isolated demo

```bash
pnpm build
pnpm demo
```

[`scripts/demo.mjs`](../scripts/demo.mjs) creates a new temporary home, explicitly
sets all three home/configuration variables for its own process, seeds fictional
native files, and starts the built app. It adds one instruction edit as a draft
so you can inspect the review flow immediately. It does not change your shell's
environment or your real assistant configuration.

The demo prints its URL and temporary directory. `Ctrl+C` stops it and removes
that directory, including any edits made inside the demo. An abrupt process kill
may leave the temporary directory behind. The MCP URL uses the reserved example
host `docs.example.com`; it is illustrative, not a working integration.

Optional arguments:

```bash
pnpm demo --port 4311
pnpm demo --host YOUR_PRIVATE_ADDRESS --port 4311
```

The default host is `127.0.0.1`. For remote access, follow the same
[private network guidance](configuration.md#private-network-access) as the main
service. If using a hostname rather than the printed address, set
`AGENT_SWITCH_ORIGINS` to that browser origin.

## Reproduce the screenshots

The images in `docs/images/` are real browser captures, not mockups:

1. Build and start a fresh demo.
2. Use the dark theme at a 1440 × 1000 CSS-pixel viewport.
3. Capture **Overview** with the initial pending change.
4. Open **Instructions** and capture the Claude Code editor.
5. Open **Skills**, select `frontend-design`, and capture its details.
6. Open **Review changes** and capture the instruction diff without applying.

Capture the viewport without browser chrome, then save as `overview.png`,
`instructions.png`, `skills.png`, and `review.png`. Browser capture tools may
scale the final PNG. Check readability, the absence of notifications, and the
absence of personal paths or credentials before replacing the images.

## Build and package

```bash
pnpm build
node packages/cli/dist/cli.js --help
pnpm pack:cli
```

The CLI build bundles the server and copies the Vite assets and license notices.
See [architecture](architecture.md) and [releasing](releasing.md).
