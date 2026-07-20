"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { DashboardProvider, useDashboard } from "./dashboard-provider"
import { DashboardSidebar, MobileSidebar } from "./sidebar"
import { Overview } from "./sections/overview"
import { OrdersSection } from "./sections/orders"
import { ApprovalsSection } from "./sections/approvals"

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

function DashboardShell() {
  const { activeSection } = useDashboard()
  const [orders, setOrders] = useState<Order[]>([])
  const [pendingProfiles, setPendingProfiles] = useState<Profile[]>([])
  const [productCount, setProductCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    Promise.all([
      supabase
        .from("orders")
        .select("*, order_items(*, products:product_id(title))")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("role", "wholesale_pending"),
      supabase.from("products").select("id", { count: "exact", head: true }),
    ]).then(([ordersRes, profilesRes, productsRes]) => {
      setOrders(ordersRes.data || [])
      setPendingProfiles(profilesRes.data || [])
      setProductCount(productsRes.count ?? 0)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4" aria-live="polite">
        <Loader2 className="size-6 animate-spin text-[#d45113]" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <DashboardSidebar />
      <main id="main-content" className="lg:pl-60">
        <div className="border-b border-[#d7dce2] bg-white px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <MobileSidebar />
            <span className="text-xs text-[#8896a4]">
              {activeSection === "overview" && "Dashboard / Overview"}
              {activeSection === "orders" && "Dashboard / Orders"}
              {activeSection === "approvals" && "Dashboard / Approvals"}
            </span>
          </div>
        </div>
        <div className="px-4 py-6 lg:px-8">
          {activeSection === "overview" && (
            <Overview
              orders={orders}
              pendingApprovalsCount={pendingProfiles.length}
              productCount={productCount}
              loading={false}
            />
          )}
          {activeSection === "orders" && (
            <OrdersSection orders={orders} loading={false} />
          )}
          {activeSection === "approvals" && (
            <ApprovalsSection
              pendingProfiles={pendingProfiles}
              loading={false}
            />
          )}
        </div>
      </main>
    </div>
  )
}

export function DashboardContent() {
  return (
    <DashboardProvider>
      <DashboardShell />
    </DashboardProvider>
  )
}
