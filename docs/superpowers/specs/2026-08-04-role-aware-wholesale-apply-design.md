# Design: Role-Aware "Apply for Wholesale"

**Date:** 2026-08-04
**Status:** Draft (pending user review)

## Problem

The "Apply for Wholesale" button in `frontend/src/components/sections/wholesale.tsx:48-54` is a static
server-component `<Link href="/login">`. It always routes to the login page, even for an
already-authenticated user — including a `wholesale_approved` business that has nothing to apply for,
and a `wholesale_pending` user whose request is already under review.

There is additionally no way for an already-logged-in `retail` user to apply: the company name / tax
ID wholesale fields only appear at signup. Applying is only possible at account creation today.

## Goal

Make the button role-aware:

- **Not logged in** → unchanged: route to `/login`.
- **`retail`** → open an apply dialog; on submit, become `wholesale_pending`.
- **`wholesale_pending`** → dialog shows "application under review".
- **`wholesale_approved`** → dialog shows an already-approved confirmation.
- **`admin`** → dialog explains that admin accounts follow the standard 10-lot wholesale rule (per ADR-001:24) — **not** "already approved".

## Architecture

Four layers, mirroring existing project patterns.

### 1. Database — new migration `011_apply_for_wholesale.sql`

A SECURITY DEFINER RPC `apply_for_wholesale(p_company_name VARCHAR, p_tax_id VARCHAR)` returning `jsonb`:

1. Require `auth.uid()` not null (authenticated only); else raise.
2. Require `SET search_path = public` on the function definition — **mandatory** for any SECURITY DEFINER
   function in this codebase (every existing one sets it, e.g. `004_security_hardening.sql:160`). Without
   it, an authenticated caller can set their own `search_path` and hijack the function to run arbitrary
   SQL with the definer's (postgres) privileges.
3. Validate `p_company_name` at the DB layer: trim it, and RAISE (or return `{"status":"error"}`) if blank.
   The RPC is directly callable via `supabase.rpc()` from any authenticated client, bypassing FastAPI —
   API-layer validation alone would let a caller create a `wholesale_pending` profile with an empty
   company name.
4. Read the caller's current `profiles.role`. If no profile row exists, return `{"status":"error"}`
   (must not silently succeed).
5. Branch on role:
   - `retail` → `UPDATE profiles SET role='wholesale_pending', company_name=..., tax_registration_id=..., updated_at=NOW() WHERE id=auth.uid()`; return `{"status":"applied"}`.
   - `wholesale_pending` → return `{"status":"pending"}` (idempotent).
   - `wholesale_approved` → return `{"status":"approved"}`.
   - `admin` → return `{"status":"admin"}` (safety guard so an admin can **never** be downgraded to `wholesale_pending`).
   - anything else → return `{"status":"error"}`.
6. Grant EXECUTE to `authenticated` only (REVOKE from anon/public).

**Why a SECURITY DEFINER function:** `profiles.role` is not API-writable (column grants exclude it,
`004_security_hardening.sql:152`, `policies.sql:34-42`), and `admin_set_profile_role` is admin-guarded.
The service_role client is off-limits for anything but `/checkout` (ADR-009). A dedicated RPC is the
only clean path for a user to self-apply.

**RLS:** the function runs as its owner (definer) but is callable only by `authenticated`, validates
`auth.uid()`, and only ever touches the caller's own row. RLS stays enabled; no policy changes.

**Apply to live:** after committing, apply migration 011 to the live Supabase project via the MCP
`apply_migration` tool (same process used for migration 010 in Task 1) so the repo and live DB do not
drift. Verify `convalidated`/RPC presence after applying.

### 2. Backend — `POST /wholesale/apply`

New route in `backend/app/routes/` (e.g. `wholesale.py`), registered alongside existing routers,
mirroring the admin approvals pattern (`admin.py`):

- `POST /wholesale/apply`, rate limited (e.g. `10/minute`, same limiter as admin routes).
- Validates the JWT via `get_current_user`.
- Calls `supabase.rpc("apply_for_wholesale", {...})` on the caller's client (`get_user_supabase`).
- Returns the RPC's `{"status": ...}`. Idempotent — the same endpoint serves both the initial apply
  and a status re-check.
- **HTTP status mapping:** `200` for `applied`/`pending`/`approved`/`admin`; `400` for `error`
  (e.g. no profile row, blank company name). Auth failures come from `get_current_user` as `401/403`.
- New Pydantic schema: `WholesaleApplyRequest` (`company_name: str` required, non-empty after trim,
  `max_length=255`; `tax_registration_id: str` optional, `max_length=100`) and a response model
  wrapping `status`. Length caps match the `profiles` columns (`001_initial_schema.sql:16-17`), so
  oversized input fails cleanly at `422` rather than surfacing a DB truncation error.

### 3. Frontend — client component `WholesaleApplyButton`

Replaces the static `<Link href="/login">` in `wholesale.tsx:48-54`. `wholesale.tsx` stays a server
component; the new interactive button is a client component imported into it.

Behavior, driven by `useUserRole()` and `useUserRoleLoaded()` (the latter already exists from the
price-flash work — reuse it, do not invent a new loading signal):

| State | Render |
|---|---|
| role not loaded | `<Button disabled>` placeholder matching the link's dimensions (no layout shift when it swaps) |
| `null` (guest) | `<Link href="/login">Apply for Wholesale</Link>` (unchanged) |
| `retail` | button opening an apply dialog |
| `wholesale_pending` | button opening a "pending" status dialog |
| `wholesale_approved` | button opening an "approved" confirmation dialog |
| `admin` | button opening an "admin follows the 10-lot rule" dialog |

The dialog reuses `components/ui/dialog.tsx` (Dialog, DialogContent, DialogHeader, DialogTitle).

**Apply dialog (retail):**
- Fields: Company Name (required, trimmed), Tax Registration ID (optional).
- Submit → `POST /wholesale/apply` with the auth token (mirrors `approvals.tsx` fetch pattern).
- Success → `toast.success`, close dialog, refetch role so the button now reflects `wholesale_pending`.
- Error → message in dialog + `toast.error`.

**Status dialogs (pending/approved/admin):** static confirmation copy, no form. The admin copy must
NOT claim wholesale pricing is active — it should say admin accounts follow the standard 10-lot rule.

**Re-apply after rejection:** an admin-rejected user (`role` → `retail` via `admin.py:63`) may click
the button again and re-apply; the RPC treats them as a fresh `retail` applicant. This is intentional.

### 4. Tests

- Backend pytest: new test file for the endpoint, mirroring `test_admin.py`'s mocking approach
  (`MagicMock` + `rpc_side` fixture — the suite mocks the Supabase client, it does not hit a live DB):
  - retail apply → returns `applied` (assert the RPC is invoked with the caller's payload + trimmed company name)
  - approved user re-checks → returns `approved`
  - RPC returns `error` → HTTP 400
  - missing/invalid JWT → 401/403
  - missing company name → 422
  - company name over 255 chars / tax id over 100 chars → 422
- Migration SQL review: confirm `SET search_path = public`, `SECURITY DEFINER`, and EXECUTE grants
  (REVOKE anon/public, GRANT authenticated) — match the hardening pattern asserted in `test_admin.py`.
- Frontend: `tsc --noEmit`, `npm run lint`, `npm run build` all exit 0. Manual check of each role state.

## Files

- New: `supabase/migrations/011_apply_for_wholesale.sql`
- New: `backend/app/routes/wholesale.py`
- New: `backend/app/schemas/wholesale.py`
- New: `backend/tests/test_wholesale_apply.py`
- New: `frontend/src/components/sections/wholesale-apply-button.tsx`
- Modified: `frontend/src/components/sections/wholesale.tsx` (import client button in place of the static Link)
- Modified: `backend/app/main.py` or router registration (include new router)
- Modified: `docs/Structure.txt` (new files per AGENTS.md §4)

## Out of Scope

- Email/webhook notification to admin (ADR-006 says "no email at MVP").
- Auto-approval or business-name vetting.
- Changes to the admin approve/reject flow.
- Editing company/tax fields after application (would be a separate profile-edit feature).

## Risks / Notes

- The RPC is SECURITY DEFINER; keep the body minimal and validate `auth.uid()` first, and **always
  `SET search_path = public`** (hardening requirement, verified against every existing definer function).
- `updated_at` column exists on `profiles` (confirmed: `001_initial_schema.sql:21`, written by
  `admin_set_profile_role`).
- New router must follow the existing rate-limit + error-handling conventions (`admin.py`, `main.py`).
- Admin branch is a safety guard, not a privilege: per ADR-001:24 admins follow the uniform 10-lot rule.
