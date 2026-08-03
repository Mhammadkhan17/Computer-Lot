import { notFound } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { ProductDetailContent } from "./product-detail-content"
import type { Product, UserRole } from "@/types"

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from("products").select("title").eq("id", id).single()
  if (!data) return { title: "Product Not Found" }
  return { title: `${data.title} — Lot Liquidation` }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single()

  if (!product) notFound()

  const { data: pool } = await supabase
    .from("products")
    .select("*")
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(20)

  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  let role: UserRole | null = null
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    isAdmin = profile?.role === "admin"
    role = (profile?.role as UserRole | undefined) ?? null
  }

  return (
    <ProductDetailContent
      product={product as Product}
      relatedPool={(pool as Product[]) || []}
      isAdmin={isAdmin}
      role={role}
    />
  )
}
