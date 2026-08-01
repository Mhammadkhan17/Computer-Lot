import { createClient } from "@/utils/supabase/client"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function broadcastProductUpdate() {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch(`${API_URL}/admin/products/broadcast-update`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  } catch {
    // broadcast is best-effort
  }
}
