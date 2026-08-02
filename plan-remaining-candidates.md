# Implementation Plans: Remaining 4 Architecture Candidates

**Date**: 2026-08-02
**Status**: Plans only — no code changes

---

## Candidate 2: Consolidate the Duplicated Pricing Logic

### Turn 1 — Read and Understand

The pricing decision logic is duplicated independently in two locations:

- **`backend/app/adapters/pricing.py`**: `resolve_price(product, quantity, role, total_lots)` applies the hybrid wholesale model — checks `role == "wholesale_approved" and total_lots >= 10`, then `quantity >= product["minimum_wholesale_lots"]`. `resolve_all_items()` iterates checkout items and produces `OrderItemResponse` objects with resolved prices.
- **`frontend/src/hooks/usePricing.ts`**: `isWholesale(totalLotsCount, role)` and `resolvePrice({product, quantity, totalLotsCount, role})` replicate the identical logic. Also provides `calcSubtotal()` and a `usePricing()` hook that binds the role from `useUserRoleStore`.
- **`frontend/src/hooks/useCart.ts`**: Imports `calcSubtotal` from `usePricing.ts` and calls it in the `subtotal()` method, also reading role from `useUserRoleStore.getState().role`.

The wholesale threshold (`total_lots >= 10`) and per-product minimum (`quantity >= minimum_wholesale_lots`) are the same logic maintained in two files. The frontend's cart preview computes its own subtotal using this duplicated logic, while the backend resolves prices authoritatively at checkout time.

### Turn 2 — Identify the Seam

The seam sits between the backend pricing adapter and the frontend display logic. Currently, the frontend independently re-implements the pricing decision rules rather than deriving its display from the backend's authoritative resolution.

What is leaking across this seam:
- The pricing tier decision (which price applies to a line item) is defined independently in two runtimes.
- The cart's `subtotal()` method in `useCart.ts` contains pricing logic that should be the backend's concern.
- The frontend's `usePricing.ts` hook is a parallel adapter that mirrors the backend's pricing module.

The deepened module's interface should sit at the backend adapter level. The frontend should derive its display from the backend's output (checkout response) rather than computing prices independently.

### Turn 3 — Determine Absorption vs. Preservation

| Adapter | Action | Rationale |
|---------|--------|-----------|
| `backend/app/adapters/pricing.py` | **Deepen** | Becomes the single authoritative pricing module. Expand its interface to return a `PricingResult` that includes both resolved items and a computed subtotal. |
| `frontend/src/hooks/usePricing.ts` | **Absorb (delete)** | Its logic is entirely duplicated by the backend module. The frontend should not independently compute pricing decisions. |
| `frontend/src/hooks/useCart.ts` | **Preserve (modify)** | The cart state management (Zustand) is a separate concern. But its `subtotal()` method must stop using the deleted `calcSubtotal` and instead derive pricing from checkout response data or a thin display-only helper. |

**Deletion test**: If we delete `usePricing.ts`, can the frontend still display prices? Yes — at checkout time, prices come from the backend's `CheckoutResponse`. For the cart preview before checkout, the frontend can show a "projected" subtotal using cached product data without implementing the wholesale decision logic.

### Turn 4 — Design the Deepened Module's Interface

**Backend module** (`backend/app/adapters/pricing.py`):

The existing `resolve_price()` and `resolve_all_items()` functions are preserved as the authoritative core. A new `PricingResult` type is introduced:

```
PricingResult:
  items: list[OrderItemResponse]
  subtotal: float
```

New public function:
```
resolve_checkout(products_map, checkout_items, role, total_lots) -> PricingResult
```
This combines `resolve_all_items()` and subtotal computation into a single call, ensuring the frontend cannot get a different subtotal than the backend.

**Frontend changes**:
1. Delete `frontend/src/hooks/usePricing.ts` entirely.
2. In `frontend/src/hooks/useCart.ts`, remove the `subtotal()` method and the import of `calcSubtotal`. The cart no longer computes pricing — it stores quantities and product references only. Pricing is resolved at checkout by the backend and returned in `CheckoutResponse`.
3. The checkout page displays prices from the `CheckoutResponse` data, not from client-side computation.

**Seam change**: The seam between frontend and backend pricing narrows. The frontend no longer holds a pricing decision module. It receives resolved prices from the backend's checkout response and displays them. The only frontend-side pricing logic that remains is the cart quantity arithmetic (quantity × unit_price), which is display math, not pricing logic.

### Turn 5 — Test Impact

**Existing tests**:
- `backend/tests/test_adapters_pricing.py`: Tests for `resolve_price` remain valid. Add tests for the new `resolve_checkout()` function covering: hybrid pricing (some items wholesale, some retail), subtotal computation, and edge cases (empty cart, single item).
- `backend/tests/test_checkout.py`: Integration tests that mock `resolve_all_items` — these continue to work since `resolve_all_items` is preserved. Add a test that verifies the checkout response includes the correct subtotal from the pricing module.
- `backend/tests/test_adapters_order_intake.py`: Mocks `resolve_all_items` — no changes needed.

**New tests needed**:
- Test that `resolve_checkout()` returns a `PricingResult` where `subtotal` matches the sum of `unit_price_applied × quantity_ordered` across all items.
- Test that the frontend cart displays prices from the checkout response, not from client-side computation.

**Test surface**: The deepened module exposes `resolve_checkout()` as its primary interface. All pricing tests target this single function.

### Turn 6 — ADR Conflicts

- **ADR-001 (Hybrid Wholesale Pricing)**: The deepened module preserves the exact pricing logic (role check, total_lots threshold, per-product minimum). No conflict. The `resolve_checkout()` function implements the same hybrid model.
- **ADR-003 (Server Components for reads, FastAPI for writes)**: The frontend no longer computes pricing decisions — it receives resolved prices from the backend's write-path (checkout). This aligns with the ADR's principle that pricing is a write-side concern. No conflict.
- **ADR-007 (Stock Validation at Checkout)**: Pricing resolution happens before stock validation in the current flow. The deepened module preserves this ordering. No conflict.
- **ADR-009 (service_role restricted to /checkout)**: The pricing module is used exclusively within the `/checkout` endpoint's call chain. No conflict.

### Turn 7 — Implementation Plan

**Files to modify**:
1. `backend/app/adapters/pricing.py` — Add `PricingResult` type and `resolve_checkout()` function that combines item resolution and subtotal computation.
2. `frontend/src/hooks/usePricing.ts` — **Delete** entirely.
3. `frontend/src/hooks/useCart.ts` — Remove `subtotal()` method and `calcSubtotal` import. Remove `usePricing` import. The cart stores quantities only; pricing comes from checkout response.
4. `frontend/src/app/checkout/page.tsx` (or equivalent checkout page) — Update to display prices from `CheckoutResponse` rather than from client-side computation.

**Deepened module's interface shape**:
- `resolve_checkout(products_map, checkout_items, role, total_lots) -> PricingResult`
- `PricingResult.items: list[OrderItemResponse]`
- `PricingResult.subtotal: float`

**Adapters remaining vs. absorbed**:
- `pricing.py` remains as the deepened authoritative module.
- `usePricing.ts` is absorbed (deleted).
- `useCart.ts` is preserved but stripped of pricing logic.

**New seam**: The frontend receives resolved pricing exclusively from the backend's checkout response. The cart is a quantity-only store; pricing is a checkout-time resolution.

**Tests to change**:
- Add `resolve_checkout` tests in `test_adapters_pricing.py`.
- Update checkout integration tests to verify subtotal in response.
- Remove any frontend pricing tests (none exist currently).

**Step-by-step sequence**:
1. Add `PricingResult` type and `resolve_checkout()` to `backend/app/adapters/pricing.py`.
2. Add tests for `resolve_checkout()` in `backend/tests/test_adapters_pricing.py`.
3. Delete `frontend/src/hooks/usePricing.ts`.
4. Modify `frontend/src/hooks/useCart.ts` to remove `subtotal()` and `calcSubtotal` import.
5. Update checkout page to display prices from `CheckoutResponse`.
6. Run backend tests to verify pricing module still works.
7. Run frontend build to verify no broken imports.

---

## Candidate 3: Deepen the CSV Import Pipeline

### Turn 1 — Read and Understand

The import pipeline consists of four thin adapters executed sequentially in `backend/app/routes/admin.py` (`import_products` route):

1. **`csv_parser.py`** (37 lines): `parse_rows(content)` decodes CSV bytes into list of dicts. Also provides `get_headers()` and `get_template_row()`. Pure parsing — no validation or transformation.
2. **`row_validator.py`** (90 lines): `validate_row(row)` validates a single raw row (title, sku, grade, prices, stock). Returns `(validated_dict, errors)`. Private helpers `_parse_float` and `_parse_int`.
3. **`row_normalizer.py`** (37 lines): `normalize_row(row)` transforms validated row into DB-ready format (image_urls→images list, tags→list, hardware_specifications→dict).
4. **`product_inserter.py`** (9 lines): `insert_products(supabase, rows)` iterates rows and calls `supabase.table("products").insert(row).execute()` for each one. **No transaction safety** — if insert #3 of 10 fails, rows 1-2 are already committed to the database.

The `admin.py` route orchestrates these in sequence: `parse_rows → validate_row → normalize_row → insert_products`. It also calls `get_manager().broadcast_to_role("product_update", ...)` after insertion.

The critical problem: `product_inserter.py` has no transaction safety. Partial imports are possible. Additionally, the four adapters have no shared type contract — each transforms the data shape independently with no formal interface between them.

### Turn 2 — Identify the Seam

The seam is between the import pipeline's stages. Each adapter is a thin transformation step with no shared contract. The deepened module should collapse these into a single `execute()` interface that handles parsing, validation, normalization, and insertion atomically.

What is leaking across seams:
- The row shape transforms between stages (raw CSV dict → validated dict → normalized dict) with no formal type contract.
- The admin route directly calls each adapter in sequence, knowing the internal pipeline structure.
- Transaction safety is absent — the pipeline's atomicity boundary is each individual insert, not the entire import.

### Turn 3 — Determine Absorption vs. Preservation

| Adapter | Action | Rationale |
|---------|--------|-----------|
| `csv_parser.py` | **Absorb** | Only used by the import pipeline. Its `parse_rows`, `get_headers`, `get_template_row` become internal functions of the deepened module. |
| `row_validator.py` | **Absorb** | Only used by the import pipeline. Validation logic becomes an internal stage of the deepened module. |
| `row_normalizer.py` | **Absorb** | Only used by the import pipeline. Normalization logic becomes an internal stage. |
| `product_inserter.py` | **Absorb** | Only used by the import pipeline. Needs transaction safety added — this is the core motivation for deepening. |
| `backend/app/routes/admin.py` | **Preserve (modify)** | Route definitions are preserved but refactored to call the deepened module's single `execute()` interface. |

**Deletion test**: If we collapse the four adapters into one module, can the import pipeline still function? Yes — the deepened module provides a single `execute()` interface that replaces all four adapters. The admin route calls `execute()` instead of orchestrating the four adapters.

### Turn 4 — Design the Deepened Module's Interface

**New module**: `backend/app/adapters/product_import.py`

**Public interface**:
```
execute(content: bytes, supabase: Client) -> ImportResult
```

**`ImportResult` type**:
```
ImportResult:
  inserted: int
  errors: list[RowImportError]
  total_rows: int
```

**Internal structure** (stages within `execute()`):
1. **Parse**: Decode CSV bytes → raw rows (from `csv_parser.py`)
2. **Validate**: Iterate raw rows, validate each → (valid_rows, validation_errors) (from `row_validator.py`)
3. **Normalize**: Transform validated rows → DB-ready rows (from `row_normalizer.py`)
4. **Insert**: Batch-insert all normalized rows in a single transaction (from `product_inserter.py`, with transaction safety added)

**Transaction safety**: Replace the per-row insert loop with a single batch insert:
```python
supabase.table("products").insert(all_normalized_rows).execute()
```
If the batch insert fails, nothing is committed. This is atomic by nature of the PostgreSQL INSERT statement — either all rows insert or none do. This is simpler and more reliable than wrapping individual inserts in a transaction block.

If batch insert has size limits (e.g., Supabase row limit per request), fall back to grouping rows into batches and wrapping each batch in a transaction using the existing `run_in_transaction` pattern from `txn.py`.

**Seam change**: The admin route's `import_products` handler changes from orchestrating four adapters to calling one `execute()` function. The seam between the HTTP route and the import logic narrows from four adapter calls to one.

### Turn 5 — Test Impact

**Existing tests**:
- `backend/tests/test_adapters_csv.py`: Tests for `parse_rows`, `get_headers`, `get_template_row`, `validate_row`, `normalize_row`, `insert_products`. These individual function tests become internal to the deepened module. They should be reorganized as unit tests of the `execute()` function's internal stages, or moved to integration-level tests.
- `backend/tests/test_admin.py`: Tests for the `/admin/products/import` endpoint. These test the full pipeline end-to-end and remain valid but should verify transaction safety (e.g., if one row fails, none are inserted).

**New tests needed**:
- **Transaction rollback test**: Insert 10 rows where row 3 has invalid data. Verify that after `execute()` returns with errors, zero rows are in the database (not 2). This is the core new behavior.
- **Batch insert test**: Verify that `execute()` correctly inserts all valid rows in a single batch operation.
- **Error aggregation test**: Verify that validation errors from multiple rows are all collected and returned in the `ImportResult.errors` list.

**Test surface**: The deepened module exposes a single `execute()` function. All import pipeline tests target this one interface.

### Turn 6 — ADR Conflicts

- **ADR-002 (Atomic checkout transaction)**: The principle of atomic all-or-nothing operations should extend to the import pipeline. The deepened module applies the same atomicity pattern to imports. No conflict — it extends the principle consistently.
- **ADR-009 (service_role restricted to /checkout)**: The import endpoint uses `get_user_supabase` (anon key with RLS), not `service_role`. The admin user's profile has `role=admin`, so RLS policies allow product writes. No conflict.
- **ADR-003 (Server Components for reads, FastAPI for writes)**: The import pipeline is a write operation on the FastAPI side. No conflict.

### Turn 7 — Implementation Plan

**Files to modify**:
1. `backend/app/adapters/product_import.py` — **Create** new deepened module with `execute()` interface.
2. `backend/app/adapters/csv_parser.py` — **Delete**. Its functions are absorbed into `product_import.py`.
3. `backend/app/adapters/row_validator.py` — **Delete**. Its functions are absorbed into `product_import.py`.
4. `backend/app/adapters/row_normalizer.py` — **Delete**. Its functions are absorbed into `product_import.py`.
5. `backend/app/adapters/product_inserter.py` — **Delete**. Its logic is absorbed into `product_import.py` with transaction safety added.
6. `backend/app/routes/admin.py` — **Modify**: Replace the four-adapter orchestration in `import_products` with a single call to `product_import.execute()`. Remove imports of the deleted adapters.

**Deepened module's interface shape**:
- `execute(content: bytes, supabase: Client) -> ImportResult`
- `ImportResult.inserted: int`
- `ImportResult.errors: list[RowImportError]`
- `ImportResult.total_rows: int`

**Adapters remaining vs. absorbed**:
- `product_import.py` is the single deepened module.
- `csv_parser.py`, `row_validator.py`, `row_normalizer.py`, `product_inserter.py` are all absorbed (deleted).

**New seam**: The admin route's import handler calls one `execute()` function instead of orchestrating four adapters. The seam between the HTTP layer and the import logic is a single function call.

**Tests to change**:
- Reorganize `test_adapters_csv.py` to test the `execute()` function's behavior instead of individual adapter functions.
- Add transaction rollback test in `test_adapters_csv.py` or a new test file.
- Update `test_admin.py` import tests to verify atomicity (no partial inserts).

**Step-by-step sequence**:
1. Create `backend/app/adapters/product_import.py` with `execute()` function that internally uses the logic from the four deleted adapters.
2. Implement batch insert with transaction safety in `product_import.py`.
3. Delete `csv_parser.py`, `row_validator.py`, `row_normalizer.py`, `product_inserter.py`.
4. Update `backend/app/routes/admin.py` to import and call `product_import.execute()`.
5. Reorganize `backend/tests/test_adapters_csv.py` to test `execute()` instead of individual adapters.
6. Add transaction rollback test.
7. Run all backend tests to verify no regressions.
8. Verify the admin import endpoint still works end-to-end.

---

## Candidate 4: Collapse the WebSocket/Notification Seam

### Turn 1 — Read and Understand

The notification and WebSocket infrastructure spans five files:

- **`backend/app/utils/ws_manager.py`** (68 lines): Singleton `ConnectionManager` with `_connections: dict[str, list[tuple[WebSocket, str]]]`. Methods: `connect`, `disconnect`, `broadcast`, `broadcast_to_role`, `send_to_user`. The `get_manager()` function returns a global singleton instance. The cascading-error bug: in `send_to_user`, when `ws.send_text()` fails and `self.disconnect()` is called, if `disconnect()` itself raises an exception (e.g., the WebSocket is in an unexpected state), the exception propagates up and stops the loop, preventing subsequent connections for that user from being notified.
- **`backend/app/adapters/notification.py`** (10 lines): Trivial pass-through adapter. `broadcast_order_update(order_data)` calls `get_manager().send_to_user(...)` with hardcoded event type and payload. No abstraction — it's a thin wrapper around the WebSocket manager.
- **`backend/app/routes/admin.py`** (235 lines): HTTP routes that directly call `get_manager()` in multiple places (approve_profile, reject_profile, update_order_status, import_products, broadcast_product_update). This couples the HTTP route layer directly to the WebSocket transport.
- **`backend/app/routes/ws.py`** (51 lines): WebSocket endpoint handler. Contains inline profile lookup: queries `profiles` table to get the user's role, then connects the WebSocket to the manager.
- **`backend/app/adapters/order_intake.py`** (120 lines): Order creation logic. Contains `_fetch_profile()` which performs the same profile lookup as `ws.py` — querying `profiles` table by user_id.

The profile lookup is duplicated across `ws.py` (lines 31-42) and `order_intake.py` (lines 38-42).

### Turn 2 — Identify the Seam

Two seams need attention:

**Seam 1 — Notification transport**: The admin routes directly depend on `get_manager()` (a singleton accessor for the WebSocket manager). The notification module should abstract the transport so that business logic doesn't know about WebSocket connections. The current `notification.py` is a trivial pass-through that provides no abstraction.

**Seam 2 — Profile lookup**: The profile fetch (user_id → profile data) is duplicated in `ws.py` and `order_intake.py`. This should be extracted into a shared adapter.

What is leaking across these seams:
- HTTP routes know about the WebSocket manager singleton.
- The notification adapter has no interface — it's a direct passthrough to the transport layer.
- Profile lookup logic is copy-pasted across two adapters.

### Turn 3 — Determine Absorption vs. Preservation

| Adapter/Module | Action | Rationale |
|----------------|--------|-----------|
| `notification.py` | **Deepen** | Transform from a trivial 10-line pass-through into a real notification module with a defined interface that abstracts the transport. |
| `ws_manager.py` | **Preserve** | The `ConnectionManager` is the transport layer. It should remain as-is but the notification module should be the only consumer of it from the business logic side. |
| `admin.py` | **Preserve (modify)** | Route definitions are preserved but refactored to use the notification module's interface instead of `get_manager()` directly. |
| `ws.py` | **Preserve (modify)** | WebSocket endpoint preserved but profile lookup extracted to shared adapter. |
| `order_intake.py` | **Preserve (modify)** | Order creation preserved but profile lookup extracted to shared adapter. |

**Deletion test**: If we remove the direct `get_manager()` calls from `admin.py` and replace them with notification module calls, does the system still work? Yes — the notification module wraps the manager and provides a cleaner interface. No code is deleted from the notification module itself; it is deepened, not removed.

### Turn 4 — Design the Deepened Module's Interface

**Deepened notification module** (`backend/app/adapters/notification.py`):

Replace the current trivial 10-line adapter with a proper notification module:

```python
# Public interface — event-driven notification dispatch
async def notify_order_status(order_data: dict) -> None:
    """Notify relevant parties of an order status change."""
    ...

async def notify_profile_update(profile_id: str, role: str) -> None:
    """Notify admins of a profile approval/rejection."""
    ...

async def notify_product_update() -> None:
    """Notify admins of a product import."""
    ...
```

Each function encapsulates the event type, payload construction, and target audience. The notification module is the only place that knows about `get_manager()`.

**Cascading-error fix**: In `ws_manager.py`, the `send_to_user` method must handle per-connection errors without cascading. The fix: collect dead connections during iteration and clean them up after the loop completes, rather than calling `disconnect()` inside the loop which could raise and abort subsequent sends.

```python
async def send_to_user(self, event_type: str, payload: dict, user_id: str) -> None:
    conns = self._connections.get(user_id, [])
    if not conns:
        return
    message = json.dumps({"type": event_type, "payload": payload})
    dead: list[tuple[str, WebSocket]] = []
    for ws, _role in conns:
        try:
            await ws.send_text(message)
        except Exception:
            dead.append((user_id, ws))
    for uid, ws in dead:
        self.disconnect(ws, uid)
```

**Shared profile adapter** (`backend/app/adapters/profile.py`):

```python
async def fetch_profile(supabase: Client, user_id: str) -> dict:
    """Fetch a user's profile by ID. Raises HTTPException(404) if not found."""
    ...
```

This replaces the duplicated profile lookup in both `ws.py` and `order_intake.py`.

**Seam changes**:
1. `admin.py` no longer imports `get_manager`. It imports from `notification` and `profile` adapters instead.
2. `ws.py` imports `fetch_profile` from the shared profile adapter instead of inline lookup.
3. `order_intake.py` imports `fetch_profile` from the shared profile adapter instead of `_fetch_profile`.

### Turn 5 — Test Impact

**Existing tests**:
- `backend/tests/test_ws_manager.py`: Tests for `ConnectionManager`. The cascading-error fix in `send_to_user` should be covered by existing tests (test `send_to_user_sends_only_to_that_user`, `test_send_to_user_no_connection_does_not_error`). Add a test that verifies one failed send doesn't prevent subsequent sends.
- `backend/tests/test_adapters_notification.py`: Tests for `broadcast_order_update`. These need to be updated to test the deepened notification functions (`notify_order_status`, `notify_profile_update`, `notify_product_update`).
- `backend/tests/test_admin.py`: Tests for admin routes that currently mock `get_manager()`. These need to be updated to mock the notification module's functions instead.
- `backend/tests/test_adapters_order_intake.py`: Tests that mock `broadcast_order_update`. These need updating if the notification interface changes.

**New tests needed**:
- Test that `send_to_user` continues sending to remaining connections when one connection fails (cascading-error fix verification).
- Test that `notify_order_status` correctly dispatches to the order owner.
- Test that the shared `fetch_profile` adapter returns the same result as the inline lookups it replaces.

**Test surface**: The deepened notification module exposes three public async functions. The shared profile adapter exposes one public async function. All notification and profile tests target these interfaces.

### Turn 6 — ADR Conflicts

- **ADR-009 (service_role restricted to /checkout)**: The notification module and profile adapter use `get_user_supabase` (anon key with RLS), not `service_role`. The notification module sends WebSocket messages, not database writes. No conflict.
- **ADR-003 (Server Components for reads, FastAPI for writes)**: The notification module is a write-side concern (sending real-time updates). The profile adapter is a read-side concern used by both write and WebSocket paths. No conflict.
- **ADR-005 (WhatsApp fulfillment without payment gateway)**: The notification module handles WebSocket notifications, not WhatsApp messages. No conflict.

### Turn 7 — Implementation Plan

**Files to modify**:
1. `backend/app/adapters/notification.py` — **Deepen**: Replace the trivial 10-line pass-through with a proper notification module exposing `notify_order_status`, `notify_profile_update`, `notify_product_update`.
2. `backend/app/utils/ws_manager.py` — **Modify**: Fix the cascading-error bug in `send_to_user` by collecting dead connections and cleaning up after the loop.
3. `backend/app/adapters/profile.py` — **Create** new shared profile adapter with `fetch_profile(supabase, user_id) -> dict`.
4. `backend/app/routes/admin.py` — **Modify**: Remove `get_manager` import and direct `get_manager()` calls. Replace with calls to notification module functions (`notify_order_status`, `notify_profile_update`, `notify_product_update`). Remove `_assert_admin` profile lookup duplication if applicable.
5. `backend/app/routes/ws.py` — **Modify**: Replace inline profile lookup with import from `profile.py` adapter.
6. `backend/app/adapters/order_intake.py` — **Modify**: Replace `_fetch_profile` with import from `profile.py` adapter. Remove the duplicate `_fetch_profile` function.

**Deepened module's interface shape**:
- `notify_order_status(order_data: dict) -> Awaitable[None]`
- `notify_profile_update(profile_id: str, role: str) -> Awaitable[None]`
- `notify_product_update() -> Awaitable[None]`
- `fetch_profile(supabase: Client, user_id: str) -> dict` (shared adapter)

**Adapters remaining vs. absorbed**:
- `notification.py` is deepened (not deleted — it gains a real interface).
- `ws_manager.py` is preserved as the transport layer.
- `profile.py` is created as a new shared adapter.
- The inline profile lookup in `ws.py` and `order_intake.py` is absorbed into the shared adapter.

**New seam**: The admin routes depend on the notification module's interface, not on the WebSocket manager singleton. The profile lookup is defined once in the shared adapter and consumed by both the WebSocket route and the order intake adapter.

**Tests to change**:
- Update `test_adapters_notification.py` to test the deepened notification functions.
- Update `test_admin.py` to mock notification module functions instead of `get_manager()`.
- Update `test_adapters_order_intake.py` to mock the shared profile adapter instead of inline `_fetch_profile`.
- Add cascading-error fix test to `test_ws_manager.py`.
- Add shared profile adapter tests.

**Step-by-step sequence**:
1. Create `backend/app/adapters/profile.py` with `fetch_profile()`.
2. Fix cascading-error bug in `backend/app/utils/ws_manager.py` `send_to_user()`.
3. Deepen `backend/app/adapters/notification.py` with `notify_order_status`, `notify_profile_update`, `notify_product_update`.
4. Update `backend/app/routes/admin.py` to use notification module and remove direct `get_manager()` calls.
5. Update `backend/app/routes/ws.py` to use shared `fetch_profile` adapter.
6. Update `backend/app/adapters/order_intake.py` to use shared `fetch_profile` adapter and remove `_fetch_profile`.
7. Update all relevant tests.
8. Run backend test suite to verify no regressions.

---

## Candidate 5: Deepen the Admin Dashboard Data Module

### Turn 1 — Read and Understand

The admin dashboard data layer consists of three files:

- **`frontend/src/lib/dashboard-data.ts`** (48 lines): Defines `AdminDashboardData` interface with three fields (`orders`, `pendingProfiles`, `products`). Exports three individual async functions (`loadOrders`, `loadPendingProfiles`, `loadProducts`) and one consolidated function (`loadDashboardData`) that calls all three in parallel via `Promise.all`.
- **`frontend/src/hooks/useAdminDashboard.ts`** (83 lines): Client hook managing state for orders, pendingProfiles, products. Has `loadAll` (refetches everything), `loadOrdersOnly`, `loadProfilesOnly`. The `refresh` callback calls `loadAll`. Three `useWebSocket` subscriptions:
  - `order_status_update` → `refreshOrders` (loads only orders) ✓ fine-grained
  - `profile_update` → `refreshPendingProfiles` (loads only profiles) ✓ fine-grained
  - `product_update` → `refresh` (loads ALL data) ✗ coarse-grained — the bug
- **`frontend/src/hooks/useWebSocket.ts`** (45 lines): Thin subscription adapter mapping event names to Supabase Realtime channel subscriptions. Calls the handler on each Realtime change.

The bug: When a `product_update` WebSocket event fires, the `refresh` callback calls `loadAll()` which fetches orders, pending profiles, AND products — even though only products changed. This causes unnecessary network traffic, potential UI flicker, and wasted server resources.

### Turn 2 — Identify the Seam

The seam is between the data-fetching layer (`dashboard-data.ts`) and the refresh orchestration (`useAdminDashboard.ts`). Currently, `useAdminDashboard` has a coarse `refresh` that refetches everything and fine-grained `refreshOrders`/`refreshPendingProfiles` that only refetch one type. But `product_update` triggers the coarse refresh instead of a fine-grained product-only refresh.

The deepened module should provide a single interface that supports incremental refreshes — each data type can be refreshed independently without pulling in the others.

What is leaking across this seam:
- The `product_update` event triggers a full dashboard refetch instead of a product-only refetch.
- The `refresh` callback in `useAdminDashboard` is a coarse-grained operation that doesn't distinguish which data types changed.
- The `dashboard-data.ts` module provides individual loaders but doesn't expose a consolidated incremental refresh interface.

### Turn 3 — Determine Absorption vs. Preservation

| Module | Action | Rationale |
|--------|--------|-----------|
| `dashboard-data.ts` | **Deepen** | The individual load functions are preserved. A new `refreshProduct` function is added to support incremental product refreshes. The module becomes the single source of truth for all dashboard data operations. |
| `useAdminDashboard.ts` | **Preserve (modify)** | The orchestration hook is preserved but refactored to use the deepened module's incremental refresh interface. The `product_update` WebSocket handler is wired to `refreshProducts` instead of `refresh`. |
| `useWebSocket.ts` | **Preserve** | The subscription adapter is thin and correct. No changes needed. |

**Deletion test**: If we add `refreshProducts` to the deepened module and wire it to the `product_update` event, can the dashboard still function? Yes — and it does so more efficiently by only refetching the changed data type.

### Turn 4 — Design the Deepened Module's Interface

**Deepened `dashboard-data.ts`**:

The existing individual loaders (`loadOrders`, `loadPendingProfiles`, `loadProducts`) and the consolidated loader (`loadDashboardData`) are preserved. A new function is added:

```typescript
// Existing — preserved
export function loadOrders(supabase: SupabaseClient): Promise<AdminOrder[]>
export function loadPendingProfiles(supabase: SupabaseClient): Promise<AdminProfile[]>
export function loadProducts(supabase: SupabaseClient): Promise<Product[]>
export function loadDashboardData(supabase: SupabaseClient): Promise<AdminDashboardData>

// NEW — incremental refresh support
export function refreshProduct(supabase: SupabaseClient): Promise<Product[]>
```

`refreshProduct` is semantically identical to `loadProducts` but its name signals that it's intended for incremental updates (as opposed to initial load). This naming convention makes the intent explicit at the interface level.

**Deepened `useAdminDashboard.ts`**:

The hook is modified to wire `product_update` WebSocket events to a new `refreshProducts` callback instead of the coarse `refresh`:

```typescript
const refreshProducts = useCallback(() => {
  setError(null)
  loadProductsOnly().catch((err) => setError(toErrorMessage(err)))
}, [loadProductsOnly])

// Replace: useWebSocket("product_update", refresh)
// With:     useWebSocket("product_update", refreshProducts)
```

The `loadProductsOnly` callback already exists in the current code (lines 54-57) but is not currently used by any WebSocket subscription. It is wired to the `product_update` event in the deepened version.

**Seam change**: The seam between WebSocket events and data refresh narrows. Each event type maps to the most granular refresh function possible:
- `order_status_update` → `refreshOrders` (orders only)
- `profile_update` → `refreshPendingProfiles` (profiles only)
- `product_update` → `refreshProducts` (products only, not all data)

### Turn 5 — Test Impact

**Existing tests**:
- No frontend test files exist for dashboard data (no `.test.ts` or `.spec.ts` files found in the frontend directory).

**New tests needed**:
- Test that `product_update` WebSocket event triggers only `refreshProducts`, not the full `refresh` (loadAll).
- Test that `order_status_update` triggers only `refreshOrders`.
- Test that `profile_update` triggers only `refreshPendingProfiles`.
- Test that the initial mount still calls `loadAll` for the first paint.

**Test surface**: The deepened module exposes four loader functions and the hook exposes three refresh callbacks. Tests verify the correct wiring between WebSocket events and refresh callbacks.

### Turn 6 — ADR Conflicts

- **ADR-003 (Server Components for reads, FastAPI for writes)**: The dashboard data module is a read-side concern. The deepened module preserves the Server Components initial fetch pattern and adds incremental client-side refreshes. The update note in ADR-003 explicitly describes the dashboard as the reference case for interactive read surfaces. No conflict — this deepening aligns with the ADR's intent.
- **ADR-007 (Stock Validation at Checkout)**: Not relevant to dashboard data. No conflict.

### Turn 7 — Implementation Plan

**Files to modify**:
1. `frontend/src/lib/dashboard-data.ts` — **Deepen**: Add `refreshProduct` function (semantically equivalent to `loadProducts` but named for incremental use). The existing functions are preserved.
2. `frontend/src/hooks/useAdminDashboard.ts` — **Modify**: Add `refreshProducts` callback that calls `loadProductsOnly`. Wire `product_update` WebSocket event to `refreshProducts` instead of `refresh`.

**Deepened module's interface shape**:
- `loadOrders(supabase) -> Promise<AdminOrder[]>` (preserved)
- `loadPendingProfiles(supabase) -> Promise<AdminProfile[]>` (preserved)
- `loadProducts(supabase) -> Promise<Product[]>` (preserved)
- `loadDashboardData(supabase) -> Promise<AdminDashboardData>` (preserved)
- `refreshProduct(supabase) -> Promise<Product[]>` (new — incremental product refresh)

**Adapters remaining vs. absorbed**:
- `dashboard-data.ts` is deepened with the new `refreshProduct` function.
- `useAdminDashboard.ts` is preserved but refactored to use incremental refresh.
- `useWebSocket.ts` is preserved unchanged.

**New seam**: The WebSocket event `product_update` maps to `refreshProducts` (product-only) instead of `refresh` (all data). The seam between event types and refresh granularity is now one-to-one.

**Tests to change**:
- No existing frontend tests to change (none exist for dashboard data).
- New tests needed for WebSocket-to-refresh wiring.

**Step-by-step sequence**:
1. Add `refreshProduct` function to `frontend/src/lib/dashboard-data.ts` (can be an alias for `loadProducts` with a name that signals incremental intent).
2. In `frontend/src/hooks/useAdminDashboard.ts`, add `refreshProducts` callback that calls `loadProductsOnly`.
3. Change the `useWebSocket("product_update", refresh)` subscription to `useWebSocket("product_update", refreshProducts)`.
4. Verify that `order_status_update` still maps to `refreshOrders` and `profile_update` still maps to `refreshPendingProfiles`.
5. Run frontend build to verify no TypeScript errors.
6. Add frontend tests for WebSocket-to-refresh wiring if a testing framework is in place.
