"use client"

import { ShoppingCart, ImageOff } from "lucide-react"
import { useState } from "react"
import Link from "next/link"
import { useCart } from "@/hooks/useCart"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import type { Product } from "@/types"

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const gradeConfig = {
  Grade_A: { label: "A", color: "bg-grade-a" },
  Grade_B: { label: "B", color: "bg-grade-b" },
  Grade_C: { label: "C", color: "bg-grade-c" },
  For_Parts: { label: "FP", color: "bg-grade-parts" },
}

interface ProductCardProps {
  product: Product
  isAdmin?: boolean
}

export function ProductCard({ product, isAdmin }: ProductCardProps) {
  const addItem = useCart((s) => s.addItem)
  const secondLabel = "Wholesale"
  const secondPrice = Number(product.wholesale_price_per_lot)
  const grade = gradeConfig[product.grade]
  const inStock = product.available_stock_lots > 0
  const [imgError, setImgError] = useState(false)
  const imageUrl = product.images?.[0]

  return (
    <Card className="flex flex-col overflow-hidden border-border bg-card shadow-none">
      <Link href={`/products/${product.id}`} className="flex flex-1 flex-col">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {imageUrl && !imgError ? (
            <img
              src={imageUrl}
              alt={product.title}
              width={400}
              height={300}
              loading="lazy"
              className="h-full w-full object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff className="h-8 w-8 text-muted-foreground" />
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
            <h3 className="font-display text-sm font-semibold leading-snug text-foreground">
              {product.title}
            </h3>
            {product.description && (
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground line-clamp-2">
                {product.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
            <span>SKU LOT-{product.sku}</span>
            <span className="text-border">|</span>
            <span>{product.items_per_lot}/lot</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">Retail</span>
              <span className="min-w-0 text-right font-mono text-sm font-medium text-foreground">
                {currencyFormat.format(Number(product.retail_price_per_lot))}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">
                {secondLabel}
                {product.minimum_wholesale_lots > 1 && (
                  <span className="ml-1 text-[10px]">/{product.minimum_wholesale_lots}</span>
                )}
                <span className="ml-1 text-[10px]">· 10+ lots</span>
              </span>
              <span className="min-w-0 text-right font-mono text-sm font-medium text-primary">
                {currencyFormat.format(secondPrice)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {inStock
                ? `${product.available_stock_lots} lots available`
                : "Out of stock"}
            </span>
            {inStock && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 bg-grade-a" />
                <span className="font-mono text-[11px] text-grade-a">In Stock</span>
              </span>
            )}
          </div>
        </CardContent>
      </Link>

      {!isAdmin && (
        <CardFooter className="p-3 pt-0">
          <button
            onClick={() => addItem(product)}
            disabled={!inStock}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShoppingCart className="h-4 w-4" />
            {inStock ? "Add to Cart" : "Out of Stock"}
          </button>
        </CardFooter>
      )}
    </Card>
  )
}
