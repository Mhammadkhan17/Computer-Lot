# ADR-001: Hybrid Wholesale Pricing Model (Three-Tier)

**Status:** Accepted (amended 2026-08-03 — see "Amendment" below)
**Date:** 2026-07-18
**Context:** The platform serves both B2C retail and B2B wholesale customers. We need clear rules for when wholesale pricing applies to an order. The merchant subsequently wanted a deeper discount tier for vetted businesses, plus volume-based wholesale access for normal bulk buyers.

## Original Decision (2026-07-18)
- User must have `wholesale_approved` role
- Total lots across ALL items in the order must be ≥ 10
- Each line item gets wholesale pricing **only if** `quantity >= product.minimum_wholesale_lots`
- Items below their per-product minimum are priced at retail, even within an otherwise-wholesale order

## Amendment (2026-08-03) — Three-Tier Pricing
Supercedes the original decision. Authoritative rule (backend `app/adapters/pricing.py`, spec `docs/superpowers/specs/2026-08-03-three-tier-pricing-design.md`):

1. `quantity < minimum_wholesale_lots` → `retail_price_per_lot`
2. `role == "wholesale_approved"` (any order size) → `approved_price_per_lot`
3. `total_lots >= 10` (any role, incl. admin) → `wholesale_price_per_lot`
4. otherwise → `retail_price_per_lot`

**Decision changes:**
- **Wholesale is now a volume tier** for ANY signed-in user (retail, wholesale_pending, admin) whose order totals ≥ 10 lots — no longer gated to `wholesale_approved`.
- **New approved tier**: a third per-product price (`products.approved_price_per_lot`) defined by the merchant. `wholesale_approved` users pay it on any order size (no 10-lot total), subject to the per-product minimum.
- **Admin follows the uniform rule** (treated like any user at ≥ 10 lots → wholesale). No special case.
- **Per-product `minimum_wholesale_lots` applies to ALL tiers** (cannot buy 1 lot of a 5-min product at a tier price).
- `approved_price_per_lot <= wholesale_price_per_lot` enforced by DB CHECK (`products_approved_price_check`, migration 009) and mirrored in form/CSV validation.
- Backfill: existing products get `approved_price_per_lot = wholesale_price_per_lot`, so no price changes until the merchant edits them.
- Product cards keep the two retail/wholesale rows; the approved tier appears on the product detail page, cart, and checkout.

**Consequences:**
- A single order can have mixed pricing (some lines retail, some wholesale/approved).
- Keeps per-product fairness (can't buy 1 lot of a product that requires 5 minimum).
- Schema supports this via `minimum_wholesale_lots` + `approved_price_per_lot` columns on `products`.
- The backend remains authoritative: `/checkout` computes `unit_price_applied` per line, which flows into the stored order, WhatsApp deep link, and receipt. The client mirror (`frontend/src/lib/pricing.ts`) is display-only and must be kept in sync.

**Status:** Lots (the trading unit), never individual items. `items_per_lot` is descriptive only.
