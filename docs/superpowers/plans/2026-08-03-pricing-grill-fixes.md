# Three-Tier Pricing Hardening — Grill Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the blind spots found in the 2026-08-03 three-tier pricing self-grill: guard `wholesale <= retail` at every layer, enforce TS/Python mirror parity, correct the ADR backfill claim, and remove the low-trust UX frictions (10-lot hint, role-load flash, card approved tier).

**Architecture:** The DB CHECK becomes the last line of defense (`wholesale_price_per_lot <= retail_price_per_lot`, migration 010, NOT VALID → VALIDATE like migration 007/009). Form and CSV validation reject bad config early. Both pricing implementations (Python `pricing.py` and TS `lib/pricing.ts`) get a "never charge above retail" defensive clamp and are locked to a single shared fixture matrix enforced by pytest. Frontend UX frictions are fixed in the cart drawer, checkout page, and product card. Docs (ADR-001, glossary, Structure.txt) are corrected.

**Tech Stack:** Next.js 15 (App Router, TypeScript strict), FastAPI (Python 3.12), Supabase (PostgreSQL), pytest, Node.js (already present, `typescript` already a frontend devDependency — **no new packages**).

## Global Constraints

- Never edit migrations 001–009. New migration must be `010_wholesale_retail_price_guard.sql`.
- Never commit `.env` files. Atomic commits with clear messages.
- RLS stays enabled; `products` stays public-read (no RLS change in this plan).
- The backend is authoritative. **Every change to `backend/app/adapters/pricing.py` MUST be mirrored in `frontend/src/lib/pricing.ts` and vice-versa.** The client mirror is display-only.
- No new dependencies, no new test frameworks, no new top-level folders. `frontend/scripts/` is a subfolder and requires a `docs/Structure.txt` update (done in Task 7).
- All schema changes go in `supabase/migrations/` as numbered SQL files, applied with the same process used for migration 009 (write file + apply to the live DB).
- Backend tests: `.venv/bin/pytest -q` run from `backend/`.
- Frontend verification: `npx tsc --noEmit`, `npm run lint`, `npm run build` run from `frontend/`. **Operational note:** the `bash` tool can freeze in this repo for long frontend commands — run them through an `opencode-pty` PTY session (`pty_spawn`), as done for prior tsc/lint/build runs.

---

### Task 1: Migration 010 — DB guard `wholesale <= retail` + data normalization

**Files:**
- Create: `supabase/migrations/010_wholesale_retail_price_guard.sql`

**Interfaces:**
- Consumes: existing `public.products` schema (retail/wholesale/approved DECIMAL(12,2), `products_prices_check` from migration 007, `products_approved_price_check` from migration 009).
- Produces: `products_wholesale_price_check` constraint (live, validated); the live row `exmple-sku-001` normalized so `wholesale == approved == retail == 1200.00`.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- 010: WHOLESALE PRICE CANNOT EXCEED RETAIL
-- Guards the tier invariant wholesale <= retail so no buyer is
-- ever charged above the retail price at any tier (approved or
-- wholesale). Mirrors products_approved_price_check (approved <=
-- wholesale) from migration 009.
--
-- Data fix first: rows violating the invariant (e.g. seed row
-- 'exmple-sku-001', retail 1200 < wholesale 10500) are normalized
-- to retail so no customer overpays. approved is reset to retail
-- too so the approved <= wholesale CHECK still holds.
--
-- The CHECK is added NOT VALID then VALIDATED (migration-007 style);
-- the UPDATE guarantees every existing row satisfies it.
-- No RLS change needed -- products stay public-read.
-- Never edits applied migrations 001-009.
-- ============================================================

UPDATE public.products
SET wholesale_price_per_lot = retail_price_per_lot,
    approved_price_per_lot = retail_price_per_lot
WHERE wholesale_price_per_lot > retail_price_per_lot
   OR approved_price_per_lot > wholesale_price_per_lot;

ALTER TABLE public.products
    ADD CONSTRAINT products_wholesale_price_check
        CHECK (wholesale_price_per_lot <= retail_price_per_lot)
        NOT VALID;

ALTER TABLE public.products
    VALIDATE CONSTRAINT products_wholesale_price_check;
```

- [ ] **Step 2: Apply the migration to the live DB**

Use the Supabase MCP `apply_migration` with `name="wholesale_retail_price_guard"` and `query` = the exact SQL from Step 1 (keep the committed file identical).

- [ ] **Step 3: Verify data + constraint**

Run (via `supabase_execute_sql`):

```sql
SELECT sku, retail_price_per_lot, wholesale_price_per_lot, approved_price_per_lot
FROM public.products ORDER BY sku;
```

Expected: no row has `wholesale > retail` or `approved > wholesale`; `exmple-sku-001` is `1200.00 / 1200.00 / 1200.00`.

```sql
SELECT convalidated FROM pg_constraint WHERE conname = 'products_wholesale_price_check';
```

Expected: `true`.

- [ ] **Step 4: Run security advisors**

Run `supabase_get_advisors` (security type) to confirm no new RLS warnings introduced by the constraint.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/010_wholesale_retail_price_guard.sql
git commit -m "feat(db): guard wholesale <= retail price (migration 010)"
```

---

### Task 2: CSV validator rejects `wholesale > retail`

**Files:**
- Modify: `backend/app/adapters/row_validator.py` (the price block, lines 19–25)
- Test: `backend/tests/test_adapters_csv.py`

**Interfaces:**
- Consumes: existing `validate_row(row: dict) -> tuple[dict, list[str]]` contract.
- Produces: `validate_row` rejects `wholesale_price_per_lot > retail_price_per_lot` with the error string `"Wholesale price must be <= retail price"`. (Backend rule in `app/adapters/pricing.py` unchanged by this task.)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_adapters_csv.py`:

```python
def test_validate_row_wholesale_above_retail_rejected():
    """Mirror of the products_wholesale_price_check DB CHECK (migration 010)."""
    from app.adapters.row_validator import validate_row

    row = {
        "title": "T",
        "sku": "SKU-1",
        "grade": "Grade_A",
        "retail_price_per_lot": "100.00",
        "wholesale_price_per_lot": "120.00",
        "available_stock_lots": "10",
    }
    _, errs = validate_row(row)
    assert any("wholesale price must be <= retail price" in e.lower() for e in errs)
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_adapters_csv.py::test_validate_row_wholesale_above_retail_rejected -v`
Expected: FAIL — no such error is emitted yet.

- [ ] **Step 3: Implement the validation**

In `backend/app/adapters/row_validator.py`, after the existing retail/wholesale parsing (and before the approved block), add:

```python
    # Migration-010 mirror: wholesale can never exceed retail (mirror of the
    # products_wholesale_price_check DB CHECK). Only enforced when both parsed
    # successfully so we don't double-report the earlier parse errors.
    if retail is not None and wholesale is not None and wholesale > retail:
        errs.append("Wholesale price must be <= retail price")
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `backend/`): `.venv/bin/pytest tests/test_adapters_csv.py::test_validate_row_wholesale_above_retail_rejected -v`
Expected: PASS.

- [ ] **Step 5: Run the full CSV + pricing suites to catch regressions**

Run (from `backend/`): `.venv/bin/pytest tests/test_adapters_csv.py tests/test_adapters_pricing.py tests/test_admin.py -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/adapters/row_validator.py backend/tests/test_adapters_csv.py
git commit -m "feat(backend): reject wholesale > retail in CSV import"
```

---

### Task 3: Backend `resolve_price` never charges above retail

**Files:**
- Modify: `backend/app/adapters/pricing.py` (rewrite `resolve_price`, lines 4–36)
- Test: `backend/tests/test_adapters_pricing.py`

**Interfaces:**
- Consumes: existing `resolve_price(product: dict, quantity: int, role: str, total_lots: int) -> float`; `resolve_all_items` is untouched.
- Produces: `resolve_price` returns `min(price, retail)` in every non-retail branch so stale/misconfigured data can never overcharge. Behavior for valid data (`approved <= wholesale <= retail`) is unchanged — all 148 existing tests keep passing.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_adapters_pricing.py`:

```python
def test_wholesale_above_retail_stale_clamped_to_retail():
    """Defensive: stale payload with wholesale > retail never overcharges."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=120.0, min_wholesale=3)
    price = adapter(product, quantity=5, role="retail", total_lots=10)
    assert price == 100.0


def test_approved_above_retail_stale_clamped_to_retail():
    """approved <= wholesale but wholesale > retail (stale) -> retail, never above."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=120.0, approved=110.0, min_wholesale=3)
    price = adapter(product, quantity=5, role="wholesale_approved", total_lots=5)
    assert price == 100.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`): `.venv/bin/pytest tests/test_adapters_pricing.py::test_wholesale_above_retail_stale_clamped_to_retail tests/test_adapters_pricing.py::test_approved_above_retail_stale_clamped_to_retail -v`
Expected: FAIL — current code returns 120.0 and 110.0.

- [ ] **Step 3: Implement the clamp**

Replace the body of `resolve_price` in `backend/app/adapters/pricing.py` with:

```python
def resolve_price(product: dict, quantity: int, role: str, total_lots: int) -> float:
    """Resolve the unit price for one line item under the three-tier rule.

    Authoritative pricing rule (see docs/superpowers/specs/2026-08-03-three-tier-pricing-design.md).
    Resolved in this order for each line item:
      1. quantity < minimum_wholesale_lots        -> retail_price_per_lot
      2. role == "wholesale_approved" (any size)  -> approved_price_per_lot
      3. total_lots >= 10 (any role, incl. admin) -> wholesale_price_per_lot
      4. otherwise                                -> retail_price_per_lot

    ``approved_price_per_lot`` is NOT NULL in the DB (migration 009), but the
    key may be absent in test fixtures or stale product payloads; in that case
    we defensively fall back to the wholesale price (the documented backfill
    value). Mirrors of the DB CHECKs (products_approved_price_check, migration
    009, and products_wholesale_price_check, migration 010): bad config
    (approved > wholesale or wholesale > retail) is never passed through to the
    customer — we clamp to the retail price rather than overcharge.
    """
    retail = float(product["retail_price_per_lot"])
    wholesale = float(product["wholesale_price_per_lot"])

    if quantity < product["minimum_wholesale_lots"]:
        return retail

    if role == "wholesale_approved":
        approved = product.get("approved_price_per_lot")
        if approved is not None:
            approved_float = float(approved)
            if approved_float <= wholesale:
                return min(approved_float, retail)
        # Key absent (fixtures) or approved > wholesale (config error):
        # fall back to wholesale, still never above retail.
        return min(wholesale, retail)

    if total_lots >= 10:
        return min(wholesale, retail)

    return retail
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `backend/`): `.venv/bin/pytest tests/test_adapters_pricing.py -q`
Expected: all pass, including the two new clamp tests and the existing `test_approved_price_above_wholesale_falls_back_to_wholesale`.

- [ ] **Step 5: Run the full backend suite**

Run (from `backend/`): `.venv/bin/pytest -q`
Expected: 151 passed (149 after Task 2 + 2 new clamp tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/adapters/pricing.py backend/tests/test_adapters_pricing.py
git commit -m "feat(backend): never charge above retail price in pricing"
```

---

### Task 4: Frontend mirror `resolvePrice` never charges above retail

**Files:**
- Modify: `frontend/src/lib/pricing.ts` (rewrite `resolvePrice`, lines 23–54; `resolveTier` unchanged)

**Interfaces:**
- Consumes: `resolvePrice` signature from the existing mirror; must stay in sync with Task 3's `resolve_price`.
- Produces: `resolvePrice(product, quantity, role, totalLots): number` returning `Math.min(price, retail)` in every non-retail branch; `resolveTier` unchanged (returns the label implied by the rule, not the clamped price).

- [ ] **Step 1: Write the failing check**

There is no TS test runner in this repo (no vitest/jest). The failing check ships with Task 6's node parity script, which asserts the clamp inline. For now, replace the body of `resolvePrice`:

```ts
export function resolvePrice(
  product: Pick<
    Product,
    "retail_price_per_lot" | "wholesale_price_per_lot" | "minimum_wholesale_lots" | "approved_price_per_lot"
  >,
  quantity: number,
  role: UserRole | null,
  totalLots: number
): number {
  const retail = Number(product.retail_price_per_lot)
  const wholesale = Number(product.wholesale_price_per_lot)

  if (quantity < product.minimum_wholesale_lots) {
    return retail
  }

  if (role === "wholesale_approved") {
    const approved = product.approved_price_per_lot
    if (approved !== undefined && approved !== null) {
      const approvedFloat = Number(approved)
      // Mirrors of products_approved_price_check and
      // products_wholesale_price_check: never overcharge with bad config.
      if (approvedFloat <= wholesale) {
        return Math.min(approvedFloat, retail)
      }
    }
    return Math.min(wholesale, retail)
  }

  if (totalLots >= 10) {
    return Math.min(wholesale, retail)
  }

  return retail
}
```

- [ ] **Step 2: Verify no regressions in typecheck / lint / build**

Run (from `frontend/`, via PTY): `npx tsc --noEmit` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/pricing.ts
git commit -m "feat(frontend): never display a price above retail in pricing mirror"
```

*(Task 6 adds the automated assertion that the TS clamp matches the fixture; the DB guard from Task 1 and Task 3 are the authoritative enforcement.)*

---

### Task 5: Product form wholesale validation + helper text + CSV template discount example

**Files:**
- Modify: `frontend/src/components/product-form.tsx` (validation block lines 190–219; wholesale field lines 364–367; approved helper line 373–375)
- Modify: `backend/app/adapters/csv_parser.py` (TEMPLATE_ROW, line 19)
- Test: `backend/tests/test_adapters_csv.py` (template assertion line 56)

**Interfaces:**
- Consumes: existing form `handleSubmit` validation and CSV `TEMPLATE_ROW`.
- Produces: form rejects `wholesale > retail` with a clear toast; helper text explains the tiers to the non-technical merchant; CSV template demonstrates a *lower* approved price.

- [ ] **Step 1: Write the failing test (template example change)**

Update the assertion in `backend/tests/test_adapters_csv.py::test_get_template_row` (line 56):

```python
    assert row["approved_price_per_lot"] == "139.99"
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_adapters_csv.py -q`
Expected: FAIL — template still emits `"149.99"`.

- [ ] **Step 3: Implement the CSV template change**

In `backend/app/adapters/csv_parser.py`, change the template row so the example teaches the concept (approved lower than wholesale):

```python
    "approved_price_per_lot": "139.99",
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `backend/`): `.venv/bin/pytest tests/test_adapters_csv.py -q`
Expected: PASS.

- [ ] **Step 5: Implement the form validation**

In `frontend/src/components/product-form.tsx`, after the `wholesalePrice <= 0` check (line 200–204) and before the approved block (line 205), add:

```ts
    // Migration-010 mirror: wholesale can never exceed retail. Reject early so
    // the admin sees a clear message instead of a DB constraint error.
    if (wholesalePrice > price) {
      toast.error("Wholesale price must be less than or equal to the retail price")
      setSaving(false)
      return
    }
```

- [ ] **Step 6: Implement the helper text**

In `product-form.tsx`, under the wholesale Input (after line 366) add a helper paragraph:

```tsx
            <p className="text-xs text-muted-foreground">
              Paid by any customer whose cart reaches 10+ lots.
            </p>
```

Replace the approved helper paragraph (lines 373–375) with:

```tsx
            <p className="text-xs text-muted-foreground">
              Paid by wholesale-approved buyers on any order size (min lots still applies).
              Set it <span className="font-semibold">lower</span> than the wholesale price
              to give approved buyers a deeper discount. Blank defaults to the wholesale price.
            </p>
```

- [ ] **Step 7: Verify frontend**

Run (from `frontend/`, via PTY): `npx tsc --noEmit`, `npm run lint`, then `npm run build`
Expected: all exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/product-form.tsx backend/app/adapters/csv_parser.py backend/tests/test_adapters_csv.py
git commit -m "feat: wholesale<=retail validation and clearer tier help in product form + CSV template"
```

---

### Task 6: TS/Python mirror parity test (single shared fixture)

**Files:**
- Create: `backend/tests/fixtures/pricing_matrix.json`
- Create: `frontend/scripts/pricing-parity.mjs`
- Create: `backend/tests/test_pricing_parity.py`
- Modify: `frontend/eslint.config.mjs` (add `scripts/**` to ignores)

**Interfaces:**
- Consumes: `resolve_price` from Task 3, `resolvePrice`/`resolveTier` from Task 4, the fixture JSON.
- Produces: one fixture matrix that both implementations must satisfy; `pytest` enforces it on the Python side and gates the node script on the TS side. `docs/Structure.txt` gets the `frontend/scripts/` entry in Task 7.

- [ ] **Step 1: Create the shared fixture**

`backend/tests/fixtures/pricing_matrix.json`:

```json
[
  {"name": "retail default", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 70, "minimum_wholesale_lots": 5}, "quantity": 2, "role": "retail", "total_lots": 2, "expected_price": 100, "expected_tier": "RETAIL"},
  {"name": "retail at 10+ lots", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 70, "minimum_wholesale_lots": 1}, "quantity": 10, "role": "retail", "total_lots": 10, "expected_price": 80, "expected_tier": "WHOLESALE"},
  {"name": "pending at 10+ lots", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 70, "minimum_wholesale_lots": 1}, "quantity": 20, "role": "wholesale_pending", "total_lots": 20, "expected_price": 80, "expected_tier": "WHOLESALE"},
  {"name": "admin at 10+ lots", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 70, "minimum_wholesale_lots": 3}, "quantity": 10, "role": "admin", "total_lots": 10, "expected_price": 80, "expected_tier": "WHOLESALE"},
  {"name": "approved below 10 total", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 70, "minimum_wholesale_lots": 3}, "quantity": 5, "role": "wholesale_approved", "total_lots": 5, "expected_price": 70, "expected_tier": "APPROVED"},
  {"name": "approved at 10+ total", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 70, "minimum_wholesale_lots": 3}, "quantity": 10, "role": "wholesale_approved", "total_lots": 10, "expected_price": 70, "expected_tier": "APPROVED"},
  {"name": "approved below per-product min", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 70, "minimum_wholesale_lots": 5}, "quantity": 3, "role": "wholesale_approved", "total_lots": 10, "expected_price": 100, "expected_tier": "RETAIL"},
  {"name": "no role below 10 total", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 70, "minimum_wholesale_lots": 1}, "quantity": 5, "role": "wholesale_pending", "total_lots": 5, "expected_price": 100, "expected_tier": "RETAIL"},
  {"name": "below per-product min at 10+", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 70, "minimum_wholesale_lots": 5}, "quantity": 3, "role": "retail", "total_lots": 10, "expected_price": 100, "expected_tier": "RETAIL"},
  {"name": "approved equals wholesale backfill", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 80, "minimum_wholesale_lots": 3}, "quantity": 5, "role": "wholesale_approved", "total_lots": 5, "expected_price": 80, "expected_tier": "APPROVED"},
  {"name": "approved above wholesale falls back", "product": {"retail_price_per_lot": 100, "wholesale_price_per_lot": 80, "approved_price_per_lot": 90, "minimum_wholesale_lots": 3}, "quantity": 5, "role": "wholesale_approved", "total_lots": 5, "expected_price": 80, "expected_tier": "WHOLESALE"}
]
```

- [ ] **Step 2: Write the failing node script + pytest gate**

`frontend/scripts/pricing-parity.mjs` (uses only existing `typescript` devDependency — no new packages):

```js
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import ts from "typescript"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Transpile the single-file mirror to CommonJS (type imports are erased) and
// load it. SOURCE OF TRUTH: backend/app/adapters/pricing.py.
const src = readFileSync(path.resolve(__dirname, "../src/lib/pricing.ts"), "utf8")
const out = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const mod = { exports: {} }
new Function("module", "exports", "require", out)(mod, mod.exports, require)
const { resolvePrice, resolveTier } = mod.exports

const fixturePath = path.resolve(__dirname, "../../backend/tests/fixtures/pricing_matrix.json")
const cases = JSON.parse(readFileSync(fixturePath, "utf8"))

let failures = 0
const fail = (name, got, want) => {
  failures++
  console.error(`FAIL ${name}: got ${got}, want ${want}`)
}
for (const c of cases) {
  const price = resolvePrice(c.product, c.quantity, c.role, c.total_lots)
  if (price !== c.expected_price) fail(`${c.name} price`, price, c.expected_price)
  const tier = resolveTier(c.product, c.quantity, c.role, c.total_lots)
  if (tier !== c.expected_tier) fail(`${c.name} tier`, tier, c.expected_tier)
}

// Defensive stale-data clamps (mirror of backend pricing.py guards).
const staleWholesale = {
  retail_price_per_lot: 100, wholesale_price_per_lot: 120,
  approved_price_per_lot: 120, minimum_wholesale_lots: 3,
}
const clampW = resolvePrice(staleWholesale, 5, "retail", 10)
if (clampW !== 100) fail("wholesale>retail clamps to retail", clampW, 100)

const staleApproved = {
  retail_price_per_lot: 100, wholesale_price_per_lot: 120,
  approved_price_per_lot: 110, minimum_wholesale_lots: 3,
}
const clampA = resolvePrice(staleApproved, 5, "wholesale_approved", 5)
if (clampA !== 100) fail("approved>retail clamps to retail", clampA, 100)

if (failures) {
  console.error(`${failures} parity failure(s)`)
  process.exit(1)
}
console.log("pricing parity OK")
```

`backend/tests/test_pricing_parity.py`:

```python
import json
import subprocess
from pathlib import Path

import pytest

from app.adapters.pricing import resolve_price

FIXTURES = Path(__file__).parent / "fixtures" / "pricing_matrix.json"
CASES = json.loads(FIXTURES.read_text(encoding="utf-8"))
FRONTEND_ROOT = Path(__file__).parents[2] / "frontend"


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_python_matches_fixture(case):
    price = resolve_price(case["product"], case["quantity"], case["role"], case["total_lots"])
    assert price == case["expected_price"]


def test_ts_mirror_matches_fixture():
    result = subprocess.run(
        ["node", "scripts/pricing-parity.mjs"],
        cwd=FRONTEND_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"TS mirror mismatch:\n{result.stdout}\n{result.stderr}"
```

- [ ] **Step 3: Run to verify the node gate fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_pricing_parity.py::test_ts_mirror_matches_fixture -v`
Expected: FAIL — node cannot resolve `scripts/pricing-parity.mjs` / non-zero exit.

- [ ] **Step 4: Run both sides to verify they pass**

Run (from `backend/`): `.venv/bin/pytest tests/test_pricing_parity.py -q`
Expected: PASS — the 11 Python cases and the node gate.

- [ ] **Step 5: Add `scripts/**` to eslint ignores**

In `frontend/eslint.config.mjs`, add `"scripts/**",` to the `ignores` array (it's a Node script, not app code):

```js
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "scripts/**",
    ],
```

- [ ] **Step 6: Verify frontend lint still passes**

Run (from `frontend/`, via PTY): `npm run lint`
Expected: exit 0.

- [ ] **Step 7: Run the full backend suite**

Run (from `backend/`): `.venv/bin/pytest -q`
Expected: all pass (163 = 151 after Task 3 + 11 parametrized fixture cases + node gate).

- [ ] **Step 8: Commit**

```bash
git add backend/tests/fixtures/pricing_matrix.json backend/tests/test_pricing_parity.py frontend/scripts/pricing-parity.mjs frontend/eslint.config.mjs
git commit -m "test: enforce TS/Python pricing mirror parity against shared fixture"
```

---

### Task 7: Docs — ADR-001 correction, glossary, Structure.txt, merchant briefing

**Files:**
- Modify: `docs/adr/001-hybrid-wholesale-pricing.md` (line 27 backfill claim; add merchant-action note)
- Modify: `docs/glossary.md` (Approved Price row)
- Modify: `docs/Structure.txt` (remove deleted `ui/avatar.tsx` + `ui/table.tsx`; add `lib/pricing.ts`, `frontend/scripts/`, `hooks/useUserRoleLoaded` note)

**Interfaces:**
- Consumes: migration 009/010 behavior, the clamp in pricing.py, `frontend/scripts/` dir, deleted UI files.
- Produces: documentation that matches reality so future agents/merchants are not misled.

- [ ] **Step 1: Correct the ADR-001 backfill claim**

Replace line 27 of `docs/adr/001-hybrid-wholesale-pricing.md`:

```markdown
- Backfill: existing products get `approved_price_per_lot = wholesale_price_per_lot`, so no price changes until the merchant edits them.
```

with:

```markdown
- Backfill (migration 009): existing products got `approved_price_per_lot = wholesale_price_per_lot`. **This DID change pricing for `wholesale_approved` users on orders under 10 lots** — every qualifying line went from retail to wholesale. The merchant must set `approved_price_per_lot` deliberately (lower than wholesale) to control approved-tier margin.
```

- [ ] **Step 2: Add the wholesale<=retail guard + merchant action to the amendment**

Append to the amendment section of the same file:

```markdown
- `wholesale_price_per_lot <= retail_price_per_lot` enforced by DB CHECK (`products_wholesale_price_check`, migration 010) and mirrored in form/CSV validation; the pricing code never charges above retail even for stale data.

**Merchant action required:** after the three-tier rollout, existing `wholesale_approved` customers are now paying wholesale pricing on orders under 10 lots. Review and set `approved_price_per_lot` (below wholesale) to define the approved-tier discount, or keep it equal to wholesale to treat approved buyers like volume buyers.
```

- [ ] **Step 3: Update the glossary**

Replace the **Approved Price** row in `docs/glossary.md` (line 13):

```markdown
| **Approved Price** | Per-product price (`approved_price_per_lot`) paid by `wholesale_approved` users on any order size (subject to per-product minimums). Must be ≤ the wholesale price, which must be ≤ the retail price. Set it lower than wholesale to give approved buyers a real discount — the default equals wholesale, so no discount until the merchant edits it. |
```

- [ ] **Step 4: Update Structure.txt**

In `docs/Structure.txt`:
- Remove the deleted files from the `components/ui/` list: `avatar.tsx` (line 37) and `table.tsx` (line 48).
- Add the mirror to `lib/` (after line 68 `utils.ts`):

```
│   │   │   ├── pricing.ts                  # Client mirror of backend pricing rule (ADR-001)
```

- Add the parity script under `frontend/` (after line 5 `public/`):

```
│   ├── scripts/                           # Dev/verification scripts
│   │   └── pricing-parity.mjs             # Node check of lib/pricing.ts vs shared fixture
```

- [ ] **Step 5: Verify nothing else references the deleted files**

Run (from repo root): `rg "avatar.tsx|table.tsx" frontend/src docs/Structure.txt`
Expected: no matches (both were already confirmed unused/removed).

- [ ] **Step 6: Commit**

```bash
git add docs/adr/001-hybrid-wholesale-pricing.md docs/glossary.md docs/Structure.txt
git commit -m "docs: correct ADR-001 backfill claim, add wholesale<=retail guard, fix Structure.txt"
```

---

### Task 8: Cart drawer 10-lot wholesale progress hint

**Files:**
- Modify: `frontend/src/components/cart-drawer.tsx` (footer block, lines 140–150)

**Interfaces:**
- Consumes: `totalLots()` from `useCart`, `role` from `useUserRole`.
- Produces: a visible "X/10 lots + N to unlock wholesale" hint with a progress bar for any non-approved shopper under 10 lots. Display-only.

- [ ] **Step 1: Implement the hint**

In `cart-drawer.tsx`, after the "Total lots" row and before the "Subtotal" row, add:

```tsx
            {role !== "wholesale_approved" && totalLotsCount < 10 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Wholesale pricing</span>
                  <span>{totalLotsCount}/10 lots</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.min(100, (totalLotsCount / 10) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Add {10 - totalLotsCount} more lots to unlock wholesale pricing.
                </p>
              </div>
            )}
```

- [ ] **Step 2: Verify frontend**

Run (from `frontend/`, via PTY): `npx tsc --noEmit`, `npm run lint`, `npm run build`
Expected: all exit 0.

- [ ] **Step 3: Manual QA**

Open the storefront, add < 10 lots to the cart, open the cart drawer → the hint + progress bar appear and count down as lots are added. Confirm it disappears at 10 lots.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cart-drawer.tsx
git commit -m "feat(frontend): show 10-lot wholesale unlock progress in cart drawer"
```

---

### Task 9: Kill the role-load price flash (cart drawer + checkout page)

**Files:**
- Modify: `frontend/src/hooks/useUserRole.ts` (add `useUserRoleLoaded` export)
- Modify: `frontend/src/components/cart-drawer.tsx` (gate per-lot price + subtotal)
- Modify: `frontend/src/app/checkout/checkout-page.tsx` (gate per-line + summary)

**Interfaces:**
- Consumes: existing `useUserRoleStore` (has `loaded` flag, line 17).
- Produces: `useUserRoleLoaded(): boolean` reading `useUserRoleStore((s) => s.loaded)`. Until `loaded` is true, cart/checkout render a "Checking pricing…" placeholder instead of flashing retail→approved. The product detail page is NOT touched (its role comes from the server, `products/[id]/page.tsx:39-55`, so it has no client-side flash).

- [ ] **Step 1: Add the hook export**

Append to `frontend/src/hooks/useUserRole.ts`:

```ts
export function useUserRoleLoaded(): boolean {
  return useUserRoleStore((s) => s.loaded)
}
```

- [ ] **Step 2: Gate the cart drawer**

In `frontend/src/components/cart-drawer.tsx`:
- Change the import to `import { useUserRole, useUserRoleLoaded } from "@/hooks/useUserRole"`.
- After `const role = useUserRole()` add `const roleLoaded = useUserRoleLoaded()`.
- Replace the per-lot price paragraph (lines 87–89) with:

```tsx
                  {roleLoaded ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      {tier} &mdash; {currencyFormat.format(price)} / lot
                    </p>
                  ) : (
                    <p className="font-mono text-xs text-muted-foreground animate-pulse">
                      Checking pricing&hellip;
                    </p>
                  )}
```

- Replace the subtotal value (line 149) with:

```tsx
              <span className="font-mono">{roleLoaded ? currencyFormat.format(cartSubtotal) : "\u2026"}</span>
```

- [ ] **Step 3: Gate the checkout page**

In `frontend/src/app/checkout/checkout-page.tsx`:
- Change the import to `import { useUserRole, useUserRoleLoaded } from "@/hooks/useUserRole"`.
- After `const role = useUserRole()` add `const roleLoaded = useUserRoleLoaded()`.
- Replace the per-lot tier paragraph (lines 98–100) with the same gated `{roleLoaded ? (...) : (...)}` block as Task 9 Step 2.
- Replace the per-line total (line 107) with:

```tsx
                <p className="font-mono font-semibold text-foreground">
                  {roleLoaded ? currencyFormat.format(price * item.quantity) : "\u2026"}
                </p>
```

- Gate the summary tier (line 124) and total (line 130):

```tsx
            <span className="font-mono font-medium text-foreground">
              {roleLoaded ? summaryTier : "\u2026"}
            </span>
```

```tsx
            <span className="font-mono">
              {roleLoaded ? currencyFormat.format(totalAmount) : "\u2026"}
            </span>
```

- [ ] **Step 4: Verify frontend**

Run (from `frontend/`, via PTY): `npx tsc --noEmit`, `npm run lint`, `npm run build`
Expected: all exit 0.

- [ ] **Step 5: Manual QA**

As a signed-in `wholesale_approved` user on a slow connection: cart drawer and checkout page show "Checking pricing…" (no retail flash), then resolve to the approved tier. As a signed-out visitor: resolves to retail.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useUserRole.ts frontend/src/components/cart-drawer.tsx frontend/src/app/checkout/checkout-page.tsx
git commit -m "feat(frontend): hide tier prices until user role resolves"
```

---

### Task 10: Product card — approved tier for approved users + "10+ lots" wholesale label

**Files:**
- Modify: `frontend/src/components/product-card.tsx` (imports + second price row, lines 1–8 and 90–100)

**Interfaces:**
- Consumes: `useUserRole`, `product.approved_price_per_lot` (NOT NULL post-migration 009).
- Produces: for `wholesale_approved` shoppers the card's second row shows **Approved** + approved price; everyone else keeps **Wholesale** + wholesale price with a `· 10+ lots` hint. Amends spec decision "product cards unchanged" — cards stay two rows, only the second row's label/price become role-aware.

- [ ] **Step 1: Implement the role-aware second row**

In `frontend/src/components/product-card.tsx`:
- Add to the import from `@/hooks/useCart` line area:

```tsx
import { useUserRole } from "@/hooks/useUserRole"
```

- After `const addItem = useCart((s) => s.addItem)` add:

```tsx
  const role = useUserRole()
  const isApprovedShopper = role === "wholesale_approved"
  const secondLabel = isApprovedShopper ? "Approved" : "Wholesale"
  const secondPrice = isApprovedShopper
    ? Number(product.approved_price_per_lot)
    : Number(product.wholesale_price_per_lot)
```

- Replace the second price row (lines 90–100) with:

```tsx
            <div className="flex items-baseline justify-between gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">
                {secondLabel}
                {product.minimum_wholesale_lots > 1 && (
                  <span className="ml-1 text-[10px]">/{product.minimum_wholesale_lots}</span>
                )}
                {!isApprovedShopper && (
                  <span className="ml-1 text-[10px]">· 10+ lots</span>
                )}
              </span>
              <span className="min-w-0 text-right font-mono text-sm font-medium text-primary">
                {currencyFormat.format(secondPrice)}
              </span>
            </div>
```

- [ ] **Step 2: Verify frontend**

Run (from `frontend/`, via PTY): `npx tsc --noEmit`, `npm run lint`, `npm run build`
Expected: all exit 0.

- [ ] **Step 3: Manual QA**

Signed-in `wholesale_approved` user sees "Approved" + approved price on catalog cards; a retail shopper sees "Wholesale · 10+ lots".

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/product-card.tsx
git commit -m "feat(frontend): show approved tier on product cards and 10+ lots hint on wholesale"
```

---

## Self-Review

**Spec coverage (grill findings → tasks):**
- HIGH wholesale>retail overcharge path → Task 1 (DB CHECK + data fix), Task 2 (CSV), Task 5 (form), Tasks 3+4 (clamp) ✓
- HIGH "backfill safety = no price changes" is wrong for approved users < 10 lots → Task 7 (ADR correction + merchant action) ✓
- MEDIUM mirror drift with no enforcement → Task 6 (shared fixture + node gate) ✓
- MEDIUM merchant confusion (approved vs wholesale; all products approved==wholesale; CSV template equality) → Task 5 (helper text, CSV example), Task 7 (glossary/ADR) ✓
- LOW card-vs-cart price flip with no 10-lot hint → Task 8 (cart progress) + Task 10 (card "· 10+ lots" label) ✓
- LOW role-load price flash → Task 9 ✓
- LOW approved tier absent from cards → Task 10 ✓
- Out of scope by design: float-vs-decimal money, stale localStorage cart prices, `resolve_all_items` silently skipping unknown ids — documented in the grill, not in this plan.

**Placeholder scan:** every code step contains the exact content; no "TBD"/"similar to Task N". Verification commands are explicit per task.

**Type consistency:** `useUserRoleLoaded` (Task 9) matches the store's `loaded` flag (line 17). Fixture product keys (`retail_price_per_lot`, `wholesale_price_per_lot`, `approved_price_per_lot`, `minimum_wholesale_lots`) match `resolve_price` (Task 3) and `resolvePrice` (Task 4). `scripts/pricing-parity.mjs` is referenced identically in Task 6's pytest and eslint ignore. Constraint name `products_wholesale_price_check` is consistent across Tasks 1, 2, 3, and 7.
