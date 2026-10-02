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
    profile: { type: "string" },
    file: { type: "string" },
    output: { type: "string" },
    input: { type: "string" },
    json: { type: "boolean" },
    url: { type: "string" },
    path: { type: "string" },
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
  if (!response.ok) throw new Error(data.error ?? "Requête refusée.")
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
      `Agent Switch — gestion de la configuration locale\n\n  profiles | workspace [--json]\n  scan [--path DOSSIER] | refresh
  import-machine --input configuration.json\n  plan | apply --profile ID\n  export --profile ID --output fichier.json\n  import --file fichier.json\n  mcp-test --file serveur.json\n  run MÉTHODE --input arguments.json\n\nMéthodes : selectProfile, setTheme, createProfile, editProfile, deleteProfile,\ncreateResource, saveResource, deleteResource, discard, restore.\nLe fichier arguments.json contient le tableau des arguments du cas d’usage.\nExemple : ["mon-profil", {"name":"Travail","description":"","path":"","color":"blue"}]\n\nDémarrer le service et l’interface : pnpm dev\n--url permet de choisir l’URL du service (défaut : http://127.0.0.1:4142).`
    )
  } else {
    const workspace = await service.load()
    const id = values.profile ?? workspace.activeProfileId
    const profile = workspace.profiles.find((p) => p.id === id)
    if (!profile) throw new Error("Profil introuvable.")
    if (command === "workspace" || command === "profiles")
      print(
        values.json
          ? workspace
          : workspace.profiles.map((p) => ({
              id: p.id,
              name: p.name,
              path: p.path,
              resources: p.resources.length,
              pending: changesFor(p).length,
            }))
      )
    else if (command === "scan") {
      const resources = await request<
        { name: string; kind: string; source: string }[]
      >(`/discovery?path=${encodeURIComponent(values.path ?? "")}`)
      print(
        values.json
          ? resources
          : resources.map(({ name, kind, source }) => ({ name, kind, source }))
      )
    } else if (command === "refresh") {
      await request("/refresh", "POST")
      console.log("Configuration actualisée.")
    } else if (command === "plan")
      print(await request(`/profiles/${encodeURIComponent(id)}/plan`, "POST"))
    else if (command === "apply") {
      await service.apply(id)
      console.log("Configuration appliquée. Sauvegarde créée.")
    } else if (command === "export") {
      if (!values.output) throw new Error("--output est requis.")
      const portable = exportSchema.parse({
        format: "agent-switch-profile",
        version: 1,
        profile,
      })
      await writeFile(values.output, JSON.stringify(portable, null, 2), {
        mode: 0o600,
        flag: "wx",
      })
      console.log("Profil exporté.")
    } else if (command === "import") {
      if (!values.file) throw new Error("--file est requis.")
      const data = exportSchema.parse(
        JSON.parse(await readFile(values.file, "utf8"))
      )
      await service.importProfile(data.profile)
      console.log("Profil importé en brouillon.")
    } else if (command === "import-machine") {
      if (!values.input)
        throw new Error("--input est requis (name, path, targets).")
      await request(
        "/import-machine",
        "POST",
        JSON.parse(await readFile(values.input, "utf8"))
      )
      console.log("Configuration de la machine importée.")
    } else if (command === "mcp-test") {
      if (!values.file) throw new Error("--file est requis.")
      print(
        await request("/mcp/test", "POST", {
          content: await readFile(values.file, "utf8"),
        })
      )
    } else if (command === "run") {
      const methods = [
        "selectProfile",
        "setTheme",
        "createProfile",
        "editProfile",
        "deleteProfile",
        "createResource",
        "saveResource",
        "deleteResource",
        "discard",
        "restore",
      ] as const
      const method = positionals[1]
      if (!methods.some((m) => m === method) || !values.input)
        throw new Error("Méthode inconnue ou --input manquant. Consultez help.")
      const args = JSON.parse(await readFile(values.input, "utf8"))
      if (!Array.isArray(args))
        throw new Error("Un tableau d’arguments est attendu.")
      const operation = service[method as (typeof methods)[number]] as (
        ...args: unknown[]
      ) => Promise<Workspace>
      await operation.apply(service, args)
      console.log("Configuration enregistrée.")
    } else throw new Error("Commande inconnue. Consultez help.")
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Échec de la commande."
  )
  process.exitCode = 1
}
