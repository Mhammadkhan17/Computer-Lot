"use client"

import { Loader2, RefreshCw } from "lucide-react"
import { DashboardProvider, useDashboard } from "./dashboard-provider"
import { DashboardSidebar, MobileSidebar } from "./sidebar"
import { Overview } from "./sections/overview"
import { OrdersSection } from "./sections/orders"
import { ApprovalsSection } from "./sections/approvals"
import { ProductsSection } from "./sections/products"
import { useAdminDashboard } from "@/hooks/useAdminDashboard"
import type { AdminDashboardData } from "@/lib/dashboard-data"

function DashboardShell({ initialData }: { initialData?: AdminDashboardData }) {
  const { activeSection } = useDashboard()
  const {
    orders,
    pendingProfiles,
    products,
    productCount,
    loading,
    error,
    refresh,
    refreshOrders,
    refreshPendingProfiles,
  } = useAdminDashboard(initialData)

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
          <button
            onClick={refresh}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Refresh dashboard data"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </button>
        </div>
        {error && (
          <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive" role="alert" aria-live="polite">
            {error}
          </div>
        )}
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
            <ProductsSection products={products} loading={false} onRefresh={refresh} />
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

export function DashboardContent({ initialData }: { initialData?: AdminDashboardData }) {
  return (
    <DashboardProvider>
      <DashboardShell initialData={initialData} />
    </DashboardProvider>
  )
}
