import { lstat, mkdir, rename } from "node:fs/promises"
import { dirname, join } from "node:path"
import { hash, writablePath } from "./files"

export interface DirectoryMove {
  from: string
  to: string
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
  await writablePath(home, move.from)
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
      await moveDirectory(home, { from: move.to, to: move.from })
    }
  }
}
