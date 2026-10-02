import {
  Check,
  ChevronRight,
  CircleDashed,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@agent-switch/ui/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@agent-switch/ui/components/dialog"
import type { Assistant } from "@/domain/workspace"
import codexLogo from "@/assets/logos/codex.svg"
import claudeCodeLogo from "@/assets/logos/claude-code.svg"

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "green" | "violet" | "amber"
}) {
  return <span className={cn("pill", `pill-${tone}`)}>{children}</span>
}
export function AssistantLogo({ assistant }: { assistant: Assistant }) {
  const logo = assistant === "claude" ? claudeCodeLogo : codexLogo
  return (
    <span
      aria-hidden="true"
      className={cn("assistant-logo", assistant)}
      style={{ maskImage: `url(${JSON.stringify(logo)})` }}
    />
  )
}
export function AssistantMark({ assistant }: { assistant: Assistant }) {
  return (
    <span aria-hidden="true" className={cn("assistant-mark", assistant)}>
      <AssistantLogo assistant={assistant} />
    </span>
  )
}
export function EmptyState({
  icon: Icon = CircleDashed,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string
  description: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className={cn("app-dialog", wide && "app-dialog-wide")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
export function TextAction({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button type="button" className="text-action" onClick={onClick}>
      {children}
      <ChevronRight size={14} />
    </button>
  )
}
export function CheckLine({ children }: { children: ReactNode }) {
  return (
    <div className="check-line">
      <Check size={14} />
      {children}
    </div>
  )
}
