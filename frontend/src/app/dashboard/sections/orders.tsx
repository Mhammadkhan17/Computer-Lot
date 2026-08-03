"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Search } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import type { AdminOrder, OrderStatus } from "@/types"
import { STATUS_FILTERS, STATUS_FLOW, STATUS_META } from "./status-meta"

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const nextStatus: Record<string, OrderStatus> = {
  pending_whatsapp: "processing",
  processing: "completed",
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface OrdersSectionProps {
  orders: AdminOrder[]
  loading: boolean
  onStatusChange?: () => void
}

function OrderFlowStrip({ orders, loading }: { orders: AdminOrder[]; loading: boolean }) {
  const cancelledCount = orders.filter((o) => o.status === "cancelled").length

  return (
    <section
      className="border border-surface-dark-border bg-surface-dark"
      aria-label="Order flow by stage"
    >
      <div className="p-5 sm:px-6">
        <p className="font-mono text-[11px] font-medium tracking-[0.18em] text-text-dark-muted uppercase">
          Order flow
        </p>
        <div className="relative mt-7">
          <div
            aria-hidden="true"
            className="absolute inset-x-[12%] top-[10px] h-px bg-surface-dark-border"
          />
          <div className="relative grid grid-cols-3">
            {STATUS_FLOW.map((status) => {
              const meta = STATUS_META[status]
              const count = orders.filter((o) => o.status === status).length
              return (
                <div key={status} className="flex flex-col items-center px-2 text-center">
                  <span
                    aria-hidden="true"
                    className="relative z-10 size-5 rounded-full border border-surface-dark-border"
                    style={{ backgroundColor: meta.color }}
                  />
                  <p className="mt-3 font-mono text-2xl font-medium text-white tabular-nums">
                    {loading ? <Skeleton className="mx-auto h-7 w-10 bg-white/10" /> : count}
                  </p>
                  <p className="mt-1 font-mono text-[10px] font-medium tracking-[0.14em] text-text-dark-muted uppercase">
                    {meta.label}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3 border-t border-surface-dark-border pt-4">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-muted-foreground"
          />
          <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-text-dark-muted uppercase">
            Sidetrack · Cancelled
          </p>
          <p className="ml-auto font-mono text-sm text-text-dark-muted tabular-nums">
            {cancelledCount} {cancelledCount === 1 ? "order" : "orders"}
          </p>
        </div>
      </div>
    </section>
  )
}

export function OrdersSection({ orders, loading, onStatusChange }: OrdersSectionProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)

  const countFor = (status: OrderStatus | "all") =>
    status === "all" ? orders.length : orders.filter((o) => o.status === status).length

  const filtered = orders.filter((o) => {
    const matchesSearch =
      o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      `#${o.readable_order_id}`.includes(search)
    const matchesStatus = statusFilter === "all" || o.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleStatusChange = async (orderId: string, status: OrderStatus) => {
    setActionLoading(orderId)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`${API_URL}/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || "Status update failed")
      }
      toast.success(`Order #${orders.find((o) => o.id === orderId)?.readable_order_id ?? ""} marked as ${status}`)
      onStatusChange?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Status update failed"
      toast.error(msg)
    } finally {
      setActionLoading(null)
      setConfirmCancel(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Sort line / Orders
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground text-pretty">
          Order queue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {orders.length} orders on the line — awaiting customer, processing, completed.
        </p>
      </div>

      <OrderFlowStrip orders={orders} loading={loading} />

      <Card className="border-border bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-4 p-4 pb-0">
          <div>
            <CardTitle className="font-display text-base font-semibold text-foreground">
              Order queue
            </CardTitle>
            <CardDescription>All orders, staged down the line</CardDescription>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="text"
              name="search-orders"
              autoComplete="off"
              placeholder="Search orders\u2026"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search orders"
            />
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter orders by status">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.value
              return (
                <Button
                  key={f.value}
                  size="sm"
                  onClick={() => setStatusFilter(f.value)}
                  aria-pressed={active}
                  className={
                    active
                      ? "h-7 bg-accent px-3 font-mono text-[10px] font-medium text-accent-foreground tracking-[0.12em] uppercase hover:bg-accent/90"
                      : "h-7 border-border bg-transparent px-3 font-mono text-[10px] font-medium text-muted-foreground tracking-[0.12em] uppercase hover:text-foreground"
                  }
                >
                  {f.label}
                  <span className="ml-1.5 tabular-nums opacity-70">{countFor(f.value)}</span>
                </Button>
              )
            })}
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "No orders match your filters."
                  : "No orders yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="All orders">
                  <caption className="sr-only">All orders list</caption>
                  <thead>
                    <tr className="border-b border-border text-left font-mono text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                      <th className="pb-2 pr-4">Order</th>
                      <th className="pb-2 pr-4">Customer</th>
                      <th className="pb-2 pr-4 text-right">Lots</th>
                      <th className="pb-2 pr-4 text-right">Total</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Actions</th>
                      <th className="pb-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((order) => (
                      <tr key={order.id} className="border-b border-border last:border-0">
                        <td className="py-2.5 pr-4 font-mono text-sm text-muted-foreground">
                          #{order.readable_order_id}
                        </td>
                        <td className="py-2.5 pr-4 text-foreground">
                          {order.customer_name}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-sm text-foreground tabular-nums">
                          {(order.order_items ?? []).reduce((s, it) => s + it.quantity_ordered, 0)}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-sm font-medium text-foreground tabular-nums">
                          {currencyFormat.format(Number(order.total_amount))}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                            aria-label={STATUS_META[order.status].label}
                          >
                            <span
                              aria-hidden="true"
                              className="size-1.5 rounded-full"
                              style={{ backgroundColor: STATUS_META[order.status].color }}
                            />
                            {STATUS_META[order.status].label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex gap-1.5">
                            {nextStatus[order.status] && (
                              <Button
                                size="sm"
                                className="h-7 max-sm:min-h-[44px] bg-accent px-2 font-mono text-[10px] font-medium text-accent-foreground tracking-[0.12em] uppercase hover:bg-accent/90"
                                disabled={actionLoading === order.id}
                                onClick={() => handleStatusChange(order.id, nextStatus[order.status])}
                              >
                                {actionLoading === order.id
                                  ? "\u2026"
                                  : `Mark ${STATUS_META[nextStatus[order.status]].label.toLowerCase()}`}
                              </Button>
                            )}
                            {order.status !== "cancelled" && order.status !== "completed" && (
                              confirmCancel === order.id ? (
                                <div className="flex gap-1.5">
                                  <Button
                                    size="sm"
                                    className="h-7 max-sm:min-h-[44px] bg-destructive px-2 font-mono text-[10px] font-medium text-destructive-foreground tracking-[0.12em] uppercase"
                                    disabled={actionLoading === order.id}
                                    onClick={() => handleStatusChange(order.id, "cancelled")}
                                  >
                                    {actionLoading === order.id ? "\u2026" : "Confirm"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 max-sm:min-h-[44px] border-border px-2 font-mono text-[10px] font-medium tracking-[0.12em] uppercase"
                                    onClick={() => setConfirmCancel(null)}
                                  >
                                    No
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 max-sm:min-h-[44px] border-destructive px-2 font-mono text-[10px] font-medium text-destructive tracking-[0.12em] uppercase"
                                  onClick={() => setConfirmCancel(order.id)}
                                >
                                  Cancel
                                </Button>
                              )
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 font-mono text-sm text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
