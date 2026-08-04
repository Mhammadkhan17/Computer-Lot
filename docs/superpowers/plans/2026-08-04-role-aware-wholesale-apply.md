# Role-Aware "Apply for Wholesale" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Apply for Wholesale" button role-aware: guests go to login, retail users get a working apply dialog, and pending/approved/admin users get status dialogs instead of being bounced to login.

**Architecture:** A new SECURITY DEFINER RPC `apply_for_wholesale` (migration 011) sets `retail → wholesale_pending` atomically and idempotently reports status. A new FastAPI route `POST /wholesale/apply` validates the JWT, calls the RPC, and maps status → HTTP. A new client component `WholesaleApplyButton` replaces the static `<Link href="/login">` in the server component `wholesale.tsx`.

**Tech Stack:** PostgreSQL (Supabase), Python 3.12 FastAPI + Pydantic v2, TypeScript Next.js 15 (App Router), Zustand, Tailwind + Shadcn/ui.

## Global Constraints

- Migration 011 must be **applied to the live Supabase project via MCP `apply_migration`** (name `apply_for_wholesale`) after committing the file — never just committed to the repo (see Task 1).
- Migration 011 must set `SET search_path = public` (mandatory for SECURITY DEFINER, matches `004_security_hardening.sql:160`).
- EXECUTE grants: REVOKE from anon/public, GRANT to authenticated only.
- Backend `profiles.role` is not API-writable; role changes only via SECURITY DEFINER RPC.
- Pydantic length caps: `company_name` ≤ 255, `tax_registration_id` ≤ 100 (match `001_initial_schema.sql:16-17`).
- No new dependencies. No changes to migrations 001–010. No RLS policy changes.
- TypeScript strict mode; no `any`. Frontend client components marked `"use client"`.
- Do NOT commit `.env` files. Test commands: `backend/` → `.venv/bin/pytest`; `frontend/` → `npx tsc --noEmit`, `npm run lint`, `npm run build` (long frontend commands must run via a PTY session if the bash tool freezes).

---
### Task 1: Migration 011 — `apply_for_wholesale` RPC

**Files:**
- Create: `supabase/migrations/011_apply_for_wholesale.sql`

**Interfaces:**
- Produces: RPC `public.apply_for_wholesale(p_company_name VARCHAR, p_tax_id VARCHAR) RETURNS jsonb` returning `{"status": "applied" | "pending" | "approved" | "admin" | "error"}`. Callable by `authenticated` only.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/011_apply_for_wholesale.sql` with exactly this content:

```sql
-- 011: SELF-SERVE WHOLESALE APPLICATION
-- ============================================================
-- Lets an authenticated retail user apply for wholesale in one
-- step: role retail -> wholesale_pending, recording company/tax info.
-- SECURITY DEFINER because profiles.role is not API-writable and
-- admin_set_profile_role is admin-guarded (004_security_hardening).
-- search_path is pinned to public (hardening requirement, matches
-- every existing SECURITY DEFINER function). Idempotent: pending,
-- approved, and admin callers get their status back with no write.
-- The admin branch is a safety guard so an admin is NEVER downgraded.

CREATE OR REPLACE FUNCTION public.apply_for_wholesale(
    p_company_name VARCHAR,
    p_tax_id VARCHAR
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_company_name VARCHAR(255);
    v_tax_id VARCHAR(100);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    v_company_name := NULLIF(TRIM(p_company_name), '');
    IF v_company_name IS NULL THEN
        RETURN jsonb_build_object('status', 'error');
    END IF;
    v_tax_id := NULLIF(TRIM(p_tax_id), '');

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;

    IF v_role IS NULL THEN
        RETURN jsonb_build_object('status', 'error');
    END IF;

    IF v_role = 'retail' THEN
        UPDATE public.profiles
        SET role = 'wholesale_pending',
            company_name = v_company_name,
            tax_registration_id = v_tax_id,
            updated_at = NOW()
        WHERE id = v_user_id;
        RETURN jsonb_build_object('status', 'applied');
    ELSIF v_role = 'wholesale_pending' THEN
        RETURN jsonb_build_object('status', 'pending');
    ELSIF v_role = 'wholesale_approved' THEN
        RETURN jsonb_build_object('status', 'approved');
    ELSIF v_role = 'admin' THEN
        RETURN jsonb_build_object('status', 'admin');
    ELSE
        RETURN jsonb_build_object('status', 'error');
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_for_wholesale(VARCHAR, VARCHAR) FROM public;
REVOKE EXECUTE ON FUNCTION public.apply_for_wholesale(VARCHAR, VARCHAR) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_for_wholesale(VARCHAR, VARCHAR) TO authenticated;
```

- [ ] **Step 2: Commit the migration file**

```bash
git add supabase/migrations/011_apply_for_wholesale.sql
git commit -m "feat(db): add apply_for_wholesale RPC (migration 011)"
```

- [ ] **Step 3: Apply migration 011 to the live Supabase project via MCP**

Call the Supabase MCP tool `apply_migration` with:
- name: `apply_for_wholesale`
- query: the exact SQL from Step 1

Verify it succeeds (migration applied). If it fails, stop and report — do not proceed.

- [ ] **Step 4: Verify the RPC exists live**

Call the Supabase MCP tool `execute_sql` with:

```sql
SELECT proname, proowner::regrole, proacl
FROM pg_proc
WHERE proname = 'apply_for_wholesale';
```

Expected: one row; `proacl` shows EXECUTE granted to `authenticated` and not to `anon`/`public`. Also confirm the function has `search_path` pinned by checking `proconfig`:

```sql
SELECT proname, proconfig FROM pg_proc WHERE proname = 'apply_for_wholesale';
```

Expected: `proconfig` contains `{search_path=public}`.

- [ ] **Step 5: Update `docs/Structure.txt` migrations section**

Edit `docs/Structure.txt` line 144 (the `010_wholesale_retail_price_guard.sql` line): change the `└──` to `├──` and append a new line:

```
│   │   ├── 010_wholesale_retail_price_guard.sql  # wholesale<=retail CHECK + backfill
│   │   └── 011_apply_for_wholesale.sql           # Self-serve wholesale apply RPC
```

Commit with `git commit -m "docs: list migration 011 in Structure.txt"`.

---

### Task 2: Backend — schema + `POST /wholesale/apply` route (TDD)

**Files:**
- Create: `backend/app/schemas/wholesale.py`
- Create: `backend/app/routes/wholesale.py`
- Modify: `backend/app/main.py:13-15,43-45` (import + register router)
- Test: `backend/tests/test_wholesale_apply.py`

**Interfaces:**
- Consumes: RPC `apply_for_wholesale(p_company_name VARCHAR, p_tax_id VARCHAR)` (Task 1); `get_current_user`, `get_user_supabase` (existing); `limiter` (existing).
- Produces: `WholesaleApplyRequest` (`company_name: str`, `tax_registration_id: str | None`); `WholesaleApplyResponse` (`status: str`); route `POST /wholesale/apply` → HTTP 200 for applied/pending/approved/admin, 400 for error, 401/403 for auth failure, 422 for schema failure.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_wholesale_apply.py` with exactly this content (mirrors the mocking pattern in `tests/test_admin.py`):

```python
import jwt
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

from app.main import app
from app.config import settings
from app.database import get_user_supabase


def _make_token(payload_override: dict | None = None) -> str:
    payload = {
        "sub": "retail-user",
        "role": "authenticated",
        "aud": "authenticated",
        "iss": settings.supabase_url,
        "exp": 9999999999,
        **(payload_override or {}),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


AUTH_HEADER = {"Authorization": f"Bearer {_make_token()}"}

mock_supabase: MagicMock | None = None
rpc_status: dict[str, str] = {}


@pytest.fixture(autouse=True)
def override_deps():
    global mock_supabase
    mock_supabase = MagicMock()
    rpc_status["result"] = "applied"

    def rpc_side(function_name, params):
        r = MagicMock()
        if function_name == "apply_for_wholesale":
            r.execute.return_value.data = {"status": rpc_status["result"]}
        return r

    mock_supabase.rpc.side_effect = rpc_side
    app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
    yield
    app.dependency_overrides.clear()


class TestWholesaleApply:
    def test_retail_apply_returns_applied(self):
        rpc_status["result"] = "applied"
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "Acme Trading", "tax_registration_id": "TAX-123"},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "applied"
        assert mock_supabase.rpc.called
        fn, params = mock_supabase.rpc.call_args.args
        assert fn == "apply_for_wholesale"
        assert params["p_company_name"] == "Acme Trading"
        assert params["p_tax_id"] == "TAX-123"

    def test_approved_user_rechecks_returns_approved(self):
        rpc_status["result"] = "approved"
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "Acme Trading"},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

    def test_rpc_error_returns_400(self):
        rpc_status["result"] = "error"
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "Acme Trading"},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 400

    def test_missing_auth_returns_401(self):
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "Acme Trading"},
        )
        assert resp.status_code == 401

    def test_missing_company_name_returns_422(self):
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 422

    def test_blank_company_name_returns_422(self):
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "   "},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 422

    def test_company_name_too_long_returns_422(self):
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "A" * 256},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 422

    def test_tax_id_too_long_returns_422(self):
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "Acme", "tax_registration_id": "T" * 101},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_wholesale_apply.py -v`
Expected: FAIL (module import error — `app.routes.wholesale` does not exist).

- [ ] **Step 3: Create the schema**

Create `backend/app/schemas/wholesale.py`:

```python
from pydantic import BaseModel, Field, field_validator


class WholesaleApplyRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    tax_registration_id: str | None = Field(default=None, max_length=100)

    @field_validator("company_name")
    @classmethod
    def company_name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Company name is required")
        return v

    @field_validator("tax_registration_id")
    @classmethod
    def tax_id_trim(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None


class WholesaleApplyResponse(BaseModel):
    status: str
```

- [ ] **Step 4: Create the route**

Create `backend/app/routes/wholesale.py`:

```python
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from supabase import Client

from app.database import get_user_supabase
from app.rate_limit import limiter
from app.schemas.wholesale import WholesaleApplyRequest, WholesaleApplyResponse
from app.utils.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/wholesale", tags=["wholesale"])

_OK_STATUSES = {"applied", "pending", "approved", "admin"}


@router.post("/apply", response_model=WholesaleApplyResponse)
@limiter.limit("10/minute")
async def apply_for_wholesale(
    request: Request,
    body: WholesaleApplyRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase),
):
    resp = supabase.rpc(
        "apply_for_wholesale",
        {"p_company_name": body.company_name, "p_tax_id": body.tax_registration_id or ""},
    ).execute()
    data = resp.data
    if not data or data.get("status") not in _OK_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to apply for wholesale",
        )
    return WholesaleApplyResponse(status=data["status"])
```

- [ ] **Step 5: Register the router in main.py**

Edit `backend/app/main.py`:
- After line 13 (`from app.routes.admin import router as admin_router`), add:

```python
from app.routes.wholesale import router as wholesale_router
```

- After line 44 (`app.include_router(admin_router)`), add:

```python
app.include_router(wholesale_router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_wholesale_apply.py -v`
Expected: 8 PASSED.

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && .venv/bin/pytest`
Expected: all pass (previous 164 + 8 new = 172).

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/wholesale.py backend/app/routes/wholesale.py backend/app/main.py backend/tests/test_wholesale_apply.py
git commit -m "feat(backend): add self-serve POST /wholesale/apply endpoint"
```

---

### Task 3: Frontend — `WholesaleApplyButton` component + wiring

**Files:**
- Create: `frontend/src/components/sections/wholesale-apply-button.tsx`
- Modify: `frontend/src/components/sections/wholesale.tsx:47-61` (replace the Link with the client button)
- Test: none (verified via tsc/lint/build)

**Interfaces:**
- Consumes: `useUserRole()`, `useUserRoleLoaded()`, `useUserRoleStore` from `@/hooks/useUserRole` (all exist); `Button`, `Input` from `@/components/ui`; `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `@/components/ui/dialog`; `toast` from `sonner` (already a dependency); `createClient` from `@/utils/supabase/client`; `POST /wholesale/apply` (Task 2).
- Produces: `WholesaleApplyButton` — renders per-role (guest → Link to /login; retail → apply dialog; pending/approved/admin → status dialog).

- [ ] **Step 1: Create the client component**

Create `frontend/src/components/sections/wholesale-apply-button.tsx` with exactly this content:

```tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/utils/supabase/client"
import { useUserRole, useUserRoleLoaded, useUserRoleStore } from "@/hooks/useUserRole"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const BASE_BUTTON_CLASS =
  "inline-flex items-center gap-2 bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/90"

export function WholesaleApplyButton() {
  const role = useUserRole()
  const roleLoaded = useUserRoleLoaded()

  const [open, setOpen] = useState(false)
  const [companyName, setCompanyName] = useState("")
  const [taxId, setTaxId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!roleLoaded) {
    return (
      <Button disabled className={BASE_BUTTON_CLASS}>
        Apply for Wholesale
        <ArrowRight className="h-4 w-4" />
      </Button>
    )
  }

  if (role === null) {
    return (
      <Link href="/login" className={BASE_BUTTON_CLASS}>
        Apply for Wholesale
        <ArrowRight className="h-4 w-4" />
      </Link>
    )
  }

  const openDialog = () => {
    setError(null)
    setOpen(true)
  }

  const closeDialog = () => {
    setOpen(false)
    setCompanyName("")
    setTaxId("")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setError("Not authenticated")
        return
      }
      const res = await fetch(`${API_URL}/wholesale/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          tax_registration_id: taxId.trim() || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.detail || "Application failed")
      }
      toast.success("Wholesale application submitted for review")
      closeDialog()
      useUserRoleStore.getState().fetchRole()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Application failed"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const statusCopy: Record<string, { title: string; body: string }> = {
    wholesale_pending: {
      title: "Application Under Review",
      body: "Your wholesale application is being reviewed. You'll be notified when it's approved.",
    },
    wholesale_approved: {
      title: "You're Already Approved",
      body: "Wholesale pricing is active on your account — no application needed.",
    },
    admin: {
      title: "Admin Account",
      body: "Admin accounts follow the standard pricing rules: wholesale pricing applies automatically at 10+ lots.",
    },
  }

  return (
    <>
      <button type="button" onClick={openDialog} className={BASE_BUTTON_CLASS}>
        Apply for Wholesale
        <ArrowRight className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {role === "retail" ? "Apply for Wholesale" : statusCopy[role]?.title ?? "Wholesale"}
            </DialogTitle>
          </DialogHeader>

          {role === "retail" ? (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <div className="space-y-2">
                <label htmlFor="wholesale-company" className="text-sm font-medium text-foreground">
                  Company Name <span className="text-muted-foreground">(required)</span>
                </label>
                <Input
                  id="wholesale-company"
                  type="text"
                  placeholder="Your company name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  maxLength={255}
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="wholesale-tax-id" className="text-sm font-medium text-foreground">
                  Tax Registration ID <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="wholesale-tax-id"
                  type="text"
                  placeholder="Tax ID or VAT number"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  maxLength={100}
                  autoComplete="off"
                />
              </div>
              <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting\u2026
                  </span>
                ) : (
                  "Submit Application"
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {statusCopy[role] && (
                <p className="text-sm text-muted-foreground">{statusCopy[role].body}</p>
              )}
              <Button variant="outline" className="w-full" onClick={closeDialog}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Wire it into the server component**

Edit `frontend/src/components/sections/wholesale.tsx`:

Replace the import block (lines 1-2) with:

```tsx
import { ArrowRight, PackageCheck } from "lucide-react"
import { WholesaleApplyButton } from "@/components/sections/wholesale-apply-button"
```

(Remove the now-unused `import Link from "next/link"`.)

Replace the `<Link href="/login" ...>Apply for Wholesale...` block (lines 48-54) with:

```tsx
<WholesaleApplyButton />
```

- [ ] **Step 3: Verify with tsc, lint, build**

Run from `frontend/` (use a PTY session if the bash tool freezes — `pty_spawn` with `npx tsc --noEmit`, read output, confirm exit 0):
- `npx tsc --noEmit` → exit 0
- `npm run lint` → exit 0
- `npm run build` → exit 0

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/sections/wholesale-apply-button.tsx frontend/src/components/sections/wholesale.tsx
git commit -m "feat(frontend): role-aware wholesale apply button with status dialogs"
```

---

### Task 4: Docs — Structure.txt sync + final verification

**Files:**
- Modify: `docs/Structure.txt` (backend schemas/routes/tests sections)

**Interfaces:**
- Consumes: files created in Tasks 1–3.
- Produces: accurate Structure.txt.

- [ ] **Step 1: Update backend schemas section**

Edit `docs/Structure.txt` line 98 (the `product.py` line): change `└──` to `├──` and append:

```
│   │   │   └── wholesale.py                  # Wholesale apply request/response
```

- [ ] **Step 2: Update backend routes section**

Edit `docs/Structure.txt` line 115 (the `ws.py` line): change `└──` to `├──` and append:

```
│   │   │   └── wholesale.py                  # POST /wholesale/apply (self-serve apply)
```

- [ ] **Step 3: Update frontend sections section**

Edit `docs/Structure.txt` line 53 (the `wholesale.tsx` line): change `└──` to `├──` and append:

```
│   │   │   └── wholesale-apply-button.tsx    # Role-aware wholesale apply button
```

- [ ] **Step 4: Verify Structure.txt tree integrity**

Read `docs/Structure.txt` and confirm:
- Exactly one `└──` per directory block (the last entry of each).
- Migrations list ends with `011_apply_for_wholesale.sql` (from Task 1 Step 5).
- No duplicated entries.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && .venv/bin/pytest`
Expected: all pass (172).

- [ ] **Step 6: Run the frontend verification**

Run from `frontend/` (PTY if needed): `npx tsc --noEmit`, `npm run lint`, `npm run build` — all exit 0.

- [ ] **Step 7: Commit**

```bash
git add docs/Structure.txt
git commit -m "docs: sync Structure.txt with wholesale apply endpoint and button"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-04-role-aware-wholesale-apply-design.md` maps to a task — migration+live apply (Task 1), route+schema+status mapping (Task 2), button+dialogs+guest link (Task 3), docs+verification (Task 4). Grill fixes are embedded: `search_path` (T1), DB-level company validation + no-profile-row → error (T1), admin safety guard + correct copy (T1/T3), Pydantic length caps (T2), HTTP mapping + mocked test pattern (T2), live apply via MCP (T1), re-apply-after-rejection works by construction (T1 role check), `useUserRoleLoaded` reuse + layout-stable disabled placeholder (T3).
- **Verification plan:** Task 2 asserts the full suite grows to exactly 172 (164 + 8). If it differs, reconcile before committing.
