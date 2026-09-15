# Computer-Lot — Hybrid Computer Lot Liquidation Platform

![GitHub Stars](https://img.shields.io/github/stars/Mhammadkhan17/Computer-Lot)
![GitHub Issues](https://img.shields.io/github/issues/Mhammadkhan17/Computer-Lot)
![Next.js](https://img.shields.io/badge/Next.js%2015.5-App%20Router-black?logo=nextdotjs)
![FastAPI](https://img.shields.io/badge/FastAPI-0.141-009485?logo=fastapi)
![Supabase](https://img.shields.io/badge/Supabase-Database%20%2B%20Auth-3ECF85?logo=supabase)

**Version:** 2.0 · **Last Updated:** 2026-08-04 UTC

A B2C + B2B hybrid liquidation platform for trading computer lots (CPUs, GPUs,
motherboards, etc.) in fixed-size **lots**. Buyers pay $0 at checkout — orders
are fulfilled over **WhatsApp Business** with a generated deep link, so small
operators can run the whole flow with no payment-gateway fees or PCI burden.

> Docs live in [`docs/`](./docs/).
> The full interactive flow is in [`docs/Flowchart.txt`](./docs/Flowchart.txt).

---

## TL;DR — One-liner setup

```bash
# frontend + backend in parallel
npm install                  # root: supabase CLI
cd frontend && npm install && cp .env.example .env.local && npm run dev      # :3000
cd ../backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --reload                # :8000  — apply Supabase migrations + seed first
```

---

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 15.5.22 |
| Frontend language | TypeScript (strict) | 5.7 |
| Styling | Tailwind CSS + Shadcn/ui | v4 |
| UI primitives | Radix, Base UI, lucide-react, sonner, recharts | latest |
| Frontend state | Zustand (`persist` middleware → cart) | 5.0 |
| Auth / DB / storage | Supabase JS (@supabase/ssr) | 2.49 |
| Backend | FastAPI + Pydantic v2 | 0.141 / 2.x |
| Backend language | Python | 3.12+ |
| DB | Supabase Postgres | — |
| Backend client | supabase-py / psycopg2 | 2.31 / 2.9.12 |
| Rate limiting | SlowAPI | 0.1.10 |
| Tests | pytest, pytest-asyncio, Playwright | 8.3.4 |

**Design rule (ADR-003):** *Server Components* for all reads, *FastAPI* for all writes.

---

## Getting Started

### Prerequisites
- Node.js 20+ / npm
- Python 3.12+ + `venv`
- A Supabase project (Postgres + Auth + Storage)
- (Optional) Supabase CLI for local DB work

### 1. Clone & install tooling
```bash
git clone https://github.com/Mhammadkhan17/Computer-Lot.git
cd Computer-Lot
npm install
```

### 2. Configure environment
Two copies, one per runtime:

```bash
# Frontend
cp frontend/.env.example frontend/.env.local

# Backend
cp backend/.env.example backend/.env        # then edit with your Supabase + merchant values
```

**Frontend `frontend/.env.local`** (from `frontend/.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — project API
- `NEXT_PUBLIC_API_URL=http://localhost:8000` — FastAPI base URL
- `NEXT_PUBLIC_MERCHANT_PHONE=1234567890` — WhatsApp merchant number (no `+`)

**Backend `backend/.env`** (from `backend/.env.example`):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` — to verify buyer JWTs at checkout
- `SUPABASE_DB_HOST/NAME/USER/PASSWORD/PORT` — direct Postgres (for RPCs/seed)
- `MERCHANT_PHONE`, `CORS_ORIGINS=http://localhost:3000`, `FRONTEND_URL`
- `DEBUG=false`

### 3. Supabase — migrations & seed
```bash
# Option A: Supabase CLI against your project
supabase db push          # applies every file in supabase/migrations/

# Option B: apply via the dashboard SQL editor, in numeric order:
#   001_initial_schema.sql … 012_wholesale_apply_grants.sql
# then load supabase/seed.sql for reference data.

# Seed 10 mock products (requires working Supabase credentials above):
cd backend && . .venv/bin/activate && python seed.py
```

Migrations live in [`supabase/migrations/`](./supabase/migrations) (12 files,
`001_initial_schema` → `012_wholesale_apply_grants`). RLS policies are authored
in [`supabase/policies.sql`](./supabase/policies.sql).

### 4. Frontend (dev)
```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

### 5. Backend (dev)
```bash
cd backend
python -m venv .venv
. .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000
```

### 6. Verify pricing parity
The same pricing rules are implemented in both Zustand (frontend) and FastAPI
(backend). A guard script confirms they agree:

```bash
cd frontend && npm test       # runs scripts/pricing-parity.mjs against backend fixtures
```

---

## Architecture

```
                  ┌────────────────────────────────────────────────┐
Buyer ──────────► │ Frontend  Next.js 15 App Router                │
(browse lots)    │  - Server Components for reads                 │
                  │  - Zustand (persist) shopping cart           │
                  │  - Supabase anon client (RLS-enforced)       │
                  └──┬──────────────────┬─────────────────────────┘
                     │ 2. checkout      │ (JWT + cart)
                     ▼                  ▼
              ┌──────────────────┐  reads: catalog/recipts/orders
              │ FastAPI backend  │  (Server Components + anon RLS)
              │  /checkout       │  writes: service_role RPC only
              │  /admin          │
              │  /wholesale/*    │
              │  /ws             │
              └──┬────────────────┘
                 │ writes via RPC
                 ▼   (service_role, /checkout only — ADR-009)
          ┌──────────────────────────────────────────────────┐
          │ Supabase Postgres  (RLS mandatory on all tables) │
          │  - decrement_stock_inventory()  ◀ ATOMIC STOCK   │
          │  - increment_stock_inventory()  ◀ restock on canc│
          │  - apply_for_wholesale()         ◀ self-service   │
          └──────────────────────────────────────────────────┘
                 │
                 ▼  order data
          WhatsApp Business deep link  (https://wa.me/<phone>?text=…)
```

### Key constraints (do not violate)
1. **Atomic stock decrement** — all order writes go through the
   `decrement_stock_inventory(row_id UUID, steps INT)` PostgreSQL function via
   RPC. Never `UPDATE ... stock` from app code. (ADR-002 / ADR-007)
2. **All-or-nothing checkout** — the `/checkout` transaction inserts the order +
   items + decrements stock in one PostgreSQL transaction; any stock failure
   rolls everything back. (ADR-002)
3. **Zero-fee WhatsApp fulfillment** — orders never hit a payment gateway; the
   buyer is handed a WhatsApp deep link to complete fulfillment. (ADR-005)
4. **service_role is restricted** — the Supabase service key (bypasses RLS) is
   used *only* by the FastAPI `/checkout` endpoint. (ADR-009)
5. **RLS everywhere** — Products public-read / admin-write; Orders visible to
   owner-or-admin; Profiles strictly owned.
6. **Two pricing tiers** — retail (default), wholesale (≥10 total lots, any
    signed-in user). (ADR-001)

### Data flow
The end-to-end buyer flow (browse → cart → checkout → stock decrement →
WhatsApp link → auth-required receipt) is diagrammed in
[`docs/Flowchart.txt`](./docs/Flowchart.txt).

### Architecture Decision Records
Nine accepted ADRs live in [`docs/adr/`](./docs/adr):

| ADR | Decision |
|-----|----------|
| 001 | Hybrid wholesale pricing (retail / wholesale at 10+ lots) |
| 002 | Atomic all-or-nothing checkout transaction |
| 003 | Server Components for reads, FastAPI for writes |
| 004 | Auth-required receipt pages with dual (owner/admin) access |
| 005 | WhatsApp fulfillment — no payment gateway |
| 006 | Self-serve wholesale approval flow |
| 007 | Stock validation at checkout (error, no auto-remove) |
| 008 | `For_Parts` visible to all with an "As-Is" badge |
| 009 | `service_role` restricted to `/checkout` only |

### Background reading
- [`docs/b2b_project.txt`](./docs/b2b_project.txt) — project brief & scope
- [`docs/Structure.txt`](./docs/Structure.txt) — canonical file layout
- [`docs/architecture.txt`](./docs/architecture.txt) — design notes
- [`docs/glossary.md`](./docs/glossary.md) — terms (Lot, Grade, Roles, etc.)

---

## Project Layout

```
Computer-Lot/
├── frontend/                 # Next.js 15 (App Router) — reads + cart UI
│   ├── src/
│   │   ├── app/              # Pages & routes: /, /catalog, /login,
│   │   │                     #   /checkout, /products/[id], /receipts/[id],
│   │   │                     #   /dashboard/*
│   │   ├── components/       # Navbar, CartDrawer, ProductCard, CheckoutButton, …
│   │   ├── hooks/            # useCart, useUserRole, useAdminDashboard, useWebSocket
│   │   ├── lib/              # pricing.ts, dashboard-data.ts, product-events.ts
│   │   ├── utils/supabase/   # client.ts, middleware.ts, server.ts
│   │   └── types/
│   ├── scripts/pricing-parity.mjs   # frontend↔backend pricing agreement test
│   ├── .env.example          # NEXT_PUBLIC_* vars
│   └── package.json          # dev/build/start/lint/test
├── backend/                  # FastAPI — writes only (ADR-003)
│   ├── app/
│   │   ├── main.py           # FastAPI app: /checkout, /admin, /wholesale, /ws
│   │   ├── config.py         # pydantic-settings env loader
│   │   ├── database.py       # Supabase client factory
│   │   ├── rate_limit.py     # SlowAPI limiter
│   │   ├── routes/           # admin.py, checkout.py, wholesale.py, ws.py
│   │   ├── schemas/          # admin, order, product, wholesale (Pydantic models)
│   │   ├── adapters/         # csv_parser, pricing, stock, txn, whatsapp,
│   │   │                     #   order_intake, row_normalizer, row_validator,
│   │   │                     #   product_inserter, notification
│   │   └── utils/            # security.py, ws_manager.py
│   ├── seed.py               # seed 10 mock products
│   ├── update_images.py      # refresh product photos
│   ├── tests/                # pytest suites (checkout, pricing parity, admin, …)
│   ├── .env.example
│   └── requirements.txt      # FastAPI, uvicorn, supabase, psycopg2, slowapi, pytest
├── supabase/
│   ├── migrations/           # 12 numbered SQL migrations (001…012)
│   ├── policies.sql          # RLS policy source (reference)
│   └── seed.sql              # reference/seed data
├── docs/
│   ├── adr/                  # 001–009 Architecture Decision Records
│   ├── Flowchart.txt         # Mermaid end-to-end flow
│   ├── Structure.txt         # canonical file structure
│   ├── architecture.txt
│   ├── b2b_project.txt
│   └── glossary.md
├── AGENTS.md                 # developer guidelines (must follow)
└── package.json              # root scripts (supabase CLI, dev tooling)
```

### Key modules

**Frontend** (`frontend/src`)

| Module | Purpose | Exports | Depends on |
|--------|---------|---------|------------|
| `app/` (Server Components) | Product catalog, receipts, dashboard, checkout | page components, route layouts | Supabase server client |
| `hooks/useCart.ts` | Zustand cart w/ `persist` (localStorage) | `useCart` | — |
| `hooks/useUserRole.ts` | Resolves `retail` / `wholesale_pending` / `wholesale_approved` / `admin` | `useUserRole` | Supabase client |
| `hooks/useAdminDashboard.ts` | Dashboard data + WebSocket live updates | — | useWebSocket |
| `hooks/useWebSocket.ts` | WS connection to `/ws` | — | — |
| `lib/pricing.ts` | Retail/wholesale/approved price calculation (client mirror) | pricing helpers | — |
| `utils/supabase/*` | SSR-safe Supabase client, middleware, server helpers | `createClient` | @supabase/ssr |

**Backend** (`backend/app`)

| Module | Purpose | Exports | Depends on |
|--------|---------|---------|------------|
| `main.py` | FastAPI app + route mounting + CORS/RateLimit | `app` | routes, adapters |
| `app/routes/checkout.py` | `/checkout` (atomic txn, pricing, stock, WhatsApp link) | `router` | adapters/* |
| `routes/admin.py` | Profile approvals, order status, CSV import, template, broadcast, expire-orders | `router` | — |
| `routes/wholesale.py` | `/wholesale/apply` self-service application | `router` | — |
| `routes/ws.py` | WebSocket live events (admin dashboard) | `router` | ws_manager |
| `adapters/pricing.py` | Backend-side pricing engine (source of truth) | price calculators | schemas |
| `adapters/txn.py` | Orchestrates the atomic checkout transaction via RPC `decrement_stock_inventory` | `run_in_transaction` | database, stock |
| `adapters/stock.py` | Stock validation + RPC wrappers | validation helpers | database |
| `app/adapters/whatsapp.py` | Builds `https://wa.me/{phone}?text={encoded}` deep link | `build_order_link` | config |
| `adapters/order_intake.py` | Maps JWT/claims → user profile for checkout | intake logic | database |
| `adapters/{csv_parser,row_normalizer,row_validator,product_inserter}.py` | Admin product CSV import pipeline | — | — |
| `database.py` | Supabase client factory (anon + service_role) | `get_supabase` | config |
| `utils/security.py` | JWT verification / claim extraction | auth deps | config |
| `utils/ws_manager.py` | Broadcast manager for admin WS | — | — |

---

## Features

- **Lot-based catalog** — products sold in fixed-size lots (e.g. 10 CPUs/lot);
  grades `Grade_A` … `Grade_C` and `For_Parts` (As-Is badge, public). (ADR-008)
- **Hybrid B2C + B2B pricing** — retail (default), wholesale at ≥10 total lots,
  and an approved-price tier for vetted buyers with per-product minimums. (ADR-001)
- **Zero-fee checkout** — no payment gateway; the order produces a WhatsApp
  Business deep link for the merchant to fulfill. (ADR-005)
- **Atomic stock safety** — multi-item orders succeed or fully roll back via
  `decrement_stock_inventory`; insufficient stock returns `400` + `out_of_stock[]`
  rather than auto-removing items. (ADR-002 / ADR-007)
- **Self-serve wholesale** — any signed-in user can apply; role flips to
  `wholesale_pending` for admin approval. (ADR-006)
- **Role-aware UI** — `wholesale-apply-button` and navbar reflect current role;
  admins cannot be downgraded.
- **Auth-guarded receipts** — `/receipts/[id]` is viewable by the order owner
  *or* an admin (dual access). (ADR-004)
- **Live admin dashboard** — WebSocket (`/ws`) streams order-status events;
  status updates to `completed`/`cancelled` restock via
  `increment_stock_inventory`.
- **Admin product import** — CSV upload + template download + broadcast endpoint.

---

## Scripts & Testing

### Frontend (`frontend/package.json`)
```bash
npm run dev        # next dev @ :3000
npm run build      # next build (production)
npm run start      # next start
npm run lint       # eslint .
npm test           # pricing-parity check (scripts/pricing-parity.mjs)
```
`pricing-parity.mjs` loads the TypeScript `lib/pricing.ts` logic on the Node
side and asserts it matches the backend fixtures in
`backend/tests/fixtures/pricing_matrix.json`.

### Backend (`backend/`)
```bash
uvicorn app.main:app --reload          # :8000
pytest -q                              # full suite (asyncio)
pytest backend/tests/test_checkout.py  # atomic stock / pricing focus
pytest backend/tests/test_pricing_parity.py
```
`pytest.ini` sets `asyncio_default_fixture_loop_scope = function`.

### Verification commands
```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run lint
```

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | frontend | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend | Public (RLS-bound) client key |
| `NEXT_PUBLIC_API_URL` | frontend | FastAPI base URL |
| `NEXT_PUBLIC_MERCHANT_PHONE` | frontend | WhatsApp merchant phone (no `+`) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | backend | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | **write RPC only — `/checkout`** (ADR-009) |
| `SUPABASE_JWT_SECRET` | backend | Verify buyer JWTs |
| `SUPABASE_DB_*` | backend | Direct Postgres host for seed/RPC |
| `MERCHANT_PHONE` | backend | Builds WhatsApp deep link |
| `CORS_ORIGINS` / `FRONTEND_URL` | backend | CORS allow-list |
| `DEBUG` | backend | logging flag |

Copy from `frontend/.env.example` and `backend/.env.example` — never commit real `.env` files (see [`.gitignore`](./.gitignore)).

---

## Documentation

- **[AGENTS.md](./AGENTS.md)** — development rules; *must follow before editing*.
- **[Architecture decisions](./docs/adr/)** — ADR-001…009 (pricing, atomicity, API boundary, receipts, WhatsApp, self-serve, stock, For_Parts, service_role scope).
- **[Flowchart](./docs/Flowchart.txt)** — Mermaid end-to-end buyer flow.
- **[Glossary](./docs/glossary.md)** — terms: Lot, Grade, Roles, Hybrid Pricing, etc.
- **[Structure.txt](./docs/Structure.txt)** — canonical file layout.
- **[b2b_project.txt](./docs/b2b_project.txt)** — project brief.

---

## Contributing

1. Read [`AGENTS.md`](./AGENTS.md) — its rules are non-negotiable for this stack.
2. Consult the relevant ADR in [`docs/adr/`](./docs/adr) before changing pricing,
   stock, or auth behavior.
3. Prefer **Server Components** for reads and route writes through **FastAPI**
   (ADR-003). Never bypass `decrement_stock_inventory` for stock changes.
4. Keep `service_role` scoped to `/checkout` only (ADR-009); never in frontend or
   other backend routes.
5. Run `npx tsc --noEmit` + `npm run lint` + `pytest` before opening a PR.

Happy liquidating! 🚀

---

*Generated from the actual codebase. All listed paths, scripts, and versions were
verified against the repository on 2026-08-04.*
