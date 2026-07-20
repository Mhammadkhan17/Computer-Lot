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
        <h1 className="font-display text-2xl font-bold text-foreground">
          Your cart is empty
        </h1>
        <Button asChild className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">
          <Link href="/">Browse Products</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Button variant="ghost" size="sm" asChild className="mb-6 text-muted-foreground hover:text-foreground">
        <Link href="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Catalog
        </Link>
      </Button>

      <h1 className="font-display text-2xl font-bold text-foreground mb-8">
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
              className="flex items-center justify-between gap-4 border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {item.product.title}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {itemWholesale ? "WHOLESALE" : "RETAIL"} &mdash; {currencyFormat.format(price)} / lot
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-xs text-muted-foreground">
                  QTY {item.quantity}
                </p>
                <p className="font-mono font-semibold text-foreground">
                  {currencyFormat.format(price * item.quantity)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mb-8 border border-border bg-card px-4 py-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total lots</span>
            <span className="font-mono font-medium text-foreground">{totalLotsCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pricing tier</span>
            <span className="font-mono font-medium text-foreground">
              {isWholesale ? "WHOLESALE" : "RETAIL"}
            </span>
          </div>
          {!isWholesale && totalLotsCount > 0 && (
            <p className="font-mono text-xs text-primary">
              ADD {10 - totalLotsCount} MORE LOTS FOR WHOLESALE PRICING
            </p>
          )}
          <div className="flex justify-between border-t border-border pt-3 font-display text-lg font-bold text-foreground">
            <span>Total</span>
            <span className="font-mono">{currencyFormat.format(subtotal(isWholesale))}</span>
          </div>
        </div>
      </div>

      <CheckoutButton />
    </div>
  )
}
