import js from "@eslint/js"
import globals from "globals"

export default [
  { ignores: ["dist"] },
  js.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, AGENT_SWITCH_VERSION: "readonly" },
    },
  },
]
