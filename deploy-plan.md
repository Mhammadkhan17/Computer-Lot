# Deployment Plan — Computer-Lot to Vercel

## Goal

Deploy the **Computer-Lot Hybrid Liquidation Platform** frontend (Next.js 15) to Vercel as a **preview deployment**, linking the GitHub repository for automatic git-push deploys on every future push.

## What We're Achieving

1. **First-ever Vercel deployment** — No existing Vercel project for this repo
2. **Git integration** — Push-to-deploy so future commits auto-deploy
3. **Preview URL** — A live URL to share and test the frontend

---

## Current State Summary

| Item | Status |
|------|--------|
| Git remote | `git@github.com:Mhammadkhan17/Computer-Lot.git` |
| Vercel CLI | Authenticated as `mhammadkhan17` |
| Team | `hammads-projects-6b8c035b` (only team) |
| Vercel project | **None exists for this repo** |
| `.vercel/` directory | **Not linked** |
| Branch | `main`, 7 commits ahead of `origin/main` |
| Frontend location | `frontend/` subdirectory (Next.js 15) |
| Backend | `backend/` (FastAPI — NOT deployed to Vercel) |

---

## Uncommitted Changes

| File | Status | Action |
|------|--------|--------|
| `backend/app/utils/security.py` | Modified | **Commit** — adds `check_role()` utility function |
| `skills-lock.json` | Modified | **Commit** — auto-generated lock file |
| `.agents/skills/deploy-to-vercel/` | Untracked | **Commit** — skill installation artifacts |
| `backend/data/sourcing_requests.json` | Untracked | **Exclude** — runtime data, not source code |

---

## Step-by-Step Plan

### Step 1: Handle Uncommitted Changes

Commit the intentional changes and exclude runtime data.

```bash
# Exclude runtime data from version control
echo "backend/data/" >> .gitignore

# Stage all files
git add -A

# Commit
git commit -m "chore: commit security utils, skill files, and gitignore runtime data"
```

**Why:** Clean working tree before linking. Vercel deploys from git, so everything must be committed.

---

### Step 2: Link Project to Vercel (Repo-Based)

```bash
vercel link --repo --scope hammads-projects-6b8c035b
```

**What this does:**
- Reads the git remote URL (`github.com/Mhammadkhan17/Computer-Lot.git`)
- Creates a new Vercel project named `computer-lot` (or matches existing)
- Creates `.vercel/repo.json` with project ID and org ID
- Enables git integration — future pushes auto-deploy

**Result:** A new `.vercel/repo.json` file appears in the project root.

---

### Step 3: Configure Root Directory

The Next.js app is in `frontend/`, not the repo root. Vercel needs to know this.

```bash
# Set the root directory to frontend/ for the Vercel project
vercel project pull --scope hammads-projects-6b8c035b
# Then configure via CLI or dashboard:
vercel env pull  # optional verification
```

**Alternative (if CLI doesn't support root dir setting):**
Set the **Root Directory** to `frontend` in the Vercel dashboard under Project Settings → General → Root Directory.

**Why:** Without this, Vercel would look for `package.json` at the repo root and fail to build.

---

### Step 4: Set Environment Variables

The frontend needs Supabase environment variables. These are in `frontend/.env` but won't be in git.

```bash
# Pull env vars from .env file into Vercel
# Or manually add in Vercel dashboard under Settings → Environment Variables
```

**Required env vars** (from `frontend/.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Any other `NEXT_PUBLIC_*` vars

---

### Step 5: Push to Trigger First Deployment

```bash
git push origin main
```

**What this does:**
- Pushes all 7 pending commits + the new commit to GitHub
- Vercel detects the push and triggers a build
- Since this is `main` branch, it deploys as a **preview** (not production unless configured)

---

### Step 6: Retrieve Preview URL

```bash
sleep 5
vercel ls --format json
```

Extract the `url` field from the latest deployment entry.

---

## Expected Outcome

| Item | Result |
|------|--------|
| Vercel project | `computer-lot` created and linked |
| `.vercel/repo.json` | Created with project ID and org ID |
| Preview URL | `https://computer-lot-<hash>.vercel.app` |
| Git integration | Future `git push` auto-deploys |
| Root directory | `frontend/` |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Build fails due to missing env vars | Add env vars in Vercel dashboard before push |
| Root directory misconfigured | Verify in Vercel dashboard after linking |
| Backend not deployable | Backend is FastAPI — separate deployment needed later |
