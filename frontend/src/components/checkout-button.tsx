"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useCart } from "@/hooks/useCart"
import { createClient } from "@/utils/supabase/client"
import type { CheckoutError, CheckoutResponse } from "@/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function CheckoutButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { items, clearCart } = useCart()
  const router = useRouter()

  const handleCheckout = async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push("/login")
        return
      }

      const payload = {
        items: items.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
        })),
      }

      const resp = await fetch(`${API_URL}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })

      const data: CheckoutError | CheckoutResponse = await resp.json()

      if (!resp.ok || "error" in data) {
        const err = data as CheckoutError
        if (err.out_of_stock && err.out_of_stock.length > 0) {
          setError(
            `Insufficient stock: ${err.out_of_stock.map((s) => `${s.title} (available ${s.available}, requested ${s.requested})`).join(", ")}`
          )
        } else {
          setError(err.error || "Checkout failed")
        }
        return
      }

      const success = data as CheckoutResponse
      clearCart()
      window.location.href = success.whatsapp_deep_link
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="border border-[#bf3a2b] bg-[#fef2f0] p-3 font-mono text-xs text-[#bf3a2b]" role="alert" aria-live="polite">
          {error}
        </div>
      )}
      <Button
        className="w-full bg-[#d45113] py-6 text-base text-white hover:bg-[#bf4610]"
        size="lg"
        disabled={loading || items.length === 0}
        onClick={handleCheckout}
      >
        {loading ? "Processing\u2026" : "Checkout via WhatsApp"}
      </Button>
    </div>
  )
}
