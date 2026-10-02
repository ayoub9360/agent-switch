import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { object } from "./machine"

export async function testMcp(content: string) {
  const config = object(JSON.parse(content))
  const client = new Client(
    { name: "agent-switch", version: "0.1.0" },
    { capabilities: {} }
  )
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined) env[key] = value
  if (config.env)
    for (const [key, value] of Object.entries(object(config.env))) {
      if (typeof value !== "string")
        throw new Error("Invalid environment variable.")
      env[key] = value
    }
  let transport
  if (typeof config.command === "string") {
    if (
      config.args !== undefined &&
      (!Array.isArray(config.args) ||
        config.args.some((a) => typeof a !== "string"))
    )
      throw new Error("MCP arguments must be a list of strings.")
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args as string[] | undefined,
      env,
      stderr: "ignore",
    })
  } else if (typeof config.url === "string") {
    const url = new URL(config.url)
    if (!["https:", "http:"].includes(url.protocol))
      throw new Error("An HTTP or HTTPS URL is required.")
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(
      object(config.headers ?? config.http_headers ?? {})
    ))
      if (typeof value === "string") headers[key] = value
    for (const [key, value] of Object.entries(
      object(config.env_http_headers ?? {})
    ))
      if (typeof value === "string" && env[value]) headers[key] = env[value]
    if (
      typeof config.bearer_token_env_var === "string" &&
      env[config.bearer_token_env_var]
    )
      headers.Authorization = `Bearer ${env[config.bearer_token_env_var]}`
    transport =
      config.type === "sse"
        ? new SSEClientTransport(url, { requestInit: { headers } })
        : new StreamableHTTPClientTransport(url, { requestInit: { headers } })
  } else throw new Error("Missing MCP command or URL.")
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error("The MCP server did not respond within 10 seconds.")
            ),
          10_000
        )
      }),
    ])
    return {
      name: client.getServerVersion()?.name ?? "MCP",
      version: client.getServerVersion()?.version ?? "",
      message: "MCP connection and initialization succeeded.",
    }
  } finally {
    clearTimeout(timer)
    await client.close()
    await transport.close()
  }
}
