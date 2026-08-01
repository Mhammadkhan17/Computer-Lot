# ADR-003: API Boundary — Next.js Server Components for Reads, FastAPI for Writes

**Status:** Accepted  
**Date:** 2026-07-18  
**Context:** We have two runtimes (Next.js + FastAPI). Need a clear rule for when to use each.

**Decision:**
- **Read operations** (product catalog, user profile, order history, receipt display) → Next.js Server Components using Supabase anon key + RLS
- **Write operations** (checkout, order creation, stock mutation) → FastAPI using service_role key
- **Auth operations** → Supabase Auth SDK directly from the frontend

**Consequences:**
- Avoids unnecessary network hops for data fetching
- Keeps service_role access restricted to a single, auditable endpoint
- FastAPI endpoints are write-only and easily rate-limited
- Clean separation of concerns

**Update (2026-08-01):** The admin dashboard is the reference case for an
interactive read surface. Initial reads (orders, wholesale-pending profiles,
products) are fetched in the dashboard Server Component and hydrated into the
client data module (`useAdminDashboard`), which reconciles silently on mount and
subscribes to Supabase Realtime for deltas.

Rationale:
- Server-side initial fetch gives a first paint with no loading state.
- The mount-time reconcile catches writes that occurred between server render and
  client hydration (Realtime only delivers events after the subscription starts).
- Realtime keeps the interactive surface fresh without polling.

All dashboard read queries live in one shared module (`frontend/src/lib/dashboard-data.ts`)
backed by two adapters: the cookie-authenticated server client (initial fetch) and the
browser client (reconcile + realtime-driven refreshes). The read queries are defined
once, not duplicated across server and client.
