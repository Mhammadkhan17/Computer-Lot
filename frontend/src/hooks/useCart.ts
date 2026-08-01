import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CartItem, Product } from "@/types"
import { calcSubtotal } from "./usePricing"
import { useUserRoleStore } from "./useUserRole"

interface CartState {
  items: CartItem[]
  cartOpen: boolean
  addItem: (product: Product, quantity?: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  totalItems: () => number
  totalLots: () => number
  subtotal: (totalLotsCount: number) => number
  setCartOpen: (open: boolean) => void
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      cartOpen: false,

      addItem: (product, quantity = 1) => {
        set((state) => {
          const existing = state.items.find((i) => i.product.id === product.id)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.product.id === product.id
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            }
          }
          return { items: [...state.items, { product, quantity }] }
        })
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((i) => i.product.id !== productId),
        }))
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.product.id === productId ? { ...i, quantity } : i
          ),
        }))
      },

      clearCart: () => set({ items: [] }),

      totalItems: () => get().items.length,

      totalLots: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      subtotal: (totalLotsCount) => {
        return calcSubtotal({
          items: get().items,
          totalLotsCount,
          role: useUserRoleStore.getState().role,
        })
      },

      setCartOpen: (open) => set({ cartOpen: open }),
    }),
    {
      name: "cart-storage",
      partialize: (state) => ({ items: state.items }),
    }
  )
)