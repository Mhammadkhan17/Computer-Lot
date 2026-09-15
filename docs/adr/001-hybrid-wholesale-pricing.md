# ADR-001: Hybrid Wholesale Pricing Model

**Status:** Accepted (reverted to original two-tier 2026-08-22 — see "Reversion" below)
**Date:** 2026-07-18
**Context:** The platform serves both B2C retail and B2B wholesale customers. We need clear rules for when wholesale pricing applies to an order.

## Decision
- Total lots across ALL items in the order must be ≥ 10
- Each line item gets wholesale pricing **only if** `quantity >= product.minimum_wholesale_lots`
- Items below their per-product minimum are priced at retail, even within an otherwise-wholesale order

## Reversion (2026-08-22) — Removal of Three-Tier Pricing
The three-tier amendment (2026-08-03) has been reverted. The `approved_price_per_lot` column and all three-tier pricing logic have been removed. Authoritative rule (backend `app/adapters/pricing.py`):

1. `quantity < minimum_wholesale_lots` → `retail_price_per_lot`
2. `total_lots >= 10` (any signed-in user incl. admin) → `wholesale_price_per_lot`
3. otherwise → `retail_price_per_lot`

**Decision changes from reversion:**
- **Wholesale is a volume tier** for ANY signed-in user whose order totals ≥ 10 lots.
- **Admin follows the uniform rule** (treated like any user at ≥ 10 lots → wholesale). No special case.
- **Per-product `minimum_wholesale_lots` applies to ALL tier transitions** — cannot buy 1 lot of a product that requires 5 minimum.
- `wholesale_price_per_lot <= retail_price_per_lot` enforced by DB CHECK (`products_wholesale_price_check`, migration 010) and mirrored in form/CSV validation; the pricing code never charges above retail even for stale data.
- Product cards show a wholesale tier row with a `· 10+ lots` volume hint.
- The backend remains authoritative: `/checkout` computes `unit_price_applied` per line, which flows into the stored order, WhatsApp deep link, and receipt.

**Consequences:**
- A single order can have mixed pricing (some lines retail, some wholesale).
- Keeps per-product fairness (can't buy 1 lot of a product that requires 5 minimum).
- Schema supports this via `minimum_wholesale_lots` column on `products`.
- Lots (the trading unit), never individual items. `items_per_lot` is descriptive only.
