# Project Glossary

| Term | Definition |
|------|------------|
| **Lot** | The basic trading unit of a product. A lot may contain multiple items (e.g., "10 CPUs per lot"). Users buy lots, not individual components. |
| **Retail** | Default user role. Standard pricing on all products. |
| **Wholesale Pending** | User who submitted wholesale application (company_name + tax_registration_id) but hasn't been approved yet. |
| **Wholesale Approved** | User role granting access to the approved-price tier (deeper discount than wholesale) on any order size, subject to per-product minimums. |
| **Admin** | Full system access — can manage products, orders, user approvals. Follows the uniform pricing rule (wholesale at ≥ 10 lots). |
| **Grade_A / Grade_B / Grade_C / For_Parts** | Product condition grading from best (A) to worst (For_Parts = damaged/as-is). |
| **Minimum Wholesale Lots** | Per-product threshold. Applies to ALL discount tiers — a user must buy at least this many lots of a product to get its wholesale or approved price. |
| **Total Lots Threshold** | Order-wide minimum of 10 lots for the wholesale tier. Sum of all item quantities in the order. Available to any signed-in user, including admins. |
| **Approved Price** | Per-product price (`approved_price_per_lot`) paid by `wholesale_approved` users on any order size (subject to per-product minimums). Must be ≤ the wholesale price. |
| **Hybrid Pricing** | Pricing model where a single order can mix retail, wholesale, and approved line items based on per-product and per-order thresholds. |
| **WhatsApp Fulfillment** | Order delivery model — no payment gateway. Orders generate a WhatsApp Business deep link for manual merchant fulfillment. |
| **Atomic Stock Decrement** | PostgreSQL function (`decrement_stock_inventory`) that safely reduces stock with a built-in availability check. |
| **All-or-Nothing Transaction** | Checkout processes all items in a single DB transaction. If any item fails, the entire order is rolled back. |
| **Server Components** | Next.js 15 React Server Components used for all read-side data fetching (products, orders, profiles). |
| **service_role** | Supabase backend key with full database access. Only used by the `/checkout` FastAPI endpoint. |
| **anon key** | Public Supabase client key. Used in the frontend under RLS restrictions. |
| **RLS** | Row Level Security — PostgreSQL policies that restrict data access per user. |
| **Zustand** | Lightweight state management library used for the shopping cart (with `persist` middleware for localStorage). |
| **Readable Order ID** | An auto-incrementing `BIGSERIAL` integer displayed to customers for reference (separate from the internal UUID primary key). |
