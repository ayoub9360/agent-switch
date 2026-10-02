# CLI reference

The CLI and web interface use the same service and domain operations. Start the
server in one terminal, then run commands in another.

```bash
pnpm start
```

For an API-only process, use
`pnpm --filter @agent-switch/server exec tsx src/main.ts` instead.

## Commands from the repository

| Command                                          | Effect                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `pnpm cli help`                                  | Print command help; no server needed                                    |
| `pnpm cli workspace --json`                      | Read the complete workspace                                             |
| `pnpm cli scan`                                  | Discover current native resources                                       |
| `pnpm cli refresh`                               | Refresh disk state and keep drafts                                      |
| `pnpm cli import-machine --input selection.json` | Add missing detected resources                                          |
| `pnpm cli plan`                                  | Preview file writes, deletes, moves, and materializations               |
| `pnpm cli apply`                                 | Apply the current draft and create backups                              |
| `pnpm cli export --output configuration.json`    | Export the current configuration; refuses to overwrite an existing file |
| `pnpm cli import --file configuration.json`      | Merge an export into the draft                                          |
| `pnpm cli mcp-test --file server.json`           | Initialize and close a real MCP connection                              |
| `pnpm cli run METHOD --input arguments.json`     | Execute a supported workspace operation                                 |

An import selection file contains:

```json
{ "targets": ["claude", "codex"] }
```

A connection test takes a single MCP server configuration, not an entire
`mcpServers` document. Testing stdio configurations starts their command.

The CLI resolves the service in this order:

1. `--url`, for example `pnpm cli plan --url http://127.0.0.1:4200`.
2. `AGENT_SWITCH_API_URL`.
3. `.agent-switch/endpoint.json` under the managed home.
4. `http://127.0.0.1:4142`.

Commands that load a workspace may print sensitive content. Do not paste raw
output into public issues.

## Workspace operations

`run` supports `setTheme`, `createResource`, `saveResource`, `deleteResource`,
`saveInstruction`, `copyInstructions`, `discard`, and `restore`. The input is a
JSON array of method arguments **without a profile ID**. See
[`WorkspaceService`](../packages/core/src/workspace-service.ts) for full signatures.

Save the main Claude instructions as a draft:

```json
["claude", "# Working conventions\n\nKeep changes focused.\n"]
```

```bash
pnpm cli run saveInstruction --input arguments.json
pnpm cli plan
```

To edit an existing instruction file, add its resource ID as the third argument.
To copy instructions:

```json
["source-resource-id", "codex", "append"]
```

Use `replace` instead of `append` to replace the destination. A fourth optional
string supplies a manually adapted result. Resource IDs are available in
`workspace --json`. To remove a resource, pass `["resource-id"]` to
`deleteResource`. These edits remain drafts until `apply`.

## Build a local package

The publishable package is `@ayoub9360/agent-switch`; the executable is
`agent-switch`. It bundles the web application and server adapters. End users
need Node.js 22.12+ and npm, but do not need the monorepo or pnpm.

```bash
pnpm pack:cli
npm exec --package=./packages/cli/ayoub9360-agent-switch-0.1.1.tgz -- agent-switch --no-open
```

Or run the built launcher directly:

```bash
pnpm build
node packages/cli/dist/cli.js --no-open
node packages/cli/dist/cli.js --help
```

The launcher normally opens the browser after the service is ready. It reuses a
verified local web instance for the same managed home. `Ctrl+C` stops a server
started in that terminal and releases its lock.

| Option            | Behavior                                |
| ----------------- | --------------------------------------- |
| `--no-open`       | Print the URL without opening a browser |
| `--port 4200`     | Require this port to be free            |
| `--port 0`        | Choose a free port                      |
| `--help`, `-h`    | Show launcher help                      |
| `--version`, `-v` | Print the package version               |

## Run from npm

Requires Node.js 22.12+ and npm. No source checkout or pnpm is needed:

```bash
npx @ayoub9360/agent-switch@latest
```

Use version `0.1.1` or newer, which includes the security fixes and bundled
license notices. All launcher options and service subcommands are available:

```bash
npx @ayoub9360/agent-switch@latest --no-open
npx @ayoub9360/agent-switch@latest --version
npx @ayoub9360/agent-switch@latest plan
```

`plan` and other service commands require a running server. See
[releasing](releasing.md) for the maintainer workflow.
