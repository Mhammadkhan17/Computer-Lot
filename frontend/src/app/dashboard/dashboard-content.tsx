"use client"

import { useEffect, useState } from "react"
import { Barcode, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/client"

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

interface Profile {
  id: string
  full_name: string
  company_name?: string
  tax_registration_id?: string
  role: string
  created_at: string
}

const currencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

const statusVariant: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  pending_whatsapp: "outline",
  processing: "secondary",
  completed: "default",
  cancelled: "destructive",
}

export function DashboardContent() {
  const [orders, setOrders] = useState<Order[]>([])
  const [pendingProfiles, setPendingProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    Promise.all([
      supabase
        .from("orders")
        .select("*, order_items(*, products:product_id(title))")
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "wholesale_pending"),
    ]).then(([ordersRes, profilesRes]) => {
      setOrders(ordersRes.data || [])
      setPendingProfiles(profilesRes.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-7xl items-center justify-center px-4">
        <Loader2 className="h-6 w-6 animate-spin text-[#d45113]" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <Barcode className="h-6 w-6 text-[#d45113]" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold text-[#14161a]">
          Admin Dashboard
        </h1>
      </div>

      {pendingProfiles.length > 0 && (
        <div className="mb-8 border border-[#b8862c] bg-[#fefbf1] px-4 py-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-[#14161a]">
              Pending Wholesale Approvals
            </h2>
            <Badge variant="outline" className="border-[#b8862c] font-mono text-[#b8862c]">
              {pendingProfiles.length}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Pending wholesale approvals">
              <caption className="sr-only">Pending wholesale approval requests</caption>
              <thead>
                <tr className="border-b border-[#b8862c]/30 text-left text-xs font-semibold uppercase tracking-wider text-[#6b7885]">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Company</th>
                  <th className="pb-2 pr-4">Tax ID</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingProfiles.map((profile) => (
                  <tr key={profile.id} className="border-b border-[#e4e7eb] last:border-0">
                    <td className="py-2 pr-4 text-[#14161a]">{profile.full_name}</td>
                    <td className="py-2 pr-4 text-[#6b7885]">{profile.company_name || "\u2014"}</td>
                    <td className="py-2 pr-4 font-mono text-[#6b7885]">
                      {profile.tax_registration_id || "\u2014"}
                    </td>
                    <td className="flex gap-2 py-2">
                      <Button size="sm" className="bg-[#1f4e79] text-white hover:bg-[#1a4063]">
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="border-[#d7dce2] text-[#6b7885]">
                        Reject
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="border border-[#d7dce2] bg-white">
        <div className="border-b border-[#d7dce2] px-4 py-3">
          <h2 className="font-display text-base font-semibold text-[#14161a]">
            Orders ({orders.length})
          </h2>
        </div>
        <div className="p-4">
          {orders.length === 0 ? (
            <p className="text-sm text-[#6b7885]">No orders yet.</p>
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
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-[#e4e7eb] last:border-0">
                      <td className="py-2 pr-4 font-mono text-sm text-[#6b7885]">
                        #{order.readable_order_id}
                      </td>
                      <td className="py-2 pr-4 text-[#14161a]">{order.customer_name}</td>
                      <td className="py-2 pr-4 text-[#6b7885]">
                        {order.order_items?.length || 0}
                      </td>
                      <td className="py-2 pr-4 font-mono font-medium text-[#14161a]">
                        {currencyFormat.format(Number(order.total_amount))}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={statusVariant[order.status] || "outline"}>
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
        </div>
      </div>
    </div>
  )
}
