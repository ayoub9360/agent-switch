import { homedir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { readFile, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { WorkspaceService } from "@agent-switch/core/workspace-service"
import { changesFor, type Workspace } from "@agent-switch/core/workspace"
import { exportSchema } from "@agent-switch/core/schemas"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: "string" },
    output: { type: "string" },
    input: { type: "string" },
    json: { type: "boolean" },
    url: { type: "string" },
  },
})
const endpoint = await readFile(
  join(
    process.env.AGENT_SWITCH_HOME ?? homedir(),
    ".agent-switch/endpoint.json"
  ),
  "utf8"
)
  .then((text) => JSON.parse(text).url as string)
  .catch(() => undefined)
const base =
  values.url ??
  process.env.AGENT_SWITCH_API_URL ??
  endpoint ??
  "http://127.0.0.1:4142"
let etag = ""
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown
): Promise<T> {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      "X-Agent-Switch": "1",
      "Content-Type": "application/json",
      "If-Match": etag,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? "Request rejected.")
  etag = response.headers.get("etag") ?? etag
  return data as T
}
const repository = {
  load: () => request<Workspace>("/workspace"),
  save: async (workspace: Workspace) => {
    await request("/workspace", "PUT", workspace)
  },
  apply: (id: string) =>
    request<Workspace>(`/profiles/${encodeURIComponent(id)}/apply`, "POST"),
}
const service = new WorkspaceService(repository, {
  id: randomUUID,
  now: () => new Date().toISOString(),
})
const command = positionals[0] ?? "help"
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2))
try {
  if (command === "help") {
    console.log(
      `Agent Switch — global machine configuration

  workspace [--json]
  scan | refresh
  import-machine --input configuration.json
  plan | apply
  export --output file.json
  import --file file.json
  mcp-test --file server.json
  run METHOD --input arguments.json

Methods: setTheme, createResource, saveResource, deleteResource, saveInstruction, copyInstructions, discard, restore.
The file contains the method arguments, without a profile ID.
Example deleteResource: ["resource-id"]
Use --url to choose the service URL.`
    )
  } else {
    const workspace = await service.load()
    const id = workspace.activeProfileId
    const profile = workspace.profiles.find((p) => p.id === id)
    if (!profile) throw new Error("Profile not found.")
    if (command === "workspace" || command === "profiles")
      print(
        values.json
          ? workspace
          : workspace.profiles.map((p) => ({
              id: p.id,
              name: p.name,
              resources: p.resources.length,
              pending: changesFor(p).length,
            }))
      )
    else if (command === "scan") {
      const resources =
        await request<{ name: string; kind: string; source: string }[]>(
          "/discovery"
        )
      print(
        values.json
          ? resources
          : resources.map(({ name, kind, source }) => ({ name, kind, source }))
      )
    } else if (command === "refresh") {
      await request("/refresh", "POST")
      console.log("Configuration refreshed.")
    } else if (command === "plan")
      print(await request(`/profiles/${encodeURIComponent(id)}/plan`, "POST"))
    else if (command === "apply") {
      await service.apply(id)
      console.log("Configuration applied. Backup created.")
    } else if (command === "export") {
      if (!values.output) throw new Error("--output is required.")
      const portable = exportSchema.parse({
        format: "agent-switch-profile",
        version: 1,
        profile,
      })
      await writeFile(values.output, JSON.stringify(portable, null, 2), {
        mode: 0o600,
        flag: "wx",
      })
      console.log("Profile exported.")
    } else if (command === "import") {
      if (!values.file) throw new Error("--file is required.")
      const data = exportSchema.parse(
        JSON.parse(await readFile(values.file, "utf8"))
      )
      await service.importProfile(data.profile)
      console.log("Profile imported as a draft.")
    } else if (command === "import-machine") {
      if (!values.input) throw new Error("--input is required (name, targets).")
      await request(
        "/import-machine",
        "POST",
        JSON.parse(await readFile(values.input, "utf8"))
      )
      console.log("Machine configuration imported.")
    } else if (command === "mcp-test") {
      if (!values.file) throw new Error("--file is required.")
      print(
        await request("/mcp/test", "POST", {
          content: await readFile(values.file, "utf8"),
        })
      )
    } else if (command === "run") {
      const methods = [
        "setTheme",
        "createResource",
        "saveResource",
        "saveInstruction",
        "copyInstructions",
        "deleteResource",
        "discard",
        "restore",
      ] as const
      const method = positionals[1]
      if (!methods.some((m) => m === method) || !values.input)
        throw new Error("Unknown method or missing --input. See help.")
      const args = JSON.parse(await readFile(values.input, "utf8"))
      if (!Array.isArray(args))
        throw new Error("An array of arguments is required.")
      const operation = service[method as (typeof methods)[number]] as (
        ...args: unknown[]
      ) => Promise<Workspace>
      await operation.apply(
        service,
        method === "setTheme" ? args : [id, ...args]
      )
      console.log("Configuration saved.")
    } else throw new Error("Unknown command. See help.")
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Command failed.")
  process.exitCode = 1
}
