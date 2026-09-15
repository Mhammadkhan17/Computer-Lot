"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Search } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { useWebSocket } from "@/hooks/useWebSocket"

interface OrderItem {
  id: string
  product_id: string
  quantity_ordered: number
  unit_price_applied: number
  products: { title: string } | null
}

interface Order {
  id: string
  readable_order_id: number
  customer_name: string
  total_amount: number
  status: string
  created_at: string
  order_items: OrderItem[]
}

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const statusVariant: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  pending_whatsapp: "outline",
  processing: "secondary",
  completed: "default",
  cancelled: "destructive",
}

const nextStatus: Record<string, string> = {
  pending_whatsapp: "processing",
  processing: "completed",
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function OrdersSection() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*, products:product_id(title))")
      .order("created_at", { ascending: false })
    if (data) setOrders(data)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useWebSocket("order_status_update", useCallback(() => { refresh() }, [refresh]))

  const filtered = orders.filter(
    (o) =>
      o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      `#${o.readable_order_id}`.includes(search)
  )

  const handleStatusChange = async (orderId: string, status: string) => {
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
      refresh()
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
        <h1 className="font-display text-2xl font-bold text-foreground">
          Orders
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage and track customer orders.
        </p>
      </div>

      <Card className="border-border bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-4 p-4 pb-0">
          <div>
            <CardTitle className="font-display text-base font-semibold text-foreground">
              All Orders
            </CardTitle>
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
          <div className="mt-4">
            {loading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {search ? "No orders match your search." : "No orders yet."}
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
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            {order.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex gap-1.5">
                            {nextStatus[order.status] && (
                              <Button
                                size="sm"
                                className="h-7 bg-accent px-2 font-mono text-[10px] font-medium text-accent-foreground tracking-[0.12em] uppercase hover:bg-accent/90"
                                disabled={actionLoading === order.id}
                                onClick={() => handleStatusChange(order.id, nextStatus[order.status])}
                              >
                                {actionLoading === order.id ? "\u2026" : `Mark ${nextStatus[order.status].replace(/_/g, " ")}`}
                              </Button>
                            )}
                            {order.status !== "cancelled" && order.status !== "completed" && (
                              confirmCancel === order.id ? (
                                <div className="flex gap-1.5">
                                  <Button
                                    size="sm"
                                    className="h-7 bg-destructive px-2 font-mono text-[10px] font-medium text-destructive-foreground tracking-[0.12em] uppercase"
                                    disabled={actionLoading === order.id}
                                    onClick={() => handleStatusChange(order.id, "cancelled")}
                                  >
                                    {actionLoading === order.id ? "\u2026" : "Confirm"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 border-border px-2 font-mono text-[10px] font-medium tracking-[0.12em] uppercase"
                                    onClick={() => setConfirmCancel(null)}
                                  >
                                    No
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-destructive px-2 font-mono text-[10px] font-medium text-destructive tracking-[0.12em] uppercase"
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
