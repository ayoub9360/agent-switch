import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { Machine } from "./machine"
import { LocalRepository } from "./store"
import { createApi } from "./http"

const home = resolve(process.env.AGENT_SWITCH_HOME ?? homedir())
const directory = join(home, ".agent-switch")
await mkdir(directory, { recursive: true, mode: 0o700 })
const lock = join(directory, "server.lock")
try {
  const pid = Number(await readFile(lock, "utf8"))
  try {
    process.kill(pid, 0)
    throw new Error("An Agent Switch service is already using this folder.")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
    await rm(lock)
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
}
await writeFile(lock, String(process.pid), { flag: "wx", mode: 0o600 })
try {
  const repository = new LocalRepository(
    new Machine(home, process.env.CODEX_HOME, process.env.CLAUDE_CONFIG_DIR),
    directory
  )
  await repository.initialize()
  const web = process.argv.includes("--web")
  const host = web
    ? (process.env.AGENT_SWITCH_HOST ?? "127.0.0.1")
    : "127.0.0.1"
  const port = Number(
    web
      ? (process.env.AGENT_SWITCH_PORT ?? 4141)
      : (process.env.AGENT_SWITCH_API_PORT ?? 4142)
  )
  const origins = (
    process.env.AGENT_SWITCH_ORIGINS ??
    `http://127.0.0.1:4141,http://localhost:4141,http://${host}:${port}`
  ).split(",")
  const server = createApi(
    repository,
    origins,
    web ? resolve(import.meta.dirname, "../../web/dist") : undefined
  )
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  await writeFile(
    join(directory, "endpoint.json"),
    JSON.stringify({ url: `http://${host}:${port}` }),
    { mode: 0o600 }
  )
  server.listen(port, host, () =>
    console.log(`Agent Switch available at http://${host}:${port}`)
  )
  server.on("error", async (error) => {
    console.error(error.message)
    await rm(lock, { force: true })
    process.exit(1)
  })
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      server.close(async () => {
        await rm(lock, { force: true })
        process.exit(0)
      })
    })
} catch (error) {
  await rm(lock, { force: true })
  throw error
}
