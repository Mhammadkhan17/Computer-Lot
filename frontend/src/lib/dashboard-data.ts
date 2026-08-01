import type { SupabaseClient } from "@supabase/supabase-js"
import type { AdminOrder, AdminProfile, Product } from "@/types"

const ORDERS_SELECT = "*, order_items(*, products:product_id(title))"
const PENDING_PROFILES_SELECT = "*"
const PRODUCTS_SELECT = "*"

export interface AdminDashboardData {
  orders: AdminOrder[]
  pendingProfiles: AdminProfile[]
  products: Product[]
}

export async function loadOrders(supabase: SupabaseClient): Promise<AdminOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDERS_SELECT)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data as AdminOrder[]) ?? []
}

export async function loadPendingProfiles(supabase: SupabaseClient): Promise<AdminProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PENDING_PROFILES_SELECT)
    .eq("role", "wholesale_pending")
  if (error) throw error
  return (data as AdminProfile[]) ?? []
}

export async function loadProducts(supabase: SupabaseClient): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCTS_SELECT)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data as Product[]) ?? []
}

export async function loadDashboardData(supabase: SupabaseClient): Promise<AdminDashboardData> {
  const [orders, pendingProfiles, products] = await Promise.all([
    loadOrders(supabase),
    loadPendingProfiles(supabase),
    loadProducts(supabase),
  ])
  return { orders, pendingProfiles, products }
}
