-- ============================================================
-- 004: SECURITY HARDENING (C1/C3/H3/H4)
-- Closes service_role sprawl, TOCTOU stock check, and input
-- bound gaps. Never edits applied migrations 001/002.
-- ============================================================

-- ============================================================
-- C3/H3/H4: decrement_stock_inventory / increment_stock_inventory
-- guards — reject non-positive steps at the DB (final authority).
-- ============================================================
CREATE OR REPLACE FUNCTION public.decrement_stock_inventory(row_id UUID, steps INT)
RETURNS BOOLEAN AS $$
DECLARE
    rows_affected INT;
BEGIN
    IF steps <= 0 THEN
        RETURN FALSE;
    END IF;

    UPDATE public.products
    SET available_stock_lots = available_stock_lots - steps,
        updated_at = NOW()
    WHERE id = row_id
      AND available_stock_lots >= steps;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.increment_stock_inventory(row_id UUID, steps INT)
RETURNS BOOLEAN AS $$
DECLARE
    rows_affected INT;
BEGIN
    IF steps <= 0 THEN
        RETURN FALSE;
    END IF;

    UPDATE public.products
    SET available_stock_lots = available_stock_lots + steps,
        updated_at = NOW()
    WHERE id = row_id;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- C3/H3: ATOMIC ORDER CREATION WITH IN-TRANSACTION STOCK CHECK
-- Same signature (existing service_role-only grant is preserved by
-- CREATE OR REPLACE). Locks product rows FOR UPDATE, re-checks
-- availability inside the transaction, then inserts + decrements.
-- Insufficient stock returns a typed result instead of raising so
-- the API can respond 400 with out_of_stock[] (no TOCTOU 500).
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
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Checkout requires at least one item';
    END IF;

    -- Validate + lock product rows, collecting insufficient-stock items.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity_ordered')::INT;

        IF v_quantity <= 0 THEN
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

-- ============================================================
-- C1: ADMIN-GUARDED SECURITY DEFINER HELPERS
-- profiles.role is not API-writable (column grants exclude it) and
-- increment_stock_inventory is service_role-only. These functions
-- gate on is_admin() then run as the function owner.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_profile_role(p_profile_id uuid, p_role public.user_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    UPDATE public.profiles
    SET role = p_role,
        updated_at = NOW()
    WHERE id = p_profile_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    RETURN jsonb_build_object('status', 'updated');
END;
$function$;

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
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    SELECT readable_order_id, user_id
    INTO v_readable_order_id, v_user_id
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
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
    SET status = 'cancelled'
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
-- GRANTS for the new admin functions. REVOKE the Supabase
-- default grants (anon/authenticated auto-grant) and PUBLIC, then
-- grant to authenticated only. is_admin() gates actual authority.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_role(uuid, public.user_role) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_role(uuid, public.user_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_role(uuid, public.user_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_order(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_order(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(uuid) TO authenticated;

-- ============================================================
-- H3/H4: DB CHECK CONSTRAINTS (final line of defense)
-- Live data verified: min quantity_ordered = 1, min
-- unit_price_applied = 120.00, so the constraints are safe.
-- ============================================================
ALTER TABLE public.order_items
    DROP CONSTRAINT IF EXISTS order_items_quantity_ordered_check;
ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_quantity_ordered_check CHECK (quantity_ordered > 0);

ALTER TABLE public.order_items
    DROP CONSTRAINT IF EXISTS order_items_unit_price_applied_check;
ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_unit_price_applied_check CHECK (unit_price_applied > 0);
