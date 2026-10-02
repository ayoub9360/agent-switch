import { resolve } from "node:path"
import { startService, installShutdownHandlers } from "./service"

try {
  const web = process.argv.includes("--web")
  const service = await startService({
    webDirectory: web
      ? resolve(import.meta.dirname, "../../web/dist")
      : undefined,
    host: web ? (process.env.AGENT_SWITCH_HOST ?? "127.0.0.1") : "127.0.0.1",
    port: Number(
      web
        ? (process.env.AGENT_SWITCH_PORT ?? 4141)
        : (process.env.AGENT_SWITCH_API_PORT ?? 4142)
    ),
  })
  if (service.close) installShutdownHandlers(service.close)
  console.log(`Agent Switch available at ${service.url}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : "Server failed.")
  process.exitCode = 1
}
