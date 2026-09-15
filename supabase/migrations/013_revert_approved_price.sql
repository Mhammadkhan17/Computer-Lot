-- 013_revert_approved_price.sql
--
-- Reverts the three-tier pricing amendment (commit b58dc9b, Aug 3 2026)
-- back to the original two-tier model (retail + wholesale at 10+ lots).
-- Removes: products.approved_price_per_lot column and its CHECK constraint.
--
-- Ordering matters: drop the CHECK constraint first (so it doesn't reference
-- a column we're about to drop), then drop NOT NULL, then drop the column.

-- Step 1: Drop the CHECK constraint that validates approved_price_per_lot.
-- Uses CASCADE because the constraint may be referenced; it only exists
-- on the products table, so there's no downstream dependency risk.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_approved_price_check CASCADE;

-- Step 2: Drop the NOT NULL constraint so the column can be removed.
ALTER TABLE products ALTER COLUMN approved_price_per_lot DROP NOT NULL;

-- Step 3: Drop the column entirely.
ALTER TABLE products DROP COLUMN IF EXISTS approved_price_per_lot;

NOTIFY pg_log, 'Migration 013: approved_price_per_lot column removed from products';
