"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/hooks/useCart"

interface CartDrawerProps {
  open?: boolean
  onClose?: () => void
}

export function CartDrawer({ open: externalOpen, onClose }: CartDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const { items, removeItem, updateQuantity, clearCart, totalLots, subtotal } = useCart()

  const isOpen = externalOpen ?? internalOpen

  const close = () => {
    if (onClose) onClose()
    else setInternalOpen(false)
  }

  const totalLotsCount = totalLots()
  const isWholesale = totalLotsCount >= 10
  const cartSubtotal = subtotal(isWholesale)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("cart") === "open") {
      setInternalOpen(true)
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={close} />

      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white">
        <div className="flex items-center justify-between border-b border-[#d7dce2] px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-[#6b7885]" />
            <h2 className="font-display text-base font-semibold text-[#14161a]">
              Cart ({items.length})
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={close} className="text-[#6b7885]">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {isWholesale && items.length > 0 && (
          <div className="border-b border-[#d7dce2] bg-[#edf3f8] px-4 py-2 font-mono text-xs font-medium text-[#1f4e79]">
            WHOLESALE PRICING APPLIED &mdash; &ge;10 LOTS
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-[#6b7885]">
              <ShoppingCart className="mb-2 h-12 w-12" />
              <p className="text-sm">Your cart is empty</p>
              <Button variant="link" onClick={close} asChild className="text-[#1f4e79]">
                <Link href="/">Browse products</Link>
              </Button>
            </div>
          )}

          {items.map((item) => {
            const itemWholesale = isWholesale && item.quantity >= item.product.minimum_wholesale_lots
            const price = itemWholesale
              ? Number(item.product.wholesale_price_per_lot)
              : Number(item.product.retail_price_per_lot)

            return (
              <div key={item.product.id} className="flex gap-3 border border-[#d7dce2] p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#14161a]">
                    {item.product.title}
                  </p>
                  <p className="font-mono text-xs text-[#6b7885]">
                    {itemWholesale ? "WHOLESALE" : "RETAIL"} &mdash; ${price.toFixed(2)} / lot
                  </p>
                  <p className="text-xs text-[#6b7885]">
                    Stock: {item.product.available_stock_lots} lots
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 border-[#d7dce2] text-[#6b7885]"
                    onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center font-mono text-sm font-medium text-[#14161a]">
                    {item.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 border-[#d7dce2] text-[#6b7885]"
                    onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                <div className="flex flex-col items-end justify-between">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-[#6b7885] hover:text-[#bf3a2b]"
                    onClick={() => removeItem(item.product.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <span className="font-mono text-sm font-semibold text-[#14161a]">
                    ${(price * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {items.length > 0 && (
          <div className="border-t border-[#d7dce2] p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#6b7885]">Total lots</span>
              <span className="font-mono font-medium text-[#14161a]">{totalLotsCount}</span>
            </div>

            {totalLotsCount < 10 && totalLotsCount > 0 && (
              <p className="font-mono text-xs text-[#1f4e79]">
                ADD {10 - totalLotsCount} MORE LOTS FOR WHOLESALE PRICING
              </p>
            )}

            <div className="flex items-center justify-between border-t border-[#d7dce2] pt-3 font-display text-lg font-bold text-[#14161a]">
              <span>Subtotal</span>
              <span className="font-mono">${cartSubtotal.toFixed(2)}</span>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-[#d7dce2] text-[#6b7885]"
                onClick={clearCart}
              >
                Clear
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-[#d45113] text-white hover:bg-[#bf4610]"
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
