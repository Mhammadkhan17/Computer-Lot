# B-Stock Explore Page — Design Doc

**Date**: 2026-07-22
**Branch**: `test-features`
**Status**: Draft

## Overview

Add an **Explore** page to the Computer-Lot platform that displays live computer/hardware liquidation listings from B-Stock's public search API. Users can browse listings and submit sourcing requests for lots they're interested in; admins manage these requests via the dashboard.

## Data Source: B-Stock Public Search API

B-Stock (`bstock.com`) is the largest B2B liquidation marketplace network (Amazon, Best Buy, Target, Walmart, Home Depot, etc.). They expose a **public, unprotected search API** at `search.bstock.com` that returns all active auction lots as JSON with no authentication required.

### API characteristics
- **Endpoint**: `search.bstock.com` (exact path TBD by reverse-engineering the React SPA at `bstock.com/all-auctions/`)
- **Auth**: None — fully public
- **Returns**: JSON with lot ID, title, current bid, MSRP/retail value, unit count, condition, source retailer, location, close time, listing URL, image URL, currency, number of bids, category
- **Anti-bot**: None confirmed by multiple scraper reports
- **Filterable**: search text, category, condition, bid range, etc.

### Backend fallback plan
If the direct API path changes or is restricted, fall back to Camoufox (anti-detect Firefox browser, ~200MB) with Playwright to scrape B-Stock listing pages instead.

## Architecture

```
Browser → /explore (Next.js Server Component)
              ↓
         <ExplorePage /> (Client Component)
              ↓  on mount
         GET /explore/listings (FastAPI proxy)
              ↓
         httpx → search.bstock.com (no auth)
              ↓
         Returns JSON → renders listing grid

Sourcing Request:
  User clicks "Request Lot"
       ↓
  POST /explore/requests (FastAPI)
       ↓
  Inserts into sourcing_requests (Supabase)
       ↓
  Admin dashboard shows request
```

### Key characteristics
- **Live on page load** — no DB cache, no stale data
- **Skeleton loading** — show 12 skeleton cards matching the existing `ProductCard` style while fetching
- **Refresh button** — re-fetches from B-Stock (useful if data doesn't load or user wants fresh results)

## New Database Tables

### `sourcing_requests`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | default gen_random_uuid() |
| user_id | UUID FK → auth.users | who requested |
| listing_url | TEXT | B-Stock lot URL |
| title | TEXT | lot title from listing |
| current_bid | NUMERIC(10,2) | price at time of request |
| msrp | NUMERIC(10,2) | retail value |
| quantity_requested | INT | how many they want |
| notes | TEXT | optional user notes |
| status | TEXT | 'pending', 'contacted', 'sourced', 'declined' |
| created_at | TIMESTAMPTZ | default now() |

RLS: Users see their own requests. Admins see all.

## Frontend

### `/explore` page
- **Server Component shell** (`frontend/src/app/explore/page.tsx`) — basic layout, no data fetching
- **Client Component** (`frontend/src/app/explore/explore-page.tsx`) — fetches listings on mount, renders grid
- **Explore listing card** (`frontend/src/components/explore-card.tsx`) — similar to `ProductCard` but for external listings; shows title, bid price, MSRP, condition, location, units, closing time, "Request Lot" button
- **Search/filter bar** — client-side filtering by keyword (mirrors existing `CatalogGrid` pattern)

### Admin Dashboard
- New section in `frontend/src/app/dashboard/sections/sourcing.tsx`
- Table of all sourcing requests with status management

## Backend (FastAPI)

### Routes in `backend/app/routes/explore.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/explore/listings?search=&category=&condition=&max_price=` | Proxies to B-Stock search API, returns JSON array |
| POST | `/explore/requests` | Create a sourcing request (JWT auth required) |
| GET | `/explore/requests` | List user's requests (JWT auth) |

### Data flow for `/explore/listings`
1. Receive query params
2. Send `httpx` GET to `search.bstock.com` with appropriate params
3. Normalize B-Stock response into a consistent format
4. Return JSON array of listings

Error handling: If B-Stock is unreachable, return a clear error message to the user (not a crash).

## Security

- Rate limit `/explore/listings` (10 req/min per user) to avoid hammering B-Stock
- JWT auth on `/explore/requests` (POST and GET)
- RLS on `sourcing_requests` table
- `service_role` key only for creating requests; user reads via anon key + RLS

## Implementation Order

1. Reverse-engineer `search.bstock.com` API endpoint (inspect `bstock.com/all-auctions/` network tab)
2. Create FastAPI route `GET /explore/listings` as proxy
3. Create Supabase migration for `sourcing_requests` table + RLS
4. Create FastAPI routes for `POST/GET /explore/requests`
5. Build Explore page (server shell + client listing grid + skeleton loading)
6. Build ExploreCard component
7. Build "Request Lot" flow (form → POST → confirmation)
8. Add sourcing requests section to admin dashboard
9. Test full flow end-to-end
