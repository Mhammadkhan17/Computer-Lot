"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Search } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import type { AdminOrder } from "@/types"

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

interface OrdersSectionProps {
  orders: AdminOrder[]
  loading: boolean
  onStatusChange?: () => void
}

export function OrdersSection({ orders, loading, onStatusChange }: OrdersSectionProps) {
  const [search, setSearch] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)

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
        <h1 className="font-display text-2xl font-bold text-foreground">
          Orders
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage and review all orders ({orders.length} total).
        </p>
      </div>

      <Card className="border-border bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-4 p-4 pb-0">
          <CardTitle className="font-display text-base font-semibold text-foreground">
            All Orders
          </CardTitle>
          <div className="relative max-w-xs w-full sm:max-w-xs">
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
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4">Order</th>
                    <th className="pb-2 pr-4">Customer</th>
                    <th className="pb-2 pr-4">Items</th>
                    <th className="pb-2 pr-4">Total</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Actions</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2 pr-4 font-mono text-sm text-muted-foreground">
                        #{order.readable_order_id}
                      </td>
                      <td className="py-2 pr-4 text-foreground">
                        {order.customer_name}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {order.order_items?.length || 0}
                      </td>
                      <td className="py-2 pr-4 font-mono font-medium text-foreground">
                        {currencyFormat.format(Number(order.total_amount))}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={statusVariant[order.status] || "outline"}
                        >
                          {order.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-1">
                          {nextStatus[order.status] && (
                            <Button
                              size="sm"
                              className="bg-accent text-accent-foreground hover:bg-accent/90 h-7 max-sm:min-h-[44px] px-2 text-xs"
                              disabled={actionLoading === order.id}
                              onClick={() => handleStatusChange(order.id, nextStatus[order.status])}
                            >
                              {actionLoading === order.id
                                ? "\u2026"
                                : `Mark ${nextStatus[order.status]}`}
                            </Button>
                          )}
                          {order.status !== "cancelled" && order.status !== "completed" && (
                            confirmCancel === order.id ? (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  className="bg-destructive text-destructive-foreground h-7 max-sm:min-h-[44px] px-2 text-xs"
                                  disabled={actionLoading === order.id}
                                  onClick={() => handleStatusChange(order.id, "cancelled")}
                                >
                                  {actionLoading === order.id ? "\u2026" : "Confirm"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 max-sm:min-h-[44px] px-2 text-xs border-border"
                                  onClick={() => setConfirmCancel(null)}
                                >
                                  No
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 max-sm:min-h-[44px] px-2 text-xs border-destructive text-destructive"
                                onClick={() => setConfirmCancel(order.id)}
                              >
                                Cancel
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                      <td className="py-2 font-mono text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
