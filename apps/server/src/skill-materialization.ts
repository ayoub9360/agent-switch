import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { hash, inside, writablePath } from "./files"
import { exists } from "./skill-storage"

export type SkillTree =
  | { kind: "file"; data: string; mode: number }
  | { kind: "link"; target: string }
  | { kind: "directory"; mode: number; children: Record<string, SkillTree> }

export interface Materialization {
  kind: "isolate-root" | "copy-skill"
  path: string
  source: string
  sourceHash: string
  originalLink?: string
  originalHash?: string
  tree: SkillTree
  backup: string
  stage: string
}

export async function skillTree(
  home: string,
  path: string,
  ancestors = new Set<string>()
): Promise<SkillTree> {
  const actual = await realpath(path)
  if (!inside(home, actual))
    throw new Error(`Skill source outside the home directory: ${path}`)
  if (ancestors.has(actual)) throw new Error(`Cyclic skill attachment: ${path}`)
  const info = await lstat(actual)
  if (info.isFile())
    return {
      kind: "file",
      data: (await readFile(actual)).toString("base64"),
      mode: info.mode & 0o777,
    }
  if (!info.isDirectory())
    throw new Error(`Unsupported skill attachment: ${path}`)
  const children: Record<string, SkillTree> = Object.create(null)
  const parents = new Set([...ancestors, actual])
  for (const name of (await readdir(actual)).sort())
    children[name] = await skillTree(home, join(actual, name), parents)
  return { kind: "directory", mode: info.mode & 0o777, children }
}

export async function directoryLinks(
  home: string,
  source: string
): Promise<SkillTree> {
  const actual = await realpath(source)
  if (!inside(home, actual))
    throw new Error(`Skill source outside the home directory: ${source}`)
  const children: Record<string, SkillTree> = Object.create(null)
  for (const name of (await readdir(actual)).sort())
    children[name] = { kind: "link", target: join(actual, name) }
  return {
    kind: "directory",
    mode: (await lstat(actual)).mode & 0o777,
    children,
  }
}

export async function materialization(
  home: string,
  storage: string,
  path: string,
  source: string,
  kind: Materialization["kind"],
  originalLink?: string
): Promise<Materialization> {
  const tree =
    kind === "isolate-root"
      ? await directoryLinks(home, source)
      : await skillTree(home, source)
  const id = randomUUID()
  return {
    kind,
    path,
    source,
    sourceHash: treeHash(tree),
    originalLink,
    originalHash:
      originalLink === undefined ? treeHash(await rawTree(path)) : undefined,
    tree,
    backup: join(storage, "replaced-skills", id),
    stage: join(storage, "staged-skills", id),
  }
}

export function setSkillFile(
  tree: SkillTree,
  path: string,
  data: string,
  mode?: number
) {
  if (tree.kind !== "directory") throw new Error("A skill must be a directory.")
  const parts = path.split("/")
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        ["__proto__", "constructor", "prototype"].includes(part)
    )
  )
    throw new Error("Invalid skill path.")
  let node = tree
  for (const name of parts.slice(0, -1)) {
    const child = (node.children[name] ??= {
      kind: "directory",
      mode: 0o700,
      children: Object.create(null),
    })
    if (child.kind !== "directory")
      throw new Error(`Invalid skill folder: ${path}`)
    node = child
  }
  const name = parts.at(-1)!
  const previous = node.children[name]
  node.children[name] = {
    kind: "file",
    data,
    mode: mode ?? (previous?.kind === "file" ? previous.mode : 0o600),
  }
}

async function writeTree(path: string, tree: SkillTree) {
  if (tree.kind === "link") return symlink(tree.target, path)
  if (tree.kind === "file") {
    await writeFile(path, Buffer.from(tree.data, "base64"), {
      flag: "wx",
      mode: tree.mode,
    })
    await chmod(path, tree.mode)
    return
  }
  await mkdir(path, { mode: 0o700 })
  for (const [name, child] of Object.entries(tree.children))
    await writeTree(join(path, name), child)
  await chmod(path, tree.mode)
}

export async function checkMaterialization(
  home: string,
  operation: Materialization
) {
  const tree =
    operation.kind === "isolate-root"
      ? await directoryLinks(home, operation.source)
      : await skillTree(home, operation.source)
  if (treeHash(tree) !== operation.sourceHash)
    throw new Error(
      `Skill source changed: ${operation.source}. Refresh before applying.`
    )
}

export async function materialize(home: string, operation: Materialization) {
  await checkMaterialization(home, operation)
  await writablePath(home, dirname(operation.path))
  await writablePath(home, operation.backup)
  await writablePath(home, operation.stage)
  if ((await exists(operation.backup)) || (await exists(operation.stage)))
    throw new Error("Skill replacement already exists.")
  if (operation.originalLink !== undefined) {
    if ((await readlink(operation.path)) !== operation.originalLink)
      throw new Error(`The symlink has changed: ${operation.path}`)
  } else {
    await writablePath(home, operation.path)
    if (treeHash(await rawTree(operation.path)) !== operation.originalHash)
      throw new Error(`Skill changed: ${operation.path}`)
    if (
      treeHash(await skillTree(home, operation.path)) !== operation.sourceHash
    )
      throw new Error(`Skill changed: ${operation.path}`)
  }
  await mkdir(dirname(operation.backup), { recursive: true, mode: 0o700 })
  await mkdir(dirname(operation.stage), { recursive: true, mode: 0o700 })
  await writeTree(operation.stage, operation.tree)
  await rename(operation.path, operation.backup)
  await rename(operation.stage, operation.path)
}

async function rawTree(path: string): Promise<SkillTree> {
  const info = await lstat(path)
  if (info.isSymbolicLink())
    return { kind: "link", target: await readlink(path) }
  if (info.isFile())
    return {
      kind: "file",
      data: (await readFile(path)).toString("base64"),
      mode: info.mode & 0o777,
    }
  const children: Record<string, SkillTree> = Object.create(null)
  for (const name of (await readdir(path)).sort())
    children[name] = await rawTree(join(path, name))
  return { kind: "directory", mode: info.mode & 0o777, children }
}

export async function undoMaterializations(
  home: string,
  operations: Materialization[]
) {
  for (const operation of [...operations].reverse()) {
    if (await exists(operation.backup)) {
      await writablePath(home, dirname(operation.path))
      await writablePath(home, dirname(operation.backup))
      if (operation.originalLink !== undefined) {
        if ((await readlink(operation.backup)) !== operation.originalLink)
          throw new Error(`Skill backup changed: ${operation.backup}`)
      } else if (
        treeHash(await rawTree(operation.backup)) !== operation.originalHash
      )
        throw new Error(`Skill backup changed: ${operation.backup}`)
      if (await exists(operation.path)) {
        if (
          treeHash(await rawTree(operation.path)) !== treeHash(operation.tree)
        )
          throw new Error(
            `Cannot restore a skill modified externally: ${operation.path}`
          )
        await rm(operation.path, { recursive: true })
      }
      await rename(operation.backup, operation.path)
    }
    await writablePath(home, operation.stage)
    await rm(operation.stage, { recursive: true, force: true })
  }
}

export async function localSkillParents(
  home: string,
  storage: string,
  root: string,
  operations: Materialization[]
) {
  let path = home
  for (const part of relative(home, dirname(root)).split("/")) {
    if (!part) continue
    path = join(path, part)
    if (operations.some((op) => op.path === path)) continue
    const virtual = virtualSkillEntry(path, operations)
    const link =
      virtual ??
      ((await lstat(path)).isSymbolicLink() ? await readlink(path) : undefined)
    if (link === undefined) continue
    const source = await realpath(virtual ?? path)
    operations.push(
      await materialization(home, storage, path, source, "isolate-root", link)
    )
  }
}

export function virtualSkillEntry(path: string, operations: Materialization[]) {
  const parent = operations.find(
    (op) => op.path === dirname(path) && op.kind === "isolate-root"
  )
  if (!parent || parent.tree.kind !== "directory") return undefined
  const node = parent.tree.children[path.slice(parent.path.length + 1)]
  return node?.kind === "link" ? node.target : undefined
}

export function treeHash(tree: SkillTree) {
  return hash(
    JSON.stringify(tree, (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
          )
        : value
    )
  )
}

export async function traversesSkillPath(
  home: string,
  path: string,
  entry: string
) {
  for (let hop = 0; hop < 40; hop++) {
    if (!inside(home, path)) return false
    const parts = relative(home, path).split("/")
    let current = home
    let followed = false
    for (const [index, part] of parts.entries()) {
      current = join(current, part)
      if (inside(entry, current)) return true
      if (!(await exists(current))) return false
      if ((await lstat(current)).isSymbolicLink()) {
        path = resolve(
          dirname(current),
          await readlink(current),
          ...parts.slice(index + 1)
        )
        followed = true
        break
      }
    }
    if (!followed) return false
  }
  throw new Error(`Cyclic skill link: ${path}`)
}
