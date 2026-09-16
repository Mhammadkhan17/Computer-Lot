# Changelog

All notable changes to this project are documented in this file.

Last updated: 2026-09-16 15:20 UTC

## [Unreleased]

### Deploy: Vercel production deployment (2026-09-16)

#### Added: frontend + backend deployed to Vercel with git-push deploys
Both the Next.js frontend and FastAPI backend are now deployed to Vercel and auto-deploy on push to `main`.

- **Frontend**: `https://frontend-lac-psi-20.vercel.app` (project `frontend`, `prj_PNA1BbhHzfscGIgEoxeeudBW2AsU`)
- **Backend**: `https://backend-phi-one-35d9ykv3fu.vercel.app` (project `backend`)
- `NEXT_PUBLIC_API_URL` env var set on frontend to point at the backend production URL
- CORS origins updated to include both frontend production and preview URLs

### Fix: checkout 500 errors — three root causes resolved (2026-09-16)

#### Fixed: psycopg2 connection timeout (direct PostgreSQL unreachable from Vercel)
The `DatabaseWriter` was using `psycopg2` to connect directly to `ybwbwllmryjdfqvfpcik.supabase.co:6543` — but that hostname is the Supabase API gateway (Cloudflare CDN), not the PostgreSQL pooler. TCP connections timed out.

- `backend/app/database_writer.py`: replaced psycopg2 with the existing `create_order` stored procedure called via `supabase.rpc()` (HTTP/REST). The atomic transaction (ADR-002) is preserved via the RPC.
- `backend/app/routes/checkout.py`: injects `service_role` Supabase client for the RPC call
- `backend/app/routes/admin.py`: updated to use `get_service_role_supabase` dependency

#### Fixed: RLS blocking anonymous client on profiles query
The checkout used `get_supabase()` (anonymous client, no user auth) to query the profiles table. RLS blocked the read, returning 0 rows.

- `backend/app/routes/checkout.py`: changed to `get_user_supabase()` so the query carries the caller's JWT

#### Fixed: null customer_phone violating NOT NULL constraint
`profile.get("phone", "")` returns `None` when the key exists with a `null` value, violating the `orders.customer_phone` NOT NULL constraint.

- `backend/app/routes/checkout.py`: changed to `profile.get("phone") or ""` which coerces `None` to `""`

#### Fixed: CORS headers missing on 500 error responses
The unhandled exception handler in `main.py` was not adding CORS headers to error responses, causing browsers to show CORS errors instead of the actual backend error.

- `backend/app/main.py`: exception handler now adds CORS headers to error responses

#### Security: console.error leak in checkout
- `frontend/src/components/checkout-button.tsx`: changed `console.error("Checkout error:", err)` to `console.error("Checkout error occurred")` to avoid leaking response details

### Merge: test-features into main (2026-09-15)

#### Merged: B-Stock Explore feature + DatabaseWriter refactor
The `test-features` branch was merged into `main`, bringing significant new features and architectural improvements. This required resolving 12 merge conflicts across backend and frontend.

**New Features:**
- B-Stock Explore feature: browse external B-Stock listings, submit sourcing requests
- Sourcing tab in admin dashboard for managing user sourcing requests
- Add/Edit product modals (replaced `ProductFormDialog` with dedicated modals)
- Notification broadcaster for real-time WebSocket updates
- WhatsApp link builder function in checkout route

**Architecture Changes:**
- DatabaseWriter pattern for checkout and order management (replaces adapter-based approach)
- Inlined CSV validation/normalization in admin routes (removed adapter dependencies)
- Self-contained dashboard sections with client-side data fetching
- New `app/database_writer.py` for atomic order operations
- New `app/notification.py` for real-time broadcast
- New `app/pricing.py` for line-item price computation

**Files Added:**
- `backend/app/database_writer.py`, `backend/app/notification.py`, `backend/app/pricing.py`
- `backend/app/routes/explore.py`, `backend/app/schemas/explore.py`
- `backend/tests/test_database_writer.py`, `backend/tests/test_notification.py`, `backend/tests/test_pricing.py`
- `frontend/src/app/dashboard/sections/sourcing.tsx`, `frontend/src/app/explore/page.tsx`
- `frontend/src/components/explore-card.tsx`, `frontend/src/components/explore-page.tsx`
- `frontend/src/app/dashboard/sections/add-product-modal.tsx`, `edit-product-modal.tsx`
- `supabase/migrations/002_sourcing_requests.sql`

**Files Removed:**
- Legacy adapter modules: `csv_parser.py`, `notification.py`, `order_intake.py`, `pricing.py`, `product_inserter.py`, `row_normalizer.py`, `row_validator.py`, `stock.py`, `txn.py`, `whatsapp.py`
- `backend/app/rate_limit.py` (moved to main rate_limit module)
- `frontend/src/components/product-form.tsx`, `frontend/src/lib/pricing.ts`

### Fix: admin role check using correct Supabase client (2026-09-15)

#### Fixed: sourcing tab "Access denied" for admin users
Admin users were getting "Access denied" errors in the sourcing tab despite being logged in with admin privileges. The root cause was that `_assert_admin` in both `admin.py` and `explore.py` was using `get_supabase()` (anonymous client with no user auth token) to query the profiles table. RLS policies blocked anonymous reads.

- `backend/app/routes/admin.py`: Changed all `Depends(get_supabase)` to `Depends(get_user_supabase)` so profile queries carry the user's JWT token
- `backend/app/routes/explore.py`: Same change — admin endpoints now use authenticated client
- `frontend/src/app/dashboard/sections/sourcing.tsx`: Added proper 403 handling ("Access denied" instead of "Session expired")

### Fix: missing profile row crash (2026-09-15)

#### Fixed: PGRST116 error when user has no profile row
`_assert_admin` was using `.single().execute()` which throws an exception when no rows are found. Changed to `.execute()` with list check.

- `backend/app/routes/admin.py`: `_assert_admin` now uses `.execute()` and checks `rows` list
- `backend/app/routes/explore.py`: Same fix applied

### Fix: missing modal components (2026-09-15)

#### Fixed: build error — missing add-product-modal and edit-product-modal
The merge missed two modal component files that `products.tsx` depends on.

- Added `frontend/src/app/dashboard/sections/add-product-modal.tsx`
- Added `frontend/src/app/dashboard/sections/edit-product-modal.tsx`

### Fix: missing check_role function (2026-09-15)

#### Fixed: ImportError — cannot import name 'check_role'
The explore route was importing `check_role` from `app.utils.security` but it didn't exist.

- `backend/app/utils/security.py`: Added `check_role(user, required_role)` function

## [0.2.0] - 2026-08-04

### Auth: self-serve wholesale apply + role-aware navbar (2026-08-04)

#### Added: self-serve "Apply for Wholesale" flow
Guests already saw an "Apply for Wholesale" button that bounced everyone to `/login` —
including users who had *already* applied or been approved. The button is now role-aware,
and a retail user can submit a real application in one step.

- NEW `supabase/migrations/011_apply_for_wholesale.sql`: SECURITY DEFINER RPC
  `apply_for_wholesale(p_company_name, p_tax_id)` — atomically flips
  `retail → wholesale_pending` recording company name / tax registration ID; idempotently
  returns the caller's status (`applied`/`pending`/`approved`/`admin`/`error`); the
  `admin` branch guards against an admin being downgraded. `SET search_path = public`,
  EXECUTE granted to `authenticated` only. Applied live.
- NEW `supabase/migrations/012_wholesale_apply_grants.sql` (follow-up, applied live):
  length guards on the RPC (oversize company/tax input returns `{"status":"error"}`
  instead of a raw Postgres truncation exception) + `REVOKE EXECUTE ... FROM service_role`
  (restores the migration-007 grant-hygiene contract; live `proacl` is now
  `postgres`/`authenticated` only).
- NEW `backend/app/schemas/wholesale.py`: `WholesaleApplyRequest` (`company_name` ≤ 255,
  not blank; optional `tax_registration_id` ≤ 100) + `WholesaleApplyResponse`.
- NEW `backend/app/routes/wholesale.py`: `POST /wholesale/apply` — validates the JWT,
  calls the RPC via the caller's Supabase client (never service_role, ADR-009), maps
  `applied/pending/approved/admin → 200` and `error → 400`. Registered in `main.py`.
- NEW `frontend/src/components/sections/wholesale-apply-button.tsx` (`"use client"`):
  guest → Link to `/login`; retail → apply dialog (Company Name required, Tax ID optional)
  that POSTs to `/wholesale/apply` with the session Bearer token, then refreshes the role;
  pending/approved/admin → status dialogs with per-role copy. Replaces the static
  `<Link href="/login">` in `wholesale.tsx`.
- NEW `backend/tests/test_wholesale_apply.py`: 8 tests (status mapping, auth rejection,
  Pydantic 422s) mirroring the `test_admin.py` mocking pattern.

#### Changed: role-aware navbar auth button + URL-driven login mode
The login page's Sign In / Sign Up mode was private `useState`, so the navbar had no way
to reflect it — and the logged-out navbar showed only a static "Sign In" link.

- `frontend/src/app/login/page.tsx`: mode is now URL-driven via `useSearchParams()`
  (`?mode=signup`), so `/login?mode=signup` is directly deep-linkable; the bottom toggle
  uses `router.replace` instead of `setMode`. Page wrapped in `<Suspense>` (required for
  `useSearchParams` during prerender).
- `frontend/src/components/navbar.tsx`: new `AuthLinks` client component (wrapped in
  `<Suspense>`) renders a single accent button that mirrors the form's bottom toggle —
  **Sign Up** → `/login?mode=signup` when the sign-in form is showing, **Sign In** →
  `/login` when the sign-up form is showing, and **Sign In** everywhere else. The old
  grey/black hover state is gone (single accent button, `hover:bg-accent/90`).

#### Verified (2026-08-04)
- Backend `pytest`: **172 passed** (164 + 8 new).
- Frontend `npx tsc --noEmit`, `npm run lint` (0 errors / 0 warnings), `npm run build`:
  all exit 0.
- Live DB: migrations `apply_for_wholesale` (011) and `wholesale_apply_grants` (012)
  applied; `pg_proc` shows `search_path=public` and EXECUTE on `authenticated` only
  (no anon/public/service_role).

### Auth: login/signup fields + error visibility (2026-08-02)

#### Added: Full Name and Phone Number to signup
The signup form only collected email, password, company name and tax ID — yet the
backend order-intake reads `customer_phone` from `profiles.phone`
(`backend/app/adapters/order_intake.py`) for the WhatsApp fulfillment message, so every
order placed by a user who never entered a phone shipped without a contact number.
Full Name was also silently derived from the email prefix instead of being a real field.

- `frontend/src/app/login/page.tsx`: signup now collects **Full Name** (required) and
  **Phone Number** (required, labeled "for WhatsApp fulfillment"); both are passed as
  Supabase `user_metadata` (`full_name`, `phone`) on `signUp`. Company name and tax ID
  unchanged.
- `supabase/migrations/008_signup_phone_full_name.sql` (NEW, never edits 001–007):
  `handle_new_user` trigger now copies `phone` into `profiles.phone` and stores the
  real `full_name` (whitespace-only falls back to `'User'`). `supabase/policies.sql`
  synced to match. Applied live (verified function body + trigger attachment).
- `profiles.phone` was already covered by the existing column grants, so no policy change
  was needed.

#### Changed: app-side validation with visible errors
Previously the form relied on invisible browser tooltips (`required`/`minLength`) and
Supabase's raw error messages. Errors are now surfaced explicitly in the styled alert
box (`role="alert"`, `aria-live`):

- **Supabase errors** (bad credentials, "Email not confirmed", "User already registered",
  auth rate limits, network failures) render as before via `authRes.error.message`.
- **App-level validation** (`noValidate` + checks before the auth call): invalid email,
  password < 6 chars, missing full name, and malformed phone all show a clear message in
  the same alert box instead of a silent failure.

#### Verified
- Frontend `npx tsc --noEmit`: exit 0; `npm run lint`: 0 errors / 0 warnings.
- Backend `pytest -q`: **138 passed** (no backend changes).
- Live DB: migration `signup_phone_full_name` applied; trigger body + attachment
  verified via `pg_get_functiondef` / `pg_get_triggerdef`.

Note: users who registered before this change still have `profiles.phone` empty and will
need to supply a number before their orders carry a contact phone (no profile-edit page
exists yet).

### Storefront interaction fixes (2026-08-02)

#### Fixed: product zoom/carousel unresponsive — CSP blocking the dev runtime
The security commit's new CSP (`script-src 'self' 'unsafe-inline'`) blocked the
`eval`/`new Function` used by Next.js React Fast Refresh under `next dev`. The script
threw, client event handlers never mounted, and every click on the product page
(lightbox open, zoom, carousel arrows) was dead. Production was unaffected.

- `frontend/next.config.mjs`: `script-src` now appends `'unsafe-eval'` **only when**
  `NODE_ENV === "development"` (the dev-only hot-reload runtime; the production build
  ships no such code). The check is scoped to the explicit dev mode so `test` builds
  do not weaken the policy.
- Verified with Playwright against `next dev`: thumbnail click changes the image,
  lightbox opens, zoom scale moves `100% → 125%`, carousel arrows work, no page errors.
- `frontend/next.config.mjs`: `font-src` now also allows `'self'` so the self-hosted
  Geist woff2 (served from the same origin) loads; external `fonts.gstatic.com` kept.
  Cleared the dev-console font/CSP warnings (verified: zero console warnings).

#### Fixed: checkout page crashed — `useSyncExternalStore` in a Server Component
`checkout-page.tsx` calls `useCart()` (Zustand + persist → `useSyncExternalStore`), a
client-only hook. The route page rendered it as a Server Component, producing a runtime
`TypeError` on `/checkout`.

- `frontend/src/app/checkout/checkout-page.tsx`: added `"use client"`.
- `frontend/src/app/checkout/page.tsx`: added `export const dynamic = "force-dynamic"`
  (the page reads persisted client cart state).

#### Fixed: checkout "Failed to fetch" — CORS did not include the dev origin
The frontend dev server runs on `:3001`; FastAPI's CORS allowed only `http://localhost:3000`,
so the browser blocked the cross-origin POST to `/checkout`.

- `backend/.env` (local, not committed): `CORS_ORIGINS` now includes
  `http://localhost:3000,http://localhost:3001`; `FRONTEND_URL` set to
  `http://localhost:3001` (WhatsApp/receipt links point at the live dev origin).
- Verified: `/checkout` preflight from `:3001` → `access-control-allow-origin: http://localhost:3001`;
  POST reaches FastAPI (401 "Missing authorization header" without a JWT, i.e. the fetch succeeds).
- `frontend/src/components/checkout-button.tsx`: the catch block now logs the error
  (`console.error`) instead of swallowing it, keeping the user-facing message.

#### Changed: product gallery input — touch/pinch swipe, always-visible arrows
- `frontend/src/app/products/[id]/product-detail-content.tsx`: wheel zoom moved to a
  non-passive native `wheel` listener on the zoom container (works reliably with the
  lightbox's own overflow handling); added one-finger horizontal swipe to
  prev/next and two-finger pinch-to-zoom (`touchAction: none`).
- Carousel prev/next arrows no longer fade out on non-hover devices (always `opacity-90`,
  visible on touch); grade and AS-IS badges raised to `z-10` above the lightbox bar.
- Earlier speculative `h-[85vh]` lightbox clamp reverted to `h-[90dvh]` (not the cause).

### Cart/checkout pricing display (2026-08-02)

#### Changed: client shows RETAIL pricing; backend stays the pricing authority
The frontend's client-side wholesale pricing layer (`hooks/usePricing.ts`, `calcSubtotal`,
role lookups) was removed. Cart drawer and checkout review now compute displayed prices
from `retail_price_per_lot` directly; the "Wholesale pricing applied" banner and the
"ADD X MORE LOTS FOR WHOLESALE PRICING" nudge were removed. Wholesale pricing is still
applied authoritatively by the backend `/checkout` flow (ADR-001), so displayed totals
reflect the price the backend actually charges on a wholesale-eligible order.

- Deleted `frontend/src/hooks/usePricing.ts`; `hooks/useCart.ts` dropped the `subtotal`
  action; `cart-drawer.tsx` and `checkout-page.tsx` compute subtotals inline.
- `frontend/src/components/product-card.tsx`: price block re-flowed (aligned retail /
  wholesale rows, `min-w-0` truncation for long prices).
- `frontend/src/app/receipts/[id]/receipt-content.tsx`: WhatsApp link drops the
  placeholder fallback phone (`1234567890`), using only `NEXT_PUBLIC_MERCHANT_PHONE`.

### Order intake module (architecture review, Candidate 1)

#### Deepened: collapsed the order-intake module
`backend/app/adapters/order_intake.py` (141 → 120 lines) absorbed three one-off private
helpers into their single call sites: `_validate_stock` → inline
`check_availability`, `_resolve_pricing` → inline `resolve_all_items`, and
`_build_order_data` → a literal order dict. The `create()` signature is unchanged and the
whole module still runs the UX pre-check → pricing → transaction → WhatsApp sequence.

- `backend/app/adapters/pricing.py`: added typed `PricingResult` (items + subtotal) and
  `resolve_checkout()`; `resolve_price`/`resolve_all_items` gained full type hints.
- `backend/app/adapters/stock.py`, `whatsapp.py`: type hints added (`StockErrorItem`,
  `str` returns).
- `backend/app/adapters/txn.py`: the transaction catch narrowed to
  `(httpx.HTTPError, RuntimeError)` so programming errors still surface instead of being
  masked as a generic 500.
- `backend/app/config.py`: `open_order_cap` moved into `Settings` (default 20);
  `order_intake.py` reads it from settings instead of a module constant.
- `backend/app/database.py`: documented the supabase-py HTTP/2 workaround
  (upstream issue #438) with a 2026-08-02 review date.
- NEW `backend/tests/test_adapters_order_intake.py` covering the collapsed `create()`
  path (replaces the removed helper-level tests).

### Database & tests (2026-08-02)

#### Added: defense-in-depth upper bounds on order lines
NEW `supabase/migrations/006_order_item_upper_bounds.sql` (never edits 001–005):
- `order_items` CHECKs now cap `quantity_ordered <= 1000` and
  `unit_price_applied <= 1000000` (matching the Pydantic `Field(gt=0, le=1000)`).
- `create_order` re-created with the same 5-param signature, adding guards:
  empty/NULL `p_items`, `jsonb_array_length(p_items) > 50`, `v_quantity <= 0 || > 1000`,
  `v_unit_price <= 0 || > 1000000` all `RAISE`. `CREATE OR REPLACE` preserves the
  existing `service_role`-only grant.

#### Fixed: weak JWT secret in tests (InsecureKeyLength warnings)
`backend/tests/conftest.py` and all test modules set `SUPABASE_JWT_SECRET` to
`test-secret-key-0123456789abcdef0123456789abcdef` (48 bytes, ≥32-byte SHA256 minimum
per RFC 7518 §3.2) instead of the 11-byte `test-secret`. Test warnings dropped
197 → 143 (remainder are third-party library deprecations).

#### Verified (2026-08-02)
- Backend `pytest -q`: **110 passed**.
- Frontend `npx tsc --noEmit`: exit 0.
- Playwright (chromium, headless): product page `9/9` images render, zoom/carousel/
  lightbox interact, zero console errors; `/checkout` route `HTTP 200`.
- Note: seed products still reference `upload.wikimedia.org` hotlinks in
  `products.images`, which Wikimedia intermittently rate-limits (HTTP 429); this is
  transient and unrelated to the app (the `product-images` storage bucket images always
  render). Re-hosting those seeds into the bucket remains a recommended follow-up.

### Security Hardening — Round 1 (C1–C4, H1–H4)

#### Fixed: C1 — service_role key used for ALL backend DB access (ADR-009 violated)
Every backend query ran through a single service_role client — RLS disabled and full
DB privileges on all tables, contradicting ADR-009 ("only /checkout uses service_role").
Any future endpoint forgetting an authz check would silently bypass RLS.

- `backend/app/config.py`: added `supabase_anon_key` setting.
- `backend/app/database.py`: three clients — `get_supabase()` (anon key, RLS-enforced),
  `get_user_supabase()` (anon key + caller JWT, RLS-enforced as that user), and
  `get_service_role_supabase()` (**service_role confined to the /checkout transaction
  path only**, per ADR-009).
- `backend/app/utils/security.py`: added `get_access_token` dependency (raw bearer
  token) used to attach the caller JWT; the `/auth/v1/user` apikey now uses the anon
  key instead of service_role.
- `backend/app/routes/checkout.py`: injects user client (reads) + service_role client
  (transaction RPCs) instead of one service_role client.
- `backend/app/routes/admin.py`: all endpoints now use the RLS-enforced user client;
  `_assert_admin` reads the caller's own profile row through RLS (`is_admin()` policy).
  Approve/reject now call the new `admin_set_profile_role` SECURITY DEFINER RPC and
  order-cancel calls `admin_cancel_order` (both self-guarded by `is_admin()` inside).
- `supabase/migrations/004_security_hardening.sql`: added `admin_set_profile_role` +
  `admin_cancel_order` (SECURITY DEFINER, `SET search_path = public`, granted to
  `authenticated` only — REVOKEd from public/anon).
- Verified: `service_role` grep now confined to `config.py` / `database.py` /
  `routes/checkout.py`.

#### Fixed: C2 — rate limiting disabled + FastAPI debug mode on
The only `.env` had `DEBUG=true`, which skipped SlowAPIMiddleware entirely — combined
with no-payment WhatsApp fulfillment, an authenticated attacker could script `/checkout`
to drain inventory with fake pending orders.

- `backend/app/rate_limit.py` (new): per-user limiter key from the JWT `sub` claim
  (falls back to client IP) with a `60/minute` default safety net.
- `backend/app/main.py`: `SlowAPIMiddleware` is now always added (the `if not
  settings.debug` gate was removed); `RateLimitExceeded` handled with a clean response.
- `backend/app/routes/checkout.py`: explicit `@limiter.limit("10/minute")` per user.
- `backend/.env` and `backend/.env.example`: `DEBUG=false`.
- Verified: app boots with middleware present; debug off.

#### Fixed: C3 — check-then-act stock validation (TOCTOU → 500)
`create_order` validated stock outside a transaction, so concurrent checkouts could
pass the pre-check and fail mid-insert with a 500.

- `supabase/migrations/004_security_hardening.sql`: rewrote `create_order` (same
  signature; service_role-only grant preserved) to lock product rows
  `SELECT ... FOR UPDATE` and re-check availability **inside** the transaction. If any
  item is short/unknown it returns a structured `{commit:false, insufficient_stock:true,
  out_of_stock:[{product_id,title,available,requested}]}` — no order inserted, nothing
  rolled back; otherwise inserts order + items then decrements via the unchanged atomic
  `decrement_stock_inventory` and returns `{commit:true, order_id, readable_order_id}`.
- `backend/app/adapters/stock.py`: `InsufficientStockError` moved here (shared by
  order_intake + txn).
- `backend/app/adapters/txn.py`: maps the structured RPC result → `InsufficientStockError`
  → HTTP 400 with `out_of_stock[]`; true failures stay a generic 500 (no detail leak).
- `backend/app/adapters/order_intake.py`: the pre-check remains only as a UX hint.
- Verified against the live DB (rolled-back tests): structured result correct, no double
  decrement, success path intact.

#### Fixed: H1 — email confirmation / auto-confirm signup
`supabase/config.toml`: `enable_confirmations = true`, `enable_autoconfirm = false`.
The `handle_new_user` trigger keeps `wholesale_pending` for company-name signups
(ADR-006 self-serve approval flow); the frontend login page already handles the
confirmation flow (`identities.length === 0` → "check your email"). No frontend code
change needed.
- **Manual dashboard action remains:** hosted Supabase auth settings are not SQL-visible
  on this project version — email confirmation must be flipped in the dashboard
  (Authentication → Providers/Email). 3 current users are already email-confirmed.

#### Fixed: H2 — checkout error handler leaks internal exception details
`backend/app/routes/checkout.py`: unhandled exceptions now return a fixed generic 500
body (no `str(e)`); full detail goes to `logger.exception` server-side. Known RPC
failures are already mapped to clean 400s (C3). Test added asserting the 500 body is
generic.

#### Fixed: H3 — no upper bounds / depth guards on checkout input
`backend/app/schemas/order.py`: `product_id` must be a valid UUID (field_validator);
`quantity: int = Field(gt=0, le=1000)`; `items: list[CheckoutItem] =
Field(min_length=1, max_length=50)`. Migration 004 adds defense-in-depth RPC guards
(empty/NULL `p_items` → RAISE; `v_quantity <= 0` → RAISE) and
`CHECK (quantity_ordered > 0)` on `order_items`. 422 tests added for empty items,
>50 items, quantity 0 / >1000, non-UUID product_id.

#### Fixed: H4 — stock functions accept negative/invalid steps; no CHECKs
`supabase/migrations/004_security_hardening.sql`:
- `IF steps <= 0 THEN RETURN FALSE` guard on BOTH `decrement_stock_inventory` and
  `increment_stock_inventory` (applied migrations 001/002 were never edited).
- `CHECK (quantity_ordered > 0)` and `CHECK (unit_price_applied > 0)` on
  `public.order_items` (live data verified min qty=1, min price=120.00).
- Applied live via `security_hardening_c1_c3_h3_h4`; functions + constraints verified
  present.

#### Verified (Round 1)
- Backend `pytest -q`: **83 passed** at close of Round 1.
- Frontend `npx tsc --noEmit`: exit 0 (no frontend changes in Round 1).
- Live DB migration applied; `security-report.md` findings C1–C4 / H1–H4 all closed.

### Security Hardening — Round 2 (M1–M8, L1–L9)

#### Frontend (Next.js)
- **M1 (CSP headers)** — `frontend/next.config.mjs` `headers()` now emits a CSP
  (`default-src 'self'`, `connect-src 'self' https://*.supabase.co <API_URL>`,
  `frame-ancestors 'none'`, etc.) plus `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.
- **M2 (secure cookie)** — `src/utils/supabase/client.ts` appends `; Secure` to the
  session cookie when the page is served over HTTPS (dev http://localhost unaffected).
- **L3 (auth-gated routes)** — `src/middleware.ts` redirects unauthenticated users on
  `/dashboard` and `/receipts` to `/login`.
- **L8 (image URL validation)** — `components/product-form.tsx` rejects pasted image
  URLs that do not start with `https://` (toast + abort). Products are inserted via RLS
  directly, so no backend endpoint change was applicable.

#### Backend (FastAPI)
- **M3 (admin rate limits)** — `@limiter.limit("30/minute")` on approve / reject /
  order-status PATCH / products-import / broadcast-update / expire-orders; endpoints now
  declare `request: Request` (required by slowapi).
- **M4 (order expiry + open-order cap)** — POST `/admin/expire-orders` calls RPC
  `expire_pending_orders` (new migration `005_expire_pending_orders.sql`,
  SECURITY DEFINER + `is_admin()` guard + `FOR UPDATE SKIP LOCKED` + per-item restock);
  `order_intake.py` enforces `OPEN_ORDER_CAP = 20` pending orders per user (HTTP 400).
- **M5 (PII minimization)** — `notification.py` broadcasts only
  `{order_id, status}` via `send_to_user` (no customer name / totals).
- **M6 (WS auth via subprotocol)** — `ws.py` reads the token from
  `Sec-WebSocket-Protocol`; missing/invalid → close 4001. Frontend has no WS client.
- **M8 (CORS)** — `main.py` `parse_cors_origins()` rejects `*` and empty lists;
  methods restricted to `GET, POST, PATCH, PUT, DELETE`, headers to
  `Authorization, Content-Type`.
- **L4** — dead `check_role()` removed from `security.py`.
- **L5 (WS role from DB)** — `ws.py` resolves the role via an RLS-enforced user client
  (no `service_role`); defaults to `retail`.
- **L6 (CSV import)** — `row_validator.py` enforces `items_per_lot >= 1` and
  `minimum_wholesale_lots >= 1`; imports > 5 MB rejected with 413.
- **L7 (WhatsApp sanitization)** — `whatsapp.py` `_clean()` collapses whitespace /
  control chars in customer name and item titles (injection resistance).
- **L9 (log hygiene)** — `security.py` logs auth-server responses by status code only;
  user/sub ids truncated to 8 chars.

#### Security decisions
- **M7 (sequential readable_order_id)** — WON'T-FIX: RLS isolates rows and
  `/receipts/{readable_order_id}` validates ownership server-side (ADR-004); opaque IDs
  add no security under RLS.
- **L1 (`is_admin()` SECURITY DEFINER)** — WON'T-FIX: it is invoked inside profiles RLS
  policies; switching to INVOKER reintroduces the 42P17 recursion the helper was built to
  fix.
- **L2 (leaked-password protection)** — MANUAL dashboard action (no `auth.config` table
  exists to set via SQL).

#### Verified (2026-08-01 23:30 UTC)
- Backend `pytest -q`: **99 passed** (83 at close of Round 1; +16 tests for M3/M4/M5/M6/M8/L6/L7).
- Frontend `npx tsc --noEmit`: exit 0 (no ESLint config exists; `next lint` is interactive).
- Live DB: migration `expire_pending_orders_m4` applied; `is_admin()` guard verified
  (`Admin access required` without admin context); destructive expiry NOT run (12 real
  pending orders, some >24h old).
- `service_role` confined to `config.py` / `database.py` / `routes/checkout.py`.
- CORS preflight live-checked: unknown origins rejected, methods/headers restricted.

### Security & Database (Supabase)

#### Fixed: RLS infinite recursion breaking the dashboard
The admin RLS policies on `profiles`/`orders`/`order_items` used self-referential
`EXISTS (SELECT 1 FROM profiles WHERE ... role = 'admin')` subqueries, which Postgres
rejects with `42P17 infinite recursion detected in policy for relation "profiles"`.
Every dashboard read on those tables returned HTTP 500.

- Added `public.is_admin()` — a `SECURITY DEFINER` helper (`SET search_path = public`)
  that reads the caller's role from `profiles`, bypassing RLS and breaking the recursion.
- Rewrote all admin-gated policies on `profiles`, `products`, `orders`, `order_items`
  to use `public.is_admin()`.
- Applied live via migration `fix_rls_recursion_with_is_admin_helper`; mirrored in
  `supabase/policies.sql`.

#### Fixed: dangerous "Service role full access profiles" policy
The `profiles` table had a policy granting `ALL` with `USING (true)` to the public
role, letting any signed-in (or anon) user read/modify all profiles. Dropped live
(via `drop_service_role_full_access_profiles_policy`) and removed from `policies.sql`.

#### Fixed: `create_order` migration drift
The backend checkout called `supabase.rpc("create_order", ...)`, but the function was
only present in the live database and absent from the migrations — the DB could not be
rebuilt from source. Added `supabase/migrations/002_checkout_order_and_admin_helpers.sql`
defining `public.create_order(...)` (atomic insert order + items + per-item stock
decrement with rollback on insufficient stock) and `public.is_admin()`.

#### Fixed: SECURITY DEFINER functions callable by anon/authenticated
`create_order`, `decrement_stock_inventory`, `increment_stock_inventory` were
executable by any anon/authenticated user via PostgREST RPC, bypassing the FastAPI
checkout flow, JWT validation, and pricing. Hardened via
`harden_security_definer_function_permissions` + `revoke_function_execute_from_anon_authenticated`:

- `REVOKE EXECUTE` on `create_order`, `decrement_stock_inventory`,
  `increment_stock_inventory` from `public`, `anon`, `authenticated`; granted back to
  `service_role` (used by the backend).
- `REVOKE EXECUTE` on trigger functions `handle_new_user`, `rls_auto_enable` from
  `anon`, `authenticated` and `public`.
- `REVOKE EXECUTE` on `is_admin` from `anon` only (kept for `authenticated` because RLS
  policies evaluate as the authenticated role).
- Hardened `search_path = public` on all SECURITY DEFINER functions.
  - **Correction (2026-08-01):** this bullet was inaccurate at the time — the hardening was
    applied live (migration `harden_security_definer_function_permissions`) but the repo file
    `supabase/migrations/001_initial_schema.sql` was never updated. Fixed now: both
    `decrement_stock_inventory` and `increment_stock_inventory` in `001` now include
    `SET search_path = public`. `rls_auto_enable` is a Supabase platform-default function
    (not project code) and is already hardened to `search_path = 'pg_catalog'` in live.
    Validated by running the edited definitions in a rolled-back transaction.

Note: Supabase default privileges add *explicit* `EXECUTE` grants to
`anon`/`authenticated`, so `REVOKE ... FROM public` alone is insufficient — each role
must be revoked explicitly. Verified live: `permission denied for function
create_order` for anon.

#### Fixed: privilege escalation — users could set their own `role` to `admin`
The profiles UPDATE policy (`USING/WITH CHECK (id = auth.uid())`) validates only the
row-identity expression; it does **not** restrict columns. Any user could
`PATCH /rest/v1/profiles` with `{"role":"admin"}` and gain full admin access. Confirmed
live in a rolled-back test. Fixed via migration `reconcile_optimize_harden_rls_policies`:

- Column-level protection uses **table revoke + column re-grant** (a bare
  `REVOKE UPDATE (col)` is a no-op in this environment — no column ACL is materialized):
  - `REVOKE UPDATE` on `profiles` from `authenticated`;
    `GRANT UPDATE (full_name, company_name, tax_registration_id, phone)`.
  - `REVOKE INSERT` from `authenticated`;
    `GRANT INSERT (id, full_name, company_name, tax_registration_id, phone)`.
- `role` (and `id`/timestamps) are now writable only by `service_role`/backend.
  Verified: non-admin `role` change → `permission denied for column role`.

#### Fixed: RLS performance (initplan) + policy cleanup
- Wrapped `auth.uid()` / `public.is_admin()` calls in `(select ...)` so they evaluate
  once per query instead of per row — cleared all `auth_rls_initplan` warnings.
- Merged the permissive own+admin policies on `profiles` into single SELECT/UPDATE
  policies — cleared `multiple_permissive_policies` warnings.
- Reconciled live-vs-file drift: own-profile policies narrowed from `public` to
  `authenticated`; products read narrowed to `anon, authenticated`; restored the missing
  `Users can insert own profile` policy.
- Rollback artifact saved at `/tmp/opencode/reverse_reconcile_optimize_harden_rls.sql`
  (not committed).

#### Fixed: missing FK indexes
Added `idx_order_items_order_id`, `idx_order_items_product_id`, `idx_orders_user_id`
(migration `add_missing_fk_indexes`; mirrored in `001_initial_schema.sql`). Cleared all
`unindexed_foreign_keys` warnings. (2 new INFO `unused_index` notes now appear — those
indexes have not been exercised yet at current data scale; expected and correct to keep.)

#### Operations / dashboard actions (no code)
- Enable **Leaked password protection** in Supabase Auth settings. `auth.config` does
  not exist in this project, so it cannot be set via SQL. (Finding L2.)
- Enable **Email confirmation** for the hosted project (H1): auth settings are not
  SQL-visible on this version — flip it in the dashboard
  (Authentication → Providers/Email). The repo `supabase/config.toml` already has
  `enable_confirmations = true` / `enable_autoconfirm = false`; 3 current users are
  already email-confirmed.
- Dismiss `authenticated_security_definer_function_executable` for `public.is_admin()`
  (lint ID `0029_authenticated_security_definer_function_executable`). Expected for the
  SECURITY DEFINER RLS pattern; the function returns only the caller's own admin flag.

#### Housekeeping
- Restored deleted `.env.example` templates (`backend/`, `frontend/`).
- Added `*.tsbuildinfo` to `.gitignore` (tracked build artifact to be untracked at
  commit time).

#### Verified (2026-08-01 12:31 UTC)
Post-implementation checks confirming all changes are applied per plan:

- **FK indexes** — all three live (`idx_order_items_order_id`,
  `idx_order_items_product_id`, `idx_orders_user_id`) and mirrored in
  `supabase/migrations/001_initial_schema.sql`.
- **Policies** — live `pg_policies` matches the canonical `supabase/policies.sql`:
  merged profiles SELECT/UPDATE + restored INSERT; products read
  `TO anon, authenticated`; initplan-wrapped `(select auth.uid())` /
  `(select public.is_admin())` throughout.
- **Column protection** — profiles table ACL for `authenticated` is now
  `rdDxtm` (table-level UPDATE/INSERT removed); `role` column has no column ACL and
  is **not** writable; contact columns grant `aw` (INSERT/UPDATE). Role-change
  escalation re-tested live: `permission denied for column role` (blocked).
- **search_path** — both stock functions in `001` carry
  `SECURITY DEFINER SET search_path = public`.
- **Housekeeping** — `.env.example` templates restored; `*.tsbuildinfo` added to
  `.gitignore`; no `.env` tracked.
- **Quality gates** — `tsc --noEmit` exit 0; backend `73 passed, 0 skipped`
  (async WebSocket tests enabled via `pytest-asyncio`, previously 8 skipped);
  advisors: `unindexed_foreign_keys`, `auth_rls_initplan`,
  `multiple_permissive_policies` all cleared. Remaining lints are expected:
  two INFO `unused_index` (new indexes not yet exercised at current data scale),
  `authenticated_security_definer_function_executable` (sanctioned `is_admin()`
  pattern), and pre-existing `auth_leaked_password_protection`.
- **Rollback** — reverse migration artifact:
  `/tmp/opencode/reverse_reconcile_optimize_harden_rls.sql` (not committed).

### Backend (FastAPI)

- `backend/app/routes/admin.py`: fixed order-cancel restock calling
  `increment_stock_inventory` with wrong RPC parameter name (`product_id` → `row_id`).
- `backend/app/routes/ws.py`: `verify_jwt` is async but was invoked without `await`;
  the WebSocket endpoint now awaits it.
- `backend/app/adapters/txn.py`: converts `create_order` RPC exceptions into a clean
  HTTP 500 instead of leaking raw errors.
- `backend/tests/test_adapters_txn.py`: rewrote stale tests that described a removed
  psycopg2 implementation; now exercise the RPC-based `run_in_transaction`.
- `backend/tests/test_adapters_notification.py`: tests now await the async
  `broadcast_order_update` and use `AsyncMock`.
- Enabled the previously-skipped async WebSocket tests: added
  `pytest-asyncio==1.0.0` to `backend/requirements.txt`. The 8 async tests in
  `test_ws_manager.py` (marked `@pytest.mark.asyncio`) were silently skipped because
  no async plugin was installed. Backend suite now `73 passed, 0 skipped` (was
  `65 passed, 8 skipped`).
- Added `backend/pytest.ini` with `asyncio_default_fixture_loop_scope = function`
  (silences the pytest-asyncio 1.0 `PytestDeprecationWarning`).

### Frontend (Next.js)

#### Fixed: admin gate reading the wrong role source
`app_metadata.role` was never populated by the DB layer (role lives in
`profiles.role`), so the dashboard/navbar silently hid for admins whose metadata was
unset.

- `app/dashboard/page.tsx`, `app/page.tsx`: admin check now reads `profiles.role` via
  the server Supabase client.
- `components/navbar.tsx`: role fetched from `profiles` via the browser client.

#### Added: `hooks/useUserRole.ts`
Shared Zustand store + `useUserRole()` hook that fetches the current user's role from
`profiles` and refreshes on auth changes.

#### Fixed: wholesale pricing ignoring the user role
`hooks/usePricing.ts` granted wholesale pricing to any 10+ lot cart regardless of role,
while the backend required `wholesale_approved`. Pricing functions are now role-aware
(`isWholesale`, `resolvePrice`, `calcSubtotal`), matching backend pricing
(`backend/app/adapters/pricing.py`).

#### Fixed: `useUserRole` auth subscription torn down after first load
Initial implementation returned early once `loaded` became `true`, which ran the effect
cleanup (unsubscribing) before the early return — so `onAuthStateChange` was never
re-registered after the first fetch, and the role never refreshed after sign-in/out.
Now subscribes once on mount and refreshes on every auth event.

#### Fixed: misleading wholesale nudge
The "ADD X MORE LOTS FOR WHOLESALE PRICING" prompt showed for non-`wholesale_approved`
users (who can never get wholesale pricing). Gated on `role === "wholesale_approved"` in
`components/cart-drawer.tsx` and `app/checkout/checkout-page.tsx`.

#### Fixed: navbar stale-update race
An in-flight profile-role fetch could resolve after sign-out and restore a stale user.
Guarded with `activeUserIdRef` in `components/navbar.tsx`.

#### Deepened: admin dashboard data module (architecture review, Candidate 1)
The dashboard shell was a shallow orchestrator: 5 states, 4 fetchers, 3 realtime
subscriptions, and raw Supabase row shapes (including `products: any[]`) leaking into
4 sections that each re-declared their own Order/OrderItem/Profile interfaces (8 copies).

- NEW `hooks/useAdminDashboard.ts`: one deep module owning all three queries, their
  select strings (single source), the realtime event→refresh mapping, loading, and a
  new error surface. Background refreshes are silent (skeleton only on first mount).
- `app/dashboard/dashboard-content.tsx`: shell slimmed to consume the hook and render
  the header, refresh button, and an error banner.
- `types/index.ts`: added `AdminOrder` / `AdminOrderItem` / `AdminProfile` fetched-row
  shapes; sections import these instead of declaring local interfaces.
- `sections/{overview,orders,approvals}.tsx`: local interfaces removed and replaced
  with the shared types; `products` is now `Product[]` (no more `any[]`).
- Deleted dead `lib/ws-client.ts` stub (no importers).

Behavior preserved; the only new user-visible behavior is an error banner on fetch
failure. Verified: `tsc --noEmit` exit 0, `next build` passes (dashboard route
compiles).

#### Deepened: product form module (architecture review, Candidate 2)
The add/edit product modals were ~95% duplicate twins (only the insert vs update line
differed), and `broadcastProductUpdate` was copy-pasted 3×.

- NEW `components/product-form.tsx`: one `ProductFormDialog` module with a
  discriminated interface — `{ mode: "create" } | { mode: "edit", product }` plus
  `onSuccess` / `trigger`. Implementation absorbs string→number coercion, image/tag
  list parsing, JSON-spec parsing, validation, the payload build, and the
  insert/update branch. Field ids use `useId()` (no `add-*`/`edit-*` prefixes).
- NEW `lib/product-events.ts`: `broadcastProductUpdate()` exported once, reused by
  the form module and the products section (leverage across 3 call sites).
- `sections/products.tsx`: add/edit call sites now use `ProductFormDialog`; local
  `broadcastProductUpdate` copy removed.
- Deleted `sections/add-product-modal.tsx`, `sections/edit-product-modal.tsx`, and
  the dead `ProductFormData` interface from `types/index.ts`.

Verified: `tsc --noEmit` exit 0, `next build` passes.

#### Unified: product-change signal (architecture review, Candidate 3)
Every product mutation previously hard-reloaded the page (`window.location.reload()`,
4 sites) while separately firing the FastAPI broadcast → realtime path — two competing
mechanisms. Mutation sites now call the data module's refresh instead.

- `sections/products.tsx`: gained `onRefresh` prop (wired to `useAdminDashboard`'s
  `refresh` in `dashboard-content.tsx`). Add/edit modal `onSuccess` and the delete path
  call `onRefresh` (no page reload); CSV import success now also broadcasts before
  refreshing, so other open admin tabs see imported products via realtime.
- Single signal path: local refresh (targeted state update) + broadcast → realtime →
  refresh for other tabs. Realtime module is now actually exercised.
- Deleted all 4 `window.location.reload()` calls from the dashboard.

Verified: `tsc --noEmit` exit 0, `next build` passes.

#### Server-side read seam for the dashboard (architecture review, Candidate 4)
Reconciled ADR-003 for the admin dashboard (the largest client-side read surface).

- NEW `lib/dashboard-data.ts`: shared read module owning all dashboard queries
  (`loadOrders`, `loadPendingProfiles`, `loadProducts`, `loadDashboardData`). One
  definition backed by two adapters — the cookie-authenticated server client and the
  browser client (the "two adapters = real seam" pattern).
- `app/dashboard/page.tsx`: fetches `initialData` server-side (after the admin gate)
  and passes it to the client. If the server fetch fails, it degrades to empty data
  and the client reconcile fills it.
- `hooks/useAdminDashboard.ts`: accepts `initialData`, hydrates state (first paint
  with no spinner), and runs a single silent reconcile fetch on mount — a correctness
  net that also covers writes between server render and hydration (Realtime only
  delivers events after the subscription starts). Realtime + manual refresh handle
  everything after mount. Fetchers now delegate to `lib/dashboard-data.ts`.
- `docs/adr/003-api-boundary-server-components-vs-fastapi.md`: addendum documenting
  the dashboard as the reference case for interactive read surfaces.

Verified: `tsc --noEmit` exit 0; `next build` passes.

### Product Images (Upload + URL)
#### Added: hybrid product images — upload from device or paste a URL
Merchants can now add product photos from their phone/storage, not only by pasting
external image URLs. Both inputs merge into the existing `products.images TEXT[]`
column (URL strings), so the display layer (cards, detail gallery, checkout) is unchanged.

- NEW `supabase/migrations/003_product_images_storage.sql`: `product-images` public
  Storage bucket (5 MB / image, allowlisted MIME types) + storage RLS policies —
  admin-only INSERT/UPDATE/DELETE gated on `public.is_admin()`. No SELECT policy:
  public buckets already serve files by URL without RLS, and a broad SELECT would
  enable anonymous bucket listing (advisor lint `public_bucket_allows_listing`).
- `components/product-form.tsx`: added a multi-file upload zone (`accept` allowlist,
  5 MB guard, client-side MIME checks, removable chips). Files upload to Storage
  (UUID paths, `getPublicUrl`) during submit; uploaded URLs are appended after any
  pasted URLs. The existing URL textarea remains as the "add by URL" alternative.
- Backend: no changes — product writes stay client-side via supabase-js + RLS.

Applied live to the Supabase project (bucket + policies). `tsc --noEmit` exit 0,
`next build` passes.

### Dashboard & Storefront UX

#### Added: out-of-stock tag in the dashboard
The products table's Stock column rendered a bare number even for zero-stock
products. Rows with `available_stock_lots = 0` now show a destructive "Out of Stock"
badge (in `sections/products.tsx`); in-stock products keep the numeric count.

#### Added: user-friendly specifications editor (no more JSON)
The add/edit product form required pasting specs as raw JSON
(`hardware_specifications` textarea validated with `JSON.parse`). Merchants shouldn't
write JSON, so the form now uses a dynamic key/value row editor in `product-form.tsx`:

- Each row is a "Name" + "Value" input pair with add/remove buttons.
- On save, rows build the `hardware_specifications` object; values are kept as text
  unless they parse as JSON (so numeric specs stay numbers and nested CSV-imported
  objects round-trip). Rows with an empty name or empty value are ignored.
- On edit, the existing object is converted back into rows.
- A value with an empty name blocks submit with a friendly message (no silent data
  loss). Existing flat specs in the live DB convert cleanly.

#### Changed: admins can no longer add to cart
Admins manage inventory, they don't buy from their own storefront. The catalog home
page already hid the button; the gaps were the product detail page and the navbar:

- `app/products/[id]/page.tsx`: fetches the profile role server-side (same pattern as
  home) and passes `isAdmin` to the detail content.
- `product-detail-content.tsx`: both Add-to-Cart buttons (desktop + mobile bottom bar)
  are hidden for admins; related-product `ProductCard`s get `isAdmin` too.
- `components/navbar.tsx`: the cart icon is hidden for admins (they can no longer fill
  a cart).

No backend or schema changes; `tsc --noEmit` exit 0, `next build` passes.

### Notes / Known Items

- `public.is_admin()` remains executable by `authenticated`. This is intentional:
  - RLS policies reference it, and policies are evaluated as the `authenticated` role,
    so `authenticated` must retain `EXECUTE`.
  - `is_admin()` only returns the *current caller's* admin status via `auth.uid()`, so
    `anon` calling it yields `false` — no data leak.
  - **Update (2026-08-01):** the `PUBLIC` EXECUTE grant (which `anon` inherited) is now
    revoked via migration `revoke_is_admin_public_execute`. The earlier `REVOKE ... FROM
    anon` in `002_checkout_order_and_admin_helpers.sql` was a no-op — `anon` inherited
    EXECUTE through the `PUBLIC` grant, not an explicit one. An explicit
    `GRANT EXECUTE ... TO authenticated` is kept so RLS policies keep working.
  - **Correction (2026-08-01):** the repo file `002_checkout_order_and_admin_helpers.sql`
    now also `REVOKE EXECUTE ... FROM anon`. Supabase default privileges auto-grant
    `anon`/`authenticated`/`service_role` EXECUTE on every new function, so `REVOKE FROM
    public` alone leaves `anon` with an explicit grant. Verified empirically in a
    throwaway schema: after `REVOKE FROM public` only, `anon` could still execute the
    function. The live DB already had `anon` revoked (by the earlier hardening migration),
    so live state was unaffected.
  - The Supabase advisor's `authenticated_security_definer_function_executable` warning
    will persist; it is expected for the `is_admin()` RLS pattern and should be dismissed
    in the dashboard rather than "fixed" (revoking `authenticated` breaks RLS).
- `handle_new_user` trigger and `rls_auto_enable` event-trigger functions are no longer
  directly callable via RPC.
- `auth_leaked_password_protection` remains disabled on the hosted project (pre-existing).
- A rolled-back `create_order` end-to-end test consumed one value from the
  `readable_order_id` sequence (next order is `#14`).
