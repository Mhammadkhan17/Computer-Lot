"use client"

import { Loader2, RefreshCw } from "lucide-react"
import { DashboardProvider, useDashboard } from "./dashboard-provider"
import { DashboardSidebar, MobileSidebar } from "./sidebar"
import { Overview } from "./sections/overview"
import { OrdersSection } from "./sections/orders"
import { ApprovalsSection } from "./sections/approvals"
import { ProductsSection } from "./sections/products"
import { SourcingSection } from "./sections/sourcing"

const sectionTitles: Record<string, string> = {
  overview: "Overview",
  orders: "Orders",
  products: "Products",
  sourcing: "Sourcing",
  approvals: "Approvals",
}

function DashboardShell() {
  const { activeSection } = useDashboard()

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
          {activeSection === "overview" && <Overview />}
          {activeSection === "orders" && <OrdersSection />}
          {activeSection === "products" && <ProductsSection />}
          {activeSection === "sourcing" && <SourcingSection />}
          {activeSection === "approvals" && <ApprovalsSection />}
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
