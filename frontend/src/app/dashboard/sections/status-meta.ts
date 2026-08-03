import type { OrderStatus } from "@/types"

export const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  completed: { label: "Completed", color: "var(--color-grade-a)" },
  processing: { label: "Processing", color: "var(--color-inventory-600)" },
  pending_whatsapp: { label: "Awaiting customer", color: "var(--color-grade-b)" },
  cancelled: { label: "Cancelled", color: "var(--color-muted-foreground)" },
}

export const STATUS_FLOW: OrderStatus[] = [
  "pending_whatsapp",
  "processing",
  "completed",
]

export const STATUS_FILTERS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_whatsapp", label: "Awaiting customer" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]
