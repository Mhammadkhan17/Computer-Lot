# ADR-002: Atomic All-or-Nothing Checkout Transaction

**Status:** Accepted  
**Date:** 2026-07-18  
**Context:** Stock integrity is the #1 data priority. Multi-item orders risk partial fulfillment if one item has insufficient stock.

**Decision:**
- The `/checkout` endpoint runs inside a single PostgreSQL transaction (BEGIN/COMMIT/ROLLBACK)
- Steps in order:
  1. Validate JWT and fetch user profile
  2. Calculate pricing per item (hybrid model per ADR-001)
  3. Check stock for every item (`available_stock_lots >= quantity`)
  4. If any item fails stock check → return 400 with `out_of_stock[]` details
  5. Insert `orders` record
  6. Insert `order_items` records
  7. Call `decrement_stock_inventory` for each item
  8. If any RPC call returns `false` → raise exception → full ROLLBACK
  9. COMMIT → return order data + WhatsApp deep link

**Consequences:**
- No partial orders (all items succeed or none do)
- Requires `decrement_stock_inventory` to be called within the DB transaction
- FastAPI must use the same Supabase/PostgreSQL connection for the entire flow
