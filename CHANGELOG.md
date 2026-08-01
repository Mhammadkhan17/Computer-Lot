# Changelog

All notable changes to this project are documented in this file.

Last updated: 2026-08-01 12:31 UTC

## [Unreleased]

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
  not exist in this project, so it cannot be set via SQL.
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
