# ADR-007: Stock Validation at Checkout

**Status:** Accepted  
**Date:** 2026-07-18  
**Context:** Cart state is maintained client-side (Zustand). Stock can change between adding to cart and checking out.

**Decision:**
- Server validates stock at checkout time
- If stock changed, FastAPI returns `400` with:
  ```json
  {
    "error": "insufficient_stock",
    "out_of_stock": [
      { "product_id": "...", "title": "...", "available": 3, "requested": 5 }
    ]
  }
  ```
- Frontend displays a clear error message and highlights affected items
- **DO NOT** auto-remove items — the user decides what to do
- Client-side stock display is approximate (uses cached data from last fetch)

**Consequences:**
- Prevents overselling at the database level
- User-friendly error UX is important (not a generic "something went wrong")
- Zustand cart is source of truth for the UI, but DB is source of truth for stock
