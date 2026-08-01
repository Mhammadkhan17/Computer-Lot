-- ============================================================
-- 002: ATOMIC ORDER CREATION + ADMIN ROLE HELPER
-- ============================================================

-- SECURITY DEFINER helper to check admin role without RLS recursion.
-- Used by RLS policies on profiles/products/orders/order_items.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Atomic all-or-nothing order creation (ADR-002 / AGENTS.md core rule #2).
-- Inserts the order + items and decrements stock per item inside one
-- transaction. Any insufficient-stock item raises and rolls everything back.
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
    v_result JSONB;
BEGIN
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
-- Harden EXECUTE: only the backend (service_role) may call these
-- SECURITY DEFINER functions directly. is_admin stays executable
-- by authenticated because RLS policies reference it.
-- NOTE: Supabase default privileges add EXPLICIT grants to
-- anon/authenticated, so REVOKE them explicitly (REVOKE FROM
-- public alone would not remove those).
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.create_order(uuid, varchar, varchar, numeric, jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_inventory(uuid, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.increment_stock_inventory(uuid, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.create_order(uuid, varchar, varchar, numeric, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_inventory(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_stock_inventory(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, varchar, varchar, numeric, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_stock_inventory(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_stock_inventory(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM public;
-- is_admin() stays executable by authenticated because RLS policies
-- reference it (policy expressions run as the current role). Remove the
-- PUBLIC grant AND anon's explicit default grant (Supabase default
-- privileges auto-grant anon/authenticated/service_role on every new
-- function), then keep an explicit grant to authenticated only.
-- Note: REVOKE FROM public alone is NOT enough — anon keeps its explicit
-- grant; both must be revoked (see revoke_is_admin_public_execute).
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
