"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CheckoutButton } from "@/components/checkout-button"
import { useCart } from "@/hooks/useCart"

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

export function CheckoutPage() {
  const { items, totalLots, subtotal } = useCart()

  const totalLotsCount = totalLots()
  const isWholesale = totalLotsCount >= 10

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#14161a]">
          Your cart is empty
        </h1>
        <Button asChild className="mt-4 bg-[#d45113] text-white hover:bg-[#bf4610]">
          <Link href="/">Browse Products</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Button variant="ghost" size="sm" asChild className="mb-6 text-[#6b7885] hover:text-[#14161a]">
        <Link href="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Catalog
        </Link>
      </Button>

      <h1 className="font-display text-2xl font-bold text-[#14161a] mb-8">
        Review Order
      </h1>

      <div className="mb-8 space-y-2">
        {items.map((item) => {
          const itemWholesale =
            isWholesale && item.quantity >= item.product.minimum_wholesale_lots
          const price = itemWholesale
            ? Number(item.product.wholesale_price_per_lot)
            : Number(item.product.retail_price_per_lot)

          return (
            <div
              key={item.product.id}
              className="flex items-center justify-between border border-[#d7dce2] bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-[#14161a]">
                  {item.product.title}
                </p>
                <p className="font-mono text-xs text-[#6b7885]">
                  {itemWholesale ? "WHOLESALE" : "RETAIL"} &mdash; {currencyFormat.format(price)} / lot
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-xs text-[#6b7885]">
                  QTY {item.quantity}
                </p>
                <p className="font-mono font-semibold text-[#14161a]">
                  {currencyFormat.format(price * item.quantity)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mb-8 border border-[#d7dce2] bg-white px-4 py-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[#6b7885]">Total lots</span>
            <span className="font-mono font-medium text-[#14161a]">{totalLotsCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#6b7885]">Pricing tier</span>
            <span className="font-mono font-medium text-[#14161a]">
              {isWholesale ? "WHOLESALE" : "RETAIL"}
            </span>
          </div>
          {!isWholesale && totalLotsCount > 0 && (
            <p className="font-mono text-xs text-[#1f4e79]">
              ADD {10 - totalLotsCount} MORE LOTS FOR WHOLESALE PRICING
            </p>
          )}
          <div className="flex justify-between border-t border-[#d7dce2] pt-3 font-display text-lg font-bold text-[#14161a]">
            <span>Total</span>
            <span className="font-mono">{currencyFormat.format(subtotal(isWholesale))}</span>
          </div>
        </div>
      </div>

      <CheckoutButton />
    </div>
  )
}
