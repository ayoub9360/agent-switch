import { resolve, extname } from "node:path"
import { read, inside } from "./files"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { LocalRepository } from "./store"
import { workspaceSchema } from "@agent-switch/core/schemas"
import { testMcp } from "./mcp"

export function createApi(
  repository: LocalRepository,
  allowedOrigins: string[],
  webDirectory?: string
) {
  let queue = Promise.resolve()
  const send = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ETag: repository.etag(),
    })
    res.end(JSON.stringify(value))
  }
  const body = async (req: IncomingMessage) => {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 25_000_000)
        throw new Error("Request too large (25 MB maximum).")
      chunks.push(chunk)
    }
    return JSON.parse(Buffer.concat(chunks).toString() || "{}")
  }
  return createServer((req, res) => {
    const run = async () => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost")
        if (!url.pathname.startsWith("/api/")) {
          if (!webDirectory || req.method !== "GET")
            return send(res, 404, { error: "Route not found." })
          let path = resolve(
            webDirectory,
            "." + decodeURIComponent(url.pathname)
          )
          if (!inside(webDirectory, path))
            return send(res, 403, { error: "Forbidden path." })
          if (!extname(path)) path = resolve(webDirectory, "index.html")
          const bytes = await read(path)
          if (!bytes) return send(res, 404, { error: "File not found." })
          const types: Record<string, string> = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript",
            ".css": "text/css",
            ".woff2": "font/woff2",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
          }
          res.writeHead(200, {
            "Content-Type": types[extname(path)] ?? "application/octet-stream",
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
          })
          res.end(bytes)
          return
        }
        const origin = req.headers.origin
        if (origin && !allowedOrigins.includes(origin))
          return send(res, 403, { error: "Unauthorized origin." })
        if (req.headers["x-agent-switch"] !== "1")
          return send(res, 403, { error: "Agent Switch client required." })
        if (req.method === "GET" && url.pathname === "/api/workspace")
          return send(res, 200, await repository.load())
        if (req.method === "GET" && url.pathname === "/api/discovery")
          return send(res, 200, await repository.discover())
        if (req.method === "POST" && url.pathname === "/api/mcp/test") {
          const input = await body(req)
          if (typeof input.content !== "string")
            throw new Error("Missing configuration.")
          return send(res, 200, await testMcp(input.content))
        }
        if (req.headers["if-match"] !== repository.etag())
          return send(res, 409, {
            error:
              "The configuration has changed in another session. Reload the page before trying again.",
          })
        if (req.method === "PUT" && url.pathname === "/api/workspace") {
          await repository.save(workspaceSchema.parse(await body(req)))
          return send(res, 200, await repository.load())
        }
        if (req.method === "POST" && url.pathname === "/api/import-machine")
          return send(
            res,
            200,
            await repository.importDetected(await body(req))
          )
        if (req.method === "POST" && url.pathname === "/api/refresh")
          return send(res, 200, await repository.refresh())
        const match = url.pathname.match(
          /^\/api\/profiles\/([^/]+)\/(apply|plan)$/
        )
        if (req.method === "POST" && match) {
          const id = decodeURIComponent(match[1])
          const input = await body(req)
          const mode = input.skillEditMode ?? "local"
          if (mode !== "local" && mode !== "shared")
            throw new Error("Invalid skill edit mode.")
          if (match[2] === "apply")
            return send(res, 200, await repository.apply(id, mode))
          const plan = await repository.preview(id, mode)
          return send(res, 200, [
            ...plan.materializations.map((operation) => ({
              path: operation.path,
              action: operation.kind,
              bytes: 0,
              source: operation.source,
            })),
            ...plan.moves.map((move) => ({
              path: move.from,
              destination: move.to,
              action: move.linkTarget !== undefined ? "move-link" : "move",
              bytes: 0,
            })),
            ...[...plan].map(([path, content]) => ({
              path,
              action: content === null ? "delete" : "write",
              bytes: content?.length ?? 0,
              ...(plan.shared.has(path)
                ? { sharedTargets: plan.shared.get(path) }
                : {}),
            })),
          ])
        }
        send(res, 404, { error: "Route not found." })
      } catch (error) {
        send(res, 400, {
          error: error instanceof Error ? error.message : "Internal error.",
        })
      }
    }
    queue = queue.then(run, run)
  })
}
