-- ============================================================
-- 010: WHOLESALE PRICE CANNOT EXCEED RETAIL
-- Guards the tier invariant wholesale <= retail so no buyer is
-- ever charged above the retail price at any tier (approved or
-- wholesale). Mirrors products_approved_price_check (approved <=
-- wholesale) from migration 009.
--
-- Data fix first: rows violating the invariant (e.g. seed row
-- 'exmple-sku-001', retail 1200 < wholesale 10500) are normalized
-- to retail so no customer overpays. approved is reset to retail
-- too so the approved <= wholesale CHECK still holds.
--
-- The CHECK is added NOT VALID then VALIDATED (migration-007 style);
-- the UPDATE guarantees every existing row satisfies it.
-- No RLS change needed -- products stay public-read.
-- Never edits applied migrations 001-009.
-- ============================================================

UPDATE public.products
SET wholesale_price_per_lot = retail_price_per_lot,
    approved_price_per_lot = retail_price_per_lot
WHERE wholesale_price_per_lot > retail_price_per_lot
   OR approved_price_per_lot > wholesale_price_per_lot;

ALTER TABLE public.products
    ADD CONSTRAINT products_wholesale_price_check
        CHECK (wholesale_price_per_lot <= retail_price_per_lot)
        NOT VALID;

ALTER TABLE public.products
    VALIDATE CONSTRAINT products_wholesale_price_check;
