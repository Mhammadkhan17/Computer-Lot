-- ============================================================
-- 006: DEFENSE-IN-DEPTH UPPER BOUNDS
-- Adds upper bounds to order_items CHECK constraints and matching
-- guards inside create_order so absurdly large (or overflowed)
-- quantities/prices/line-counts are rejected at the database
-- layer, the last line of defense.
-- Never edits applied migrations 001-005.
-- ============================================================

-- Upper bound on quantity per line item (1000, matching the
-- Pydantic upper bound in schemas/order.py).
ALTER TABLE public.order_items
    DROP CONSTRAINT IF EXISTS order_items_quantity_ordered_check,
    ADD CONSTRAINT order_items_quantity_ordered_check
        CHECK (quantity_ordered > 0 AND quantity_ordered <= 1000);

-- Upper bound on unit price applied (1,000,000.00). Legit
-- wholesale/retail per-lot prices are far below this; anything
-- above indicates an overflow or malicious input.
ALTER TABLE public.order_items
    DROP CONSTRAINT IF EXISTS order_items_unit_price_applied_check,
    ADD CONSTRAINT order_items_unit_price_applied_check
        CHECK (unit_price_applied > 0 AND unit_price_applied <= 1000000);

-- ============================================================
-- Harden create_order (same 5-param signature as 004) with
-- upper-bound guards on line-item count, quantity, and price.
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

    IF jsonb_array_length(p_items) > 50 THEN
        RAISE EXCEPTION 'Too many line items (max 50)';
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
