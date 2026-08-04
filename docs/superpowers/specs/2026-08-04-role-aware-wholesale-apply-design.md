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
- **`admin`** → dialog shows that admin accounts have wholesale pricing.

## Architecture

Four layers, mirroring existing project patterns.

### 1. Database — new migration `011_apply_for_wholesale.sql`

A SECURITY DEFINER RPC `apply_for_wholesale(p_company_name VARCHAR, p_tax_id VARCHAR)` returning `jsonb`:

1. Require `auth.uid()` not null (authenticated only); else raise.
2. Read the caller's current `profiles.role`.
3. Branch on role:
   - `retail` → `UPDATE profiles SET role='wholesale_pending', company_name=..., tax_registration_id=..., updated_at=NOW() WHERE id=auth.uid()`; return `{"status":"applied"}`.
   - `wholesale_pending` → return `{"status":"pending"}` (idempotent).
   - `wholesale_approved` → return `{"status":"approved"}`.
   - `admin` → return `{"status":"admin"}`.
   - anything else → return `{"status":"error"}`.
4. Grant EXECUTE to `authenticated` only (REVOKE from anon/public).

**Why a SECURITY DEFINER function:** `profiles.role` is not API-writable (column grants exclude it,
`004_security_hardening.sql:152`, `policies.sql:34-42`), and `admin_set_profile_role` is admin-guarded.
The service_role client is off-limits for anything but `/checkout` (ADR-009). A dedicated RPC is the
only clean path for a user to self-apply.

**RLS:** the function runs as its owner (definer) but is callable only by `authenticated`, validates
`auth.uid()`, and only ever touches the caller's own row. RLS stays enabled; no policy changes.

### 2. Backend — `POST /wholesale/apply`

New route in `backend/app/routes/` (e.g. `wholesale.py`), registered alongside existing routers,
mirroring the admin approvals pattern (`admin.py`):

- `POST /wholesale/apply`, rate limited (e.g. `10/minute`, same limiter as admin routes).
- Validates the JWT via `get_current_user`.
- Calls `supabase.rpc("apply_for_wholesale", {...})` on the caller's client (`get_user_supabase`).
- Returns the RPC's `{"status": ...}`. Idempotent — the same endpoint serves both the initial apply
  and a status re-check.
- New Pydantic schema: `WholesaleApplyRequest` (`company_name: str` required, non-empty after trim;
  `tax_registration_id: str` optional) and a response model wrapping `status`.

### 3. Frontend — client component `WholesaleApplyButton`

Replaces the static `<Link href="/login">` in `wholesale.tsx:48-54`. `wholesale.tsx` stays a server
component; the new interactive button is a client component imported into it.

Behavior, driven by `useUserRole()` and `useUserRoleLoaded()`:

| State | Render |
|---|---|
| role not loaded | `<Button disabled>` placeholder (no flash) |
| `null` (guest) | `<Link href="/login">Apply for Wholesale</Link>` (unchanged) |
| `retail` | button opening an apply dialog |
| `wholesale_pending` | button opening a "pending" status dialog |
| `wholesale_approved` | button opening an "approved" confirmation dialog |
| `admin` | button opening an "admin has wholesale" dialog |

The dialog reuses `components/ui/dialog.tsx` (Dialog, DialogContent, DialogHeader, DialogTitle).

**Apply dialog (retail):**
- Fields: Company Name (required, trimmed), Tax Registration ID (optional).
- Submit → `POST /wholesale/apply` with the auth token (mirrors `approvals.tsx` fetch pattern).
- Success → `toast.success`, close dialog, refetch role so the button now reflects `wholesale_pending`.
- Error → message in dialog + `toast.error`.

**Status dialogs (pending/approved/admin):** static confirmation copy, no form.

### 4. Tests

- Backend pytest: new test file for the endpoint:
  - retail apply → returns `applied` (and asserts the RPC is invoked with the caller's payload)
  - approved user re-checks → returns `approved`
  - missing/invalid JWT → 401/403
  - missing company name → 422
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

- The RPC is SECURITY DEFINER; keep the body minimal and validate `auth.uid()` first.
- `updated_at` column must exist on `profiles` (confirmed: `admin_set_profile_role` writes it).
- New router must follow the existing rate-limit + error-handling conventions.
