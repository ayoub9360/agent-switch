import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type { WorkspaceService } from "@/application/workspace-service"
import type {
  ProfileTransfer,
  ConfigurationDiscovery,
} from "@/application/ports"
import type { Workspace } from "@/domain/workspace"

interface Snapshot {
  workspace: Workspace | null
  busy: boolean
  error: string | null
  notice: string | null
}

/** Driving adapter. React consumes snapshots; all mutations go through use cases. */
export class WorkspaceController {
  private state: Snapshot = {
    workspace: null,
    busy: false,
    error: null,
    notice: null,
  }
  private listeners = new Set<() => void>()
  readonly service: WorkspaceService
  readonly transfer: ProfileTransfer
  readonly discovery: ConfigurationDiscovery
  constructor(
    service: WorkspaceService,
    transfer: ProfileTransfer,
    discovery: ConfigurationDiscovery
  ) {
    this.service = service
    this.transfer = transfer
    this.discovery = discovery
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.state
  private publish(patch: Partial<Snapshot>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }
  dismiss = () => this.publish({ error: null, notice: null })
  notify = (notice: string) => this.publish({ notice, error: null })
  fail = (error: unknown) =>
    this.publish({
      error:
        error instanceof Error ? error.message : "Une erreur est survenue.",
      notice: null,
    })
  async run(operation: () => Promise<Workspace>, notice?: string) {
    if (this.state.busy) return false
    this.publish({ busy: true, error: null })
    try {
      const workspace = await operation()
      this.publish({ workspace, busy: false, notice: notice ?? null })
      return true
    } catch (error) {
      this.fail(error)
      this.publish({ busy: false })
      return false
    }
  }
  initialize = () => this.run(() => this.service.load())
}

const WorkspaceContext = createContext<WorkspaceController | null>(null)
export function WorkspaceProvider({
  controller,
  children,
}: {
  controller: WorkspaceController
  children: ReactNode
}) {
  return <WorkspaceContext value={controller}>{children}</WorkspaceContext>
}
export function useWorkspace() {
  const controller = useContext(WorkspaceContext)
  if (!controller) throw new Error("WorkspaceProvider manquant.")
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot
  )
  return { ...snapshot, controller }
}
