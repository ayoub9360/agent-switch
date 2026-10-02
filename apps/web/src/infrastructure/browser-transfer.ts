import type { ProfileTransfer } from "@/application/ports"
import type { Profile } from "@/domain/workspace"
import { exportSchema } from "./schemas"

export class BrowserProfileTransfer implements ProfileTransfer {
  download(profile: Profile) {
    const { name, description, path, color, resources } = profile
    const payload = {
      format: "agent-switch-profile",
      version: 1,
      profile: { name, description, path, color, resources },
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `agent-switch-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  decode(text: string) {
    if (text.length > 20_000_000)
      throw new Error("Le fichier dépasse la limite de 20 Mo.")
    try {
      return exportSchema.parse(JSON.parse(text)).profile
    } catch {
      throw new Error(
        "Ce fichier n’est pas un export Agent Switch valide (version 1)."
      )
    }
  }
}
