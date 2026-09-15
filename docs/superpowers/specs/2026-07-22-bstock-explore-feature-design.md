# B-Stock Explore Page — Design Doc

**Date**: 2026-07-22
**Branch**: `test-features`
**Status**: Draft

## Overview

Add an **Explore** page that displays live computer/hardware liquidation listings from B-Stock's public search API. Users browse listings and submit sourcing requests for lots they're interested in; admins manage these requests via the dashboard.

## Data Source: B-Stock Public Search API

B-Stock (`bstock.com`) is the largest B2B liquidation marketplace network. They expose a **public, unprotected search API** at `search.bstock.com` that returns all active auction lots as JSON with no authentication required. Confirmed working — returns 200 with real data.

### API details
- **Endpoint**: `https://search.bstock.com/v1/all-listings/listings`
- **Auth**: None — fully public
- **Method**: GET
- **Params**: `sortBy`, `sortOrder`, `offset`, `limit` (max 100)
- **Anti-bot**: None (confirmed by multiple scraper reports and direct curl test)

### Response fields used
`auctionUrl`, `title`, `winningBidAmount`, `retailPrice`, `unitCount`, `palletCount`, `condition`, `displayedCondition`, `storefrontName`, `region`, `endTime`, `primaryImageUrl`, `currency`, `numberOfBids`, `categories`, `inventoryType`

### Filtering strategy
B-Stock API supports `category` filter. We include results from `Electronics` and `Cell Phones` categories. Then server-side post-filter to keep only listings whose title contains keywords matching computer hardware: `computer`, `laptop`, `desktop`, `monitor`, `server`, `hard drive`, `ssd`, `ram`, `motherboard`, `cpu`, `graphics card`, `gpu`, `networking`, `router`, `switch`, `peripheral`, `keyboard`, `mouse`, `tablet`, `ipad`, `macbook`, `thinkpad`, `chromebook`, `workstation`, `notebook`, `all-in-one`, `apple`, `microsoft surface`, `access point`, `firewall`, `nas`, `raid`, `docking`.

## Architecture

```
Browser → /explore (Next.js Server Component shell)
              ↓
         <ExplorePage /> (Client Component, fetches on mount)
              ↓  GET /explore/listings?search=&max_results=50
         FastAPI → httpx → search.bstock.com/v1/all-listings/listings
              ↓
         Normalizes response → returns { listings: [...], total: N }
              ↓
         Renders listing grid with skeleton loading

Request Lot:
  User clicks "Request Lot" → quick form modal (qty + notes)
       ↓  POST /explore/requests (JWT auth required)
  FastAPI validates → inserts into sourcing_requests (Supabase)
       ↓
  Returns { id } → toast confirmation

Admin:
  GET /admin/explore/requests (JWT + admin role)
       ↓
  Dashboard table with filtering, sorting, inline status update
```

### Key characteristics
- **Live on page load** — no DB cache, no stale data
- **Skeleton loading** — 12 skeleton cards matching ProductCard style while fetching
- **Refresh button** — re-fetches from B-Stock
- **Rate limited** — 10 req/min per user on the proxy endpoint (SlowAPI)

## Database: `sourcing_requests`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `user_id` | UUID FK → `auth.users` | who requested |
| `user_email` | TEXT | from JWT at request time |
| `phone` | TEXT | optional contact phone for WhatsApp |
| `listing_url` | TEXT | B-Stock lot URL |
| `title` | TEXT | lot title |
| `current_bid` | NUMERIC(10,2) | price at time of request |
| `msrp` | NUMERIC(10,2) | retail value |
| `pallet_count` | INT | from listing |
| `unit_count` | INT | number of units |
| `source_retailer` | TEXT | e.g. "Amazon", "Target" |
| `condition` | TEXT | e.g. "Used Good" |
| `location` | TEXT | city/region |
| `quantity_requested` | INT | from user form |
| `notes` | TEXT | optional user notes |
| `status` | TEXT | `pending`, `contacted`, `declined` |
| `created_at` | TIMESTAMPTZ | `now()` |

### RLS Policies
- `SELECT` — user sees own `user_id`, admin sees all
- `INSERT` — authenticated users (user_id forced server-side)
- `UPDATE` — admin only (status changes)
- `DELETE` — none

## Frontend

### `/explore` page
- **Server shell** (`frontend/src/app/explore/page.tsx`) — minimal layout wrapper
- **Client component** (`frontend/src/components/explore-page.tsx`) — fetches on mount via `useEffect`, manages search state, renders grid

### ExploreCard
- Matches existing `ProductCard` visual style (same Card component, font classes)
- Shows: current bid, MSRP, condition, source retailer, location, closing time, pallet/unit count
- Image: B-Stock's `primaryImageUrl` or fallback icon
- Badge: condition label + "Live Auction"
- Action: "Request Lot" button (instead of "Add to Cart")
- No link to detail page (external B-Stock link on the card)

### Search
- Reuses existing `SearchBar` component
- Client-side filter on title + source retailer

### Request Lot Modal
- shadcn `Dialog`
- Fields: quantity (number, default 1) + notes (textarea, optional)
- Submit → `POST /explore/requests` → toast on success
- If unauthenticated: redirect to `/login?redirect=/explore`

### Navbar
- New "Explore" link in the nav bar (visible to all)

### Admin Dashboard Section (`sourcing.tsx`)
- Full table: title, user email/name, source retailer, bid/MSRP, status, created date, actions
- Filter by status dropdown (`all` / `pending` / `contacted` / `declined`)
- Sortable by created date
- Click row → expand details panel (user contact info, full listing data, notes)
- Inline status change via dropdown
- Total count / pending count stats

## Backend (FastAPI)

### Routes in `backend/app/routes/explore.py`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/explore/listings` | None | Proxy to B-Stock search API |
| POST | `/explore/requests` | JWT required | Create sourcing request |
| GET | `/explore/requests` | JWT required | List user's own requests |
| GET | `/admin/explore/requests` | JWT + admin | List all requests (with status filter) |
| PATCH | `/admin/explore/requests/{id}/status` | JWT + admin | Update request status |

### GET /explore/listings data flow
1. Receive `search` (optional), `max_results` (default 50, max 200)
2. Send `httpx` GET to `https://search.bstock.com/v1/all-listings/listings` with `limit=100`, no auth headers
3. Filter results: keep only `Electronics` category listings, then apply `search` keyword filter on title + storefront name
4. Normalize each listing into consistent format (map B-Stock field names)
5. Return `{ listings: [...], total: len(filtered) }`

### Error handling
- If B-Stock is unreachable: return `{ error: "Unable to fetch live listings. Please try again.", listings: [] }` with HTTP 200 (graceful degradation)
- Slow responses: set `httpx` timeout to 10s
- Invalid params: return 422 with clear message

### Rate limiting
- `/explore/listings`: 10 requests per minute per IP (SlowAPI decorator)
- `/explore/requests` POST: 5 per minute per IP

## Security

- Rate limiting on all endpoints
- JWT auth on all `/explore/requests` and `/admin/explore/requests` routes
- `user_id` forced from JWT on POST — cannot be spoofed
- RLS on `sourcing_requests` table
- Admin routes check `role = 'admin'` from JWT

## Testing

- `pytest` for FastAPI endpoints:
  - GET /explore/listings returns valid shape
  - POST /explore/requests rejects unauthenticated
  - POST /explore/requests creates record
  - Admin routes reject non-admin
  - B-Stock unreachable returns graceful error
- Manual: full flow browse → request → admin dashboard check

## Implementation Order

1. Database: migration for `sourcing_requests` + RLS policies
2. Backend: FastAPI `explore.py` routes (all 5 endpoints)
3. Frontend: ExploreCard component
4. Frontend: Explore page (server shell + client component)
5. Frontend: Request Lot modal
6. Frontend: Navbar link
7. Frontend: Admin dashboard sourcing section
8. Test full flow end-to-end
