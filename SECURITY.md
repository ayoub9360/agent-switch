# Security

## Deployment model

Agent Switch is a local configuration tool with the permissions of the account
running its server. It can read and update assistant files, preserve backups, and
start configured stdio commands during MCP connection tests.

Keep it on localhost or a trusted private network. There is no built-in login,
user isolation, or multi-user authorization. `X-Agent-Switch`, request host, and browser origin
checks protect the intended client flow; they are not authentication. Do not
expose the service directly to the public internet.

## Sensitive data

Native MCP and hook configurations, workspace state, backups, and JSON exports
may contain credentials. They are not encrypted by Agent Switch. Review exports
before sharing, and use sanitized fixtures in bug reports and screenshots.

Only test MCP commands and endpoints you trust. Agent Switch does not call
business tools during a connection test, but the server command itself runs.
Hook commands are executed by the configured assistant, not by the editor.

## Reporting a vulnerability

Please use GitHub's **Security → Report a vulnerability** action on this
repository if it is available. Include affected versions, impact, and a minimal
reproduction without real credentials.

If private reporting is unavailable, open an issue containing only a request for
a private contact channel. Do not include exploit details or secrets in that
public issue. Never attach your full workspace, native configuration, or backups.

This is an early-stage project. There is no guaranteed response time or
backport policy; fixes target the current development line.
