# Backend Deployment Plan — FastAPI to Vercel

## Goal

Deploy the **Computer-Lot FastAPI backend** to Vercel as a serverless Python function,
connecting it to the existing frontend deployment and Supabase database.

## What We're Achieving

1. **Backend API live on Vercel** — checkout, admin, wholesale, explore endpoints
2. **Frontend ↔ Backend connected** — frontend calls backend via environment variable
3. **Full checkout flow working** — stock decrement, pricing, WhatsApp link generation

---

## Current State

| Item | Status |
|------|--------|
| Backend location | `backend/` directory |
| Entry point | `backend/app/main.py` (FastAPI `app` instance) |
| Frontend deployed | Yes — `https://frontend-xxx.vercel.app` |
| Backend deployed | **No** |
| Supabase | Connected (shared between frontend/backend) |

---

## Architecture

```
┌─────────────────────┐     NEXT_PUBLIC_API_URL     ┌─────────────────────┐
│                     │ ──────────────────────────▶ │                     │
│   Next.js Frontend  │                             │   FastAPI Backend   │
│   (Vercel - Next.js)│ ◀────────────────────────── │  (Vercel - Python)  │
│                     │      JSON responses          │                     │
└─────────────────────┘                             └─────────────────────┘
        │                                                   │
        │                                                   │
        ▼                                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Supabase                                       │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│   │ Auth     │  │ Database │  │ Storage  │  │ Realtime             │  │
│   │ (JWT)    │  │ (Postgres│  │ (Images) │  │ (Subscriptions)      │  │
│   └──────────┘  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

Two separate Vercel projects, connected via environment variables.

---

## Files to Create

### 1. `backend/app/api/index.py`

Required by Vercel to locate the FastAPI `app` instance.

```python
# Required by vercel.json to locate the FastAPI `app` instance.
# `# noqa: F401` prevents formatters from removing this import.
from app.main import app  # noqa: F401
```

### 2. `backend/vercel.json`

Tells Vercel how to build and route requests.

```json
{
  "builds": [
    {
      "src": "app/api/index.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "app/api/index.py"
    }
  ]
}
```

### 3. `backend/.vercelignore`

Excludes unnecessary files from the deployment bundle.

```
# Python
.venv/
__pycache__/
.pytest_cache/
.mypy_cache/
.ruff_cache/
*.egg-info/
*.pyc

# Tests
tests/
.coverage
htmlcov/

# Environment
.env
.env.*

# Data
data/

# IDE
.vscode/
.idea/
```

---

## Environment Variables

### Backend (set on Vercel)

| Variable | Where to Get | Notes |
|----------|--------------|-------|
| `SUPABASE_URL` | `frontend/.env` | Same Supabase project |
| `SUPABASE_ANON_KEY` | `frontend/.env` | Same key as frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/.env` | Admin access for checkout |
| `SUPABASE_JWT_SECRET` | `backend/.env` | For JWT verification |
| `SUPABASE_DB_HOST` | `backend/.env` | Direct Postgres connection |
| `SUPABASE_DB_NAME` | `backend/.env` | Usually `postgres` |
| `SUPABASE_DB_USER` | `backend/.env` | Usually `postgres` |
| `SUPABASE_DB_PASSWORD` | `backend/.env` | From Supabase dashboard |
| `SUPABASE_DB_PORT` | `backend/.env` | Usually `5432` |
| `MERCHANT_PHONE` | Mock value | `+123456789` |
| `CORS_ORIGINS` | Frontend URL | Must include frontend Vercel URL |
| `FRONTEND_URL` | Frontend URL | For WhatsApp redirect links |
| `DEBUG` | `false` | Production mode |

### Frontend (update existing)

| Variable | New Value |
|----------|-----------|
| `NEXT_PUBLIC_API_URL` | Backend Vercel URL (e.g., `https://computer-lot-backend-xxx.vercel.app`) |

---

## Deployment Steps

### Step 1: Create Files

Create the three files listed above in the `backend/` directory.

### Step 2: Commit and Push

```bash
git add backend/app/api/index.py backend/vercel.json backend/.vercelignore
git commit -m "feat: add Vercel deployment config for backend"
git push origin main
```

### Step 3: Deploy Backend to Vercel

```bash
cd backend
vercel deploy -y --no-wait --scope hammads-projects-6b8c035b
```

This creates a new Vercel project (e.g., `computer-lot-backend`) and deploys it.

### Step 4: Set Backend Environment Variables

```bash
cd backend

# Supabase credentials
printf "https://ybwbwllmryjdfqvfpcik.supabase.co\n" | \
  vercel env add SUPABASE_URL preview --type config --yes --scope hammads-projects-6b8c035b

printf "eyJhbGci...\n" | \
  vercel env add SUPABASE_ANON_KEY preview --type config --yes --scope hammads-projects-6b8c035b

# ... (repeat for all variables from .env)

# CORS and Frontend URL
printf "https://frontend-xxx.vercel.app\n" | \
  vercel env add CORS_ORIGINS preview --type config --yes --scope hammads-projects-6b8c035b

printf "https://frontend-xxx.vercel.app\n" | \
  vercel env add FRONTEND_URL preview --type config --yes --scope hammads-projects-6b8c035b
```

### Step 5: Redeploy Backend (apply env vars)

```bash
vercel deploy -y --no-wait --scope hammads-projects-6b8c035b
```

### Step 6: Verify Backend

```bash
vercel inspect <backend-url> --scope hammads-projects-6b8c035b
```

Check `/health` endpoint and `/docs` for OpenAPI UI.

### Step 7: Update Frontend API URL

```bash
cd frontend

# Remove old value
vercel env rm NEXT_PUBLIC_API_URL preview --yes --scope hammads-projects-6b8c035b

# Add new backend URL
printf "https://computer-lot-backend-xxx.vercel.app\n" | \
  vercel env add NEXT_PUBLIC_API_URL preview --type config --yes --scope hammads-projects-6b8c035b
```

### Step 8: Redeploy Frontend

```bash
vercel deploy -y --no-wait --scope hammads-projects-6b8c035b
```

---

## Serverless Compatibility Notes

| Component | Status | Notes |
|-----------|--------|-------|
| FastAPI app | Compatible | Vercel detects automatically |
| Database connections | Compatible | Created per-request, closed in `finally` |
| Supabase client | Compatible | HTTP-based, no persistent state |
| psycopg2 | Compatible | Created per-request in `DatabaseWriter` |
| Rate limiting | Partially works | In-memory only, not enforced across instances |
| WebSocket | Supported | But frontend uses Supabase realtime instead |

---

## Expected Outcome

| Item | Result |
|------|--------|
| Backend project | `computer-lot-backend` on Vercel |
| Backend URL | `https://computer-lot-backend-xxx.vercel.app` |
| Frontend API URL | Updated to point to backend |
| Checkout flow | Working end-to-end |
| Admin features | CSV import, order management, sourcing |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rate limiting across instances | Low | Acceptable for now; add Upstash Redis later |
| Python cold starts | Low | First request ~2-3s slower |
| CORS misconfiguration | Medium | Test with frontend after deployment |
| Missing env vars | Medium | Backend will fail to start; check `/health` |

---

## Verification Checklist

- [ ] Backend `/health` returns `{"status": "ok"}`
- [ ] Backend `/docs` shows OpenAPI UI
- [ ] Frontend can call backend endpoints
- [ ] Checkout flow works end-to-end
- [ ] Admin dashboard loads data
- [ ] CORS headers present in responses
