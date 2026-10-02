import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["src/domain/**/*.{ts,tsx}", "src/application/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-dom",
                "@agent-switch/ui/*",
                "@/presentation/*",
                "@/infrastructure/*",
                "@/app/*",
                "../infrastructure/*",
                "../presentation/*",
              ],
              message:
                "Le domaine et les cas d’usage dépendent de ports, jamais des adaptateurs ou de React.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/presentation/**/*.{ts,tsx}"],
    ignores: ["**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/infrastructure/*", "@/app/*"],
              message: "Injecter les ports depuis la racine de composition.",
            },
          ],
        },
      ],
    },
  },
])
