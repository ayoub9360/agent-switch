import { build } from "esbuild"
import { chmod, cp, mkdir, readFile, rm } from "node:fs/promises"

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

for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
  await cp(
    new URL(`../../${name}`, import.meta.url),
    new URL(`./${name}`, import.meta.url)
  )
await mkdir(new URL("./dist/licenses", import.meta.url), { recursive: true })
await cp(
  new URL("../../apps/web/src/assets/logos/LICENSE", import.meta.url),
  new URL("./dist/licenses/lobe-icons.LICENSE", import.meta.url)
)
await cp(
  new URL(
    "../ui/node_modules/@fontsource-variable/geist/LICENSE",
    import.meta.url
  ),
  new URL("./dist/licenses/geist.LICENSE", import.meta.url)
)
