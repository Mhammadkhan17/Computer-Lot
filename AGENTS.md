# AGENTS.md - AI Development Guidelines

**Project**: Hybrid Computer Lot Liquidation Platform (Enhanced v2)  
**Version**: 2.0  
**Last Updated**: July 2026

This document contains **crystal-clear, non-negotiable rules** for any AI agent (Claude, Cursor, Grok, etc.) working on this codebase. All changes must strictly follow these guidelines.

---

## 1. Core Principles (Never Violate)

1. **Preserve Architecture**: This is a **Next.js 15 (App Router) + FastAPI + Supabase** stack. Do not introduce new frameworks, ORMs, or major tooling without explicit project owner approval.
2. **Atomic Stock Management**: The `decrement_stock_inventory` PostgreSQL function is **critical**. All order creation logic must use it via RPC.
3. **Zero-Fee WhatsApp Fulfillment**: Orders end with a WhatsApp Business deep link. No payment gateway integration unless explicitly requested later.
4. **B2C + B2B Hybrid**: Pricing logic must respect user role (`retail` vs `wholesale_approved`) and volume.
5. **Security First**: RLS (Row Level Security) on Supabase is mandatory. Never bypass it in application code.

---

## 2. Architecture Decision Records

All key architecture decisions are documented in `docs/adr/`. Before implementing any feature, consult the relevant ADR:

| ADR | Topic |
|-----|-------|
| 001 | Hybrid wholesale pricing (per-product minimum + total 10-lot threshold) |
| 002 | Atomic all-or-nothing checkout transaction |
| 003 | Server Components for reads, FastAPI for writes |
| 004 | Auth-required receipt pages with dual access |
| 005 | WhatsApp fulfillment — no payment gateway |
| 006 | Self-serve wholesale approval flow |
| 007 | Stock validation at checkout (error, no auto-remove) |
| 008 | For_Parts visible to all with "As-Is" badge |
| 009 | service_role restricted to /checkout only |

See `docs/glossary.md` for project terminology.

---

## 3. Technology Stack (Immutable)

**Frontend**:
- Next.js 15 (App Router)
- TypeScript (strict mode)
- Tailwind CSS + Shadcn/ui
- Zustand (with middleware persist) for cart
- Supabase JS client

**Backend**:
- Python 3.12+
- FastAPI + Pydantic v2
- Supabase Python client (or direct PostgreSQL via `psycopg`)

**Database**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)

**Other**:
- Rate limiting (SlowAPI or Upstash Redis)
- Testing: pytest + Playwright

---

## 4. Project Structure Rules

Never deviate from the structure defined in `Structure.txt`. When creating new files:

- Frontend: `frontend/src/app/` for routes, `components/`, `hooks/`, `lib/`, `types/`
- Backend: `backend/app/routes/`, `schemas/`, `utils/`
- Supabase: `supabase/migrations/` and `supabase/policies.sql`

**Forbidden**:
- Adding new top-level folders without updating AGENTS.md and Structure.txt
- Mixing frontend/backend logic
- Using `pages/` router in Next.js

---

## 5. Database & Supabase Rules

- All schema changes must go into `supabase/migrations/` as numbered SQL files.
- Enable RLS on every new table.
- Use the provided `decrement_stock_inventory(row_id UUID, steps INT)` function for stock updates — never write raw UPDATE statements for stock in application code.
- Prefer Supabase Edge Functions for complex business logic when needed.
- All timestamps must use `TIMESTAMPTZ`.
- Use `uuid-ossp` extension where needed.

**RLS Policy Requirements**:
- Products: Public read, Admin full access
- Orders: Users see only their own (or admins see all)
- Profiles: Strict ownership

---

## 6. Frontend Guidelines

- Use **Server Components** by default.
- Client Components only when necessary (`"use client"`), and mark them clearly.
- Cart state managed **exclusively** via `hooks/useCart.ts` (Zustand + persist).
- All checkout flows must go through the FastAPI `/checkout` endpoint.
- Use Shadcn/ui components for consistency.
- Responsive-first design (mobile-friendly catalog and cart drawer).
- WhatsApp deep link format must be: `https://wa.me/{phone}?text={encoded_message}` with order details.

---

## 7. Backend Guidelines (FastAPI)

- All routes in `app/routes/`
- Pydantic models in `app/schemas/`
- Use dependency injection for Supabase client.
- Every endpoint must have proper error handling and logging.
- The `/checkout` endpoint must:
  1. Validate JWT
  2. Determine retail vs wholesale pricing
  3. Check stock
  4. Run everything inside a Supabase/PostgreSQL transaction
  5. Call `decrement_stock_inventory` RPC
  6. Return order data for WhatsApp redirect

**Strict Rules**:
- Never expose sensitive data (phone numbers only when necessary for WhatsApp).
- Always validate `available_stock_lots >= quantity` before transaction.
- Return clear, user-friendly error messages.

---

## 8. Authentication & Authorization

- Supabase Auth is the single source of truth.
- Role is stored in `profiles` table (`retail` | `wholesale_pending` | `wholesale_approved` | `admin`).
- Wholesale pricing only for `wholesale_approved` users meeting minimum lot requirements.
- Admin role grants full access (use in RLS policies).

---

## 9. Code Quality & Style Rules

**General**:
- Write self-documenting code with meaningful variable names.
- Add detailed comments for complex business logic.
- Follow existing code style exactly.

**TypeScript**:
- Strict typing everywhere.
- Define interfaces in `src/types/`.

**Python**:
- Type hints everywhere.
- Black + Ruff formatting.
- Comprehensive docstrings for routes and key functions.

**Git**:
- Atomic commits with clear messages.
- Never commit `.env` files.

---

## 10. Testing Requirements

- Backend: Write pytest for every new endpoint (especially checkout).
- Frontend: Critical flows must have Playwright tests.
- Always test the full checkout → stock decrement flow.

---

## 11. Forbidden Actions (Hard Rules)

1. Do not add payment gateways without approval.
2. Do not remove or bypass the atomic stock decrement function.
3. Do not store sensitive customer data beyond order requirements.
4. Do not use client-side stock checks as source of truth.
5. Do not change the WhatsApp fulfillment model.
6. Do not introduce new state management solutions.
7. Do not disable RLS policies.
8. Do not use `any` type in TypeScript or ignore type errors.

---

## 12. Development Workflow

1. Read relevant sections of `docs/b2b_project.txt`, `docs/Flowchart.txt`, `docs/glossary.md`, and this AGENTS.md.
2. Consult the relevant ADR(s) in `docs/adr/` for the feature being implemented.
3. Understand the current implementation before changing anything.
4. Implement changes while maintaining the flowchart and ADR logic.
5. Update documentation if architecture changes (with approval).
6. Test thoroughly (especially stock management).

---

## 13. When in Doubt

- Refer back to the Mermaid flowchart in `docs/Flowchart.txt`.
- Prioritize **data integrity** (stock counts) over UX polish.
- Security > Features > Performance > Polish.

**Goal**: Build a reliable, production-ready liquidation platform that small-scale operators can actually use daily.

---

## 14. Agent Skills

See `.agents/skill-usage.md` for the full list of installed skills and when to load them before each task.

---

**Compliance Statement**: By working on this project, I confirm I have read and will strictly follow all rules in this AGENTS.md.