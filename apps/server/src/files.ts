import { createHash, randomUUID } from "node:crypto"
import {
  mkdir,
  readFile,
  rename,
  rm,
  lstat,
  chmod,
  writeFile,
} from "node:fs/promises"
import { dirname, resolve, relative, isAbsolute } from "node:path"

export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex")
export async function read(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}
export function inside(root: string, path: string) {
  const rel = relative(resolve(root), resolve(path))
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}
export async function writablePath(home: string, path: string) {
  if (!inside(home, path) || resolve(home) === resolve(path))
    throw new Error("Path outside the home directory.")
  let current = resolve(path)
  while (current !== resolve(home)) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`Cannot write to a symbolic link: ${current}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    current = dirname(current)
  }
}
export async function atomicWrite(path: string, value: Buffer | string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temp = `${path}.${randomUUID()}.tmp`
  let mode = 0o600
  try {
    mode = (await lstat(path)).mode & 0o777
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  try {
    await writeFile(temp, value, { mode: 0o600, flag: "wx" })
    await chmod(temp, mode)
    await rename(temp, path)
  } finally {
    await rm(temp, { force: true })
  }
}
