import { createBrowserRuntime } from "@/infrastructure/browser-runtime"
import { WorkspaceService } from "@/application/workspace-service"
import { LocalApi } from "@/infrastructure/http-repository"
import { BrowserProfileTransfer } from "@/infrastructure/browser-transfer"
import { WorkspaceController } from "@/presentation/workspace-context"

/** Composition root: the only place that binds use cases to concrete adapters. */
export function bootstrap() {
  const api = new LocalApi()
  const service = new WorkspaceService(api, createBrowserRuntime())
  const controller = new WorkspaceController(
    service,
    new BrowserProfileTransfer(),
    api
  )
  void controller.initialize()
  return controller
}
