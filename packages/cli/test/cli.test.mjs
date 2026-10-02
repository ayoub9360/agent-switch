import { test } from "node:test"
import assert from "node:assert/strict"
import { spawn, execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createServer } from "node:net"

const exec = promisify(execFile)
const entry =
  process.env.CLI_TEST_ENTRY ?? resolve(import.meta.dirname, "../dist/cli.js")

test("packaged CLI lifecycle, assets, API, commands and instance reuse", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "agent-switch-cli-"))
  const env = {
    ...process.env,
    AGENT_SWITCH_HOME: home,
    CODEX_HOME: join(home, ".codex"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
  }
  delete env.AGENT_SWITCH_PORT
  delete env.AGENT_SWITCH_API_URL
  t.after(() => rm(home, { recursive: true, force: true }))
  const run = (...args) =>
    exec(process.execPath, [entry, ...args], { env, cwd: home })
  assert.match((await run("--help")).stdout, /--no-open/)
  assert.match((await run("--version")).stdout, /^\d+\.\d+\.\d+/)
  await assert.rejects(run("--port", "invalid", "--no-open"), /Port must be/)

  // Intercept the OS opener, leaving the launcher and the open package intact.
  const opener = join(home, "opener.mjs")
  const browserLog = join(home, "browser.json")
  await writeFile(
    opener,
    `
    import childProcess from "node:child_process"
    import { EventEmitter } from "node:events"
    import { writeFileSync } from "node:fs"
    childProcess.spawn = (command, args) => {
      writeFileSync(${JSON.stringify(browserLog)}, JSON.stringify({ command, args }))
      const child = new EventEmitter()
      child.unref = () => {}
      return child
    }
  `
  )
  const child = spawn(
    process.execPath,
    ["--import", opener, entry, "--port", "0"],
    {
      env,
      cwd: home,
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  const exited = new Promise((resolve) =>
    child.once("exit", (code) => resolve(code))
  )
  t.after(async () => {
    child.kill("SIGTERM")
    await exited
  })
  let output = ""
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Startup timeout: ${output}`)),
      15000
    )
    child.once("exit", () => {
      clearTimeout(timer)
      reject(new Error(`Early exit: ${output}`))
    })
    child.stderr.on("data", (chunk) => {
      output += chunk
    })
    child.stdout.on("data", (chunk) => {
      output += chunk
      const match = output.match(/available at (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
  })
  let opened
  for (let attempt = 0; attempt < 100; attempt++) {
    opened = await readFile(browserLog, "utf8").catch(() => undefined)
    if (opened) break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.ok(opened, "The CLI must invoke the browser opener")
  // On Windows, open encodes the URL in a PowerShell command.
  const browserArgs = JSON.parse(opened).args
  assert.ok(
    browserArgs.includes(url) ||
      browserArgs.some((arg) =>
        Buffer.from(arg, "base64").toString("utf16le").includes(url)
      )
  )
  const html = await (await fetch(url)).text()
  assert.match(html, /<html/)
  const asset = html.match(/src="([^"]+\.js)"/)[1]
  assert.equal((await fetch(new URL(asset, url))).status, 200)
  const headers = { "X-Agent-Switch": "1", Origin: url }
  assert.equal((await fetch(`${url}/api/workspace`, { headers })).status, 200)
  assert.equal(
    (
      await fetch(`${url}/api/workspace`, {
        headers: { ...headers, Origin: "https://example.com" },
      })
    ).status,
    403
  )
  assert.equal(
    JSON.parse(
      await readFile(join(home, ".agent-switch/endpoint.json"), "utf8")
    ).url,
    url
  )
  assert.match((await run("--no-open")).stdout, /Using the running instance/)
  assert.ok(
    JSON.parse((await run("workspace", "--json")).stdout).profiles.length
  )
  assert.ok(Array.isArray(JSON.parse((await run("plan")).stdout)))
  child.kill("SIGINT")
  assert.equal(await exited, 0)
  await assert.rejects(readFile(join(home, ".agent-switch/server.lock")), {
    code: "ENOENT",
  })
  await assert.rejects(readFile(join(home, ".agent-switch/endpoint.json")), {
    code: "ENOENT",
  })
})

test("occupied default port falls back; explicit occupied port fails and releases lock", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "agent-switch-port-"))
  const env = {
    ...process.env,
    AGENT_SWITCH_HOME: home,
    CODEX_HOME: join(home, ".codex"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
  }
  delete env.AGENT_SWITCH_PORT
  const blocker = createServer()
  await new Promise((resolve, reject) => {
    blocker.once("error", (error) =>
      error.code === "EADDRINUSE" ? resolve() : reject(error)
    )
    blocker.listen(4141, "127.0.0.1", resolve)
  })
  t.after(() => {
    blocker.close()
  })
  t.after(() => rm(home, { recursive: true, force: true }))
  await assert.rejects(
    exec(process.execPath, [entry, "--no-open", "--port", "4141"], { env }),
    /EADDRINUSE/
  )
  await assert.rejects(readFile(join(home, ".agent-switch/server.lock")), {
    code: "ENOENT",
  })
  const child = spawn(process.execPath, [entry, "--no-open"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  t.after(async () => {
    child.kill("SIGTERM")
    await exited
  })
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Startup timeout")), 15000)
    child.once("exit", () => {
      clearTimeout(timer)
      reject(new Error("Early exit"))
    })
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (match) {
        clearTimeout(timer)
        resolve(Number(match[1]))
      }
    })
  })
  assert.notEqual(port, 4141)
  child.kill("SIGTERM")
  assert.equal(await exited, 0)
})

test("an unverified live instance is preserved", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "agent-switch-lock-"))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(join(home, ".agent-switch"))
  const lock = join(home, ".agent-switch/server.lock")
  await writeFile(lock, String(process.pid))
  await assert.rejects(
    exec(process.execPath, [entry, "--no-open"], {
      env: { ...process.env, AGENT_SWITCH_HOME: home },
    }),
    /already using this folder/
  )
  assert.equal(await readFile(lock, "utf8"), String(process.pid))
})
