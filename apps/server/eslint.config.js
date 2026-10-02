import js from "@eslint/js"
import tseslint from "typescript-eslint"
import globals from "globals"
export default [
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
]
