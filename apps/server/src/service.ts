import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { access, mkdir, readFile, writeFile, rm } from "node:fs/promises"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { Machine } from "./machine"
import { LocalRepository } from "./store"
import { createApi } from "./http"

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      reject(error)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(port, host)
  })
}

export async function startService(options: {
  webDirectory?: string
  host: string
  port: number
  fallbackPort?: boolean
  reuse?: boolean
}) {
  if (
    !Number.isInteger(options.port) ||
    options.port < 0 ||
    options.port > 65535
  )
    throw new Error("Port must be an integer between 0 and 65535.")
  if (options.webDirectory)
    await access(join(options.webDirectory, "index.html"))
  const home = resolve(process.env.AGENT_SWITCH_HOME ?? homedir())
  const directory = join(home, ".agent-switch")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const lock = join(directory, "server.lock")
  const endpoint = join(directory, "endpoint.json")
  let pid: number | undefined
  try {
    pid = Number(await readFile(lock, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  if (pid !== undefined) {
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new Error(`Invalid service lock: ${lock}`)
    let running = true
    try {
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
      running = false
    }
    if (running) {
      if (options.reuse) {
        try {
          const { url } = JSON.parse(await readFile(endpoint, "utf8"))
          const address = new URL(url)
          if (
            address.protocol !== "http:" ||
            address.hostname !== "127.0.0.1" ||
            address.username ||
            address.password
          )
            throw new Error("Not a local service.")
          const response = await fetch(`${address.origin}/api/health`, {
            headers: { "X-Agent-Switch": "1" },
            signal: AbortSignal.timeout(2000),
            redirect: "error",
          })
          const health = await response.json()
          if (
            response.ok &&
            health.service === "agent-switch" &&
            health.pid === pid &&
            health.web
          )
            return { url: address.origin, close: undefined }
        } catch {
          // A live lock must never be removed if its service cannot be verified.
        }
      }
      throw new Error(
        "An Agent Switch service is already using this folder. Stop it before starting another instance."
      )
    }
    await rm(lock)
  }
  await writeFile(lock, String(process.pid), { flag: "wx", mode: 0o600 })
  let server: Server | undefined
  const cleanup = async () => {
    await rm(endpoint, { force: true })
    await rm(lock, { force: true })
  }
  const close = async () => {
    if (server?.listening) {
      const stopped = new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve()))
      )
      await stopped
    }
    await cleanup()
  }
  try {
    const repository = new LocalRepository(
      new Machine(home, process.env.CODEX_HOME, process.env.CLAUDE_CONFIG_DIR),
      directory
    )
    await repository.initialize()
    const origins = (
      process.env.AGENT_SWITCH_ORIGINS ??
      "http://127.0.0.1:4141,http://localhost:4141"
    ).split(",")
    server = createApi(repository, origins, options.webDirectory)
    server.requestTimeout = 15_000
    server.headersTimeout = 10_000
    try {
      await listen(server, options.port, options.host)
    } catch (error) {
      if (
        !options.fallbackPort ||
        (error as NodeJS.ErrnoException).code !== "EADDRINUSE"
      )
        throw error
      await listen(server, 0, options.host)
    }
    const port = (server.address() as AddressInfo).port
    const host = options.host.includes(":") ? `[${options.host}]` : options.host
    const url = `http://${host}:${port}`
    origins.push(url)
    await writeFile(endpoint, JSON.stringify({ url }), { mode: 0o600 })
    return { url, close }
  } catch (error) {
    await close()
    throw error
  }
}

export function installShutdownHandlers(close: () => Promise<void>) {
  let stopping = false
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      if (stopping) return
      stopping = true
      void close().then(
        () => process.exit(0),
        (error: Error) => {
          console.error(error.message)
          process.exit(1)
        }
      )
    })
}
