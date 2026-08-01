Security Review Report
Project: Hybrid Computer Lot Liquidation Platform (Enhanced v2)
Reviewed: 2026-08-01
Reviewer: security-reviewer agent
Scope: Backend (FastAPI), Frontend (Next.js 15 App Router), Supabase (migrations, RLS, functions), configuration files
Method: Static review of all source files + live verification of the linked Supabase project (RLS policies, function grants, advisor lints)
Summary
- Critical Issues: 3
- High Issues: 4
- Medium Issues: 8
- Low Issues: 9
- Risk Level: HIGH
Overall posture: The database layer is the strongest part of the system — RLS is enabled on all tables, the atomic decrement_stock_inventory guard prevents overselling, the create_order RPC is REVOKEd from anon/authenticated and granted only to service_role, the profiles role column is not writable via the API, and admin authorization is enforced server-side against the DB profile role. There is no SQL injection, no XSS sink with user-controlled data, no open redirect, no SSRF, and no secrets committed to git (only .env.example are tracked).
However, there are critical structural and config issues: the service_role key is used for all backend DB access (not just /checkout), rate limiting is disabled in the current configuration (DEBUG=true), and the check-then-act stock validation has a TOCTOU window that produces 500s instead of clean errors. The most dangerous combination is: no rate limiting + no payment at checkout + stock decremented at order creation → an authenticated attacker can drain inventory with fake orders.
CRITICAL Findings
C1. service_role key used for ALL backend database access — ADR-009 violated, RLS bypassed platform-wide
Severity: CRITICAL
Category: Authorization / Secrets Handling / Architecture
Location:
- backend/app/database.py:27-28 — get_supabase() creates a client with settings.supabase_service_role_key
- backend/app/routes/checkout.py:20 — supabase: Client = Depends(get_supabase)
- backend/app/routes/admin.py:36, 55, 75, 138, 159, 198 — every admin endpoint uses Depends(get_supabase)
- backend/app/adapters/order_intake.py:25, 33 — profile/products reads via the service_role client
Issue: ADR-009 states "Only the /checkout FastAPI endpoint uses service_role key. All other operations use Supabase anon key (RLS-enforced)." This is not true in the implementation. The only Supabase client the backend knows how to build is a service_role client, and it is injected into /admin/* (and implicitly any future route). Every query in admin.py (update, rpc, select) therefore runs with RLS disabled and full DB privileges. AGENTS.md rule #5 ("Never bypass RLS in application code") is also violated.
Impact: There is no active exploit today only because every admin route happens to call _assert_admin (admin.py:25-29). But the entire backend operates as postgres: any future endpoint that forgets an authz check, any bug in _assert_admin, or any code path that trusts a client-supplied ID will silently bypass RLS. This turns one small mistake into total database compromise (including orders.customer_phone, profiles, and stock manipulation). It also directly contradicts the project's own security decision record.
Remediation:
- Create two dependencies: get_supabase() (anon/authenticated key, RLS-enforced) used everywhere by default, and get_service_role_supabase() used only by /checkout (and only for the create_order RPC + decrement_stock_inventory).
- Rewrite _assert_admin to use the RLS-enforced client and rely on the is_admin() policy instead of a service_role read.
- Consider executing the admin role checks purely through RLS (profiles/orders/products policies already gate by is_admin()), so the FastAPI admin layer only needs JWT validation.
C2. Rate limiting disabled and FastAPI debug mode enabled in the working configuration
Severity: CRITICAL
Category: Security Misconfiguration / Business Logic Abuse
Location:
- backend/.env — DEBUG=true
- backend/app/main.py:18 — limiter = Limiter(key_func=get_remote_address, default_limits=["10/minute"])
- backend/app/main.py:32-33 — if not settings.debug: app.add_middleware(SlowAPIMiddleware) → middleware is never added while DEBUG=true
- backend/app/main.py:20 — app = FastAPI(..., debug=settings.debug) → debug stack traces returned to clients
- No @limiter.limit(...) decorator exists on any route (verified by grep)
Issue: With DEBUG=true in the only .env present, SlowAPIMiddleware is skipped entirely, so no requests are rate limited. ADR-009 explicitly requires "Rate limit /checkout at 10 requests/minute per user (SlowAPI)" — this is unimplemented (no per-route/per-user limit anywhere). FastAPI debug=True also returns full stack traces (internal paths, DB error details) to API clients on unhandled exceptions.
Impact: Combined with the WhatsApp-fulfillment model (no payment gateway, ADR-005), where stock is decremented at order creation, an authenticated attacker can script /checkout to create hundreds of pending_whatsapp orders that are never paid — draining the entire inventory (denial-of-sale) with zero cost. Debug mode additionally leaks internal implementation details to any caller.
Remediation:
- Set DEBUG=false for any deployed environment (fail closed: default debug=False in config.py:17 and never ship a .env with DEBUG=true).
- Add explicit @limiter.limit("10/minute") on /checkout, keyed by user["sub"] (per-user, not per-IP).
- Add a global exception handler that returns a generic 500 message without str(e) (see M4).
C3. Stock validation is check-then-act across a non-transactional boundary — TOCTOU window
Severity: CRITICAL (data-integrity adjacent; does not oversell but breaks the ADR-002 contract)
Category: Business Logic / Race Condition
Location:
- backend/app/adapters/order_intake.py:86-90 — products fetched and _validate_stock runs outside any transaction
- backend/app/adapters/stock.py:19 — if product["available_stock_lots"] < qty_entry["quantity"] reads a snapshot from line 86
- backend/app/adapters/txn.py:20-29 — the actual decrement happens later, inside create_order RPC
- supabase/migrations/001_initial_schema.sql:84-91 — atomic guard WHERE available_stock_lots >= steps (this is what prevents overselling)
Issue: ADR-002/ADR-007 say the stock check must run inside the transaction. The code checks stock on a snapshot fetched before the transaction and only re-validates implicitly via the decrement guard. For two concurrent checkouts of the last N lots: both pass the pre-check, the first commits, and the second's decrement_stock_inventory returns false → RAISE EXCEPTION (migration 002:59-61) → txn.py:31-32 converts it to a generic 500 "Checkout failed, order rolled back".
Impact: Inventory integrity is preserved (no oversell — the single-statement guarded UPDATE is correct), but the user contract is broken: the second buyer receives a confusing 500 instead of the friendly out_of_stock[] 400, and the pre-check in order_intake.py:88 is rendered meaningless (it can pass then fail). The rollback is correct, so this is not a double-decrement — but the failure mode and the redundant check violate the ADR and produce a poor, noisy failure.
Remediation:
- Perform the stock validation inside the same DB transaction as the decrement. Either (a) add a dedicated RPC create_order_with_stock_check that selects available_stock_lots with FOR UPDATE then decrements, and have it return structured out_of_stock[] errors rather than raising, or (b) keep create_order but have it return a typed insufficient_stock result that the FastAPI layer maps to a 400.
- Remove the redundant pre-check or keep it only as a UX hint, never as a source of truth (AGENTS.md rule 4).
HIGH Findings
H1. Email confirmation / auto-confirm signup enabled — fake accounts and unverified wholesale applications
Severity: HIGH
Category: Authentication / Business Logic
Location: supabase/config.toml:34-35
[auth.email]
enable_confirmations = false
enable_autoconfirm = true
Issue: New accounts are auto-confirmed without email verification, and signup is open (enable_signup = true). The signup trigger handle_new_user (policies.sql:99-127) grants wholesale_pending to anyone who provides a company_name — with zero verification. This powers the self-serve wholesale flow (ADR-006) on top of unverified identities.
Impact: Mass fake accounts, spam orders, and wholesale-pending queue flooding. An attacker can trivially create unlimited identities to farm the inventory-draining attack in C2. (Note: config.toml is the local dev config; if the hosted Supabase project mirrors it, this is active. Verify in the dashboard.)
Remediation: Enable email confirmation (enable_confirmations = true, enable_autoconfirm = false). Optionally add a rate limit on signup and require admin approval before wholesale_pending is applied (e.g., keep new signups retail and let them request wholesale via a separate flow that records intent + admin review).
H2. Checkout error handler leaks internal exception details
Severity: HIGH
Category: Information Disclosure
Location: backend/app/routes/checkout.py:43-48
except Exception as e:
    logger.exception("Unexpected checkout error")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(error="internal_error", detail=str(e)).model_dump(),
    )
Issue: Any unexpected exception's message (str(e)) is returned to the client. With DEBUG=true (C2) this becomes full stack traces. Exceptions here include Postgrest API errors, DB connection errors, and type-cast failures from malformed input (e.g., a non-UUID product_id or a quantity > INT32 range reaching (v_item->>'quantity_ordered')::INT in migration 002:52).
Impact: Leaks internal API/DB error text, schema details, and environment information, aiding targeted attacks. Combined with C2, it can also be used to probe internals.
Remediation: Return a fixed generic message ("internal_error" / "Unexpected error, please retry") and log the full detail server-side only. Map known RPC failures (insufficient stock, invalid UUID cast) to 400/422 with safe messages.
H3. No upper bound / depth guards on checkout input — malformed requests reach the SECURITY DEFINER function
Severity: HIGH
Category: Input Validation
Location:
- backend/app/schemas/order.py:4-6 — quantity: int = Field(gt=0) (no upper bound)
- backend/app/schemas/order.py:9-10 — items: list[CheckoutItem] (no max length)
- backend/app/adapters/txn.py:22-28 — item dict passed straight into RPC params
- supabase/migrations/002_checkout_order_and_admin_helpers.sql:51-53 — raw JSONB casts ::UUID, ::INT, ::DECIMAL
Issue: Quantity is unbounded (an int > 2³¹−1 raises a Postgres integer-out-of-range error → 500), items list is unbounded (thousands of line items → huge JSONB, slow RPC), and product_id is only cast to UUID inside the DB. The create_order RPC (SECURITY DEFINER) accepts and casts all of this without its own validation.
Impact: Cheap 500-error generation, resource exhaustion via oversized p_items, and reliance on the DB to validate shapes that Pydantic should reject. The SECURITY DEFINER function becomes an input-validation backstop that is currently missing.
Remediation: Add bounds in Pydantic: quantity: int = Field(gt=0, le=1000), items: list[CheckoutItem] = Field(min_length=1, max_length=50), and validate product_id as UUID format in the schema. Add defense-in-depth guards in create_order (v_quantity <= 0 THEN RAISE, empty p_items THEN RAISE) and a CHECK (quantity_ordered > 0) constraint on order_items.
H4. decrement_stock_inventory accepts negative/invalid steps; order_items.quantity_ordered has no CHECK constraint
Severity: HIGH (defense-in-depth; not exploitable today)
Category: Business Logic Integrity
Location:
- supabase/migrations/001_initial_schema.sql:79-93 — decrement_stock_inventory(row_id UUID, steps INT) has no steps > 0 guard
- supabase/migrations/001_initial_schema.sql:63-69 — order_items.quantity_ordered INT NOT NULL (no CHECK)
- supabase/migrations/002_checkout_order_and_admin_helpers.sql:51-58 — quantities flow from JSONB into both the order_items insert and the decrement
Issue: A negative steps would increase stock (available_stock_lots - (-3) = +3), and the WHERE available_stock_lots >= steps guard is satisfied by negatives. Today this is blocked by Pydantic gt=0 (order.py:6) and by REVOKE of the function from anon/authenticated (migration 002:82-90), but the DB itself — the final authority per AGENTS.md rule 2 — does not enforce it.
Impact: If the Pydantic guard is ever bypassed (e.g., a future caller, a different schema, or an admin-path bug), an attacker could mint unlimited stock. The DB must be the last line of defense.
Remediation: Add IF steps <= 0 THEN RETURN FALSE; END IF; to both stock functions; add CHECK (quantity_ordered > 0) and CHECK (unit_price_applied > 0) to order_items; add CHECK (p_items IS NOT NULL AND jsonb_array_length(p_items) > 0) logic in create_order.
MEDIUM Findings
M1. No security headers / Content-Security-Policy
Location: frontend/next.config.mjs (no headers() configured); frontend/src/app/layout.tsx (no CSP meta)
Issue: No Content-Security-Policy, X-Frame-Options, Referrer-Policy, or HSTS headers. XSS mitigation currently relies solely on React's default escaping (which is good — no dangerouslySetInnerHTML with user data exists; the only use is static recharts theme CSS at frontend/src/components/ui/chart.tsx:95).
Impact: If any future DOM-XSS or injection slips in (e.g., an admin pastes a malicious image_urls value rendered into an <img> context or a title with markup), there is no second layer. Clickjacking of the auth pages is also possible.
Remediation: Add a headers() block in next.config.mjs with a restrictive CSP (e.g., default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co ${API_URL}), X-Frame-Options: DENY, and Referrer-Policy: no-referrer.
M2. Session cookie set without Secure flag (and httpOnly not applied)
Location: frontend/src/utils/supabase/client.ts:16-20
document.cookie = `${name}=${value}; path=/; max-age=...; SameSite=Lax${...}`
Issue: The browser Supabase session cookie is written with SameSite=Lax but no Secure attribute, so over any plaintext connection (or if the site is reachable via HTTP) the access token can be intercepted. The token is JS-readable by design for the browser client, so XSS → full account takeover — making the CSP gap (M1) more important.
Remediation: Append ; Secure when window.location.protocol === "https:" (or always in production), and prefer the SSR client for cookie setting with httpOnly/secure options where the architecture allows.
M3. No per-user rate limit and limiter keyed by IP (ignores proxies)
Location: backend/app/main.py:18 — Limiter(key_func=get_remote_address, default_limits=["10/minute"])
Issue: get_remote_address uses request.client.host, which behind a reverse proxy/load balancer is the proxy's IP — all users share one bucket (either everyone is throttled or, more likely, the limit is raised and becomes useless). There is no per-user limiting and no X-Forwarded-For handling.
Impact: Directly undermines ADR-009's "10/minute per user" and enables the C2 inventory-drain script.
Remediation: Add a custom key function that extracts the JWT sub (or falls back to IP with proxy-aware logic), and add explicit @limiter.limit("10/minute") on /checkout and admin mutation endpoints.
M4. Order spam / inventory lock-up (no payment, no expiry)
Location: backend/app/adapters/order_intake.py:98-102 (order created + stock decremented); backend/app/adapters/txn.py:20-29; supabase/migrations/001_initial_schema.sql:56 (status order_status DEFAULT 'pending_whatsapp')
Issue: Stock is decremented at order creation with no payment (WhatsApp fulfillment, ADR-005). There is no pending-order TTL/auto-cancel, and cancelled restock (admin.py:86-96) is only manual.
Impact: Any authenticated user (or script) can create unbounded unpaid orders that hold inventory indefinitely — an inventory DoS even with rate limiting (C2/M3 make it trivially automatable).
Remediation: Add a job/RPC that auto-cancels pending_whatsapp orders older than X (e.g., 24h) and calls increment_stock_inventory; enforce the per-user checkout limit; consider a per-user cap on open pending orders.
M5. WebSocket broadcasts order PII to all connected clients
Location:
- backend/app/adapters/order_intake.py:104-109 → broadcast_order_update (includes customer_name, total_amount)
- backend/app/adapters/notification.py:4-12
- backend/app/utils/ws_manager.py:33-43 — broadcast() sends to every connection, no role filter
Issue: manager.broadcast delivers order data (customer name + total) to every WebSocket, regardless of ownership or role. The frontend currently uses Supabase Realtime instead of this WS (so the exposure is latent), but the endpoint exists at /ws.
Impact: If the frontend ever adopts the FastAPI WS, any connected user would receive every order's customer name and amount. Customer PII disclosure.
Remediation: Use send_to_user(order_user_id, ...) instead of broadcast for order events, or add a role/ownership filter to broadcast. Do not broadcast customer_name at all — broadcast a minimal {order_id, status}.
M6. JWT passed as WebSocket query parameter
Location: backend/app/routes/ws.py:13 — async def websocket_endpoint(ws: WebSocket, token: str = Query(...))
Issue: The access token travels in the URL query string; it can be logged by proxies, browser history, and access logs.
Impact: Token leakage → session hijack.
Remediation: Pass the token in the Sec-WebSocket-Protocol header or a cookie, or at minimum ensure no access logs record query strings.
M7. orders.readable_order_id is a sequential BIGSERIAL — enumeration of order IDs
Location: supabase/migrations/001_initial_schema.sql:51
Issue: Order numbers are sequential. RLS protects the data (users only see their own, receipts double-check ownership), so no data leak today, but the sequence reveals platform volume and every receipt URL is guessable (useful only if RLS ever regresses).
Impact: Low direct risk; supports targeted enumeration if RLS is misconfigured.
Remediation: (Optional) switch to a random suffix (e.g., ORD-XXXXXX from gen_random_bytes) while keeping a non-guessable receipt token.
M8. CORS configured with credentials and env-driven origins — no HTTPS/allowlist hardening
Location: backend/app/main.py:24-30 — allow_origins=settings.cors_origins.split(","), allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
Issue: Current value http://localhost:3000 is fine for dev, but the pattern permits * to be set, which with allow_credentials=True is rejected by browsers (mostly harmless) but signals configuration fragility; also no validation that origins are HTTPS in production.
Remediation: Validate at startup that cors_origins is a non-wildcard list of HTTPS origins when not in dev; tighten methods/headers to what is used (POST, PATCH, GET; Authorization, Content-Type).
LOW Findings
L1. is_admin() SECURITY DEFINER RPC executable by any authenticated user
Location: supabase/migrations/002_checkout_order_and_admin_helpers.sql:103-105 (explicit GRANT ... TO authenticated); confirmed live (advisor lint authenticated_security_definer_function_executable)
Issue: Required so RLS policies can call it, but it is also callable directly via /rest/v1/rpc/is_admin, revealing whether the caller is an admin.
Impact: Trivial info disclosure (a user already knows their own role). Acceptable trade-off; consider making it SECURITY INVOKER with STABLE semantics and a guard, or move to a dedicated schema.
L2. Supabase "Leaked Password Protection" disabled
Location: Live project advisor (auth config)
Issue: Compromised-password checks against HaveIBeenPwned are off.
Remediation: Enable in the Supabase dashboard (auth → password security).
L3. middleware.ts performs session refresh only — no route protection
Location: frontend/src/middleware.ts:4-13
Issue: Protected routes rely on per-page checks (dashboard/page.tsx:9-22, receipts/id/page.tsx:13-16). These are correct, but there is no defense-in-depth at the middleware layer.
Remediation: Redirect unauthenticated users away from /dashboard and /receipts in middleware.
L4. Dead code check_role with insecure default
Location: backend/app/utils/security.py:80-82 — role = payload.get("role", "retail")
Issue: Unused; if a future route uses it with the JWT-derived role (which is always "authenticated" for real Supabase tokens, never "admin"/"retail"), it would not work as intended (fail-closed for admin, but the default silently downgrades/upgrades semantics).
Remediation: Delete it, or reimplement to look up the profile role from the DB like _assert_admin.
L5. WebSocket role claim from JWT is always authenticated — role-based broadcasts never deliver
Location: backend/app/routes/ws.py:21 — role = payload.get("role", "retail"); ws_manager.py:45-57 (broadcast_to_role)
Issue: The Supabase JWT role claim is the auth role (authenticated), not the profiles role. broadcast_to_role(..., role="admin") therefore matches nobody (admin notifications silently vanish). Not a security hole, but the role plumbing is broken and could mislead future security work.
Remediation: Fetch the profile role from DB on WS connect (like _assert_admin) or drop role-based broadcasts.
L6. CSV import: no upload size limit; integer fields lack lower bounds
Location: backend/app/routes/admin.py:163-166 (await file.read() — whole file in memory); backend/app/adapters/row_validator.py:74-78 (_parse_int accepts negatives/zero for items_per_lot, minimum_wholesale_lots)
Issue: Admin-only endpoint, so impact is limited to admin errors/memory use and invalid product data (e.g., items_per_lot=0, minimum_wholesale_lots=-1).
Remediation: Enforce items_per_lot >= 1, minimum_wholesale_lots >= 1, and a max upload size (e.g., 5 MB).
L7. User-controlled profile fields flow into WhatsApp message text unvalidated
Location: backend/app/adapters/whatsapp.py:6-20 — message includes customer_name (user-controlled) and product title (admin-controlled), URL-quoted with quote()
Issue: quote() prevents URL-breaking/injection into the deep link; the host is always wa.me. There is no open redirect (verified: the only window.location.href is frontend/src/components/checkout-button.tsx:67 and it points to the server-built https://wa.me/...). Residual risk is just WhatsApp-message-content spoofing (e.g., a title containing a fake link).
Remediation: Optional — strip control characters/line breaks from names/titles in the message builder.
L8. Product image URLs are not validated (admin-supplied external URLs)
Location: frontend/src/components/product-form.tsx:196-199 (pasted image_urls); rendered in <img src> (product-card.tsx:46-48, checkout-page.tsx:70-75)
Issue: An admin can paste arbitrary URLs (tracking pixels, internal/cloud metadata endpoints fetched by visitor browsers). Script execution via <img> is blocked by browsers, but external-network leakage (visitor IP → third-party) is possible.
Remediation: Restrict pasted image URLs to https:// (and optionally the project's storage origin); keep uploads for everything else.
L9. Logging of user IDs and auth-server response bodies
Location: backend/app/utils/security.py:28, 34-38
Issue: Logs user IDs and resp.text[:200] from the Auth server on rejection (may include email addresses in some Supabase responses).
Remediation: Log only status codes and sanitized identifiers.
Security Checklist
- No hardcoded secrets / committed .env (only .env.example tracked)
- SQL injection: no raw SQL; postgrest/RPC params parameterized (get_raw_connection is dead code)
- XSS: React escaping everywhere; no user-data dangerouslySetInnerHTML
- Atomic stock decrement with guard prevents oversell
- RLS enabled on all 4 tables; profiles role column not writable via API
- create_order/decrement_stock_inventory executable only by service_role
- service_role restricted to /checkout only (violated) — used by all admin endpoints
- Admin authorization enforced server-side via DB profile role
- Rate limiting per user on /checkout (not implemented; global limit disabled by DEBUG=true)
- Security headers / CSP (missing)
- Email confirmation (disabled)
- Session cookie Secure flag (missing)
- Pydantic bounds on quantity/items (partial — no upper bounds)
- DB-level CHECK constraints on order quantities/prices (missing)
Overall Assessment & Top 5 Recommended Fixes
The platform's core transactional design is sound: the atomic decrement guard, the restricted RPC grants, RLS on all tables, server-side pricing, and server-side role checks are the right bones. The weaknesses are concentrated in (1) architectural drift from ADR-009 (service_role sprawl), (2) deployment configuration (rate limiting off, debug on, auto-confirm signup), and (3) input-bound hardening at the DB layer. In priority order:
1. Constrain service_role to /checkout only (fix C1): introduce a separate anon/authenticated-key client for all non-checkout DB access, and make admin authorization rely on RLS + is_admin() rather than a service_role read.
2. Fix deployment config (fix C2/H1): set DEBUG=false, enable the SlowAPI middleware, add a per-user 10/minute limit on /checkout, and enable email confirmation (plus verify the hosted Supabase auth settings).
3. Do the stock check inside the transaction and return typed errors (fix C3): move stock validation into the RPC with row locking so concurrent buyers get a clean 400 out_of_stock[] instead of a 500, keeping the decrement atomic.
4. Harden the DB as the last line of defense (fix H3/H4): add steps > 0 guards to stock functions, CHECK (quantity_ordered > 0), CHECK (unit_price_applied > 0), and Pydantic upper bounds (quantity ≤ 1000, items ≤ 50, UUID validation).
5. Add an anti-abuse layer for the unpaid-order model (fix M3/M4): auto-expire pending_whatsapp orders (restock on expiry), cap open pending orders per user, and stop broadcasting order PII over the WebSocket (use send_to_user).
Security > Features > Performance > Polish — with these fixes, the platform's security posture would move from HIGH to a defensible MEDIUM-LOW for a production liquidation marketplace.