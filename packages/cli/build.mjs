import { build } from "esbuild"
import { chmod, cp, readFile, rm } from "node:fs/promises"

const directory = import.meta.dirname
const manifest = JSON.parse(
  await readFile(new URL("./package.json", import.meta.url), "utf8")
)
await rm(new URL("./dist", import.meta.url), { recursive: true, force: true })
await build({
  absWorkingDir: directory,
  entryPoints: {
    cli: "src/cli.mjs",
    service: "../../apps/server/src/service.ts",
    commands: "../../apps/server/src/cli.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22.12",
  external: [
    ...Object.keys(manifest.dependencies),
    "./service.js",
    "./commands.js",
  ],
  define: { AGENT_SWITCH_VERSION: JSON.stringify(manifest.version) },
})
await cp(
  new URL("../../apps/web/dist", import.meta.url),
  new URL("./dist/web", import.meta.url),
  { recursive: true }
)
await chmod(new URL("./dist/cli.js", import.meta.url), 0o755)
