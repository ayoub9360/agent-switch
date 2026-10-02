import { lstat, mkdir, rename, realpath, readlink } from "node:fs/promises"
import { dirname, join, resolve, relative } from "node:path"
import { hash, inside, writablePath } from "./files"

export interface SkillLink {
  path: string
  target: string
  resolved: string
}
export interface LinkedSkill {
  entry: string
  root: string
  file: string
  links: SkillLink[]
}
export interface LinkCheck extends SkillLink {
  currentPath: string
  targetPath?: string
}

export async function inspectSkill(
  home: string,
  root: string
): Promise<LinkedSkill | undefined> {
  const links: SkillLink[] = []
  let current = home
  let entry = root
  let actualRoot = root
  for (const part of relative(home, join(root, "SKILL.md")).split("/")) {
    const path = join(current, part)
    const info = await lstat(path)
    if (part === "SKILL.md") {
      actualRoot = current
    } else {
      entry = path
    }
    current = await realpath(path)
    if (!inside(home, current))
      throw new Error(`Symlink outside the home directory: ${path}`)
    if (info.isSymbolicLink())
      links.push({ path, target: await readlink(path), resolved: current })
  }
  return links.length
    ? { entry, root: actualRoot, file: current, links }
    : undefined
}

export async function checkSkillLinks(home: string, checks: LinkCheck[]) {
  for (const link of checks) {
    await writablePath(home, dirname(link.currentPath))
    if (
      (await readlink(link.currentPath)) !== link.target ||
      (await realpath(
        link.targetPath ?? resolve(dirname(link.path), link.target)
      )) !== link.resolved ||
      !inside(home, link.resolved)
    )
      throw new Error(
        `The symlink has changed: ${link.path}. Refresh the configuration.`
      )
  }
}

export interface DirectoryMove {
  from: string
  to: string
  linkTarget?: string
}
export const archivedSkill = (directory: string, root: string) =>
  join(directory, "disabled-skills", hash(root).slice(0, 24))
export async function exists(path: string) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}
export async function moveDirectory(home: string, move: DirectoryMove) {
  if (move.linkTarget !== undefined) {
    await writablePath(home, dirname(move.from))
    if ((await readlink(move.from)) !== move.linkTarget)
      throw new Error(`The symlink has changed: ${move.from}`)
  } else await writablePath(home, move.from)
  await writablePath(home, move.to)
  if (await exists(move.to))
    throw new Error(`The folder already exists: ${move.to}`)
  await mkdir(dirname(move.to), { recursive: true, mode: 0o700 })
  await rename(move.from, move.to)
}
export async function undoMoves(home: string, moves: DirectoryMove[]) {
  for (const move of [...moves].reverse()) {
    if (await exists(move.to)) {
      if (await exists(move.from))
        throw new Error(
          `Cannot restore: both ${move.from} and ${move.to} exist.`
        )
      await moveDirectory(home, { ...move, from: move.to, to: move.from })
    }
  }
}
