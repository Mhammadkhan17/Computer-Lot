# Plan: Collapse the Order Intake Module

## Candidate

**"Collapse the Order Intake module"** — `backend/app/adapters/order_intake.py` (141 lines)

## Summary

The Order Intake module is a god orchestrator that mixes data fetching, validation, pricing, persistence, notification, and response construction in a single `create()` function. It orchestrates 7 thin private helpers (`_fetch_profile`, `_assert_open_order_cap`, `_fetch_products`, `_validate_stock`, `_resolve_pricing`, `_build_order_data`) plus calls to `run_in_transaction`, `build_order_link`, and `broadcast_order_update`. Four of these helpers are thin pass-throughs with no real seam — they add interface complexity without implementation depth. This plan removes those 4 helpers and absorbs their logic directly into `create()`, deepening the module while keeping its external interface unchanged.

---

## 1. Deepened Module's Interface Shape

### Public interface (unchanged)

```python
async def create(
    checkout_req: CheckoutRequest,
    supabase: Client,
    tx_supabase: Client,
    user_id: str,
) -> CheckoutResponse:
```

The checkout route (`backend/app/routes/checkout.py`) calls this function with the same signature. No changes needed in the route.

### Exception contract (unchanged)

| Exception | Source |
|-----------|--------|
| `InsufficientStockError` | Stock pre-check (was `_validate_stock`) or transaction (was `run_in_transaction`) |
| `HTTPException(404)` | Profile not found (was `_fetch_profile`) |
| `HTTPException(400)` | Open order cap exceeded (was `_assert_open_order_cap`) |
| `HTTPException(500)` | Transaction failure (was `run_in_transaction`) |

### Private helpers (after deepening)

| Helper | Status | Reason |
|--------|--------|--------|
| `_assert_open_order_cap` | **Kept** | Contains real logic: count check, HTTPException construction |
| `_fetch_profile` | **Kept** | Contains real logic: 404 error handling |
| `_fetch_products` | **Kept** | Contains real logic: HTTP/2 retry loop |
| `_validate_stock` | **Removed** | Thin pass-through to `check_availability()` |
| `_resolve_pricing` | **Removed** | Thin pass-through to `resolve_all_items()` |
| `_build_order_data` | **Removed** | Trivial dict constructor |

---

## 2. What Adapters Remain and What Gets Absorbed

### Adapters that remain as separate modules (real seams)

| Adapter | File | Why it stays |
|---------|------|-------------|
| Pricing | `backend/app/adapters/pricing.py` | Hybrid pricing logic (per-product minimum + total 10-lot threshold) — ADR-001 |
| Stock | `backend/app/adapters/stock.py` | Stock availability check + `InsufficientStockError` — ADR-007 |
| Transaction | `backend/app/adapters/txn.py` | Atomic checkout transaction — ADR-002 |
| WhatsApp | `backend/app/adapters/whatsapp.py` | WhatsApp deep link builder — ADR-005 |
| Notification | `backend/app/adapters/notification.py` | WebSocket broadcast — separate concern |

### Logic absorbed into the deepened order_intake module

| Absorbed helper | Absorbed as |
|----------------|-------------|
| `_validate_stock` | Direct call to `check_availability()` inside `create()` |
| `_resolve_pricing` | Direct call to `resolve_all_items()` inside `create()` |
| `_build_order_data` | Inline dict construction inside `create()` |

---

## 3. What the New Seam Looks Like

### Current seam (checkout route → order_intake)

The checkout route depends on:
- The public `create()` function
- 7 private helpers (for mocking in unit tests)
- 3 external adapters (`run_in_transaction`, `build_order_link`, `broadcast_order_update`)

This is a **wide seam** — the route's test surface includes many internal details of the order_intake module.

### Deepened seam

The checkout route depends on:
- The public `create()` function (unchanged)
- 3 external adapters (`run_in_transaction`, `build_order_link`, `broadcast_order_update`)

This is a **narrow seam** — the route's test surface is just `create()`. The 3 remaining private helpers (`_assert_open_order_cap`, `_fetch_profile`, `_fetch_products`) are internal to the module and don't leak into the route's testing surface.

### Module internal structure (after deepening)

`create()` now has 6 clear phases visible in its body:

1. **Fetch context** — profile lookup + order cap check
2. **Fetch products + validate stock** — product lookup with retry, then direct `check_availability()` call
3. **Resolve pricing** — direct `resolve_all_items()` call + total calculation
4. **Persist order** — `run_in_transaction()` call
5. **Build WhatsApp link** — `build_order_link()` call
6. **Broadcast + respond** — `broadcast_order_update()` + `CheckoutResponse` construction

---

## 4. What Tests Survive and What Changes

### Tests that survive (unchanged)

All tests in `test_checkout.py` (303 lines) — the route-level integration tests are unaffected because the `create()` interface is unchanged.

All tests in `test_adapters_order_intake.py` for the remaining private helpers:
- `TestAssertOpenOrderCap` (3 tests)
- `TestFetchProfile` (2 tests)
- `TestFetchProducts` (3 tests)
- `TestCreateOrder` (3 tests — `test_successful_order_creation`, `test_checkout_returns_stock_errors`, `test_open_order_cap_enforced`)

### Tests to remove

| Test class | File | Reason |
|-----------|------|--------|
| `TestValidateStock` (2 tests) | `test_adapters_order_intake.py` | `_validate_stock` is absorbed; logic covered by `test_adapters_stock.py` |
| `TestResolvePricing` (2 tests) | `test_adapters_order_intake.py` | `_resolve_pricing` is absorbed; logic covered by `test_adapters_pricing.py` |
| `TestBuildOrderData` (1 test) | `test_adapters_order_intake.py` | `_build_order_data` is absorbed; trivial dict construction, no separate seam |

**Total: 5 tests removed, 0 new tests needed.**

### Coverage verification

The absorbed logic is covered by:
- `test_adapters_stock.py` — covers `check_availability()` directly
- `test_adapters_pricing.py` — covers `resolve_price()` and `resolve_all_items()` directly
- `TestCreateOrder.*` in `test_adapters_order_intake.py` — covers the full pipeline through `create()`
- `test_checkout.py` — covers the route-level integration

---

## 5. ADR Conflicts

**None.** The deepening is purely an internal restructuring. It does not change any architectural decisions recorded in ADRs.

| ADR | Relevant? | Conflict? |
|-----|-----------|-----------|
| ADR-002 (Atomic checkout transaction) | Yes — transaction flow | No — unchanged |
| ADR-007 (Stock validation at checkout) | Yes — stock pre-check | No — pre-check still runs before transaction |
| ADR-009 (Service role restricted to /checkout) | Yes — service_role usage | No — unchanged |
| ADR-003 (Server Components vs FastAPI boundary) | Yes — FastAPI write path | No — unchanged |
| ADR-001 (Hybrid wholesale pricing) | Yes — pricing logic | No — `pricing.py` unchanged |
| ADR-005 (WhatsApp fulfillment) | Yes — WhatsApp link | No — `whatsapp.py` unchanged |

---

## 6. Implementation Sequence

### Step 1: Edit `backend/app/adapters/order_intake.py`

Remove the 3 thin helpers and inline their logic into `create()`:

- Delete `_validate_stock()` function (lines 62-68)
- Delete `_resolve_pricing()` function (lines 71-81)
- Delete `_build_order_data()` function (lines 84-90)
- In `create()`, replace the `_validate_stock(...)` call with a direct `check_availability(...)` call
- In `create()`, replace the `_resolve_pricing(...)` call with a direct `resolve_all_items(...)` call
- In `create()`, replace the `_build_order_data(...)` call with inline dict construction
- Keep `_assert_open_order_cap`, `_fetch_profile`, `_fetch_products` unchanged

### Step 2: Edit `backend/tests/test_adapters_order_intake.py`

Remove the 3 test classes for absorbed helpers:

- Delete `TestValidateStock` (lines 161-189)
- Delete `TestResolvePricing` (lines 192-219)
- Delete `TestBuildOrderData` (lines 222-230)

### Step 3: Run tests

```bash
cd /home/user/Computer-Lot/backend
python -m pytest tests/test_adapters_order_intake.py tests/test_checkout.py -v
```

### Step 4: Run linting/formatting

```bash
cd /home/user/Computer-Lot/backend
ruff check app/adapters/order_intake.py tests/test_adapters_order_intake.py
black app/adapters/order_intake.py tests/test_adapters_order_intake.py
```

### Step 5: Verify the checkout route still works

Run the full checkout test suite:

```bash
python -m pytest tests/test_checkout.py -v
```

---

## 7. Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Lines in `order_intake.py` | 141 | ~110 (3 helpers removed, ~31 lines saved) |
| Private helpers | 7 | 3 |
| Test classes in `test_adapters_order_intake.py` | 7 | 4 |
| Test surface for checkout route | Wide (7 helpers + create) | Narrow (create only) |
| Module depth | Shallow (interface ≈ implementation) | Deeper (interface simpler, implementation concentrated) |

The module's **locality** improves — all checkout flow logic is in one module with clear phase boundaries. The **leverage** improves — future changes to the checkout flow (e.g., adding a new validation step) only require modifying one file with one clear function.