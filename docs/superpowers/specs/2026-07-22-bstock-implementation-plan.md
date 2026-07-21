# Implementation Plan: B-Stock Explore Feature

**Branch**: `test-features`
**Depends on**: Design doc at `docs/superpowers/specs/2026-07-22-bstock-explore-feature-design.md`

## Step 1: Reverse-engineer B-Stock Search API

1. Open `bstock.com/all-auctions/` in browser DevTools
2. Identify XHR/fetch calls to `search.bstock.com`
3. Document: exact URL, query params, response format, pagination
4. Test with `curl`/`httpx` to confirm no auth required

**Deliverable**: Confirmed API endpoint + params + sample response

---

## Step 2: Supabase Migration — `sourcing_requests` table

1. Create `supabase/migrations/002_sourcing_requests.sql`:
   - `sourcing_requests` table with columns from design doc
   - RLS: user can read own, admin can read all
   - Enable RLS
2. Apply migration

**Deliverable**: Migration file applied

---

## Step 3: FastAPI Backend

3a. Create `backend/app/routes/explore.py`:
   - `GET /explore/listings` — proxy to B-Stock, normalize response
   - `POST /explore/requests` — create sourcing request (JWT auth)
   - `GET /explore/requests` — list user's requests (JWT auth)

3b. Register router in `backend/app/main.py`

**Deliverable**: 3 working endpoints

---

## Step 4: Frontend — Explore Page

4a. Create `frontend/src/app/explore/page.tsx` (Server Component shell)
4b. Create `frontend/src/app/explore/explore-page.tsx` (Client Component):
   - Fetch `/explore/listings` on mount
   - Skeleton loading (12 cards)
   - Search/filter bar
   - Listing grid
4c. Create `frontend/src/components/explore-card.tsx` (matching `ProductCard` style)
4d. Add navbar link to `/explore`

**Deliverable**: Working `/explore` page

---

## Step 5: Request Lot Flow

5a. Add "Request Lot" button to `explore-card.tsx`
5b. On click: show inline form (quantity + optional notes) or modal
5c. On submit: `POST /explore/requests`
5d. Show confirmation toast/success state

**Deliverable**: Users can request lots

---

## Step 6: Admin Dashboard Section

6a. Create `frontend/src/app/dashboard/sections/sourcing.tsx`
6b. Table of all sourcing requests with status dropdown (`pending` → `contacted` → `sourced` / `declined`)
6c. Wire into existing dashboard sidebar

**Deliverable**: Admin can manage requests

---

## Step 7: Test & Polish

7a. Test full flow: browse Explore → request lot → check admin dashboard
7b. Test error states (B-Stock down, no results, etc.)
7c. Test responsive layout

**Deliverable**: Feature ready for review on `test-features`
