"use client"

import Link from "next/link"
import { ArrowLeft, ImageOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CheckoutButton } from "@/components/checkout-button"
import { useCart } from "@/hooks/useCart"
import { useUserRole } from "@/hooks/useUserRole"
import { resolvePrice, resolveTier } from "@/lib/pricing"

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const gradeColors: Record<string, string> = {
  Grade_A: "bg-grade-a",
  Grade_B: "bg-grade-b",
  Grade_C: "bg-grade-c",
  For_Parts: "bg-grade-parts",
}

export function CheckoutPage() {
  const { items, totalLots } = useCart()
  const role = useUserRole()

  const totalLotsCount = totalLots()
  const linePrices = items.map((item) =>
    resolvePrice(item.product, item.quantity, role, totalLotsCount)
  )
  const lineTiers = items.map((item) =>
    resolveTier(item.product, item.quantity, role, totalLotsCount)
  )
  const uniqueTiers = Array.from(new Set(lineTiers))
  const summaryTier = uniqueTiers.length === 1 ? uniqueTiers[0] : "MIXED"
  const totalAmount = items.reduce(
    (sum, i, idx) => sum + linePrices[idx] * i.quantity,
    0
  )

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
        {items.map((item, idx) => {
          const price = linePrices[idx]
          const tier = lineTiers[idx]
          const image = item.product.images?.[0]

          return (
            <div
              key={item.product.id}
              className="flex items-center gap-4 border border-border bg-card px-4 py-3"
            >
              <div className="relative size-14 shrink-0 overflow-hidden bg-muted">
                <div className="flex h-full w-full items-center justify-center">
                  <ImageOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                {image && (
                  <img
                    src={image}
                    alt={item.product.title}
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                  />
                )}
                <span className={`absolute left-0 top-0 flex h-4 w-4 items-center justify-center font-mono text-[8px] font-bold text-white ${gradeColors[item.product.grade] || "bg-muted"}`}>
                  {item.product.grade === "Grade_A" ? "A" : item.product.grade === "Grade_B" ? "B" : item.product.grade === "Grade_C" ? "C" : "FP"}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {item.product.title}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {tier} &mdash; {currencyFormat.format(price)} / lot
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
              {summaryTier}
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-3 font-display text-lg font-bold text-foreground">
            <span>Total</span>
            <span className="font-mono">
              {currencyFormat.format(totalAmount)}
            </span>
          </div>
        </div>
      </div>

      <CheckoutButton />
    </div>
  )
}