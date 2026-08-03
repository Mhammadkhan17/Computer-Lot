# Security Review Report — Round 3

**Project**: Hybrid Computer Lot Liquidation Platform (Enhanced v2)
**File**: security-report-round3.md
**Reviewed**: 2026-08-02
**Reviewer**: security-reviewer agent
**Scope**: Follow-up review after remediation of all prior findings (C1-C3, H1-H4, M1-M8, L1-L9 from security-report.md / security-todo.txt). Focus is on **new** issues introduced by the remediation work (new SECURITY DEFINER RPCs, expiry job, CSP, rate limiting) and any attack surface the previous review missed.
**Method**: Static review of all source files + live verification against the linked Supabase project (function grants, RLS policies, storage policies, realtime publication, advisor lints) + `npm audit --omit=dev` on the frontend. **Read-only** — no migrations were applied, no packages were installed (pip-audit unavailable).

## Summary

- **Critical Issues:** 0
- **High Issues:** 1
- **Medium Issues:** 4
- **Low Issues:** 4
- **Risk Level:** MEDIUM

**Overall posture (Round 3)**: The Round-1/2 remediation is verified — C1 (service_role confined to /checkout), C2 (rate limiting on, DEBUG=false), C3 (atomic in-RPC stock check with typed out-of-stock), H3/H4 (input bounds at Pydantic + DB), M1 (CSP), M2 (Secure cookie), M3 (per-user limits), M4 (open-order cap + expiry RPC), M5/M6 (WS PII + token transport), M8 (CORS), L3-L9 are all implemented correctly. The database layer remains the strongest part of the system: RLS is enabled on all tables, `create_order`/`decrement_stock_inventory`/`increment_stock_inventory` are service_role-only (verified live), `profiles.role` is not API-writable, and no secrets are committed.

However, this round found **one new High data-integrity bug** introduced by the Round-1 remediation: the new `admin_cancel_order` SECURITY DEFINER function has **no status guard and is not idempotent**, so canceling an order twice (or racing it with `expire_pending_orders`) restocks the same inventory twice — minting stock out of thin air and enabling overselling. It also confirmed the three new admin RPCs are callable by any signed-in user via PostgREST (advisor WARN), and that the M4 "auto-expire" remediation is incomplete (expiry is manual-only, no scheduler).

---

## High Findings (Fix First)

### H-R3-1. `admin_cancel_order` double-restock — no status guard, no idempotency, race with expiry
**Severity:** HIGH
**Category:** Business Logic / Data Integrity (stock integrity is the project's #1 invariant per AGENTS.md)
**Location:**
- `supabase/migrations/004_security_hardening.sql:180-228` — `admin_cancel_order(p_order_id uuid)` (SECURITY DEFINER)
- `backend/app/routes/admin.py:101-104` — cancel path in `PATCH /admin/orders/{order_id}/status`
- `supabase/migrations/005_expire_pending_orders.sql:37-62` — `expire_pending_orders` (uses `FOR UPDATE SKIP LOCKED` on the order row; `admin_cancel_order` does **not** lock the row)

**Issue:** `admin_cancel_order` selects the order by id with **no `status` filter** (migration 004:196-199), restocks every line item via `increment_stock_inventory` (204-215), then sets `status='cancelled'` (217-219). Consequences:

1. **Repeated cancel = unbounded stock minting.** `POST /admin/orders/{id}/status {"status":"cancelled"}` twice on the same order restocks the full quantity both times. There is no "already cancelled / not pending" guard, so each subsequent call adds the order's quantity back to `available_stock_lots` again.
2. **Cancelling non-pending orders restocks shipped/processing goods.** An admin can cancel a `processing` or `completed` order (goods already committed/shipped) — stock is restored even though the goods were sold, creating phantom inventory that can then be oversold.
3. **Race with `expire_pending_orders` (migration 005).** The expiry job locks the order row with `FOR UPDATE SKIP LOCKED` and restocks; `admin_cancel_order` reads the same row with a **plain SELECT, no lock** and restocks concurrently. Both paths then set `status='cancelled'`. If they interleave on the same order, the inventory is restored twice. Unlike `expire_pending_orders`, `admin_cancel_order` has no row lock to serialize against it.
4. The non-cancel status path (`admin.py:108-118`) has no state machine either — an admin can set `completed` → `pending_whatsapp` or `cancelled` → `processing` after a cancel-restock, re-opening an order whose stock was already restored.

**Impact:** `available_stock_lots` can be inflated beyond physical reality by an admin error, a script, or the expire/cancel race. The seller then accepts orders for stock that does not physically exist → fulfillment failures and real financial loss. This directly violates the project's stated priority "data integrity (stock counts) over UX polish" (AGENTS.md §13). Reachable only by admins today (the RPC self-guards with `is_admin()`), but any compromised admin session or future regression converts this into inventory minting.

**Remediation (new migration `007_*.sql` — do not edit 001-006):**
- In `admin_cancel_order`, require the order to actually be cancellable:
  ```sql
  SELECT readable_order_id, user_id
  FROM public.orders
  WHERE id = p_order_id
    AND status = 'pending_whatsapp'
  FOR UPDATE;                     -- lock to serialize against expire_pending_orders
  IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'already_cancelled_or_missing');
  END IF;
  ```
- Make the function idempotent: if the order is already `cancelled` (or not `pending_whatsapp`), return a typed `status` without restocking.
- Add a DB trigger (or RPC check) preventing any restock path from targeting a non-`pending_whatsapp` order; consider a `restocked_at`/`restocked_why` column to make restock operations auditable.
- Add a state-machine guard in `backend/app/routes/admin.py` `update_order_status`: reject transitions `cancelled`/`completed` → `pending_whatsapp`/`processing` (a cancelled order is terminal; only stock-restoring cancels are allowed on `pending_whatsapp`).
- Test: cancel twice → stock restored exactly once; cancel a `processing` order → 409/400 and no restock; concurrent cancel + expire → single restock.

---

## Medium Findings

### M-R3-1. New SECURITY DEFINER admin RPCs are executable by any signed-in user via PostgREST (advisor WARN)
**Severity:** MEDIUM (defense-in-depth; guarded today)
**Category:** Access Control / Grant Hygiene
**Location:**
- `supabase/migrations/004_security_hardening.sql:235-241` — grants to `authenticated` for `admin_set_profile_role`, `admin_cancel_order`
- `supabase/migrations/005_expire_pending_orders.sql:73-75` — grant to `authenticated` for `expire_pending_orders`
- Live advisor (verified): `authenticated_security_definer_function_executable` fires on **all four** — `admin_cancel_order(uuid)`, `admin_set_profile_role(uuid, user_role)`, `expire_pending_orders(int)`, and `is_admin()`

**Issue:** The Round-1 remediation created three new SECURITY DEFINER functions owned by `postgres` and granted `EXECUTE` to `authenticated`, so any logged-in user can invoke them via `/rest/v1/rpc/...`. Each function body does check `IF NOT public.is_admin() THEN RAISE EXCEPTION`, so **there is no privilege escalation today**. But all protection rests on a single SQL helper (`is_admin()`), and:
- `admin_set_profile_role` can change **any** profile to `admin`;
- `admin_cancel_order` can restock **any** order's items;
- `expire_pending_orders` can mass-restock.
If `is_admin()` ever regresses (search_path change, RLS change, function rewrite), these become trivial privesc/inventory-mint primitives for every signed-up user. The grants are needed by the current design (the backend admin routes call these via the user client), so the fix is defense-in-depth, not revocation alone.

**Remediation (migration 007, + optionally backend):**
- Harden `is_admin()` (migration 007): add an explicit role-claim check so only `auth.role() = 'authenticated'` callers are evaluated, and add a regression test that a non-admin invoking each RPC gets `Admin access required` (these tests already exist in spirit; make them hit PostgREST as the RPC surface).
- Keep `EXECUTE` grants but document them in the migration (already done) and add a comment that removing them requires moving these calls to a `service_role` client (which would conflict with ADR-009 "service_role restricted to /checkout" and must be an ADR-reviewed decision).
- Consider moving the three admin RPCs into a dedicated schema (`admin_api`) exposed only to the backend, per Supabase's lint guidance, **only after** an ADR-009 amendment.

### M-R3-2. Pending orders never auto-expire — M4 remediation is manual-only
**Severity:** MEDIUM
**Category:** Availability / Business Logic Abuse (inventory DoS)
**Location:**
- `supabase/migrations/005_expire_pending_orders.sql:15-66` — `expire_pending_orders` exists
- `backend/app/routes/admin.py:222-235` — `POST /admin/expire-orders` (manual, admin-only)
- No scheduler: no `pg_cron`, no Supabase Edge Function, no FastAPI background task (verified — no edge functions exist, main.py has no background jobs)

**Issue:** M4's remediation introduced `expire_pending_orders` but nothing invokes it automatically. An admin must click the endpoint. Meanwhile stock is decremented at order creation (by design, no payment — ADR-005), and the per-user cap is 20 open `pending_whatsapp` orders (order_intake.py `_assert_open_order_cap`), each up to 50 line items × 1000 lots (H3 bounds). A motivated user (or a script with several accounts) can park thousands of lots in `pending_whatsapp` orders that hold stock hostage indefinitely until a human runs the expiry job. The open-cap check also races (two concurrent checkouts can both pass the `>= 20` test before either commits) — minor, but real.

**Remediation:**
- Add a scheduled job: `pg_cron` job on the Supabase project calling `expire_pending_orders(24)` (or a `service_role`-guarded wrapper) every hour; alternatively a Supabase Edge Function with a schedule, or a FastAPI background task. Keep the RLS/admin guard on the *public* RPC; the scheduler can use a dedicated helper.
- Make `_assert_open_order_cap` transactional (lock a per-user counter row, or enforce the cap inside the `create_order` RPC) so two parallel checkouts cannot both exceed the cap.
- Consider lowering the cap (e.g., 10) and adding a per-user "total pending lots" cap.

### M-R3-3. Rate limiter is in-memory per-process — bypassable under multi-worker deploys
**Severity:** MEDIUM (anti-abuse control weakened)
**Category:** DoS / Configuration
**Location:**
- `backend/app/rate_limit.py:28-31` — `Limiter(..., in_memory_fallback_enabled=True)` with no Redis backend configured (requirements.txt has no redis/slowapi redis storage)

**Issue:** SlowAPI's in-memory storage is per-process. Under `uvicorn --workers N`, gunicorn, or a load balancer with multiple replicas, each worker keeps its own counter, so the `10/minute` per-user limit on `/checkout` and `30/minute` admin limits effectively multiply by the worker count. The ADR-009 anti-spam intent ("10 requests/minute per user") is not honored in a scaled deployment. Also, the IP fallback key is `request.client.host`, which behind a proxy is the proxy IP for unauthenticated requests (no `X-Forwarded-For` handling) — though all sensitive endpoints require a JWT, so this is secondary.

**Remediation:**
- Configure a Redis-backed limiter storage (Upstash Redis per AGENTS.md) and key by `user:{sub}` as today.
- If single-process deployment is the plan, document that explicitly and note that any horizontal scaling must add Redis first.

### M-R3-4. Frontend dependency CVEs (npm audit: 5 — 3 high, 2 moderate) + dated backend pins
**Severity:** MEDIUM (dependency hygiene)
**Category:** Using Components with Known Vulnerabilities
**Location:** `frontend/package-lock.json`, `backend/requirements.txt`

**Issue:** `npm audit --omit=dev` in `frontend/` reports 5 vulnerabilities:
- `postcss <=8.5.17` — **high** (installed `8.4.31` as a Next.js dependency): GHSA-qx2v-qp2m-jg93 (XSS via unescaped `</style>`), GHSA-6g55-p6wh-862q (arbitrary file read via `sourceMappingURL`), GHSA-r28c-9q8g-f849 (path traversal). These affect build-time CSS processing; the app does not process untrusted CSS, so runtime risk is low, but the advisory is open.
- `sharp <0.35.0` — **high** (installed `0.34.5`, transitive via Next image optimization): CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 (libvips). The app uses raw `<img>` (not `next/image`), so sharp may never be invoked at runtime, but it is present in the dependency tree.
- `@hono/node-server <2.0.5` — **moderate**, via `@modelcontextprotocol/sdk@1.29.0` (dev tooling for opencode, not shipped in the app bundle) — path traversal on Windows.

`npm audit fix --force` proposes downgrading to `next@9.3.3` — **do not do that**; it is a misleading resolution. Backend pins are also dated (`fastapi==0.115.0`, `starlette==0.38.6`, `supabase==2.6.0`, `slowapi==0.1.9`, `psycopg2-binary==2.9.10`); pip-audit was not installed in the environment, so no backend CVE confirmation was possible.

**Remediation:**
- Upgrade `next` to the latest 15.5.x (or 16.x when stable) so it ships `postcss >= 8.5.18` and `sharp >= 0.35`; add `overrides` in package.json if a transitive pin is needed. Run `npm audit` in CI and fail on high.
- Consider removing the `next/image`-triggered `sharp` dependency by keeping the raw-`<img>` approach (already the case) and verifying no `next/image` usage pulls it at runtime.
- Upgrade backend pins and add `pip-audit` to CI (requires install in a controlled env).

---

## Low Findings

### L-R3-1. Local JWT fallback skips `iss`/`aud`/`role` checks and provides no revocation
**Severity:** LOW
**Category:** Authentication (defense-in-depth)
**Location:** `backend/app/utils/security.py:48-66` (`_verify_jwt_locally`)

**Issue:** When the Supabase Auth server is unreachable, `verify_jwt` falls back to `jwt.decode(..., options={"verify_aud": False})`. Signature and `exp` are verified (good), but `aud`, `iss`, and the `role` claim are not. During an outage, a token belonging to a disabled/deleted user keeps validating locally (no revocation check), and if the JWT secret ever leaks, the fallback accepts any signed token for any `sub`.

**Remediation:** In `_verify_jwt_locally`, additionally require `payload.get("role") == "authenticated"`, `payload.get("aud") == "authenticated"`, and `payload.get("iss") == settings.supabase_url` (or the project's auth issuer); fail closed otherwise. Consider disabling the local fallback in production if the Auth server is the only source of truth.

### L-R3-2. `products` table lacks price/stock upper-bound CHECKs (DB is the final authority)
**Severity:** LOW (defense-in-depth)
**Category:** Input Validation / Integrity
**Location:** `supabase/migrations/001_initial_schema.sql:27-44` — `products` has only `CHECK (available_stock_lots >= 0)`; `retail_price_per_lot`, `wholesale_price_per_lot`, `items_per_lot`, `minimum_wholesale_lots` have no CHECKs. The Round-2 hardening (migration 006) only added CHECKs to `order_items`.

**Issue:** The CSV validator (`row_validator.py`) enforces `> 0` bounds, and the product form checks `Number.isNaN` but not `> 0` (an admin can submit a negative price via the form). Since `products` has no CHECK, a negative/absurd price can be written via the RLS-gated admin insert path (product-form.tsx writes directly to `products` via the browser client). A negative `retail_price_per_lot` would flow into `resolve_price` and produce a negative order total, which `create_order` then rejects (v_unit_price <= 0 guard) — so it fails closed today, but the DB itself should enforce it (AGENTS.md: DB is the last line of defense).

**Remediation (migration 007):** add
```sql
ALTER TABLE public.products
  ADD CONSTRAINT products_prices_check
    CHECK (retail_price_per_lot > 0 AND wholesale_price_per_lot > 0),
  ADD CONSTRAINT products_lots_check
    CHECK (items_per_lot > 0 AND minimum_wholesale_lots > 0);
```
and mirror the lower bounds in `product-form.tsx` (`> 0`, not just `!isNaN`).

### L-R3-3. Realtime publication surface is undocumented and config-drifted
**Severity:** LOW
**Category:** Security Misconfiguration / Attack-surface documentation
**Location:** Live project — `supabase_realtime` publication includes `orders`, `order_items`, `products`, `profiles` (verified). `supabase/config.toml:36-37` has `[realtime] enabled = false` (drift). Frontend subscribes via `frontend/src/hooks/useWebSocket.ts` (orders/profiles/products) using Supabase Realtime.

**Issue:** Realtime `postgres_changes` respects RLS, so today a user only receives rows their RLS lets them see (own orders, own profile; admins see all) — **no cross-user leak confirmed**. However, the surface is undocumented: the M1 remediation comment claims "Supabase realtime is disabled (config.toml) so no wss:// needed," which is false for the hosted project, and `profiles`/`orders` change streams flow to every logged-in client of the dashboard. If RLS ever regresses, order PII (customer names, phone, amounts) would stream to arbitrary subscribers.

**Remediation:** Document Realtime as an active attack surface; confirm RLS policies on `orders`/`order_items`/`profiles` cover realtime (they do today); optionally drop `order_items` and `profiles` from the publication and rely on pull-based refresh; re-run the security advisor after any RLS change. (CSP note: `connect-src https://*.supabase.co` correctly covers `wss://*.supabase.co` per CSP3 WebSocket scheme matching — no CSP change needed.)

### L-R3-4. No HSTS / `upgrade-insecure-requests` in the new CSP
**Severity:** LOW
**Category:** Security Headers
**Location:** `frontend/next.config.mjs:9-36`

**Issue:** The M1 remediation added CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `nosniff`, but no `Strict-Transport-Security` header and no `upgrade-insecure-requests` directive in the CSP. In a production HTTPS deployment this is a hardening gap (though the Secure cookie flag on https partially mitigates downgrade risk).

**Remediation:** Add `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` behind an env check for production, and append `upgrade-insecure-requests` to the CSP for non-localhost environments.

---

## Remediation Verification (prior findings C1–C3, H1–H4, M1–M8, L1–L9)

| ID | Prior issue | Status (verified this round) |
|----|-------------|------------------------------|
| C1 | service_role used for all backend DB access | **FIXED** — `database.py` has `get_supabase` (anon), `get_user_supabase` (anon + caller JWT), `get_service_role_supabase`; `checkout.py:24-25` injects user client for reads + service_role client for the tx; every admin route uses `get_user_supabase`; grep confirms service_role appears only in config/database/checkout (+ dev scripts seed.py/update_images.py). |
| C2 | Rate limiting disabled + debug on | **FIXED** — `backend/.env` has `DEBUG=false`; `main.py:41` always adds `SlowAPIMiddleware`; `checkout.py:19` `@limiter.limit("10/minute")`; admin routes `30/minute`; `main.py:48-56` generic 500 handler. |
| C3 | Check-then-act TOCTOU → 500 | **FIXED** — migration 004/006 rewrite `create_order` locks product rows `FOR UPDATE`, re-checks inside the transaction, returns typed `insufficient_stock`; `txn.py:43-54` maps to 400 `out_of_stock[]`. Verified live: `create_order` is service_role-only. |
| H1 | Email confirmation / auto-confirm | **FIXED (local)** — `config.toml:30-31` `enable_confirmations = true`, `enable_autoconfirm = false`; hosted auth settings must still be flipped in the dashboard (manual action; not SQL-verifiable). |
| H2 | Error handler leaks internals | **FIXED** — `checkout.py:48-52` returns generic `ErrorResponse`; `main.py` generic handler. |
| H3 | No upper bounds on checkout input | **FIXED** — `schemas/order.py` qty `gt=0 le=1000`, items `1..50`, UUID validation; RPC guards; migration 006 CHECKs. |
| H4 | Negative steps / missing CHECKs | **FIXED** — migration 004 steps `<= 0` guards; migration 006 CHECKs on `order_items`. |
| M1 | No CSP/security headers | **FIXED** — `next.config.mjs` headers present and correct (incl. `wss://` matching for Realtime). |
| M2 | Cookie missing Secure | **FIXED** — `client.ts` appends `; Secure` on https. |
| M3 | No per-user rate limit | **FIXED** — `rate_limit.py` keys on JWT `sub`, falls back to IP; checkout 10/min, admin 30/min. |
| M4 | Order spam / stale pending orders | **PARTIALLY FIXED** — open-order cap (20) + `expire_pending_orders` exist, but no scheduler (see **M-R3-2**). |
| M5 | WS broadcasts order PII | **FIXED** — `notification.py` uses `send_to_user` with minimal `{order_id, status}` payload. |
| M6 | JWT in WS query string | **FIXED** — `ws.py:15-16` reads token from `Sec-WebSocket-Protocol` subprotocol. |
| M7 | Sequential readable_order_id | **WON'T-FIX** (documented; RLS + server-side ownership check mitigate). Accept. |
| M8 | CORS wildcard + loose config | **FIXED** — `main.py:25-31` rejects `*` with credentials; methods/headers restricted. |
| L1 | is_admin() executable by authenticated | **WON'T-FIX** (documented; required for RLS policies). Advisor WARN persists — see **M-R3-1**. |
| L2 | Leaked-password protection disabled | **OPEN** — advisor confirms `auth_leaked_password_protection` WARN; requires manual Supabase dashboard action (Authentication → Security). |
| L3 | No middleware route protection | **FIXED** — `middleware.ts` protects `/dashboard` and `/receipts`. |
| L4 | Dead `check_role` | **FIXED** — removed. |
| L5 | WS role always 'authenticated' | **FIXED** — `ws.py:29-40` fetches profile role from DB. |
| L6 | CSV size/limits | **FIXED** — `admin.py:177` 5 MB cap; `row_validator.py` lower bounds. |
| L7 | WhatsApp message injection | **FIXED** — `whatsapp.py` `_clean()` collapses whitespace/control chars. |
| L8 | Product image URLs unvalidated | **FIXED** — `product-form.tsx:200` requires `https://` for pasted URLs (client-side; documented). |
| L9 | Logging leaks | **FIXED** — `security.py` logs truncated ids and status codes only. |

---

## Not-A-Finding (verified clean this round)

- **No secrets committed** — `git ls-files` shows only `backend/.env.example` and `frontend/.env.example`; `git log --all` contains no `.env`; live secrets exist only in untracked `.env` files (rotation recommended, see below).
- **No SQL injection** — all data access via PostgREST/parameterized RPCs; no dynamic SQL in any function reviewed (all plpgsql bodies use static SQL with typed params).
- **No XSS** — React escaping everywhere; the only `dangerouslySetInnerHTML` (`chart.tsx:95`) builds static CSS from developer-provided chart config keys, not user data; CSP limits `img-src` to `https:`.
- **No open redirect** — the only `window.location.href` assignment (`checkout-button.tsx:67`) points to a server-built `https://wa.me/...` deep link.
- **No SSRF** — no server-side fetch of user-supplied URLs; product image URLs are rendered client-side in `<img>`; CSV import stores URLs without server-side fetch.
- **CSRF** — state-changing FastAPI calls use `Authorization: Bearer` (not cookies); Supabase auth cookies are `SameSite=Lax`; no cookie-authenticated state-changing GET/POST surfaces identified.
- **IDOR on receipts** — `receipts/[id]/page.tsx` enforces ownership server-side with admin fallback; RLS matches.
- **RLS on all 4 tables; `profiles.role` not writable via API** — verified via live privilege checks (authenticated has table-level INSERT on orders/order_items/products; profiles INSERT=false, UPDATE=false, `profiles.role` column UPDATE=false).
- **Atomic stock functions correct** — `decrement_stock_inventory`/`increment_stock_inventory` service_role-only with `steps <= 0` guards; `create_order` is service_role-only (verified live).
- **Storage** — `product-images` bucket public (by design for product images), 5 MB + MIME allowlist, INSERT/UPDATE/DELETE admin-only via `is_admin()`; no SELECT policy so bucket contents cannot be listed (only guessed URLs readable).
- **`handle_new_user` trigger** — computes role from `company_name` metadata (wholesale_pending vs retail); does not accept a `role` from user metadata — no signup mass-assignment. EXECUTE revoked from anon/authenticated (migration 002:92-95).

---

## Secrets Hygiene Note

`backend/.env`, `frontend/.env`, and root `.env` contain live credentials (service_role JWT, DB password, JWT secret, anon key, Context7 key). None are tracked and git history is clean — this is **not a leak finding**. Recommended hygiene: rotate the Supabase service_role key and the DB password at next deploy (the DB password is a natural-language string, `computerlotliquidatio`), keep `.env` out of any backup/CI artifact, and consider a secret manager for production.

---

## Commands & Verification Run

- `git ls-files | grep -E '\.env'` → only `.env.example` files tracked
- `git log --all --name-only | grep -i '\.env'` → no committed env files
- `git grep -rnE "(sk-proj-|AKIA[0-9A-Z]{16}|ghp_|xox[baprs]-|AIza)"` → no matches
- `grep -rn "service_role" backend/app` → only `config.py`, `database.py`, `routes/checkout.py` (app code)
- `npm audit --omit=dev` (frontend) → 5 vulns (2 moderate, 3 high) — see M-R3-4
- `pip-audit` → unavailable (not installed; no installs permitted)
- Supabase MCP (read-only): `get_advisors(security)` → 5 WARNs (4× `authenticated_security_definer_function_executable` + leaked-password); `execute_sql` privilege/policy/function-grant/realtime checks as documented above; `list_migrations` → 001-006 applied
- No migrations applied this round (verification only)

---

## Priority Recommendation Order (Round 3)

1. **Fix `admin_cancel_order`** (H-R3-1) — status guard + `FOR UPDATE` + idempotency + state-machine validation on the status route. This is the only High and it silently corrupts the core stock invariant.
2. **Add an automatic expiry scheduler** (M-R3-2) and enforce the open-order cap transactionally.
3. **Harden `is_admin()` + document the admin RPC grants** (M-R3-1) and close L2 (manual dashboard).
4. **Redis-backed rate limiting** before any multi-worker deployment (M-R3-3).
5. **Dependency upgrades + CI audits** (M-R3-4) and the low-severity hardening items (L-R3-1..4, migration 007 CHECKs).
