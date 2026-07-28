import type { Product } from "@/types"

interface ResolvePriceArgs {
  product: Product
  quantity: number
  totalLotsCount: number
}

export function usePricing() {
  function resolvePrice({ product, quantity, totalLotsCount }: ResolvePriceArgs): number {
    const isWholesale = totalLotsCount >= 10
    if (isWholesale && quantity >= product.minimum_wholesale_lots) {
      return Number(product.wholesale_price_per_lot)
    }
    return Number(product.retail_price_per_lot)
  }

  return { resolvePrice }
}