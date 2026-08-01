-- ============================================================
-- 005: MEDIUM SEVERITY HARDENING (M4)
-- Expire stale pending_whatsapp orders and restock inventory
-- atomically. Never edits applied migrations 001-004.
-- ============================================================

-- ============================================================
-- M4: expire_pending_orders — admin-guarded SECURITY DEFINER.
-- Selects expired pending orders (FOR UPDATE SKIP LOCKED so
-- concurrent runs don't double-process), restocks each line via
-- increment_stock_inventory (nested SECURITY DEFINER call runs
-- as the owner, matching admin_cancel_order in migration 004),
-- then marks the orders cancelled. Runs as one transaction.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_pending_orders(p_older_than_hours INT)
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

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
        SET status = 'cancelled'
        WHERE id = v_order.id;

        v_expired := v_expired + 1;
    END LOOP;

    RETURN jsonb_build_object('expired', v_expired);
END;
$function$;

-- ============================================================
-- GRANTS: same pattern as the 004 admin RPCs — revoke the
-- Supabase default grants and PUBLIC, grant to authenticated
-- only; is_admin() gates actual authority.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.expire_pending_orders(INT) FROM public;
REVOKE EXECUTE ON FUNCTION public.expire_pending_orders(INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.expire_pending_orders(INT) TO authenticated;

-- ============================================================
-- M4: partial index for the expiry scan (status + created_at).
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
    ON public.orders (status, created_at)
    WHERE status = 'pending_whatsapp';
