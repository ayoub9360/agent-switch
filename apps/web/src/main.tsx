import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@agent-switch/ui/globals.css"
import "@/presentation/styles.css"
import { App } from "./App"
import { bootstrap } from "@/app/bootstrap"
import { WorkspaceProvider } from "@/presentation/workspace-context"

const controller = bootstrap()
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkspaceProvider controller={controller}>
      <App />
    </WorkspaceProvider>
  </StrictMode>
)
