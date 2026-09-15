# Checkout Pipeline Deepening — Design Spec

**Date**: 2026-07-21
**Status**: Draft
**ADRs referenced**: 001, 002, 003, 005, 007, 009

## 1. Problem

The `/checkout` endpoint (`backend/app/routes/checkout.py`) is a 177-line function that conflates 7 concerns: JWT validation, profile lookup, product lookup, pricing computation, stock validation, PostgreSQL transaction management, WebSocket broadcast, and WhatsApp link construction. Understanding any single concern requires reading the full function. The module is shallow — its interface (one POST route) is nearly as complex as its implementation.

Three specific defects exist today:
- **Stale broadcast bug**: The WebSocket broadcast computes `new_stock` from pre-transaction data. Concurrent checkouts send wrong stock values.
- **Untestable write path**: The raw `psycopg2` connection is not injectable, so the checkout endpoint cannot be tested through its interface alone — tests must monkey-patch `psycopg2.connect`.
- **Duplicated connection factory**: `_get_db_connection()` is copy-pasted in `checkout.py` and `admin.py`.

## 2. Solution

Decompose the checkout function into a thin orchestrator coordinating three deepened modules. Each module hides its complexity behind a narrow interface.

```
POST /checkout  (thin orchestrator, ~40 lines)
  │
  ├── Pricing Engine        (pure function)
  ├── Database Writer       (seam: pg + in-memory adapters)
  └── Notification Broadcaster  (seam: ws + spy adapters)
```

## 3. Module Interfaces

### 3.1 Pricing Engine

**File**: `backend/app/pricing.py`
**Type**: Pure function, no I/O
**Language**: Python (backend-only per ADR-003)

```python
def compute_line_item_prices(
    items: list[CheckoutItem],
    profile: Profile,
    products: list[Product]
) -> list[PricedItem]:
```

Logic (per ADR-001 hybrid pricing):
- Compute `total_lots = sum(item.quantity for item in items)`
- `is_wholesale = (profile.role == "wholesale_approved" and total_lots >= 10)`
- For each item: apply wholesale price iff `is_wholesale and item.quantity >= product.minimum_wholesale_lots`
- Return `PricedItem {product_id, quantity, unit_price_applied, pricing_tier: "retail"|"wholesale"}`

Frontend keeps its approximate pricing display (already exists in 3 files). The backend is the source of truth — consistent with ADR-007's client/server trust model.

### 3.2 Database Writer

**File**: `backend/app/database_writer.py`
**Type**: Seam (abstract interface + two adapters)
**Adapters**: `PostgresDatabaseWriter` (psycopg2), `InMemoryDatabaseWriter` (dicts, for tests)

```python
class DatabaseWriter(ABC):
    @abstractmethod
    def write_checkout_order(
        self, user_id: str, request: CheckoutRequest, priced_items: list[PricedItem]
    ) -> WriteOrderResult:
        """Coarse, atomic. Wraps full transaction: BEGIN → order → items → decrement → COMMIT/ROLLBACK."""

    @abstractmethod
    def update_order_status(self, order_id: str, new_status: str) -> bool:
        """Single op for admin."""

    @abstractmethod
    def restock_product(self, product_id: str, quantity: int) -> bool:
        """Single op for admin cancellations."""
```

`WriteOrderResult`:
```python
@dataclass
class WriteOrderResult:
    success: bool
    order: Order | None = None
    items: list[OrderItem] | None = None
    updated_stock: dict[str, int] | None = None   # product_id → new stock count
    error: Literal["race_condition", "db_error"] | None = None
```

Key behaviors:
- `write_checkout_order` never raises for business logic failures. Returns `error="race_condition"` if `decrement_stock_inventory` returns false (another checkout consumed stock between validation and decrement). Returns `error="db_error"` for connection/transaction failures.
- After COMMIT, re-reads `available_stock_lots` for each product to return accurate post-transaction values (fixes the stale broadcast bug).
- `update_order_status` with status `"cancelled"` calls `restock_product` internally in the same transaction.

### 3.3 Notification Broadcaster

**File**: `backend/app/notification.py`
**Type**: Seam (abstract interface + two adapters)
**Adapters**: `WebSocketBroadcaster` (ws_manager singleton), `SpyBroadcaster` (records calls, for tests)

```python
class NotificationBroadcaster(ABC):
    @abstractmethod
    async def order_placed(
        self, order: Order, items: list[OrderItem], updated_stock: dict[str, int]
    ) -> None:
        """Fire-and-forget broadcast to admin role."""
```

WhatsApp link construction stays as the existing pure utility `_build_whatsapp_link()` — not part of this module.

### 3.4 Orchestrator

**File**: `backend/app/routes/checkout.py` (rewritten, ~40 lines)

```python
@router.post("")
async def checkout(
    request: CheckoutRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    db_writer: DatabaseWriter = Depends(get_db_writer),
    notifier: NotificationBroadcaster = Depends(get_notifier),
):
    profile = await get_profile(supabase, user["sub"])
    if not profile:
        return JSONResponse({"error": "profile_not_found"}, 404)

    products = await get_products(supabase, request.items)
    priced_items = compute_line_item_prices(request.items, profile, products)

    stock_errors = validate_stock(priced_items, products)
    if stock_errors:
        return JSONResponse(
            {"error": "insufficient_stock", "out_of_stock": stock_errors}, 400
        )

    result = db_writer.write_checkout_order(user["sub"], request, priced_items)
    if not result.success:
        if result.error == "race_condition":
            return JSONResponse({"error": "stock_changed_retry"}, 409)
        return JSONResponse({"error": "checkout_failed"}, 500)

    await notifier.order_placed(result.order, result.items, result.updated_stock)
    whatsapp_link = build_whatsapp_link(result.order)
    return CheckoutResponse(order=result.order, whatsapp_link=whatsapp_link)
```

## 4. File Changes

| File | Change |
|------|--------|
| `backend/app/routes/checkout.py` | Rewrite: 177→40 lines, thin orchestrator |
| `backend/app/pricing.py` | **New** — `compute_line_item_prices()` |
| `backend/app/database_writer.py` | **New** — abstract interface + pg adapter + mem adapter |
| `backend/app/notification.py` | **New** — abstract interface + ws adapter + spy adapter |
| `backend/app/routes/admin.py` | Replace inline `_get_db_connection()` with `DatabaseWriter` dependency |
| `backend/app/database.py` | Unchanged (still provides Supabase client for reads) |
| `backend/app/main.py` | Wire `get_db_writer` and `get_notifier` as dependencies |
| `backend/tests/test_checkout.py` | Unchanged (17 HTTP tests survive) |
| `backend/tests/test_pricing.py` | **New** — 12+ scenarios, pure function tests |
| `backend/tests/test_database_writer.py` | **New** — 8 tests via in-memory adapter |
| `backend/tests/test_notification.py` | **New** — 4 tests via spy adapter |

## 5. Test Plan

### 5.1 Pricing Engine (12 scenarios)

| Scenario | Role | Total Lots | Meets Per-Product Min | Expected Tier |
|----------|------|------------|----------------------|---------------|
| Retail user | retail | any | any | retail |
| Wholesale pending | wholesale_pending | any | any | retail |
| Wholesale below global threshold | wholesale_approved | 5 | yes | retail |
| Wholesale meets global, meets per-product | wholesale_approved | 10 | yes | wholesale |
| Wholesale meets global, below per-product | wholesale_approved | 10 | no | retail |
| Mixed cart (some meet, some don't) | wholesale_approved | 15 | mixed | mixed |
| Empty cart | retail | 0 | N/A | empty result |
| Single item at exact per-product min | wholesale_approved | 5 | yes (min=5) | wholesale |
| Single item below per-product min | wholesale_approved | 4 | no (min=5) | retail |
| Multiple items, all below per-product min | wholesale_approved | 10 | no | all retail |
| Multiple items, all meet per-product min | wholesale_approved | 10 | yes | all wholesale |
| Admin role | admin | any | any | retail (admin uses retail) |

### 5.2 Database Writer (8 tests)

- Successful checkout creates order + items + decrements stock
- Order status set to `pending_whatsapp` on creation
- Decrement returns false → ROLLBACK, error returned
- Race condition handling (concurrent decrement failure)
- `update_order_status` changes status
- `restock_product` increases stock
- Cancel order restocks in same transaction
- DB connection failure returns `db_error`

### 5.3 Notification Broadcaster (4 tests)

- `order_placed` broadcasts to admin role
- Broadcast includes correct order_id and stock values
- Spy adapter records the call for assertion
- Broadcast failure does not raise (fire-and-forget contract)

### 5.4 HTTP tests (17 existing, unchanged)

All existing tests continue to validate POST /checkout through the HTTP interface. No contract changes.

## 6. ADR Compliance

| ADR | How design satisfies it |
|-----|----------------------|
| ADR-001 (hybrid pricing) | Pricing Engine implements per-product min + 10-lot threshold |
| ADR-002 (atomic transaction) | Database Writer's coarse `write_checkout_order` wraps full transaction |
| ADR-003 (reads via Server Components) | No FastAPI read endpoints. Pricing Engine is backend-only pure function called within /checkout |
| ADR-005 (WhatsApp fulfillment) | WhatsApp link builder stays a pure utility. Order flow unchanged |
| ADR-007 (stock validation with errors) | Explicit stock check before transaction. Structured error responses (400/409) |
| ADR-009 (service_role restricted) | Database Writer used only by /checkout and /admin (both already protected) |

## 7. Accepted Tensions

1. **Asymmetric I/O treatment**: Read operations (profile, product lookup) stay as inline Supabase calls using FastAPI's existing `Depends(get_supabase)` injection. Only write operations get a new seam. The asymmetry is intentional — the existing DI pattern already makes reads injectable. Adding a read seam would add indirection without reducing test complexity (tests already override `get_supabase`).

2. **Two granularities in one Writer**: The Database Writer interface serves two callers with different granularity needs — checkout wants a single coarse call; admin wants fine-grained operations. They share the same module because they share connection management, transaction primitives, and the `decrement_stock_inventory`/`increment_stock_inventory` function calls. The asymmetry is documented and intentional.

## 8. What This Design Does NOT Change

- The frontend checkout button and cart display
- The Zustand cart store
- The WhatsApp link format
- The database schema or PostgreSQL functions
- The Supabase RLS policies
- The WebSocket manager singleton
- The auth flow (login, signup, JWT validation)
