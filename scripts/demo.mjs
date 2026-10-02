import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { startService } from "../packages/cli/dist/service.js"

// Only fictional files in a newly created directory are used by this demo.
const { values } = parseArgs({
  options: { port: { type: "string" }, host: { type: "string" } },
})
const demoHome = await mkdtemp(join(tmpdir(), "agent-switch-demo-"))
process.env.AGENT_SWITCH_HOME = demoHome
process.env.CODEX_HOME = join(demoHome, ".codex")
process.env.CLAUDE_CONFIG_DIR = join(demoHome, ".claude")

async function put(path, content) {
  const destination = join(demoHome, path)
  await mkdir(resolve(destination, ".."), { recursive: true })
  await writeFile(destination, content)
}

await put(
  ".claude/CLAUDE.md",
  "# Working together\n\n## Code quality\n\n- Keep changes focused and easy to review.\n- Follow the existing architecture and conventions.\n- Test behavior at the boundaries.\n\n## Communication\n\nExplain the tradeoffs. Document the decisions that matter.\n"
)
await put(
  ".codex/AGENTS.md",
  "# My coding preferences\n\n- Read the project instructions before making changes.\n- Prefer small, maintainable solutions.\n- Preserve existing work.\n- Run the relevant checks and report the results.\n"
)
await put(
  ".claude/rules/reviews.md",
  "# Code reviews\n\nPrioritize correctness, regressions, and missing tests.\nExplain each finding with a concrete example.\n"
)
for (const [name, description, content] of [
  [
    "frontend-design",
    "Build thoughtful, accessible interfaces.",
    "Use the existing design system. Check keyboard navigation, empty states, and responsive layouts.",
  ],
  [
    "code-review",
    "Review changes for correctness and maintainability.",
    "Read the diff in context. Focus on behavior, regressions, and actionable feedback.",
  ],
  [
    "documentation",
    "Turn working code into clear, useful documentation.",
    "Lead with a working example. Explain setup, everyday workflows, and limitations.",
  ],
]) {
  for (const assistant of [".claude", ".codex"])
    await put(
      `${assistant}/skills/${name}/SKILL.md`,
      `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name
        .split("-")
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ")}\n\n${content}\n`
    )
}
await put(
  ".claude.json",
  JSON.stringify(
    {
      mcpServers: {
        documentation: { type: "http", url: "https://docs.example.com/mcp" },
      },
    },
    null,
    2
  )
)
await put(
  ".codex/config.toml",
  '[mcp_servers.documentation]\nurl = "https://docs.example.com/mcp"\n'
)
await put(
  ".claude/settings.json",
  JSON.stringify(
    {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: "echo 'Demo: review the checks before finishing'",
              },
            ],
          },
        ],
      },
    },
    null,
    2
  )
)

let service
try {
  service = await startService({
    webDirectory: resolve(import.meta.dirname, "../apps/web/dist"),
    host: values.host ?? "127.0.0.1",
    port: Number(values.port ?? 4141),
    fallbackPort: values.port === undefined,
  })
  const response = await fetch(`${service.url}/api/workspace`, {
    headers: { "X-Agent-Switch": "1" },
  })
  if (!response.ok) throw new Error("Could not load the demo workspace.")
  const workspace = await response.json()
  workspace.theme = "dark"
  const profile = workspace.profiles.find(
    (item) => item.id === workspace.activeProfileId
  )
  const instruction = profile.resources.find(
    (item) => item.name === "CLAUDE.md"
  )
  instruction.content +=
    "\n## Before you ship\n\n- Check accessibility and keyboard navigation.\n- Document any user-facing changes.\n"
  const saved = await fetch(`${service.url}/api/workspace`, {
    method: "PUT",
    headers: {
      "X-Agent-Switch": "1",
      "Content-Type": "application/json",
      "If-Match": response.headers.get("etag"),
    },
    body: JSON.stringify(workspace),
  })
  if (!saved.ok) throw new Error("Could not save the demo draft.")
  console.log(
    `Demo available at ${service.url}\nFictional configuration: ${demoHome}\nCtrl+C stops the demo and removes its temporary files.`
  )
} catch (error) {
  await service?.close?.()
  await rm(demoHome, { recursive: true, force: true })
  throw error
}
let stopping = false
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    if (stopping) return
    stopping = true
    void (async () => {
      await service.close()
      await rm(demoHome, { recursive: true, force: true })
      process.exit(0)
    })().catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
  })
