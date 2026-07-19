# ADR-009: Service Role Key Restricted to /checkout Only

**Status:** Accepted  
**Date:** 2026-07-18  
**Context:** Supabase `service_role` key bypasses RLS and has full database access. Using it broadly is a security risk.

**Decision:**
- Only the `/checkout` FastAPI endpoint uses `service_role` key
- All other operations use Supabase anon key (RLS-enforced) or authenticated user key
- `/checkout` is narrowly scoped: accepts cart items → validates → creates order → returns result
- Rate limit `/checkout` at 10 requests/minute per user (SlowAPI)
- Strict Pydantic v2 validation on all inputs

**Consequences:**
- Minimal attack surface for the powerful service_role key
- One endpoint to audit for security
- RLS covers the rest of the data access
