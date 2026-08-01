import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { loadDashboardData } from "@/lib/dashboard-data"
import { DashboardContent } from "./dashboard-content"

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") {
    redirect("/")
  }

  const initialData = await loadDashboardData(supabase).catch(() => ({
    orders: [],
    pendingProfiles: [],
    products: [],
  }))

  return <DashboardContent initialData={initialData} />
}
