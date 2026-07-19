# ADR-001: Hybrid Wholesale Pricing Model

**Status:** Accepted  
**Date:** 2026-07-18  
**Context:** The platform serves both B2C retail and B2B wholesale customers. We need clear rules for when wholesale pricing applies to an order.

**Decision:**
- User must have `wholesale_approved` role
- Total lots across ALL items in the order must be ≥ 10
- Each line item gets wholesale pricing **only if** `quantity >= product.minimum_wholesale_lots`
- Items below their per-product minimum are priced at retail, even within an otherwise-wholesale order

**Consequences:**
- A single order can have mixed pricing (some items retail, some wholesale)
- Keeps per-product fairness (can't buy 1 lot of a product that requires 5 minimum)
- Schema already supports this (`minimum_wholesale_lots` column on `products`)

**Status:** Lots (the trading unit), never individual items. `items_per_lot` is descriptive only.
