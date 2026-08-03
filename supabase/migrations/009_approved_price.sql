-- ============================================================
-- 009: THREE-TIER PRICING — APPROVED PRICE PER LOT
-- Adds products.approved_price_per_lot, a third per-product price that
-- wholesale_approved users pay on ANY order size (subject to the per-product
-- minimum_wholesale_lots). Existing products are backfilled to their wholesale
-- price so no price changes until the merchant edits them. A NOT NULL column
-- with a CHECK that mirrors the app-level guard (approved <= wholesale).
--
-- The CHECK is added NOT VALID then VALIDATED (migration-007 style): the
-- backfill guarantees every existing row satisfies `approved <= wholesale`
-- (they are equal), and the constraint is enforced for all future writes.
--
-- No RLS change needed — products stay public-read.
-- Never edits applied migrations 001-008.
-- ============================================================

ALTER TABLE public.products
    ADD COLUMN approved_price_per_lot DECIMAL(12,2);

UPDATE public.products
SET approved_price_per_lot = wholesale_price_per_lot
WHERE approved_price_per_lot IS NULL;

ALTER TABLE public.products
    ALTER COLUMN approved_price_per_lot SET NOT NULL;

-- NOT VALID → VALIDATE pattern (see migration 007): existing rows are
-- guaranteed clean by the backfill above, so we validate after adding.
ALTER TABLE public.products
    ADD CONSTRAINT products_approved_price_check
        CHECK (approved_price_per_lot > 0 AND approved_price_per_lot <= wholesale_price_per_lot)
        NOT VALID;

ALTER TABLE public.products
    VALIDATE CONSTRAINT products_approved_price_check;
