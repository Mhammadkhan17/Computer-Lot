# Three-Tier Pricing: Retail / Wholesale / Approved

**Date:** 2026-08-03
**Status:** Accepted (pending implementation)
**Relates to:** ADR-001 (hybrid wholesale pricing), ADR-006 (wholesale approval)

## Context

The platform currently has two per-product prices — `retail_price_per_lot` and
`wholesale_price_per_lot` — and wholesale pricing is gated to
`wholesale_approved` users whose order totals ≥ 10 lots (ADR-001). The merchant
wants to change the model:

1. **Approved businesses** (vetted by the merchant) should see their price on
   the product page and pay a *deeper* discount than the standard wholesale
   price, because they buy more lots than a normal person.
2. The **discount logic must be defined by the merchant** — hence a third,
   per-product price the merchant sets: `approved_price_per_lot`.
3. **Normal bulk buyers** keep the current wholesale rate. Wholesale becomes a
   pure *volume* tier available to any user whose cart totals ≥ 10 lots.
4. The correct tier must take effect in the **cart drawer** ("checkout window")
   and the **checkout page**, not only at the final FastAPI charge.

## Decisions (user-confirmed)

- **Discount mechanism:** per-product `approved_price_per_lot` column (third
  price the merchant enters), not a global % or volume schedule.
- **Wholesale tier access:** any signed-in user whose cart totals ≥ 10 lots pays
  `wholesale_price_per_lot` (per-product `minimum_wholesale_lots` still applies).
- **Approved tier conditions:** `wholesale_approved` users get
  `approved_price_per_lot` on *any* order size (no 10-lot total), as long as the
  line quantity meets the per-product `minimum_wholesale_lots`.
- **Admin:** follows the uniform rule (treated like any user at ≥ 10 lots →
  wholesale). No special case.
- **Product cards:** keep the current two rows (retail + wholesale). The approved
  tier is shown on the product detail page, cart, and checkout only.
- **Per-product `minimum_wholesale_lots` applies to ALL tiers** (cannot buy 1 lot
  of a 5-min product at a tier price).

## Pricing Rules (authoritative — backend `app/adapters/pricing.py`)

For each line item, resolved in this order:

| # | Condition | Unit price |
|---|-----------|------------|
| 1 | `quantity < minimum_wholesale_lots` | `retail_price_per_lot` |
| 2 | `role == "wholesale_approved"` (any order size) | `approved_price_per_lot` |
| 3 | `total_lots >= 10` (any role, incl. admin) | `wholesale_price_per_lot` |
| 4 | otherwise | `retail_price_per_lot` |

- `total_lots` = sum of all line quantities in the order.
- A single order may mix tiers (per-product minimum gating) — consistent with
  ADR-001 mixed pricing.
- `approved_price_per_lot <= wholesale_price_per_lot` is enforced by a DB CHECK.

## Data Flow

```
products.approved_price_per_lot  ──► resolve_price(product, qty, role, total_lots)
                                          │
                    ┌─────────────────────┴──────────────────────┐
                    ▼                                            ▼
        unit_price_applied (order_items)                client mirror (lib/pricing.ts)
                    │                                            │
      order.total_amount · WhatsApp link · receipt      cart drawer · checkout page ·
                                                              product detail page
```

- The **backend is authoritative**: `/checkout` computes `unit_price_applied`
  per line and the final `total_amount`, which flows into the stored order, the
  WhatsApp deep link, and the receipt — all automatically, no other changes.
- The **client mirror** (`lib/pricing.ts`) is an exact TypeScript transcription
  of the same rule, used only for display/estimate. It must be kept in sync with
  `pricing.py`.

## Scope

### 1. Database — `supabase/migrations/009_approved_price.sql` (new file)

- `ALTER TABLE products ADD COLUMN approved_price_per_lot DECIMAL(12,2);`
- Backfill: `UPDATE products SET approved_price_per_lot = wholesale_price_per_lot WHERE approved_price_per_lot IS NULL;`
- `ALTER TABLE products ALTER COLUMN approved_price_per_lot SET NOT NULL;`
- CHECK `approved_price_per_lot > 0 AND approved_price_per_lot <= wholesale_price_per_lot`,
  added **NOT VALID → VALIDATE** (migration-007 pattern).
- Never edits migrations 001–008. No RLS change (products remain public-read).

### 2. Backend — `app/adapters/pricing.py`

Rewrite `resolve_price` to the table above. `resolve_all_items`,
`order_intake.create`, and the `/checkout` route are unchanged.

### 3. Backend — CSV import (backward-compatible)

- `app/adapters/csv_parser.py`: add `approved_price_per_lot` to `CSV_HEADERS`
  and `TEMPLATE_ROW`.
- `app/adapters/row_validator.py`: parse the column as optional; blank defaults
  to the wholesale value; validate `> 0` and `<= wholesale`.
- `app/adapters/row_normalizer.py`: emit `approved_price_per_lot` (row value or
  wholesale fallback) so inserts always satisfy NOT NULL.

### 4. Backend — tests (`tests/test_adapters_pricing.py`)

Update the `_make_product` fixture to include `approved_price_per_lot` and flip
the behavior assertions, then add new cases:

- Retail at 10+ lots (qty ≥ min) → wholesale (was retail).
- `wholesale_pending` at 10+ lots → wholesale (was retail).
- Admin at 10+ lots → wholesale (was retail).
- `wholesale_approved`, total < 10, qty ≥ min → approved (was retail).
- `wholesale_approved`, total ≥ 10 → approved (supersedes wholesale).
- `wholesale_approved`, qty < min → retail.
- `approved_price_per_lot > wholesale` guard (mirror of DB CHECK).

Audit `tests/test_adapters_txn.py` and `tests/test_admin.py` for assertions that
encoded the old pricing and update them.

### 5. Frontend — shared mirror `src/lib/pricing.ts` (new)

`resolvePrice(product, quantity, role, totalLots): number` — exact TS
transcription of the backend rule. Commented to point at `pricing.py` as the
source of truth.

### 6. Frontend — types (`src/types/index.ts`)

Add `approved_price_per_lot: number` to `Product` and `ProductCsvColumn`.

### 7. Frontend — role-aware display

- `src/app/checkout/checkout-page.tsx`: use `useUserRole()` + mirror; per-line
  tier label (RETAIL / WHOLESALE / APPROVED) and live total. Remove the
  hardcoded RETAIL tier.
- `src/components/cart-drawer.tsx`: use the mirror; per-line price + subtotal
  relabel live as quantities cross the 10-lot threshold.
- `src/app/products/[id]/page.tsx` + `product-detail-content.tsx`: server passes
  the role (not just `isAdmin`); highlight the applicable tier (approved for
  approved users, wholesale for bulk shoppers, retail otherwise). Mobile
  bottom-bar price uses the same logic.
- `src/components/product-card.tsx`: **unchanged** (two rows) per decision.
- `src/hooks/useUserRole.ts`: reused as-is (`null` → retail default).

### 8. Frontend — merchant surfaces

- `src/components/product-form.tsx`: add approved price field; validate `> 0`
  and `<= wholesale`; include in create/edit payload.
- `src/app/dashboard/sections/products.tsx`: add approved price column.

### 9. Docs

- Update `docs/adr/001-hybrid-wholesale-pricing.md` (wholesale is now a volume
  tier for any user; new approved tier; approved price defined per product).
- Update `docs/glossary.md` if it defines wholesale pricing terms.

## Error Handling & Edge Cases

- **Approved price above wholesale** (config error): rejected by DB CHECK and by
  form/CSV validation with a clear message.
- **Backfill safety:** existing products get `approved = wholesale`, so no
  price changes until the merchant edits them.
- **Async role flash:** the client shows retail until `useUserRole` resolves; the
  backend charge is always correct regardless.
- **Stale cart snapshots:** products cached in localStorage may show old prices
  vs fresh backend prices — pre-existing, out of scope, documented.

## Verification

- Backend: `.venv/bin/pytest -q` (all suites).
- Frontend: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Search/update Playwright e2e specs for price assertions.
- Verify `whatsapp.py` and `receipt-content.tsx` use `unit_price_applied` (no
  retail hardcode).

## Out of Scope

- Email/webhook notifications on approval (unchanged).
- Payment gateway (unchanged — WhatsApp fulfillment model).
- Removing the 10-lot threshold or changing `minimum_wholesale_lots` semantics
  for existing wholesale behavior.
