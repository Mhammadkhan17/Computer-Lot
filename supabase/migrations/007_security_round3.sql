-- ============================================================
-- 007: SECURITY ROUND 3 HARDENING (H-R3-1, M-R3-1, M-R3-2, L-R3-2)
-- Fixes:
--   H-R3-1  admin_cancel_order double-restock — status guard + FOR UPDATE
--           (serialize vs expire_pending_orders) + idempotency + auditable
--           restock markers + DB-level order status state-machine trigger.
--   M-R3-1  is_admin() hardened (auth.role()='authenticated' required) and
--           the admin RPC EXECUTE grants re-documented (keep them; the
--           backend admin routes call these via the caller-scoped client per
--           ADR-009 — removing them requires an ADR-009 amendment).
--   M-R3-2  Automatic pending-order expiry via pg_cron (hourly) using an
--           owner-only runner (no is_admin gate, not callable via PostgREST
--           nor by authenticated/service_role) + transactional per-user
--           open-order cap inside create_order (pg_advisory_xact_lock +
--           count; same signature).
--   L-R3-2  products price/lot lower-bound CHECK constraints.
-- Never edits applied migrations 001-006.
-- ============================================================

-- ============================================================
-- M-R3-2: ensure pg_cron is available for the hourly expiry job.
-- (Created on the hosted project; idempotent.)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- H-R3-1: auditable restock markers on orders. Every restock path
-- (admin_cancel_order, expire_pending_orders_runner) records when and
-- why stock was restored so inventory movements are traceable.
-- ============================================================
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS restocked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS restocked_why TEXT;

-- ============================================================
-- M-R3-1: harden is_admin() — fail closed for any non-authenticated
-- session (anon / service_role / cron) by requiring auth.role() =
-- 'authenticated' in addition to an admin profile row.
-- SECURITY DEFINER stays: it is required inside RLS policies to avoid
-- recursion (see Round-1 L1 WON'T-FIX); it must NOT be converted to
-- SECURITY INVOKER. auth.uid()/auth.role() read the per-request JWT GUCs
-- set by PostgREST, so they are correct inside a definer function.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'authenticated'
     AND EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role = 'admin'
     );
$$;

-- ============================================================
-- H-R3-1: admin_cancel_order — status guard + FOR UPDATE + idempotent.
-- Locks the order row regardless of status (serializes against
-- expire_pending_orders, which uses FOR UPDATE SKIP LOCKED, and against
-- concurrent cancels). Only pending_whatsapp orders are restocked;
-- every other outcome returns a typed status without touching inventory:
--   'not_found'                    -> row does not exist
--   'already_cancelled_or_missing' -> exists but not pending_whatsapp
--   'cancelled'                    -> restocked exactly once + cancelled
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_cancel_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_item RECORD;
    v_restocked BOOLEAN;
    v_readable_order_id BIGINT;
    v_user_id UUID;
    v_status public.order_status;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    SELECT readable_order_id, user_id, status
    INTO v_readable_order_id, v_user_id, v_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE; -- serialize against expire_pending_orders / concurrent cancels

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_status <> 'pending_whatsapp' THEN
        -- Already cancelled / completed / processing — nothing to restock.
        RETURN jsonb_build_object(
            'status', 'already_cancelled_or_missing',
            'order_id', p_order_id::TEXT
        );
    END IF;

    FOR v_item IN
        SELECT product_id, quantity_ordered
        FROM public.order_items
        WHERE order_id = p_order_id
    LOOP
        SELECT public.increment_stock_inventory(v_item.product_id, v_item.quantity_ordered)
        INTO v_restocked;
        IF NOT v_restocked THEN
            RAISE EXCEPTION 'Restock failed for product %', v_item.product_id;
        END IF;
    END LOOP;

    UPDATE public.orders
    SET status = 'cancelled',
        restocked_at = NOW(),
        restocked_why = 'admin_cancel'
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'status', 'cancelled',
        'order_id', p_order_id::TEXT,
        'readable_order_id', v_readable_order_id,
        'user_id', v_user_id::TEXT
    );
END;
$function$;

-- ============================================================
-- H-R3-1: DB-level state machine guard on orders.status.
-- 'cancelled' is terminal; a 'completed' order cannot be reopened to
-- pending/processing; and the ONLY transition INTO 'cancelled' is from
-- 'pending_whatsapp' AND must carry the restock audit marker
-- (restocked_at NOT NULL) that admin_cancel_order /
-- expire_pending_orders_runner set. This makes every cancel a
-- stock-restoring, audited cancel: a direct UPDATE that tries to cancel a
-- processing/completed order — or a pending order WITHOUT the marker
-- (bypassing the restock RPCs) — is rejected at the DB, so no path can
-- mark an order cancelled while its stock stays committed or gets double-
-- restored. Same-status no-ops allowed (e.g. expiry job re-touching
-- restocked_at).
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_order_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot change status of a cancelled order (terminal state)';
    END IF;
    IF NEW.status = 'cancelled' THEN
        IF OLD.status <> 'pending_whatsapp' THEN
            RAISE EXCEPTION 'Only pending_whatsapp orders can be cancelled (stock-restoring cancels)';
        END IF;
        IF NEW.restocked_at IS NULL THEN
            RAISE EXCEPTION 'Cancel requires a restock audit marker (restocked_at); use admin_cancel_order';
        END IF;
    END IF;
    IF OLD.status = 'completed' AND NEW.status IN ('pending_whatsapp', 'processing') THEN
        RAISE EXCEPTION 'Cannot reopen a completed order';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_status_transition_guard ON public.orders;
CREATE TRIGGER orders_status_transition_guard
    BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_order_status_transitions();

-- ============================================================
-- M-R3-2: shared expiry implementation WITHOUT the is_admin() gate.
-- The scheduler (pg_cron) runs as postgres and has no JWT session, so it
-- cannot pass the admin gate. This function is SECURITY DEFINER and
-- EXECUTE is revoked from PUBLIC/anon/authenticated/service_role, so it
-- is NOT reachable through PostgREST and is NOT a privesc primitive.
-- Only the owner (postgres) keeps EXECUTE, which is what pg_cron uses.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_pending_orders_runner(p_older_than_hours INT DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_restocked BOOLEAN;
    v_expired INT := 0;
    v_hours INT;
BEGIN
    v_hours := COALESCE(p_older_than_hours, 24);
    IF v_hours <= 0 THEN
        v_hours := 24;
    END IF;

    FOR v_order IN
        SELECT id
        FROM public.orders
        WHERE status = 'pending_whatsapp'
          AND created_at < NOW() - (v_hours * INTERVAL '1 hour')
        ORDER BY id
        FOR UPDATE SKIP LOCKED
    LOOP
        FOR v_item IN
            SELECT product_id, quantity_ordered
            FROM public.order_items
            WHERE order_id = v_order.id
        LOOP
            SELECT public.increment_stock_inventory(v_item.product_id, v_item.quantity_ordered)
            INTO v_restocked;
            IF NOT v_restocked THEN
                RAISE EXCEPTION 'Restock failed for order %', v_order.id;
            END IF;
        END LOOP;

        UPDATE public.orders
        SET status = 'cancelled',
            restocked_at = NOW(),
            restocked_why = 'expiry'
        WHERE id = v_order.id;

        v_expired := v_expired + 1;
    END LOOP;

    RETURN jsonb_build_object('expired', v_expired);
END;
$function$;

-- The runner must NOT be callable by any signed-in user (PostgREST) nor by
-- the service_role client. Only the owning role (postgres) may call it.
REVOKE ALL ON FUNCTION public.expire_pending_orders_runner(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_pending_orders_runner(INT) FROM anon;
REVOKE ALL ON FUNCTION public.expire_pending_orders_runner(INT) FROM authenticated;
REVOKE ALL ON FUNCTION public.expire_pending_orders_runner(INT) FROM service_role;

-- ============================================================
-- M-R3-2: admin-facing expire_pending_orders becomes a thin wrapper.
-- Same signature and same authenticated-only grant as migration 005.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_pending_orders(p_older_than_hours INT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    RETURN public.expire_pending_orders_runner(p_older_than_hours);
END;
$function$;

-- ============================================================
-- M-R3-1: (re)document and re-assert the admin RPC EXECUTE grants.
-- The backend admin routes call these via the caller-scoped user client
-- (ADR-009). Removing these grants would require moving the calls to a
-- service_role client, which conflicts with ADR-009 and must be an
-- ADR-reviewed decision. is_admin() is the authority gate (hardened above).
-- service_role EXECUTE is additionally revoked here: ADR-009 confines the
-- service_role client to /checkout (create_order only), and the backend
-- never calls these admin RPCs with it. is_admin() would reject a
-- service_role caller anyway (auth.role()='service_role' != 'authenticated'),
-- so this is pure defense-in-depth / grant hygiene.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.expire_pending_orders(INT) FROM public;
REVOKE EXECUTE ON FUNCTION public.expire_pending_orders(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_pending_orders(INT) FROM service_role;
GRANT EXECUTE ON FUNCTION public.expire_pending_orders(INT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_order(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_order(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_profile_role(uuid, public.user_role) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_role(uuid, public.user_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_role(uuid, public.user_role) FROM service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_role(uuid, public.user_role) TO authenticated;

-- ============================================================
-- M-R3-2: hourly pg_cron job. Idempotent (unschedule-if-exists first so
-- re-applying the migration does not stack duplicate jobs). The job runs
-- as postgres and calls the un-gated runner directly.
-- NOTE: the inner dollar-quote uses a distinct tag ($cmd$) because
-- PostgreSQL does not allow nested dollar-quoting with the same tag.
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-pending-orders-hourly') THEN
        PERFORM cron.unschedule('expire-pending-orders-hourly');
    END IF;
    PERFORM cron.schedule(
        'expire-pending-orders-hourly',
        '0 * * * *',
        $cmd$SELECT public.expire_pending_orders_runner(24);$cmd$
    );
END;
$$;

-- ============================================================
-- L-R3-2: products price/lot lower-bound CHECKs (DB is the last line of
-- defense — AGENTS.md §5/§11). Live data verified clean before adding
-- (min retail 120.00, min wholesale 90.00, min items_per_lot 2, min
-- minimum_wholesale_lots 3), so plain CHECKs are safe without NOT VALID.
-- ============================================================
ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_prices_check;
ALTER TABLE public.products
    ADD CONSTRAINT products_prices_check
        CHECK (retail_price_per_lot > 0 AND wholesale_price_per_lot > 0);

ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_lots_check;
ALTER TABLE public.products
    ADD CONSTRAINT products_lots_check
        CHECK (items_per_lot > 0 AND minimum_wholesale_lots > 0);

-- ============================================================
-- M-R3-2: transactional per-user open-order cap inside create_order.
-- Same 5-param signature (existing service_role-only grant is preserved by
-- CREATE OR REPLACE). A per-user advisory lock serializes concurrent
-- checkouts from the same user so the pending-order count is authoritative,
-- closing the app-level _assert_open_order_cap race (order_intake.py).
-- Cap value 20 matches backend settings.open_order_cap.
-- Returns a typed {'commit': false, 'open_order_cap': true, ...} so the
-- API can respond 400 (txn.py maps it).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_order(
    p_user_id uuid,
    p_customer_name character varying,
    p_customer_phone character varying,
    p_total_amount numeric,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_order_id UUID;
    v_readable_order_id BIGINT;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INT;
    v_unit_price DECIMAL;
    v_decremented BOOLEAN;
    v_available INT;
    v_title TEXT;
    v_errors JSONB := '[]'::jsonb;
    v_result JSONB;
    v_open_orders INT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Checkout requires at least one item';
    END IF;

    IF jsonb_array_length(p_items) > 50 THEN
        RAISE EXCEPTION 'Too many line items (max 50)';
    END IF;

    -- Serialize per-user checkout transactions so the pending-order cap
    -- below is authoritative even when two checkouts race. Lock order:
    -- advisory lock first, then product row locks (no reverse ordering
    -- anywhere, so no advisory-vs-row deadlock).
    PERFORM pg_advisory_xact_lock(hashtext('user-open-orders'), hashtext(p_user_id::text));

    SELECT COUNT(*) INTO v_open_orders
    FROM public.orders
    WHERE user_id = p_user_id
      AND status = 'pending_whatsapp';

    IF v_open_orders >= 20 THEN
        RETURN jsonb_build_object(
            'commit', false,
            'open_order_cap', true,
            'open_orders', v_open_orders
        );
    END IF;

    -- Validate + lock product rows, collecting insufficient-stock items.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity_ordered')::INT;

        IF v_quantity <= 0 OR v_quantity > 1000 THEN
            RAISE EXCEPTION 'Invalid quantity for product %', v_product_id;
        END IF;

        SELECT available_stock_lots, title
        INTO v_available, v_title
        FROM public.products
        WHERE id = v_product_id
        FOR UPDATE;

        IF NOT FOUND OR v_available < v_quantity THEN
            v_errors := v_errors || jsonb_build_object(
                'product_id', v_product_id::TEXT,
                'title', COALESCE(v_title, 'Unknown Product'),
                'available', COALESCE(v_available, 0),
                'requested', v_quantity
            );
        END IF;
    END LOOP;

    IF jsonb_array_length(v_errors) > 0 THEN
        RETURN jsonb_build_object(
            'commit', false,
            'insufficient_stock', true,
            'out_of_stock', v_errors
        );
    END IF;

    INSERT INTO public.orders (user_id, customer_name, customer_phone, total_amount)
    VALUES (p_user_id, p_customer_name, p_customer_phone, p_total_amount)
    RETURNING id, readable_order_id INTO v_order_id, v_readable_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity_ordered')::INT;
        v_unit_price := (v_item->>'unit_price_applied')::DECIMAL;

        IF v_unit_price <= 0 OR v_unit_price > 1000000 THEN
            RAISE EXCEPTION 'Invalid unit price for product %', v_product_id;
        END IF;

        INSERT INTO public.order_items (order_id, product_id, quantity_ordered, unit_price_applied)
        VALUES (v_order_id, v_product_id, v_quantity, v_unit_price);

        SELECT decrement_stock_inventory(v_product_id, v_quantity) INTO v_decremented;
        IF NOT v_decremented THEN
            RAISE EXCEPTION 'Insufficient stock for product %', v_product_id;
        END IF;
    END LOOP;

    v_result := jsonb_build_object(
        'order_id', v_order_id::TEXT,
        'readable_order_id', v_readable_order_id,
        'commit', true
    );

    RETURN v_result;
END;
$function$;
