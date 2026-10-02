import js from "@eslint/js"
import tseslint from "typescript-eslint"
export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "node:*",
            "react",
            "react-dom",
            "@agent-switch/web/*",
            "@agent-switch/server/*",
            "@agent-switch/ui/*",
          ],
        },
      ],
    },
  },
]
