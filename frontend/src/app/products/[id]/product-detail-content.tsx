"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { ShoppingCart, ImageOff, ArrowLeft, Package, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Maximize2, Minimize2 } from "lucide-react"
import { useCart } from "@/hooks/useCart"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import type { Product } from "@/types"
import { ProductCard } from "@/components/product-card"

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

const gradeConfig: Record<string, { label: string; color: string; full: string }> = {
  Grade_A: { label: "A", color: "bg-grade-a", full: "Grade A" },
  Grade_B: { label: "B", color: "bg-grade-b", full: "Grade B" },
  Grade_C: { label: "C", color: "bg-grade-c", full: "Grade C" },
  For_Parts: { label: "FP", color: "bg-grade-parts", full: "For Parts" },
}

interface ProductDetailContentProps {
  product: Product
  relatedPool: Product[]
  isAdmin?: boolean
}

export function ProductDetailContent({ product, relatedPool, isAdmin }: ProductDetailContentProps) {
  const addItem = useCart((s) => s.addItem)
  const cartItems = useCart((s) => s.items)
  const inStock = product.available_stock_lots > 0
  const [imgError, setImgError] = useState<Record<number, boolean>>({})
  const [selectedImage, setSelectedImage] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const grade = gradeConfig[product.grade]

  // Applicable tier for THIS shopper, using the same rule as backend
  // app/adapters/pricing.py (retail / wholesale at 10+ lots). Quantity is the
  // current cart line for this product, else the minimum qualifying purchase;
  // total lots includes this line so a 10+ bulk order is reflected live in
  // the highlighted tier and the mobile bottom-bar price.
  const existingLine = cartItems.find((i) => i.product.id === product.id)
  const displayQty = existingLine ? existingLine.quantity : Math.max(product.minimum_wholesale_lots, 1)
  const prospectiveTotal =
    cartItems.reduce((sum, i) => sum + i.quantity, 0) + (existingLine ? 0 : displayQty)
  const displayTier = resolveTier(product, displayQty, prospectiveTotal)
  const displayPrice = resolvePrice(product, displayQty, prospectiveTotal)

  const images = product.images?.length ? product.images : []
  const specs = product.hardware_specifications
  const specEntries = Object.keys(specs).length > 0 ? Object.entries(specs) : []

  const related = useMemo(
    () =>
      [...relatedPool]
        .sort((a, b) => {
          const aSame = a.grade === product.grade ? 0 : 1
          const bSame = b.grade === product.grade ? 0 : 1
          if (aSame !== bSame) return aSame - bSame
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        .slice(0, 4),
    [relatedPool, product.grade]
  )

  const prevImage = useCallback(() => {
    setSelectedImage((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }, [images.length])

  const nextImage = useCallback(() => {
    setSelectedImage((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }, [images.length])

  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const lastPosition = useRef({ x: 0, y: 0 })

  const resetZoom = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    lastPosition.current = { x: 0, y: 0 }
  }, [])

  useEffect(() => {
    if (!lightboxOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prevImage()
      if (e.key === "ArrowRight") nextImage()
      if (e.key === "Escape") resetZoom()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [lightboxOpen, prevImage, nextImage, resetZoom])

  useEffect(() => {
    resetZoom()
  }, [selectedImage, resetZoom])

  const clampScale = (s: number) => Math.max(1, Math.min(5, s))

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return
    isDragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    lastPosition.current = { ...position }
  }, [scale, position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setPosition({
      x: lastPosition.current.x + dx,
      y: lastPosition.current.y + dy,
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const handleDoubleClick = useCallback(() => {
    if (scale > 1) {
      resetZoom()
    } else {
      setScale(2.5)
      setPosition({ x: 0, y: 0 })
      lastPosition.current = { x: 0, y: 0 }
    }
  }, [scale, resetZoom])

  const zoomIn = useCallback(() => setScale((prev) => clampScale(prev + 0.25)), [])
  const zoomOut = useCallback(() => setScale((prev) => clampScale(prev - 0.25)), [])
  const [isFullscreen, setIsFullscreen] = useState(false)

  const lightboxRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      try {
        await lightboxRef.current?.requestFullscreen()
        setIsFullscreen(true)
      } catch {}
    } else {
      try {
        await document.exitFullscreen()
        setIsFullscreen(false)
      } catch {}
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  const zoomRef = useRef<HTMLDivElement>(null)
  const swipeStart = useRef<number | null>(null)
  const pinchBase = useRef<{ dist: number; scale: number } | null>(null)

  useEffect(() => {
    const el = zoomRef.current
    if (!el || !lightboxOpen) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setScale((prev) => clampScale(prev + (e.deltaY < 0 ? 0.25 : -0.25)))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [lightboxOpen])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      pinchBase.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        scale,
      }
      swipeStart.current = null
    } else if (e.touches.length === 1) {
      swipeStart.current = e.touches[0].clientX
      pinchBase.current = null
    }
  }, [scale])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (pinchBase.current && e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      e.preventDefault()
      setScale(() => clampScale(pinchBase.current!.scale * (dist / pinchBase.current!.dist)))
    }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (swipeStart.current != null) {
      const dx = e.changedTouches[0].clientX - swipeStart.current
      swipeStart.current = null
      if (Math.abs(dx) > 60) {
        if (dx < 0) nextImage()
        else prevImage()
      }
    }
    pinchBase.current = null
  }, [nextImage, prevImage])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 lg:pb-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to catalog
      </Link>

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="relative aspect-[4/3] overflow-hidden bg-muted rounded-sm group">
            {images[selectedImage] && !imgError[selectedImage] ? (
              <button
                onClick={() => setLightboxOpen(true)}
                className="h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Open image viewer"
              >
                <img
                  src={images[selectedImage]}
                  alt={product.title}
                  width={800}
                  height={600}
                  className="h-full w-full object-contain"
                  onError={() => setImgError((prev) => ({ ...prev, [selectedImage]: true }))}
                />
              </button>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageOff className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
              </div>
            )}

            {images.length > 1 && images[selectedImage] && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); prevImage() }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white opacity-90 transition-opacity hover:bg-black/60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:opacity-100 cursor-pointer"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); nextImage() }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white opacity-90 transition-opacity hover:bg-black/60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:opacity-100 cursor-pointer"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}

            <span
              className={`absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center font-mono text-xs font-bold text-white ${grade.color} pointer-events-none`}
            >
              {grade.label}
            </span>
            {product.grade === "For_Parts" && (
              <span className={`absolute right-3 top-3 z-10 px-3 py-1 font-mono text-xs font-bold text-white ${grade.color} pointer-events-none`}>
                AS-IS
              </span>
            )}

            {images.length > 1 && (
              <div className="absolute left-0 right-0 top-0 flex gap-1 overflow-x-auto bg-[#DCDCDC] p-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                {images.map((url, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setSelectedImage(i) }}
                    aria-label={`View image ${i + 1}`}
                    className={`shrink-0 overflow-hidden border-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      i === selectedImage ? "border-accent" : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <img
                      src={url}
                      alt={`${product.title} ${i + 1}`}
                      width={80}
                      height={60}
                      className="h-12 w-16 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="mt-2 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  aria-label={`Go to image ${i + 1}`}
                  className={`h-3 w-3 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    i === selectedImage ? "bg-accent" : "bg-border"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <Dialog open={lightboxOpen} onOpenChange={(open) => { if (!open) resetZoom(); setLightboxOpen(open) }}>
          <DialogContent className={`border-none bg-black/95 p-0 overflow-hidden [&>button:last-child]:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200 ${isFullscreen ? "max-w-none" : "max-w-5xl"}`}>
            <div ref={lightboxRef} className="relative flex h-[90dvh] flex-col">
              <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
                <button
                  onClick={toggleFullscreen}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
                </button>
                <button
                  onClick={() => { resetZoom(); setLightboxOpen(false) }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
                  aria-label="Close image viewer"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="relative flex flex-1 items-center justify-center overflow-hidden">
                {images[selectedImage] && (
                  <div
                    ref={zoomRef}
                    className="flex h-full w-full items-center justify-center overflow-hidden select-none"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onDoubleClick={handleDoubleClick}
                    style={{ touchAction: "none", cursor: scale > 1 ? (isDragging.current ? "grabbing" : "grab") : "default" }}
                  >
                    <img
                      src={images[selectedImage]}
                      alt={`${product.title} — image ${selectedImage + 1} of ${images.length}`}
                      className="max-h-full max-w-full object-contain pointer-events-none"
                      draggable={false}
                      style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        transition: isDragging.current ? "none" : "transform 0.2s ease-out",
                      }}
                    />
                  </div>
                )}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => { resetZoom(); prevImage() }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/70 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => { resetZoom(); nextImage() }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/70 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </>
                )}
                <div className="absolute bottom-16 right-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
                  <button
                    onClick={zoomOut}
                    disabled={scale <= 1}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-[3.5ch] text-center font-mono text-xs font-medium text-white/80 tabular-nums">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    onClick={zoomIn}
                    disabled={scale >= 5}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground text-pretty">
                {product.title}
              </h1>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                SKU LOT-{product.sku}
              </p>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-flex h-5 w-5 items-center justify-center font-mono text-[10px] font-bold text-white ${grade.color}`}>
              {grade.label}
            </span>
            <span className="text-xs text-muted-foreground">{grade.full}</span>
            <span className="text-border">|</span>
            <span className="text-xs text-muted-foreground">{product.items_per_lot} units per lot</span>
          </div>

          {product.description && (
            <p className="mt-4 text-sm leading-relaxed text-foreground">
              {product.description}
            </p>
          )}

          {specEntries.length > 0 && (
            <div className="mt-6">
              <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
                Specifications
              </h2>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {specEntries.map(([key, value]) => (
                    <tr key={key} className="border-b border-border last:border-0 transition-colors hover:bg-muted/30">
                      <td className="py-1.5 pr-4 font-medium text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </td>
                      <td className="py-1.5 text-foreground">
                        {String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 space-y-3 rounded-sm border border-border bg-card p-4">
            <div className={`flex items-center justify-between ${displayTier === "RETAIL" ? "rounded-sm bg-accent/10 px-2 py-1" : ""}`}>
              <span className="text-sm text-muted-foreground">
                Retail price
                {displayTier === "RETAIL" && <span className="ml-2 font-mono text-[10px] font-bold text-accent">YOUR TIER</span>}
              </span>
              <span className="font-mono text-lg font-bold text-foreground tabular-nums">
                {currencyFormat.format(Number(product.retail_price_per_lot))}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/lot</span>
              </span>
            </div>
            <div className={`flex items-center justify-between ${displayTier === "WHOLESALE" ? "rounded-sm bg-accent/10 px-2 py-1" : ""}`}>
              <span className="text-sm text-muted-foreground">
                Wholesale price (10+ lots)
                {displayTier === "WHOLESALE" && <span className="ml-2 font-mono text-[10px] font-bold text-accent">YOUR TIER</span>}
              </span>
              <span className="font-mono text-lg font-bold text-primary tabular-nums">
                {currencyFormat.format(Number(product.wholesale_price_per_lot))}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/lot</span>
              </span>
             </div>
            {product.minimum_wholesale_lots > 1 && (
              <p className="text-xs text-muted-foreground">
                Discount pricing requires minimum {product.minimum_wholesale_lots} lots per line
              </p>
            )}
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4" aria-hidden="true" />
                Available stock
              </span>
              <span className={`font-mono font-medium ${inStock ? "text-grade-a" : "text-destructive"}`}>
                {inStock ? `${product.available_stock_lots} lots` : "Out of stock"}
              </span>
            </div>
          </div>

          {!isAdmin && (
            <button
              onClick={() => addItem(product)}
              disabled={!inStock}
              className="mt-4 hidden w-full items-center justify-center gap-2 bg-accent px-6 py-3 text-base font-semibold text-accent-foreground transition-all hover:bg-accent/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer lg:flex"
            >
              <ShoppingCart className="h-5 w-5" />
              {inStock ? "Add to Cart" : "Out of Stock"}
            </button>
          )}

          {!isAdmin && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-4 shadow-lg backdrop-blur-sm lg:hidden">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{displayTier}</p>
                <p className="font-display text-lg font-bold text-foreground tabular-nums">
                  {currencyFormat.format(displayPrice)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/lot</span>
                </p>
              </div>
              <button
                onClick={() => addItem(product)}
                disabled={!inStock}
                className="flex items-center gap-2 bg-accent px-8 py-3 text-base font-semibold text-accent-foreground transition-all hover:bg-accent/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <ShoppingCart className="h-5 w-5" />
                {inStock ? "Add to Cart" : "Out of Stock"}
              </button>
            </div>
          </div>
          )}

          {product.tags && product.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="font-mono text-[11px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16 border-t border-border pt-10">
          <h2 className="font-display text-xl font-bold text-foreground">
            Browse More Products
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} isAdmin={isAdmin} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
