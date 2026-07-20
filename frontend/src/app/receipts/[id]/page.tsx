import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { ReceiptContent } from "./receipt-content"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ReceiptPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/login")
  }

  const userId = claimsData.claims.sub

  const { data: order } = await supabase
    .from("orders")
    .select("*, order_items(*, products:product_id(title))")
    .eq("readable_order_id", id)
    .single()

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Order not found</h1>
        <p className="text-muted-foreground mt-2">
          This order does not exist or you don&apos;t have access.
        </p>
      </div>
    )
  }

  if (order.user_id !== userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single()

    if (!profile || profile.role !== "admin") {
      return (
        <div className="container mx-auto px-4 py-12 text-center">
          <h1 className="text-2xl font-bold">Access denied</h1>
          <p className="text-muted-foreground mt-2">
            You don&apos;t have permission to view this order.
          </p>
        </div>
      )
    }
  }

  return <ReceiptContent order={order as never} />
}