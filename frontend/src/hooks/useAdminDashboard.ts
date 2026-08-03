"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { useWebSocket } from "./useWebSocket"
import { loadDashboardData, loadOrders, loadPendingProfiles } from "@/lib/dashboard-data"
import type { AdminDashboardData } from "@/lib/dashboard-data"
import type { AdminOrder, AdminProfile, Product } from "@/types"

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === "string" && msg) return msg
  }
  return "Failed to load dashboard data"
}

export function useAdminDashboard(initialData?: AdminDashboardData) {
  const [orders, setOrders] = useState<AdminOrder[]>(initialData?.orders ?? [])
  const [pendingProfiles, setPendingProfiles] = useState<AdminProfile[]>(initialData?.pendingProfiles ?? [])
  const [products, setProducts] = useState<Product[]>(initialData?.products ?? [])
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const supabase = createClient()
    const data = await loadDashboardData(supabase)
    setOrders(data.orders)
    setPendingProfiles(data.pendingProfiles)
    setProducts(data.products)
  }, [])

  const loadOrdersOnly = useCallback(async () => {
    const supabase = createClient()
    setOrders(await loadOrders(supabase))
  }, [])

  const loadProfilesOnly = useCallback(async () => {
    const supabase = createClient()
    setPendingProfiles(await loadPendingProfiles(supabase))
  }, [])

  const refresh = useCallback(() => {
    setError(null)
    loadAll().catch((err) => setError(toErrorMessage(err)))
  }, [loadAll])

  const refreshOrders = useCallback(() => {
    setError(null)
    loadOrdersOnly().catch((err) => setError(toErrorMessage(err)))
  }, [loadOrdersOnly])

  const refreshPendingProfiles = useCallback(() => {
    setError(null)
    loadProfilesOnly().catch((err) => setError(toErrorMessage(err)))
  }, [loadProfilesOnly])

  useEffect(() => {
    loadAll()
      .then(() => setLoading(false))
      .catch((err) => {
        setError(toErrorMessage(err))
        setLoading(false)
      })
  }, [loadAll])

  useWebSocket("order_status_update", refreshOrders)
  useWebSocket("profile_update", refreshPendingProfiles)
  useWebSocket("product_update", refresh)

  return {
    orders,
    pendingProfiles,
    products,
    loading,
    error,
    refresh,
    refreshOrders,
    refreshPendingProfiles,
  }
}
