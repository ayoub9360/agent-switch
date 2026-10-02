# Releasing

This is a maintainer checklist, not an automatic publishing workflow. A source
checkout, a public GitHub repository, and a published npm package are separate
states. Version `0.1.0` was published from an older checkout. Version `0.1.1`
is published and includes the security fixes and license notices.
A published version cannot be overwritten, even when its registry metadata is
not yet visible to `npm view`.

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

Example for version 0.1.1:

```bash
pnpm pack:cli
tar -tzf packages/cli/ayoub9360-agent-switch-0.1.1.tgz
npm exec --package=./packages/cli/ayoub9360-agent-switch-0.1.1.tgz -- agent-switch --help
```

For a running smoke test, set `AGENT_SWITCH_HOME`, `CODEX_HOME`, and
`CLAUDE_CONFIG_DIR` to directories inside a disposable home. Never test applying
release fixtures against your real assistant setup.

## Publish deliberately

After reviewing the artifact and authorizing the release, publish that archive
with the maintainer's npm account:

```bash
npm publish ./packages/cli/ayoub9360-agent-switch-0.1.1.tgz --access public
```

Create a matching Git tag and GitHub release with user-visible changes and
verification. Update the README and CLI documentation to offer the verified
`npx @ayoub9360/agent-switch@latest` command. Verify the published version from a
clean directory. Registry publication and release tags are not performed by
`pnpm pack:cli`.

## Publication errors

- **E403: cannot publish over a previously published version:** increment the
  version in `packages/cli/package.json`, rebuild with `pnpm pack:cli`, and publish
  the archive with the new version in its filename. Rebuilding an archive with
  the same version does not replace the version already on npm.
- **E403: two-factor authentication required:** enable 2FA on the publishing
  account and complete the browser authentication requested by `npm publish`.
- **E404 after a successful publication:** check both access and metadata using
  `npm access get status @ayoub9360/agent-switch` and
  `npm view @ayoub9360/agent-switch version dist-tags --prefer-online`.
  Public access does not guarantee that all registry endpoints are immediately
  consistent. A version document or tarball can be available while the package
  metadata still returns 404. Do not attempt to republish the same version to
  resolve this; retry the read later and contact npm support if it persists.

Always pull the intended source revision and install the committed dependencies
before packaging. For release `0.1.1`, the archive must include `LICENSE`,
`THIRD_PARTY_NOTICES.md`, `dist/licenses/`, and `dist/web/licenses.md`.
