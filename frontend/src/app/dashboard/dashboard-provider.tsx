"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

type DashboardSection = "overview" | "orders" | "approvals" | "products" | "sourcing"

interface DashboardContextValue {
  activeSection: DashboardSection
  setActiveSection: (section: DashboardSection) => void
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider")
  }
  return context
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSection] = useState<DashboardSection>("overview")

  return (
    <DashboardContext.Provider value={{ activeSection, setActiveSection }}>
      {children}
    </DashboardContext.Provider>
  )
}
