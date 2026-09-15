"use client"

import Link from "next/link"
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/hooks/useCart"
import { useUserRoleLoaded } from "@/hooks/useUserRole"
import type { Product } from "@/types"

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

type PricingTier = "RETAIL" | "WHOLESALE"

function resolvePrice(
  product: Product,
  quantity: number,
  totalLots: number
): number {
  const retail = Number(product.retail_price_per_lot)
  const wholesale = Number(product.wholesale_price_per_lot)
  if (quantity < product.minimum_wholesale_lots) return retail
  if (totalLots >= 10) return Math.min(wholesale, retail)
  return retail
}

function resolveTier(
  product: Product,
  quantity: number,
  totalLots: number
): PricingTier {
  if (quantity < product.minimum_wholesale_lots) return "RETAIL"
  if (totalLots >= 10) return "WHOLESALE"
  return "RETAIL"
}

export function CartDrawer() {
  const { items, removeItem, updateQuantity, clearCart, totalLots, cartOpen, setCartOpen } = useCart()
  const roleLoaded = useUserRoleLoaded()

  const isOpen = cartOpen

  const close = () => setCartOpen(false)

  const totalLotsCount = totalLots()
  const linePrices = items.map((item) =>
    resolvePrice(item.product, item.quantity, totalLotsCount)
  )
  const lineTiers = items.map((item) =>
    resolveTier(item.product, item.quantity, totalLotsCount)
  )
  const cartSubtotal = items.reduce((sum, i, idx) => sum + linePrices[idx] * i.quantity, 0)

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
      />

      <div
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-card transition-transform duration-300 ease-out sm:max-w-lg ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ overscrollBehavior: "contain" }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-display text-base font-semibold text-foreground">
              Cart ({items.length})
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Close cart" className="text-muted-foreground">
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <ShoppingCart className="mb-2 h-12 w-12" aria-hidden="true" />
              <p className="text-sm">Your cart is empty</p>
              <Button variant="link" onClick={close} asChild className="text-primary">
                <Link href="/">Browse products</Link>
              </Button>
            </div>
          )}

          {items.map((item, idx) => {
            const price = linePrices[idx]
            const tier = lineTiers[idx]

            return (
              <div key={item.product.id} className="flex gap-2 border border-border p-3 max-[400px]:flex-col max-[400px]:gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.product.title}
                  </p>
                  {roleLoaded ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      {tier} &mdash; {currencyFormat.format(price)} / lot
                    </p>
                  ) : (
                    <p className="font-mono text-xs text-muted-foreground animate-pulse">
                      Checking pricing&hellip;
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Stock: {item.product.available_stock_lots} lots
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="min-h-[44px] min-w-[44px] text-muted-foreground"
                      aria-label="Decrease quantity"
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <span className="w-8 text-center font-mono text-sm font-medium text-foreground">
                      {item.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="min-h-[44px] min-w-[44px] text-muted-foreground"
                      aria-label="Increase quantity"
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
                      aria-label="Remove item"
                      onClick={() => removeItem(item.product.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <span className="font-mono text-sm font-semibold text-foreground max-[400px]:text-xs">
                      {roleLoaded ? currencyFormat.format(price * item.quantity) : "\u2026"}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {items.length > 0 && (
          <div className="border-t border-border p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total lots</span>
              <span className="font-mono font-medium text-foreground">{totalLotsCount}</span>
            </div>

            {totalLotsCount < 10 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Wholesale pricing</span>
                  <span>{totalLotsCount}/10 lots</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.min(100, (totalLotsCount / 10) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Add {10 - totalLotsCount} more lots to unlock wholesale pricing.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-3 font-display text-lg font-bold text-foreground">
              <span>Subtotal</span>
              <span className="font-mono">{roleLoaded ? currencyFormat.format(cartSubtotal) : "\u2026"}</span>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-muted-foreground"
                onClick={() => {
                  if (window.confirm("Clear all items from your cart?")) clearCart()
                }}
              >
                Clear
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                asChild
              >
                <Link href="/checkout">Checkout</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
