"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Search } from "lucide-react"
import { useState } from "react"

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

interface OrdersSectionProps {
  orders: Order[]
  loading: boolean
}

export function OrdersSection({ orders, loading }: OrdersSectionProps) {
  const [search, setSearch] = useState("")

  const filtered = orders.filter(
    (o) =>
      o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      `#${o.readable_order_id}`.includes(search)
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#14161a]">
          Orders
        </h1>
        <p className="mt-1 text-sm text-[#6b7885]">
          Manage and review all orders ({orders.length} total).
        </p>
      </div>

      <Card className="border-[#d7dce2] bg-white shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-4 p-4 pb-0">
          <CardTitle className="font-display text-base font-semibold text-[#14161a]">
            All Orders
          </CardTitle>
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8896a4]" aria-hidden="true" />
            <input
              type="text"
              name="search-orders"
              autoComplete="off"
              placeholder="Search orders…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-[#d7dce2] bg-white py-2 pl-9 pr-3 text-sm text-[#14161a] placeholder:text-[#8896a4] focus:border-[#1f4e79] focus:outline-none focus:ring-1 focus:ring-[#1f4e79]"
              aria-label="Search orders"
            />
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-[#e4e7eb]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[#8896a4]">
              {search ? "No orders match your search." : "No orders yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="All orders">
                <caption className="sr-only">All orders list</caption>
                <thead>
                  <tr className="border-b border-[#d7dce2] text-left text-xs font-semibold uppercase tracking-wider text-[#6b7885]">
                    <th className="pb-2 pr-4">Order</th>
                    <th className="pb-2 pr-4">Customer</th>
                    <th className="pb-2 pr-4">Items</th>
                    <th className="pb-2 pr-4">Total</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-[#e4e7eb] last:border-0"
                    >
                      <td className="py-2 pr-4 font-mono text-sm text-[#6b7885]">
                        #{order.readable_order_id}
                      </td>
                      <td className="py-2 pr-4 text-[#14161a]">
                        {order.customer_name}
                      </td>
                      <td className="py-2 pr-4 text-[#6b7885]">
                        {order.order_items?.length || 0}
                      </td>
                      <td className="py-2 pr-4 font-mono font-medium text-[#14161a]">
                        {currencyFormat.format(Number(order.total_amount))}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={statusVariant[order.status] || "outline"}
                        >
                          {order.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-2 font-mono text-[#6b7885]">
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
