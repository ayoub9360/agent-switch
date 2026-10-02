#!/usr/bin/env node
import { parseArgs } from "node:util"
import { resolve } from "node:path"
import open from "open"

try {
  const args = process.argv.slice(2)
  if (args[0] && !args[0].startsWith("-") && args[0] !== "help") {
    await import("./commands.js")
  } else {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        port: { type: "string" },
        "no-open": { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    })
    if (values.version) console.log(AGENT_SWITCH_VERSION)
    else if (values.help || positionals[0] === "help") {
      console.log(`Agent Switch — local configuration manager

Usage: agent-switch [--port PORT] [--no-open]

Starts the local server and opens your browser. Ctrl+C stops the server.
  --port PORT  Choose a port (0 selects a free port)
  --no-open    Print the URL without opening a browser
  -h, --help   Show help
  -v, --version Show version

Commands (require a running server):
  workspace [--json], scan, refresh, plan, apply
  export --output FILE, import --file FILE
  import-machine --input FILE, mcp-test --file FILE
  run METHOD --input FILE
Use --url URL with a command to select a running server.`)
    } else {
      const { startService, installShutdownHandlers } =
        await import("./service.js")
      const configuredPort = values.port ?? process.env.AGENT_SWITCH_PORT
      const result = await startService({
        webDirectory: resolve(import.meta.dirname, "web"),
        host: "127.0.0.1",
        port: configuredPort === undefined ? 4141 : Number(configuredPort),
        fallbackPort: configuredPort === undefined,
        reuse: true,
      })
      if (result.close) installShutdownHandlers(result.close)
      console.log(
        `Agent Switch available at ${result.url}${result.close ? "\nPress Ctrl+C to stop." : "\nUsing the running instance."}`
      )
      if (!values["no-open"]) {
        try {
          const browser = await open(result.url)
          browser.on("error", () =>
            console.error(`Open ${result.url} in your browser.`)
          )
          browser.on("exit", (code) => {
            if (code) console.error(`Open ${result.url} in your browser.`)
          })
        } catch {
          console.error(`Open ${result.url} in your browser.`)
        }
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Command failed.")
  process.exitCode = 1
}
