import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  server: {
    port: 4141,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4142" },
  },
  preview: {
    port: 4141,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4142" },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
