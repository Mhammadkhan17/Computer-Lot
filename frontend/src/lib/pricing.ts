import type { Product } from "@/types"
import type { UserRole } from "@/types"

/**
 * Client-side mirror of the authoritative backend pricing rule.
 *
 * SOURCE OF TRUTH: backend/app/adapters/pricing.py — keep this file in sync.
 * Spec: docs/superpowers/specs/2026-08-03-three-tier-pricing-design.md
 *
 * Resolved per line item, in this order:
 *   1. quantity < minimum_wholesale_lots        -> retail_price_per_lot
 *   2. role === "wholesale_approved" (any size) -> approved_price_per_lot
 *   3. totalLots >= 10 (any role, incl. admin)  -> wholesale_price_per_lot
 *   4. otherwise                                -> retail_price_per_lot
 *
 * The product param accepts the full `Product` shape or a partial snapshot
 * (e.g. a stale cart item persisted in localStorage before the approved-price
 * column existed). When `approved_price_per_lot` is missing it falls back to
 * the wholesale price — matching the migration-009 backfill semantics. This
 * mirror is used for display/estimates only; the backend charge is always
 * authoritative.
 */
export function resolvePrice(
  product: Pick<
    Product,
    "retail_price_per_lot" | "wholesale_price_per_lot" | "minimum_wholesale_lots" | "approved_price_per_lot"
  >,
  quantity: number,
  role: UserRole | null,
  totalLots: number
): number {
  const retail = Number(product.retail_price_per_lot)
  const wholesale = Number(product.wholesale_price_per_lot)

  if (quantity < product.minimum_wholesale_lots) {
    return retail
  }

  if (role === "wholesale_approved") {
    const approved = product.approved_price_per_lot
    if (approved !== undefined && approved !== null) {
      const approvedFloat = Number(approved)
      // Mirrors of products_approved_price_check and
      // products_wholesale_price_check: never overcharge with bad config.
      if (approvedFloat <= wholesale) {
        return Math.min(approvedFloat, retail)
      }
    }
    return Math.min(wholesale, retail)
  }

  if (totalLots >= 10) {
    return Math.min(wholesale, retail)
  }

  return retail
}

export type PricingTier = "RETAIL" | "WHOLESALE" | "APPROVED"

/**
 * Returns the tier label that applies to a line given the same rule as
 * `resolvePrice`. Used to label per-line and per-cart tier indicators.
 */
export function resolveTier(
  product: Pick<
    Product,
    "retail_price_per_lot" | "wholesale_price_per_lot" | "minimum_wholesale_lots" | "approved_price_per_lot"
  >,
  quantity: number,
  role: UserRole | null,
  totalLots: number
): PricingTier {
  if (quantity < product.minimum_wholesale_lots) {
    return "RETAIL"
  }
  if (role === "wholesale_approved") {
    const approved = product.approved_price_per_lot
    if (approved !== undefined && approved !== null && Number(approved) <= Number(product.wholesale_price_per_lot)) {
      return "APPROVED"
    }
    return "WHOLESALE"
  }
  if (totalLots >= 10) {
    return "WHOLESALE"
  }
  return "RETAIL"
}
