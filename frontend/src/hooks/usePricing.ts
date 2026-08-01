import type { CartItem, Product, UserRole } from "@/types"
import { useUserRole } from "./useUserRole"

interface ResolvePriceArgs {
  product: Product
  quantity: number
  totalLotsCount: number
  role: UserRole | null
}

interface CalcSubtotalArgs {
  items: CartItem[]
  totalLotsCount: number
  role: UserRole | null
}

export function isWholesale(totalLotsCount: number, role: UserRole | null): boolean {
  return role === "wholesale_approved" && totalLotsCount >= 10
}

export function resolvePrice({ product, quantity, totalLotsCount, role }: ResolvePriceArgs): number {
  const wholesale = isWholesale(totalLotsCount, role)
  if (wholesale && quantity >= product.minimum_wholesale_lots) {
    return Number(product.wholesale_price_per_lot)
  }
  return Number(product.retail_price_per_lot)
}

export function calcSubtotal({ items, totalLotsCount, role }: CalcSubtotalArgs): number {
  return items.reduce((sum, item) => {
    const price = resolvePrice({ product: item.product, quantity: item.quantity, totalLotsCount, role })
    return sum + price * item.quantity
  }, 0)
}

export function usePricing() {
  const role = useUserRole()
  return {
    role,
    resolvePrice: (args: Omit<ResolvePriceArgs, "role">) => resolvePrice({ ...args, role }),
    isWholesale: (totalLotsCount: number) => isWholesale(totalLotsCount, role),
    calcSubtotal: (args: Omit<CalcSubtotalArgs, "role">) => calcSubtotal({ ...args, role }),
  }
}
