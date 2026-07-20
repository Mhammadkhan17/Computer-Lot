"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { DashboardProvider, useDashboard } from "./dashboard-provider"
import { DashboardSidebar, MobileSidebar } from "./sidebar"
import { Overview } from "./sections/overview"
import { OrdersSection } from "./sections/orders"
import { ApprovalsSection } from "./sections/approvals"
import { ProductsSection } from "./sections/products"
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
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const refreshOrders = useCallback(() => {
    const supabase = createClient()
    supabase
      .from("orders")
      .select("*, order_items(*, products:product_id(title))")
      .order("created_at", { ascending: false })
      .then((res) => {
        if (res.data) setOrders(res.data)
      })
  }, [])

  const refreshPendingProfiles = useCallback(() => {
    const supabase = createClient()
    supabase.from("profiles").select("*").eq("role", "wholesale_pending").then((res) => {
      if (res.data) setPendingProfiles(res.data)
    })
  }, [])

  useWebSocket("order_status_update", useCallback(() => refreshOrders(), [refreshOrders]))
  useWebSocket("profile_update", useCallback(() => refreshPendingProfiles(), [refreshPendingProfiles]))
  useWebSocket("product_update", useCallback(() => window.location.reload(), []))

  useEffect(() => {
    const supabase = createClient()

    Promise.all([
      supabase
        .from("orders")
        .select("*, order_items(*, products:product_id(title))")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("role", "wholesale_pending"),
      supabase.from("products").select("*").order("created_at", { ascending: false }),
    ]).then(([ordersRes, profilesRes, productsRes]) => {
      setOrders(ordersRes.data || [])
      setPendingProfiles(profilesRes.data || [])
      setProducts(productsRes.data || [])
      setProductCount(productsRes.data?.length ?? 0)
      setLoading(false)
    })
  }, [])

  const sectionTitles: Record<string, string> = {
    overview: "Overview",
    orders: "Orders",
    products: "Products",
    approvals: "Approvals",
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4" aria-live="polite">
        <Loader2 className="size-6 animate-spin text-accent" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <DashboardSidebar />
      <main id="main-content" className="lg:pl-60">
        <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 lg:px-8">
          <MobileSidebar />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Dashboard</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-foreground">{sectionTitles[activeSection]}</span>
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
            <OrdersSection orders={orders} loading={false} onStatusChange={refreshOrders} />
          )}
          {activeSection === "products" && (
            <ProductsSection products={products} loading={false} />
          )}
          {activeSection === "approvals" && (
            <ApprovalsSection
              pendingProfiles={pendingProfiles}
              loading={false}
              onAction={refreshPendingProfiles}
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
