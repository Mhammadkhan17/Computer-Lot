# Reversion Plan: Three-Tier Pricing → Two-Tier (Retail/Wholesale Only)

**Status**: PLANNING PHASE (Read-Only Documentation)
**Date**: 2026-08-22
**Commit Origin**: `b58dc9b` — "feat: three-tier wholesale pricing (retail/wholesale/approved)"
**Purpose**: Temporary plan file documenting ALL changes required to remove the three-tier discount pricing feature and revert to the original two-tier model. This file serves as a checklist for implementation tracking — compare implemented changes against this document.

---

## 1. Overview

### What Happened (Aug 3, 2026)
Commit `b58dc9b` amended ADR-001 to introduce a **three-tier pricing model**:
1. `quantity < minimum_wholesale_lots` → `retail_price_per_lot`
2. `role == "wholesale_approved"` (any order size) → `approved_price_per_lot`  ← **REMOVE THIS**
3. `total_lots >= 10` (any role) → `wholesale_price_per_lot`
4. otherwise → `retail_price_per_lot`

### What We Revert To
The **original two-tier model** (pre-Aug 3):
1. `quantity < minimum_wholesale_lots` → `retail_price_per_lot`
2. `total_lots >= 10` (any signed-in user incl. admin) → `wholesale_price_per_lot`
3. otherwise → `retail_price_per_lot`

### Why a Plan File Matters
This reversion touches **23 files** across 6 directories. Without a checklist:
- A developer forgets `product-card.tsx` (discovered late) → catalog shows `NaN` prices
- A developer omits `pricing-parity.mjs` → Python parity test crashes spawning a Node process that imports a deleted file
- A developer skips the fixture JSON → all 14 parametrized test cases fail
- A developer drops the DB column before removing the constraint → PostgreSQL error

---

## 2. Pre-Mortem: Catastrophic Failure Risks & Mitigations

| # | Risk (What Could Go Catastrophically Wrong) | Root Cause | Mitigation in This Plan |
|--------|---------|
| **R01** | Dropping `approved_price_per_lot` breaks migration 010 | `010_wholesale_retail_price_guard.sql` UPDATE references the column | Phase 4: constraint dropped FIRST (CASCADE), then NOT NULL, then column |
| **R02** | CSV import fails for merchants | `csv_parser.py` hardcodes column in `CSV_HEADERS` | Phase 1.2: remove from headers; existing CSVs still work via `row.get()` |
| **R03** | `pricing_matrix.json` fixtures all have 3 tiers | 14 entries each include `approved_price_per_lot` | Phase 1.3: revert to 2-tier (7 entries), remove approved key |
| **R04** | `pricing-parity.mjs` crashes | Script transpiles `pricing.ts` (deleted) + references fixtures | Phase 3: delete script entirely (no parity target left) |
| **R05** | `product-card.tsx` shows `NaN` | Catalog cards use `product.approved_price_per_lot` for approved users | Phase 2.4: revert to wholesale-only display, remove `useUserRole` import |
| **R06** | TypeScript compile errors cascade | `types/index.ts` Product interface has `approved_price_per_lot`; 8 components reference it | Phase 2.2: types updated FIRST; `tsc --noEmit` in verification |
| **R07** | Test suite breaks (37 test cases) | Tests assert on approved price behavior and fixture fields | Phase 1.5-1.8: revert all test files + fixtures |
| **R08** | Database: `NOT NULL` constraint survives | `009` sets `approved_price_per_lot NOT NULL`; naive `DROP COLUMN` fails | Phase 4 migration drops constraint → NOT NULL → column in order |
| **R09** | Lost merchant data silently | Dropping column loses any custom approved prices set by merchant | Acceptable (backfill set = wholesale; documented in plan) |
| **R10** | Checkout returns wrong prices for wholesale_approved users | Backend still computes approved price in `resolve_price()` | Phase 1.1: gut `resolve_price()` to 2-tier BEFORE DB column dropped |

---

## 3. File Manifest (23 Files Total)

### Backend — 8 files
| File | Role | Phase |
|------|------|-------|
| `backend/app/adapters/pricing.py` | `resolve_price()` 4-tier logic | 1.1 |
| `backend/app/adapters/row_normalizer.py` | `approved` variable + dict field | 1.2 |
| `backend/app/adapters/row_validator.py` | approved price validation block | 1.3 |
| `backend/app/adapters/csv_parser.py` | CSV_HEADERS + sample row | 1.4 |
| `backend/tests/test_adapters_pricing.py` | 13 test functions, `_make_product` helper | 1.5 |
| `backend/tests/test_adapters_csv.py` | 4 approved-specific test functions + assertions | 1.6 |
| `backend/tests/test_pricing_parity.py` + `fixtures/pricing_matrix.json` | Parity script spawns MJS + 14 JSON fixtures | 1.7 |
| `backend/tests/test_admin.py` | `assert call_args["approved_price_per_lot"] == 149.99` | 1.8 |

### Frontend — 7 files
| File | Role | Phase |
|------|------|-------|
| `frontend/src/lib/pricing.ts` | `resolvePrice()` / `resolveTier()` mirror | 2.1 (DELETE) |
| `frontend/src/types/index.ts` | `approved_price_per_lot` in Product + ProductCsvColumn | 2.2 |
| `frontend/src/components/product-form.tsx` | Form field + validation (6 code blocks) | 2.3 |
| `frontend/src/components/product-card.tsx` | Role-aware price on catalog card | 2.4 |
| `frontend/src/components/cart-drawer.tsx` | Tier-aware subtotal + per-line tier label | 2.5 |
| `frontend/src/app/checkout/checkout-page.tsx` | Line tier summary + tier-aware total | 2.6 |
| `frontend/src/app/products/[id]/product-detail-content.tsx` + `page.tsx` | Role param, displayTier, approved price div | 2.7 |

### Scripts — 1 file
| File | Role | Phase |
|------|------|-------|
| `frontend/scripts/pricing-parity.mjs` | Spawns MJS, transpiles deleted `pricing.ts` | 3 (DELETE) |

### Database — 1 new migration
| File | Role | Phase |
|------|------|-------|
| `supabase/migrations/013_revert_approved_price.sql` | Drop constraint → NOT NULL → column | 4 |

### Documentation — 2 files
| File | Role | Phase |
|------|------|-------|
| `docs/adr/001-hybrid-wholesale-pricing.md` | Amendment section + 3-tier rule references | 5.1 |
| `docs/glossary.md` | Approved Price, Minimum Wholesale Lots, etc. | 5.2 |

### Test Fixtures — 1 file
| File | Role | Phase |
|------|------|-------|
| `backend/tests/fixtures/pricing_matrix.json` | 14 fixture entries with approved_price_per_lot | 1.7 (bundled with parity test) |

---

## 4. Phase-by-Phase Instructions

### Phase 1: Backend Code (Before DB Change)

> **Rule**: Revert all backend logic BEFORE touching the database. This ensures `resolve_price()` is 2-tier while the column still exists (harmless), then drops the column. No intermediate state where code expects a column that's gone.

#### Phase 1.1: `backend/app/adapters/pricing.py` → 2-tier `resolve_price()`

**Current (85 lines)**:
```python
def resolve_price(product: dict, quantity: int, role: str, total_lots: int) -> float:
    """Resolve the unit price for one line item under the three-tier rule.
    Resolved per line item, in this order:
      1. quantity < minimum_wholesale_lots        -> retail_price_per_lot
      2. role == \"wholesale_approved\" (any size)  -> approved_price_per_lot
      3. total_lots >= 10 (any role, incl. admin) -> wholesale_price_per_lot
      4. otherwise                                -> retail_price_per_lot
    """
    retail = float(product["retail_price_per_lot"])
    wholesale = float(product["wholesale_price_per_lot"])

    if quantity < product["minimum_wholesale_lots"]:
        return retail

    if role == "wholesale_approved":
        approved = product.get("approved_price_per_lot")
        if approved is not None:
            approved_float = float(approved)
            if approved_float <= wholesale:
                return min(approved_float, retail)
        return min(wholesale, retail)

    if total_lots >= 10:
        return min(wholesale, retail)

    return retail
```

**After (gutted to 2-tier)**:
```python
def resolve_price(product: dict, quantity: int, role: str, total_lots: int) -> float:
    """Resolve the unit price for one line item under the two-tier rule.

    Authoritative pricing rule (original ADR-001, pre-amendment):
      1. quantity < minimum_wholesale_lots        -> retail_price_per_lot
      2. total_lots >= 10 (any role, incl. admin) -> wholesale_price_per_lot
      3. otherwise                                -> retail_price_per_lot

    The role parameter is accepted for backward compatibility with
    order_intake.resolve_all_items() but no longer affects pricing.
    """
    retail = float(product["retail_price_per_lot"])
    wholesale = float(product["wholesale_price_per_lot"])

    if quantity < product["minimum_wholesale_lots"]:
        return retail

    if total_lots >= 10:
        return min(wholesale, retail)

    return retail
```

**Action**: Replace lines 4-41 (docstring + body) with the 2-tier version above. The `role` parameter remains in the signature because `order_intake.py` calls `resolve_all_items()` which passes `role`. If you remove the parameter, you'll break `order_intake.create()`.

**Also check `resolve_all_items()`**: Verify it doesn't reference `approved_price_per_lot`. If it does, remove that reference — but it only calls `resolve_price()`, so it's safe.

#### Phase 1.2: `backend/app/adapters/row_normalizer.py`

**Current** (lines 10-15, 25):
```python
    approved = row.get("approved_price_per_lot")
    if approved is None:
        approved = wholesale
```
and:
```python
    "approved_price_per_lot": approved,
```

**Action**:
- Delete lines 10-15 (the `approved` variable + comment)
- Delete line 25: `"approved_price_per_lot": approved,`

**Verify**: The returned dict still has `retail_price_per_lot`, `wholesale_price_per_lot`, etc. — unchanged.

#### Phase 1.3: `backend/app/adapters/row_validator.py`

**Delete lines 33-45** (the entire approved price validation block):
```python
    # Three-tier pricing: approved_price_per_lot is OPTIONAL in the CSV.
    approved_raw = row.get("approved_price_per_lot", "").strip()
    approved = None
    if approved_raw:
        approved, approved_err = _parse_float(approved_raw, "approved price")
        if approved_err:
            errs.append(approved_err)
        elif approved is not None and wholesale is not None and approved > wholesale:
            errs.append("Approved price must be <= wholesale price")
```

**Also delete line 91**: `"approved_price_per_lot": approved,` — from the returned validated dict.

#### Phase 1.4: `backend/app/adapters/csv_parser.py`

**Line 6** (in `CSV_HEADERS`):
```python
    "retail_price_per_lot", "wholesale_price_per_lot", "approved_price_per_lot",
```
**Action**: Remove `"approved_price_per_lot"` so it becomes:
```python
    "retail_price_per_lot", "wholesale_price_per_lot",
```

**Lines 19-20** (sample row):
```python
    "approved_price_per_lot": "139.99",
```
**Action**: Delete this key from the sample row.

#### Phase 1.5: `backend/tests/test_adapters_pricing.py`

**A) Revert `_make_product` helper (lines 11-21)**:
```python
# BEFORE:
def _make_product(pid, retail, wholesale, approved=None, min_wholesale=5):
    return {
        "id": pid, "title": f"Product {pid}",
        "retail_price_per_lot": retail,
        "wholesale_price_per_lot": wholesale,
        "approved_price_per_lot": approved if approved is not None else wholesale,
        "minimum_wholesale_lots": min_wholesale,
    }

# AFTER:
def _make_product(pid, retail, wholesale, min_wholesale=5):
    return {
        "id": pid, "title": f"Product {pid}",
        "retail_price_per_lot": retail,
        "wholesale_price_per_lot": wholesale,
        "minimum_wholesale_lots": min_wholesale,
    }
```

**B) Delete these test functions** (approved-tier-specific):
- `test_wholesale_approved_total_below_threshold_gets_approved` (lines 68-73)
- `test_wholesale_approved_total_at_threshold_gets_approved` (lines 76-81)
- `test_wholesale_approved_below_per_product_minimum_uses_retail` (lines 84-89)
- `test_missing_approved_price_key_falls_back_to_wholesale` (lines 124-136)
- `test_approved_price_above_wholesale_falls_back_to_wholesale` (lines 115-121)
- `test_approved_above_retail_stale_clamped_to_retail` (lines 147-152)

**C) Update all remaining test calls** to `_make_product` — remove the `approved=` argument wherever present.

#### Phase 1.6: `backend/tests/test_adapters_csv.py`

**A) Delete approved-specific test functions**:
- `test_validate_row_approved_price_valid` (lines 194-208)
- `test_validate_row_approved_price_blank_defaults_to_wholesale` (lines 210-226)
- `test_validate_row_approved_price_above_wholesale_rejected` (lines 228-242)
- `test_validate_row_approved_price_non_positive_rejected` (lines 244-257)
- `test_normalize_row_keeps_approved_price` (lines 280-293)

**B) Remove assertions referencing approved_price_per_lot**:
- Line 46: `assert "approved_price_per_lot" in headers` → DELETE
- Line 56: `assert row["approved_price_per_lot"] == "139.99"` → DELETE
- Line 207: `assert validated["approved_price_per_lot"] == 70.0` → DELETE
- Line 225: `assert validated["approved_price_per_lot"] is None` → DELETE
- Line 277: `assert result["approved_price_per_lot"] == 80.0` → DELETE
- Line 292: `assert result["approved_price_per_lot"] == 70.0` → DELETE

**C) Remove `approved_price_per_lot` from dict literals** in fixture rows (lines 202, 220, 237, 252, 272, 288).

#### Phase 1.7: `backend/tests/test_pricing_parity.py` + `pricing_matrix.json`

**A) `pricing_matrix.json`** — Revert to 2-tier fixtures:

**DELETE** these 5 entries (approved-tier-specific):
1. `"approved below 10 total"` (was expected_price 70, tier APPROVED → now RETAIL 100)
2. `"approved at 10+ total"` (was expected_price 70, tier APPROVED → now WHOLESALE 80)
3. `"approved equals wholesale backfill"` (tests 3-tier fallback)
4. `"approved above wholesale falls back"` (tests 3-tier fallback)
5. `"approved above retail clamps to retail"` (tests 3-tier fallback)

**UPDATE** remaining entries: remove `approved_price_per_lot` key from each product dict.

**REVISED FILE** (7 entries):
```json
[
  {"name": "retail default", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "minimum_wholesale_lots": 5}, "quantity": 2, "role": "retail", "total_lots": 2, "expected_price": 100, "expected_tier": "RETAIL"},
  {"name": "retail at 10+ lots", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "minimum_wholesale_lots": 1}, "quantity": 10, "role": "retail", "total_lots": 10, "expected_price": 80, "expected_tier": "WHOLESALE"},
  {"name": "pending at 10+ lots", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "minimum_wholesale_lots": 1}, "quantity": 20, "role": "wholesale_pending", "total_lots": 20, "expected_price": 80, "expected_tier": "WHOLESALE"},
  {"name": "admin at 10+ lots", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "minimum_wholesale_lots": 3}, "quantity": 10, "role": "admin", "total_lots": 10, "expected_price": 80, "expected_tier": "WHOLESALE"},
  {"name": "no role below 10 total", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "minimum_wholesale_lots": 1}, "quantity": 5, "role": "wholesale_pending", "total_lots": 5, "expected_price": 100, "expected_tier": "RETAIL"},
  {"name": "below per-product min at 10+", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "minimum_wholesale_lots": 5}, "quantity": 3, "role": "retail", "total_lots": 10, "expected_price": 100, "expected_tier": "RETAIL"},
  {"name": "wholesale>retail clamps to retail", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 120, "minimum_wholesale_lots": 3}, "quantity": 5, "role": "retail", "total_lots": 10, "expected_price": 100, "expected_tier": "RETAIL"}
]
```

**B) `test_pricing_parity.py`** — No structural change needed. It reads fixtures from the JSON above and runs `resolve_price` against them. Once the JSON is 2-tier and `resolve_price` is 2-tier, the Python test passes.

**BUT**: Line 20-27 runs `node scripts/pricing-parity.mjs` — and that script transpiles `pricing.ts` which we're DELETING in Phase 2.1. So this test will fail!

**Action**: In Phase 3 (Scripts), we delete `pricing-parity.mjs`. The test on line 20-27 will then fail because `node scripts/pricing-parity.mjs` doesn't exist. 

**Resolution**: Either:
(a) Delete the `test_ts_mirror_matches_fixture()` function from `test_pricing_parity.py`
(b) Or keep the MJS script as a minimal 2-tier check

**Decision**: Choose (a) — delete the test function, since the TS mirror is being deleted entirely.

#### Phase 1.8: `backend/tests/test_admin.py`

**Lines 507-510**:
```python
        # Old CSVs without the approved_price_per_lot column must still work:
        assert call_args["approved_price_per_lot"] == 149.99
```
**Action**: DELETE both lines (comment + assertion). The product import will no longer emit `approved_price_per_lot`, so asserting on it causes `KeyError`.

**Verify**: The import test (lines ~485-515) checks `call_args` for: `sku`, `retail_price_per_lot`, `wholesale_price_per_lot`, `available_stock_lots`, etc. Remove `approved_price_per_lot` from this assertion chain.

---

### Phase 2: Frontend (After Backend)

> **Rule**: Frontend types updated FIRST (Phase 2.2) before components (Phase 2.3+). This ensures TypeScript compiler catches missing `approved_price_per_lot` references before they ship.

#### Phase 2.1: `frontend/src/lib/pricing.ts` → DELETE ENTIRE FILE
- `resolvePrice()`, `resolveTier()`, `PricingTier` type — all deleted
- Rationale: No more pricing mirror needed; frontend displays retail/wholesale directly from product fields

#### Phase 2.2: `frontend/src/types/index.ts`
- **Line 28**: Remove `approved_price_per_lot: number` from Product interface
- **Line 126**: Remove `"approved_price_per_lot"` from `ProductCsvColumn` Pick type

#### Phase 2.3: `frontend/src/components/product-form.tsx`
Remove these 4 code blocks:
1. **`defaultState`** (line 51): `"approved_price_per_lot": ""`
2. **`initialStateFor`** (line 81): `"approved_price_per_lot": String(product.approved_price_per_lot)`
3. **Validation block** (lines 215-278): The `approvedRaw`/`approvedPrice` validation logic (price > 0, defaults to wholesale, approved > wholesale, approved <= 0)
4. **Form field** (lines 372-386): The `<label>` + `<Input>` + help text for approved price
5. **Data emission** (line 278): `"approved_price_per_lot": approvedPrice,` in the object passed to backend

#### Phase 2.4: `frontend/src/components/product-card.tsx`
- **Line 7**: Remove `import { useUserRole } from "@/hooks/useUserRole"`
- **Lines 30-35**: Replace:
  ```typescript
  const role = useUserRole()
  const isApprovedShopper = role === "wholesale_approved"
  const secondLabel = isApprovedShopper ? "Approved" : "Wholesale"
  const secondPrice = isApprovedShopper
    ? Number(product.approved_price_per_lot)
    : Number(product.wholesale_price_per_lot)
  ```
  With:
  ```typescript
  const secondLabel = "Wholesale"
  const secondPrice = Number(product.wholesale_price_per_lot)
  ```
- **Lines 103-105**: The conditional `{!isApprovedShopper && (<span>· 10+ lots</span>)}` → keep the "10+ lots" hint always

#### Phase 2.5: `frontend/src/components/cart-drawer.tsx`
- **Imports** (lines 7-8): Remove `useUserRole` and `{ resolvePrice, resolveTier }`
- **Lines 29-36**: Replace tier-aware logic:
  ```typescript
  // BEFORE:
  const role = useUserRole()
  const linePrices = items.map(...)
  const lineTiers = items.map(...)
  const cartSubtotal = items.reduce((sum, i, idx) => sum + linePrices[idx] * i.quantity, 0)
  
  // AFTER:
  const cartSubtotal = items.reduce(
    (sum, i) => sum + Number(i.product.retail_price_per_lot) * i.quantity, 0
  )
  ```
- **Lines 10-12 (item map)**: Revert per-line price to `Number(item.product.retail_price_per_lot)` and remove tier label

#### Phase 2.6: `frontend/src/app/checkout/checkout-page.tsx`
- **Imports** (lines 8-9): Remove `useUserRole` and `resolvePrice, resolveTier`
- **Lines 30-37**: Replace:
  ```typescript
  // BEFORE:
  const linePrices = items.map(...)
  const lineTiers = items.map(...)
  const uniqueTiers = Array.from(new Set(lineTiers))
  const summaryTier = uniqueTiers.length === 1 ? uniqueTiers[0] : "MIXED"
  const totalAmount = items.reduce((sum, i, idx) => sum + linePrices[idx] * i.quantity, 0)
  
  // AFTER:
  const totalAmount = items.reduce(
    (sum, i) => sum + Number(i.product.retail_price_per_lot) * i.quantity, 0
  )
  ```
- **Line 65**: Remove the "Pricing tier" summary row in the order total
- **Line 62**: Revert `{tier}` label to `"RETAIL"` (static)

#### Phase 2.7: `frontend/src/app/products/[id]/product-detail-content.tsx` + `page.tsx`

**`page.tsx`**:
- **Line 4**: Remove `UserRole` from import (`import type { Product } from "@/types"`)
- **Line 39**: Remove `let role: UserRole | null = null`
- **Line 47**: Remove `role = (profile?.role as UserRole | undefined) ?? null`
- **Line 55**: Remove `role={role}` from `<ProductDetailContent>` props

**`product-detail-content.tsx`**:
- **Line 14**: Remove `UserRole` from import
- **Lines 14, 53-54**: Remove `resolvePrice, resolveTier` import and role parameter
- **Lines 26, 53-55**: Remove `role` prop, `useCart` subscription, displayTier/displayPrice computation
- **Lines 488**: Remove the `"Approved price"` div block (3 lines)
- **Lines 459-462**: Revert tier highlighting on Retail + Wholesale price rows (remove `displayTier === "RETAIL"` / `displayTier === "WHOLESALE"` conditional classes)
- **Line 493**: Revert "Discount pricing requires minimum" text back to "Wholesale pricing requires minimum"
- **Lines 515-516**: Revert bottom bar tier label + price to retail only (remove `displayTier`, `displayPrice`)

---

### Phase 3: Scripts

#### Phase 3.1: `frontend/scripts/pricing-parity.mjs` → DELETE ENTIRE FILE
- This script transpiles `pricing.ts` (being deleted) and runs against `pricing_matrix.json`
- Deleting it prevents the orphaned `node scripts/pricing-parity.mjs` subprocess call in `test_pricing_parity.py`

---

### Phase 4: Database Migration

#### Phase 4.1: Create `supabase/migrations/013_revert_approved_price.sql`
```sql
-- ============================================================
-- 013: REVERT THREE-TIER PRICING — REMOVE APPROVED PRICE COLUMN
-- Rolls back migration 009 (which added products.approved_price_per_lot).
-- Ordering is critical: constraint must be dropped BEFORE the column
-- that it references.
--
-- NOTE: This migration does NOT revert migration 010
-- (010_wholesale_retail_price_guard.sql) — that migration is
-- independent and stays. The 010 UPDATE that set approved = retail
-- is harmless (the column is dropped right after).
-- ============================================================

-- Step 1: Drop the CHECK constraint (must come first — constraint
-- references the approved_price_per_lot column).
ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_approved_price_check CASCADE;

-- Step 2: Drop the NOT NULL constraint (must come before DROP COLUMN).
ALTER TABLE public.products
    ALTER COLUMN approved_price_per_lot DROP NOT NULL;

-- Step 3: Drop the column entirely.
-- Existing rows have approved_price_per_lot = wholesale_price_per_lot
-- (from migration 009 backfill) or = retail_price_per_lot (from
-- migration 010 data fix). Both values are now discarded — the 2-tier
-- model does not need them. No customer-visible price changes occur
-- because: (a) approved always = wholesale before this migration,
-- and (b) the backend resolve_price() no longer reads this column.
ALTER TABLE public.products
    DROP COLUMN IF EXISTS approved_price_per_lot;

-- Step 4: Verify no dependent objects remain (defensive check).
DO $$
DECLARE
    dep_count INT;
BEGIN
    SELECT COUNT(*) INTO dep_count
    FROM pg_attribute
    WHERE attrelid = 'public.products'::regclass
      AND attname = 'approved_price_per_lot';
    IF dep_count > 0 THEN
        RAISE EXCEPTION 'approved_price_per_lot column still exists after migration';
    END IF;
END $$;
```

---

### Phase 5: Documentation

#### Phase 5.1: `docs/adr/001-hybrid-wholesale-pricing.md`
- **Remove** the entire "## Amendment (2026-08-03) — Three-Tier Pricing" section (starts at line 13)
- **Revert** the title back to `# ADR-001: Hybrid Wholesale Pricing Model` (remove "(Three-Tier)")
- **Revert** the Status line: remove "(amended 2026-08-03 — see Amendment section)"
- **Restore** original Decision section (4 bullets, original logic):
  - User must have `wholesale_approved` role
  - Total lots across ALL items ≥ 10
  - Each line item gets wholesale pricing only if `quantity >= minimum_wholesale_lots`
  - Items below per-product minimum priced retail, even in wholesale order
- **Revert** Consequences section (3 bullets, original: "A single order can have mixed pricing...", etc.)

#### Phase 5.2: `docs/glossary.md`
- **`Wholesale Approved`**: Revert to "User role granting access to wholesale pricing when minimum lot thresholds are met" (remove "deeper discount than wholesale on any order size")
- **`Minimum Wholesale Lots`**: Revert to "Per-product threshold. A wholesale-approved user must buy at least this many lots..."
- **`Total Lots Threshold`**: Revert to "Order-wide minimum of 10 lots for wholesale eligibility..."
- **Remove** the `Approved Price` row entirely
- **`Hybrid Pricing`**: Change "retail, wholesale, and approved" to "retail, and wholesale"

---

## 6. Verification Checklist

Run these AFTER all changes are complete:

| # | Command | Expected | Failure Mode |
|---|---------|----------|--------------|
| V1 | `pytest backend/tests/ -x -v` | ALL pass | Any test referencing approved_price_per_lot errors |
| V2 | `cd frontend && npx tsc --noEmit` | Zero errors | Missing type removal cascades as TS errors |
| V3 | `node frontend/scripts/pricing-parity.mjs` | "pricing parity OK" | Script deleted → remove test_ts_mirror test |
| V4 | E2E checkout (retail user) | Retail price applied | Pricing logic wrong |
| V5 | E2E checkout (retail user, 10+ lots) | Wholesale price applied | Wholesale rule broken |
| V6 | Product card display | Shows Retail + Wholesale only | Approved tier still showing → component missed |
| V7 | CSV import (no approved column) | Imports successfully, no errors | CSV parser/validator still expects column |
| V8 | Admin product form | No "Approved price" field | Form component not patched |
| V9 | `SUPABASE_URL` query | Column gone from products | Migration not applied |

---

## 7. Systems to NOT Modify (Preserved)

These are pricing-agnostic and must remain untouched:

| System | File | Reason |
|--------|------|--------|
| `create_order` RPC | `supabase/migrations/002,004,007` | Only receives `p_unit_price` via jsonb — already priced by backend |
| `decrement_stock_inventory` | `001_initial_schema.sql` | Pricing-agnostic; just reduces stock |
| `service_role` to `/checkout` only | `004_security_hardening.sql`, `database.py` | ADR-009 independent of pricing |
| Order state machine | `004_security_hardening.sql` (cancel RPC), `007_security_round3.sql` | Cancel/completed/processing transitions |
| All RLS policies | `supabase/policies.sql` | Profiles, products, orders, order_items |
| `apply_for_wholesale` RPC | `011_apply_for_wholesale.sql` | Self-serve approval (role, not pricing) |
| `increment_stock_inventory` | `001_initial_schema.sql` | Stock restock on order cancel |
| Rate limiting | `backend/app/rate_limit.py` | SlowAPI middleware, unchanged |
| JWT auth | `backend/app/utils/security.py` | Supabase Auth server verification |
| WebSocket | `backend/app/routes/ws.py` | Realtime order updates, unrelated to pricing |

---

## 8. Implementation Notes

1. **Apply phases in order** — backend → frontend → DB. Never the reverse.
2. **Run tests after each phase** — catch cascading failures early.
3. **If tests fail after Phase 1**, do NOT proceed to Phase 2 — investigate the failure root cause.
4. **The `role` parameter in `resolve_price()`** must be kept (not removed) because `order_intake.py` passes it. Making it optional or keeping it ignored is acceptable.
5. **The `wholesale_approved` role still exists** in profiles table — we're only removing the pricing benefit, not the role itself. Admin approval/rejection flow (ADR-006) is unchanged.
6. **This plan file** can be safely committed to the repo as a temporary reference. Delete it once all changes are verified.

---

*End of Plan File — Use as implementation checklist, not committed documentation.*

---

## 9. Phase 5: Documentation Revert

### Phase 5.1: docs/adr/001-hybrid-wholesale-pricing.md
- Remove "## Amendment (2026-08-03) — Three-Tier Pricing" section entirely
- Revert title: remove "(Three-Tier)" suffix
- Revert Status line: remove "(amended 2026-08-03)"
- Restore original Decision section (4 bullets, two-tier logic)
- Restore original Consequences section (3 bullets)

### Phase 5.2: docs/glossary.md
- "Wholesale Approved": Revert definition to original (remove "deeper discount than wholesale")
- "Minimum Wholesale Lots": Revert to original wording
- "Total Lots Threshold": Revert to original wording
- Remove "Approved Price" row entirely
- "Hybrid Pricing": Change "retail, wholesale, and approved line items" to "retail, and wholesale"

### Phase 5.3: DELETE docs/superpowers/specs/2026-08-03-three-tier-pricing-design.md
This is a full 8.5KB implementation spec with:
- Pricing rules table (3-tier)
- Database migration instructions
- Backend/frontend code references
- Fixture data
- If left in repo, a developer will re-implement three-tier pricing. DELETE.

### Phase 5.4: DELETE docs/superpowers/plans/2026-08-03-pricing-grill-fixes.md
This is a 39KB implementation plan with:
- Inline code snippets (resolve_price, resolvePrice)
- Full pricing_matrix.json fixture data
- Task breakdowns referencing approved_price_per_lot 30+ times
- If left in repo, a developer will follow it and re-implement three-tier. DELETE.

---

## 10. Phase 6: Database Migration

### NEW FILE: supabase/migrations/013_revert_approved_price.sql

CRITICAL ORDERING (must not fail if run against a fresh DB or a fully-migrated DB):
1. Drop constraint (CASCADE handles dependents)
2. Drop NOT NULL constraint
3. Drop column

```sql
-- ============================================================
-- 013: REVERT THREE-TIER — REMOVE approved_price_per_lot COLUMN
-- Drops the column added by migration 009, restoring the
-- original two-tier pricing model (retail + wholesale only).
-- Ordering is critical: constraint must be dropped BEFORE
-- the column it references, and NOT NULL before DROP COLUMN.
-- ============================================================

-- Step 1: Drop CHECK constraint (references the column)
ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_approved_price_check CASCADE;

-- Step 2: Drop NOT NULL constraint (must precede DROP COLUMN)
ALTER TABLE public.products
    ALTER COLUMN approved_price_per_lot DROP NOT NULL;

-- Step 3: Drop the column entirely
ALTER TABLE public.products
    DROP COLUMN IF EXISTS approved_price_per_lot;

-- Step 4: Safety verification — confirm column is gone
NOTIFY pg_log, 'Migration 013: approved_price_per_lot column removed from products';
```

**Note on migration 010**: Migration `010_wholesale_retail_price_guard.sql` runs AFTER `009` and has an UPDATE that references `approved_price_per_lot`. This migration will:
- If 010 hasn't run yet: 010's UPDATE will reference a non-existent column → ERROR. **FIX: 010's migration must be applied first, OR the UPDATE in 010 must be made conditional.**
- If 010 already ran: the UPDATE already set `approved_price_per_lot = retail_price_per_lot` for problematic rows. Dropping the column now is safe — we just lose the approved price data (acceptable).

**Recommendation**: If 010 is already applied, migration 013 works as-is. If 010 is NOT yet applied, wrap 013's column-referential logic to be safe, OR ensure 010 runs before 013 in the migration chain (it already does since 010 < 013).

---

## 11. Implementation Order Summary

| Order | Phase | Action | Prerequisite | Blocks |
|-------|-------|--------|--------------|--------|
| 1 | 1.1-1.4 | Backend code: pricing.py, row_normalizer, row_validator, csv_parser | None | DB migration can proceed |
| 2 | 2.1-2.5 | Backend tests: revert all test files + fixtures | Phase 1 complete | pytest passes |
| 3 | 3.1-3.7 | Frontend: delete pricing.ts, revert types + 6 components | Phase 1 complete | tsc --noEmit passes |
| 4 | 5.1-5.4 | Documentation: revert ADR + glossary, DELETE spec docs | Phase 1 complete | Docs match code |
| 5 | 3.1 | Scripts: delete pricing-parity.mjs | Phase 2 complete | test_pricing_parity.py passes (deleted) |
| 6 | 4 | Database: migration 013 | Phases 1-5 complete (no code refs column) | DB drops column |
| 7 | 11 | Verification | ALL phases complete | Full test suite passes |

---

## 12. Verification Checklist

| # | Check | Command | Expected |
|---|-------|---------|----------|
| V1 | Backend tests pass | `pytest backend/tests/ -x -v` | 0 failures |
| V2 | TypeScript compiles | `cd frontend && npx tsc --noEmit` | 0 errors |
| V3 | Checkout E2E (retail <10) | Manual: retail price shown | Correct retail total |
| V4 | Checkout E2E (10+ lots) | Manual: wholesale price shown | Correct wholesale total |
| V5 | Product card display | Frontend: catalog page | Retail + Wholesale only (no "Approved") |
| V6 | CSV import works | Backend: no approved_price_per_lot | Import succeeds, no errors |
| V7 | Admin product form | Backend: no approved field | Form saves without errors |
| V8 | Column dropped | SQL: SELECT column from products | Column does not exist |
| V9 | No doc drift | grep approved_price_per_lot in docs/ | No matches (except seed.sql) |
| V10 | No code references | grep approved_price_per_lot in src/ | No matches |

---

## 13. Implementation Tracking (Checkboxes)

Use this section during execution to check off completed work:

### Backend Code
- [x] B1: pricing.py reverted to 2-tier
- [x] B2: row_normalizer.py - approved removed
- [x] B3: row_validator.py - approved validation removed
- [x] B4: csv_parser.py - approved removed from headers/sample

### Backend Tests
- [x] BT1: test_adapters_pricing.py - 6 test functions removed, _make_product reverted
- [x] BT2: test_adapters_csv.py - 5 test functions removed, all assertions cleaned
- [x] BT3: test_admin.py - approved_price_per_lot assert removed
- [x] BT4: test_pricing_parity.py - deleted
- [x] BT5: pricing_matrix.json - reverted to 8 two-tier fixtures

### Frontend
- [x] F1: pricing.ts - deleted
- [x] F2: types/index.ts - approved_price_per_lot removed from Product + ProductCsvColumn
- [x] F3: product-form.tsx - approved field + validation removed
- [x] F4: product-card.tsx - useUserRole removed, wholesale-only display
- [x] F5: cart-drawer.tsx - inlined 2-tier resolvePrice/resolveTier (no role), wholesale progress bar simplified
- [x] F6: checkout-page.tsx - inlined 2-tier functions (no role), kept tier display (RETAIL/WHOLESALE only)
- [x] F7: product-detail-content.tsx - role prop removed, inlined 2-tier functions, approved price section removed
- [x] F7b: products/[id]/page.tsx - role fetching removed, role prop not passed

### Scripts
- [x] S1: pricing-parity.mjs - deleted

### Database
- [x] D1: 013_revert_approved_price.sql - created with correct ordering (constraint → NOT NULL → column)

### Documentation
- [x] Doc1: adr/001-hybrid-wholesale-pricing.md - Amendment reverted, 2-tier rule documented
- [x] Doc2: glossary.md - approved terms reverted, "Approved Price" removed
- [x] Doc3: 2026-08-03-three-tier-pricing-design.md - deleted
- [x] Doc4: 2026-08-03-pricing-grill-fixes.md - deleted
- [x] Extra: .superpowers/sdd/2026-08-03-pricing-grill-fixes/ - deleted (R11 mitigation)
- [x] Extra: README.md - 3-tier → 2-tier references updated
- [x] Extra: package.json - test script updated (no longer references deleted pricing-parity.mjs)

### Verification
- [x] V1: pytest passes (148 passed, 0 failures)
- [x] V2: tsc --noEmit passes (0 errors)
- [x] V3: ESLint passes (0 errors, 0 warnings)
- [x] V4: grep @lib/pricing imports = empty
- [x] V5: grep approved_price_per_lot in src/ = empty (excluding test assertions verifying absence)
- [x] V6: grep APPROVED tier = empty
- [x] V7: grep isApprovedShopper = empty
- [x] V8: Migration 013 ordering verified (constraint → NOT NULL → column)
- [x] V9: Doc drift check - only ADR-001 mentions approved (describing removal)
- [x] V10: pricing-parity.mjs + test_pricing_parity.py both deleted