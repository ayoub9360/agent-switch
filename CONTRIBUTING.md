# Contributing to Agent Switch

Thanks for helping make assistant configuration easier to manage. Useful
contributions include reproducible bug reports, clearer documentation,
accessibility improvements, and focused fixes.

## Before making a change

Search existing issues first. For a new assistant integration or a substantial
behavior change, open a feature request describing the user workflow and native
files involved before investing in a large implementation.

Current scope is one global configuration for Claude Code and Codex. Avoid
introducing project profiles or an additional service architecture as part of an
unrelated fix.

## Local setup

```bash
git clone https://github.com/ayoub9360/agent-switch.git
cd agent-switch
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

Requires Node.js 22.12+ and pnpm 12.8.1. The demo is disposable and uses fictional
files. See [development](docs/development.md) for the dev server and screenshots.

## Make a focused pull request

- Follow existing TypeScript, React, and formatting conventions.
- Keep domain rules in `packages/core`; filesystem operations in `apps/server`.
- Preserve unrelated native settings, drafts, backups, and linked skill contents.
- Add behavioral tests for new functionality or bug fixes, using isolated files.
- Update documentation when changing commands, supported paths, or user behavior.
- Keep screenshots and fixtures free of personal paths, tokens, and real exports.

Run `pnpm check` before submitting. If a check cannot run, say which one and why.
In your PR, explain the problem, resulting behavior, and verification. A small
before/after example or screenshot is useful for visible changes.

Commits in this repository generally use Conventional Commits, such as
`fix(skills): preserve supporting files when disabling a skill`.

## Report a problem

Use the bug report template with your OS, Node version, startup method, expected
behavior, actual behavior, and minimal reproduction. Redact secrets and personal
data. Follow [SECURITY.md](SECURITY.md) for vulnerabilities rather than opening a
public exploit report.

Be respectful, specific, and constructive in discussions and reviews. By
submitting a contribution, you agree that it may be distributed under the
project's [MIT license](LICENSE).
