import { z } from "zod"

export const resourceSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum(["instructions", "skills", "mcp", "hooks"]),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500),
  content: z.string().max(100_000),
  enabled: z.boolean(),
  targets: z
    .array(z.enum(["claude", "codex"]))
    .min(1)
    .max(2),
  scope: z.literal("global").default("global"),
  files: z.record(z.string(), z.string().max(7_000_000)).optional(),
  fileModes: z.record(z.string(), z.number().int().min(0).max(511)).optional(),
  source: z.string().max(300),
  instructionRole: z.enum(["primary", "override", "rule"]).optional(),
  instructionPaths: z
    .object({
      claude: z.string().max(4096).optional(),
      codex: z.string().max(4096).optional(),
    })
    .optional(),
})
const resourcesSchema = z
  .array(resourceSchema)
  .max(2000)
  .refine(
    (resources) =>
      new Set(resources.map((item) => item.id)).size === resources.length,
    "IDs must be unique."
  )
export const portableProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500),
  path: z.literal("").default(""),
  color: z.enum(["violet", "blue", "amber", "green"]),
  resources: resourcesSchema,
})
const profileSchema = portableProfileSchema.extend({
  id: z.string(),
  applied: resourcesSchema,
  history: z
    .array(
      z.object({
        id: z.string(),
        date: z.iso.datetime(),
        label: z.string(),
        count: z.number(),
        resources: resourcesSchema,
      })
    )
    .max(30),
})
export const workspaceSchema = z
  .object({
    machine: z
      .object({
        hostname: z.string(),
        home: z.string(),
        scannedAt: z.string(),
        warnings: z.array(z.string()),
        instructionRoots: z
          .object({ claude: z.string(), codex: z.string() })
          .optional(),
      })
      .optional(),
    version: z.literal(1),
    activeProfileId: z.string(),
    profiles: z.array(profileSchema).length(1),
    theme: z.enum(["dark", "light"]),
  })
  .refine(
    (value) =>
      value.profiles.some((profile) => profile.id === value.activeProfileId) &&
      new Set(value.profiles.map((profile) => profile.id)).size ===
        value.profiles.length
  )
export const exportSchema = z.object({
  format: z.literal("agent-switch-profile"),
  version: z.literal(1),
  profile: portableProfileSchema,
})
