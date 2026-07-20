# Major Implementation Plan — Phase 2

## Stack: Next.js 15 (App Router) + FastAPI + Supabase
## Current State: Dashboard has Overview, Orders, Approvals sections. WebSocket real-time infra is built. Signup collects wholesale fields.

---

## Feature A: Dynamic Product Detail Page (`/products/[id]`)

### Step A1 — Make product card clickable
**File**: `frontend/src/components/product-card.tsx`
- Wrap the entire `<Card>` body (except the "Add to Cart" button in `<CardFooter>`) with `<Link href={/products/${product.id}}>`
- The `<CardFooter>` with the button stays outside the Link so it's clickable independently
- Use `next/link` import

### Step A2 — Create server component page
**File**: `frontend/src/app/products/[id]/page.tsx`
- Async server component
- Fetch product by `id` param: `supabase.from("products").select("*").eq("id", params.id).single()`
- 404 if not found
- `generateMetadata` for SEO (product title as page title)
- Render `<ProductDetailContent product={product} />`

### Step A3 — Create client detail component
**File**: `frontend/src/app/products/[id]/product-detail-content.tsx`
- "use client"
- Full-width layout: image gallery left (60%), details right (40%)
- Image gallery: main image + thumbnail strip (if multiple images)
- Grade badge + "AS-IS" badge if For_Parts
- Full description (not truncated)
- Hardware specifications table:
  - Render `product.hardware_specifications` as a key-value table
  - Handle `Record<string, unknown>` type safely
- Pricing section: Retail price/lot, Wholesale price/lot with minimum lots note
- Stock status with count
- "Add to Cart" button (reuse from product-card pattern)
- Tags displayed as chips/badges
- Back to catalog link

### Step A4 — Add route to sidebar/nav
**File**: `frontend/src/components/navbar.tsx` (if needed — route is linked from cards, no nav needed)

---

## Feature B: Dashboard Products Section (Read-Only Table First)

### Step B1 — Add "products" to section types
**File**: `frontend/src/app/dashboard/dashboard-provider.tsx`
- Add `"products"` to `DashboardSection` union type

### Step B2 — Add sidebar nav item
**File**: `frontend/src/app/dashboard/sidebar.tsx`
- Add `{ section: "products", label: "Products", icon: Package }` to `navItems` array

### Step B3 — Create ProductsSection component (read-only table)
**File**: `frontend/src/app/dashboard/sections/products.tsx`
- Fetch products from Supabase: `supabase.from("products").select("*").order("created_at", { ascending: false })`
- Table columns: SKU, Title, Grade, Stock, Retail Price, Wholesale Price, Actions (Edit/Delete)
- Client-side search by SKU or title
- Skeleton loading states
- Empty state: "No products yet"

### Step B4 — Wire into dashboard-content
**File**: `frontend/src/app/dashboard/dashboard-content.tsx`
- Import `ProductsSection`
- Fetch product count (already done for overview)
- Add `products` section render: `{activeSection === "products" && <ProductsSection ... />}`
- Subscribe to `product_update` WebSocket events for real-time refresh

---

## Feature C: Add Product Modal (Single Product Creation)

### Step C1 — Create AddProductModal component
**File**: `frontend/src/app/dashboard/sections/add-product-modal.tsx`
- Uses `@radix-ui/react-dialog` (already installed) as base for modal
- Form fields:
  - Title (text, required)
  - SKU (text, required)
  - Description (textarea)
  - Grade (select: Grade_A/B/C, For_Parts)
  - Items per lot (number, default 1)
  - Retail price per lot (number, required)
  - Wholesale price per lot (number, required)
  - Minimum wholesale lots (number, default 5)
  - Available stock lots (number, default 0)
  - Image URLs (text, comma-separated, optional)
  - Tags (text, comma-separated, optional)
  - Hardware specs (JSON textarea, optional)

### Step C2 — Wire form submission
- On submit: `supabase.from("products").insert({...}).execute()`
- RLS allows admin INSERT (policy exists)
- On success: close modal, refresh table, show success toast
- On error: show error toast with details
- Broadcast `product_update` via WebSocket after creation

### Step C3 — Add "+ Add Product" button to ProductsSection
- Button in the header area of the products table
- Opens the modal

---

## Feature D: Backend CSV Import Endpoint (TDD)

### Seams to test (confirm before implementing):
| Seam | Public Interface | Test Approach |
|---|---|---|
| CSV Parser | `POST /admin/products/import` (multipart file upload) | `TestClient` with `io.BytesIO` CSV file |
| Validation | Response includes per-row errors for invalid data | Send bad CSV, check error detail |
| Insertion | Products appear in DB (mock `supabase.table().insert()`) | Mock supabase, verify insert called with parsed data |
| Auth | Non-admin gets 403 | `_make_token({"role": "retail"})` |
| Template | `GET /admin/products/template` returns CSV | Check response content-type + header row |

### Implementation Plan:

**Backend files:**
- `backend/app/routes/admin.py` — add 2 new endpoints:
  - `POST /admin/products/import` — accepts CSV file, parses with Python `csv.DictReader`, validates each row, inserts via Supabase client
  - `GET /admin/products/template` — returns a CSV template with headers + 1 example row

**Test files:**
- `backend/tests/test_admin.py` — extend with `TestAdminProducts` class

### CSV Format Spec:
Headers: `title, sku, description, grade, items_per_lot, retail_price_per_lot, wholesale_price_per_lot, minimum_wholesale_lots, available_stock_lots, image_urls, tags, hardware_specifications`

Validation rules:
- title: required, non-empty
- sku: required, non-empty
- grade: must be valid `item_grade` enum value
- retail_price_per_lot: required, > 0
- wholesale_price_per_lot: required, > 0
- available_stock_lots: required, >= 0
- items_per_lot: optional, default 1
- minimum_wholesale_lots: optional, default 5
- image_urls: optional, comma-separated → parsed into TEXT[] array
- tags: optional, comma-separated → parsed into TEXT[] array
- hardware_specifications: optional, JSON string → parsed into JSONB

Response format:
```json
{
  "inserted": 42,
  "errors": [
    { "row": 5, "sku": "CPU-001", "reason": "Missing title" },
    { "row": 12, "sku": "", "reason": "Invalid price: -10" }
  ],
  "total_rows": 50
}
```

---

## Feature E: CSV Upload + Template Download UI

### Step E1 — Add upload button to ProductsSection
- "Upload CSV" button next to "+ Add Product"
- File input (accept=".csv") hidden, triggered by button click
- On file select:
  1. Read file as `FormData`
  2. POST to `{API_URL}/admin/products/import` with JWT auth
  3. Show loading state
  4. On success: show result toast (X inserted, Y errors)
  5. If errors exist: show inline error table with row-by-row details
  6. Refresh product table

### Step E2 — Add Download Template button
- Simple `<a>` tag or button that triggers download:
  ```ts
  const blob = await fetch(`${API_URL}/admin/products/template`).then(r => r.blob())
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "product-import-template.csv"
  a.click()
  ```

---

## Feature F: Edit/Delete Products (from table actions)

### Step F1 — Edit product
- Reuse AddProductModal but pre-fill with existing product data
- On submit: `supabase.from("products").update({...}).eq("id", product.id).execute()`
- Broadcast `product_update`

### Step F2 — Delete product
- Confirmation dialog before deletion
- On confirm: `supabase.from("products").delete().eq("id", product.id).execute()`
- Show warning about associated order_items (foreign key constraint — prevent deletion if items exist, or allow with CASCADE)
- Broadcast `product_update`

---

## TypeScript Types to Add

**File**: `frontend/src/types/index.ts`
```typescript
// For CSV import result
export interface CsvImportResult {
  inserted: number
  errors: CsvImportError[]
  total_rows: number
}

export interface CsvImportError {
  row: number
  sku: string
  reason: string
}

// For CSV template column validation
export type ProductCsvColumn = keyof Pick<Product, "title" | "sku" | "description" | "grade" | "items_per_lot" | "retail_price_per_lot" | "wholesale_price_per_lot" | "minimum_wholesale_lots" | "available_stock_lots">

// For form validation on Add/Edit
export interface ProductFormData {
  title: string
  sku: string
  description?: string
  grade: ItemGrade
  items_per_lot: number
  retail_price_per_lot: number
  wholesale_price_per_lot: number
  minimum_wholesale_lots: number
  available_stock_lots: number
  imageUrls: string    // comma-separated input, split on submit
  tags: string          // comma-separated input, split on submit
  hardwareSpecs: string // JSON string input, parse on submit
}
```

---

## Execution Order (Vertical Slices)

| Order | Step | TDD? | Est. Time |
|-------|------|------|-----------|
| 1 | A1: Make card clickable | No (trivial) | 5 min |
| 2 | A2 + A3: Product detail page | No (read-only, no complex logic) | 20 min |
| 3 | B1-B4: Products table in dashboard (read-only) | No | 20 min |
| 4 | C1-C3: Add Product modal | No (direct Supabase, RLS handles auth) | 20 min |
| 5 | D: Backend CSV import endpoint | Yes (validation logic, auth, parsing) | 30 min |
| 6 | E1-E2: CSV upload + template download UI | No | 15 min |
| 7 | F1-F2: Edit + Delete products | No | 15 min |

Total: ~2 hours
