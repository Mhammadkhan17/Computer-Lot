"use client"

import { ShoppingCart, ImageOff } from "lucide-react"
import { useState } from "react"
import { useCart } from "@/hooks/useCart"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import type { Product } from "@/types"

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const gradeConfig = {
  Grade_A: { label: "A", color: "bg-[#45845f]", badgeBg: "bg-[#45845f]/10", badgeText: "text-[#45845f]" },
  Grade_B: { label: "B", color: "bg-[#b8862c]", badgeBg: "bg-[#b8862c]/10", badgeText: "text-[#b8862c]" },
  Grade_C: { label: "C", color: "bg-[#c95d2b]", badgeBg: "bg-[#c95d2b]/10", badgeText: "text-[#c95d2b]" },
  For_Parts: { label: "FP", color: "bg-[#6b4c8a]", badgeBg: "bg-[#6b4c8a]/10", badgeText: "text-[#6b4c8a]" },
}

const gradeNames: Record<string, string> = {
  Grade_A: "Grade A",
  Grade_B: "Grade B",
  Grade_C: "Grade C",
  For_Parts: "For Parts",
}

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCart((s) => s.addItem)
  const grade = gradeConfig[product.grade]
  const inStock = product.available_stock_lots > 0
  const [imgError, setImgError] = useState(false)
  const imageUrl = product.images?.[0]

  return (
    <Card className="flex flex-col overflow-hidden border-[#d7dce2] bg-white shadow-none">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#f0f2f5]">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={product.title}
            width={400}
            height={300}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-[#6b7885]" />
          </div>
        )}
        <span
          className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center font-mono text-[10px] font-bold text-white ${grade.color}`}
        >
          {grade.label}
        </span>
        {product.grade === "For_Parts" && (
          <span className={`absolute right-2 top-2 px-2 py-0.5 font-mono text-[10px] font-bold text-white ${grade.color}`}>
            AS-IS
          </span>
        )}
      </div>

      <CardContent className="flex-1 space-y-3 p-4 pb-3">
        <div>
          <h3 className="font-display text-sm font-semibold leading-snug text-[#14161a]">
            {product.title}
          </h3>
          {product.description && (
            <p className="mt-0.5 text-xs leading-snug text-[#6b7885] line-clamp-2">
              {product.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] text-[#6b7885]">
          <span>SKU LOT-{product.sku}</span>
          <span className="text-[#d7dce2]">|</span>
          <span>{product.items_per_lot}/lot</span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[#6b7885]">Retail</span>
            <span className="font-mono font-medium text-[#14161a]">
              {currencyFormat.format(Number(product.retail_price_per_lot))}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#6b7885]">Wholesale</span>
            <span className="font-mono font-medium text-[#1f4e79]">
              {currencyFormat.format(Number(product.wholesale_price_per_lot))}
              {product.minimum_wholesale_lots > 1 && (
                <span className="ml-1 text-[10px] text-[#6b7885]">
                  /{product.minimum_wholesale_lots}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-[#6b7885]">
            {inStock
              ? `${product.available_stock_lots} lots available`
              : "Out of stock"}
          </span>
          {inStock && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 bg-[#45845f]" />
              <span className="font-mono text-[11px] text-[#45845f]">In Stock</span>
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-3 pt-0">
        <button
          onClick={() => addItem(product)}
          disabled={!inStock}
          className="flex w-full items-center justify-center gap-2 bg-[#d45113] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#bf4610] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ShoppingCart className="h-4 w-4" />
          {inStock ? "Add to Cart" : "Out of Stock"}
        </button>
      </CardFooter>
    </Card>
  )
}
