# Implementation Plan: B-Stock Explore Feature

**Branch**: `test-features`
**Depends on**: Design doc at `docs/superpowers/specs/2026-07-22-bstock-explore-feature-design.md`

## Step 1: Supabase Migration — `sourcing_requests` table

1. Create `supabase/migrations/002_sourcing_requests.sql`:
   - `sourcing_requests` table with all columns from design doc
   - Enable RLS
   - RLS policies: user SELECT own, admin SELECT all, INSERT authenticated, UPDATE admin only
2. Apply migration

**Files**: `supabase/migrations/002_sourcing_requests.sql`
**Verification**: Query table via Supabase SQL editor

---

## Step 2: FastAPI Backend — `explore.py` routes

1. Create `backend/app/schemas/explore.py`:
   - `ListingOut` — normalized listing schema
   - `SourcingRequestCreate` — request body (listing_url, title, current_bid, msrp, pallet_count, unit_count, source_retailer, condition, location, quantity_requested, notes)
   - `SourcingRequestOut` — response with id, status, created_at
   - `StatusUpdate` — for PATCH endpoint

2. Create `backend/app/routes/explore.py`:
   - `GET /explore/listings` — no auth, SlowAPI rate-limited (10/min/IP)
     - Query params: `search` (optional str), `max_results` (optional int, default 50, max 200)
     - Calls `httpx` GET to `https://search.bstock.com/v1/all-listings/listings` with `limit=100`
     - Filters: keep `Electronics` + `Cell Phones` categories, then post-filter by computer hardware keywords
     - Normalizes field names, returns `{ listings: [...], total: N }`
     - Timeout 10s, graceful error return on failure
   - `POST /explore/requests` — JWT auth, SlowAPI (5/min/user)
     - Validates body, sets `user_id` from JWT, inserts into `sourcing_requests`
     - Returns `{ id }` with 201
   - `GET /explore/requests` — JWT auth, returns user's own requests
   - `GET /admin/explore/requests` — JWT + admin check, returns all requests, supports `?status=` filter
   - `PATCH /admin/explore/requests/{id}/status` — JWT + admin, updates status

3. Register router in `backend/app/main.py`

**Files**: `backend/app/schemas/explore.py`, `backend/app/routes/explore.py`
**Verification**: `pytest` on each endpoint

---

## Step 3: Frontend — ExploreCard component

1. Create `frontend/src/components/explore-card.tsx`:
   - Match `ProductCard` visual style (Card component, same CSS classes, ImageOff fallback)
   - Props: full listing object from API
   - Shows: primaryImageUrl (or fallback), title, current bid, MSRP, condition badge, source retailer, location, pallet/unit count, closing time countdown
   - "Request Lot" button → onClick handler prop (parent manages modal)
   - External link to B-Stock auction URL on the card

**Files**: `frontend/src/components/explore-card.tsx`
**Verification**: Import and render in a test page

---

## Step 4: Frontend — Explore page

1. Create `frontend/src/app/explore/page.tsx` (Server Component):
   - Minimal layout wrapper, imports the client component

2. Create `frontend/src/components/explore-page.tsx` (Client Component):
   - `useEffect` to fetch `GET /explore/listings` on mount
   - State: listings[], loading bool, error string, search string
   - Loading state: render 12 skeleton cards (div with pulsing bg, matching card dimensions)
   - Error state: show error message with retry button
   - Search: reuse `SearchBar` component, client-side filter on title + source retailer
   - Grid: same responsive grid as `CatalogGrid` (4 cols xl, 3 lg, 2 sm)
   - Request lot modal (shadcn Dialog): quantity field (number, default 1) + notes textarea + submit
   - Submit calls `POST /explore/requests`, shows toast on success
   - If unauthenticated user clicks "Request Lot", redirect to `/login?redirect=/explore`
   - Refresh button in header area

3. Add navbar link to `/explore`

**Files**: `frontend/src/app/explore/page.tsx`, `frontend/src/components/explore-page.tsx`
**Verification**: Navigate to `/explore`, see listings load with skeleton, search works, modal works

---

## Step 5: Admin Dashboard — Sourcing section

1. Create `frontend/src/app/dashboard/sections/sourcing.tsx`:
   - Fetches `GET /admin/explore/requests` with status filter
   - Table columns: title (truncated), user email, source retailer, bid/MSRP, status, created date, actions
   - Status filter dropdown (all/pending/contacted/declined)
   - Sortable by created date
   - Click row → expand details panel (user info, full listing data, user notes)
   - Inline status change via dropdown → `PATCH /admin/explore/requests/{id}/status`
   - Stats at top: total count, pending count

**Files**: `frontend/src/app/dashboard/sections/sourcing.tsx`
**Verification**: Log in as admin, see sourcing section, manage requests

---

## Step 6: Test Full Flow

1. Browsing: `/explore` loads listings, search filters work, refresh button works
2. Auth gate: unauthenticated user clicks "Request Lot" → redirects to login
3. Request: authenticated user requests a lot → success toast, data in DB
4. Admin: admin sees request in dashboard, changes status, sees user details
5. Error states: test with B-Stock unreachable (graceful message), test empty results
6. Responsive: test on mobile viewport, cards stack correctly

**Verification**: All 6 scenarios pass
