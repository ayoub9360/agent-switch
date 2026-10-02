# Releasing

This is a maintainer checklist, not an automatic publishing workflow. A source
checkout, a public GitHub repository, and a published npm package are separate
states. The npm package is not yet published.

## Prepare the repository

- Choose and include the root license and retain third-party notices.
- Run `pnpm check` and inspect the demo and README screenshots.
- Check tracked files and Git history for accidentally committed credentials,
  private exports, and personal data before changing repository visibility.
- Review the GitHub description and topics against the current product scope.
- Commit and push the reviewed changes, then inspect README rendering and CI.
- Enable private vulnerability reporting when available for the public repository.

Do not advertise a green CI run, a supported operating system, or an npm release
until it has been verified.

## Build an npm artifact

1. Update the package version in `packages/cli/package.json` and any versioned
   archive examples. Keep other workspace version changes intentional.
2. Install with the committed lockfile and run `pnpm check`.
3. Run `pnpm pack:cli` and inspect the archive contents.
4. Confirm the launcher, web assets, license, and notices are present and there
   are no configuration exports, `.env` files, test homes, or `workspace:` runtime
   dependencies.
5. Install the archive into an isolated directory and smoke-test `--help`,
   `--version`, server startup, a workspace read, and shutdown.

Example for version 0.1.0:

```bash
pnpm pack:cli
tar -tzf packages/cli/ayoub9360-agent-switch-0.1.0.tgz
npm exec --package=./packages/cli/ayoub9360-agent-switch-0.1.0.tgz -- agent-switch --help
```

For a running smoke test, set `AGENT_SWITCH_HOME`, `CODEX_HOME`, and
`CLAUDE_CONFIG_DIR` to directories inside a disposable home. Never test applying
release fixtures against your real assistant setup.

## Publish deliberately

After reviewing the artifact and authorizing the release, publish that archive
with the maintainer's npm account:

```bash
npm publish ./packages/cli/ayoub9360-agent-switch-0.1.0.tgz --access public
```

Create a matching Git tag and GitHub release with user-visible changes and
verification. Update the README and CLI documentation to offer the verified
`npx @ayoub9360/agent-switch@latest` command. Verify the published version from a
clean directory. Registry publication and release tags are not performed by
`pnpm pack:cli`.
