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
