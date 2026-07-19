import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { DashboardContent } from "./dashboard-content"

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const role = (user.app_metadata?.role as string) ?? null
  if (!role || role !== "admin") {
    redirect("/")
  }

  return <DashboardContent />
}
