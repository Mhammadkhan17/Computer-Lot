CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('retail', 'wholesale_pending', 'wholesale_approved', 'admin');
CREATE TYPE item_grade AS ENUM ('Grade_A', 'Grade_B', 'Grade_C', 'For_Parts');
CREATE TYPE order_status AS ENUM ('pending_whatsapp', 'processing', 'completed', 'cancelled');

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    tax_registration_id VARCHAR(100),
    role user_role DEFAULT 'retail',
    phone VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    hardware_specifications JSONB DEFAULT '{}',
    grade item_grade NOT NULL DEFAULT 'Grade_A',
    items_per_lot INT DEFAULT 1 NOT NULL,
    retail_price_per_lot DECIMAL(12,2) NOT NULL,
    wholesale_price_per_lot DECIMAL(12,2) NOT NULL,
    minimum_wholesale_lots INT DEFAULT 5 NOT NULL,
    available_stock_lots INT DEFAULT 0 NOT NULL CHECK (available_stock_lots >= 0),
    manifest_file_url TEXT,
    images TEXT[],
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    readable_order_id BIGSERIAL,
    user_id UUID REFERENCES auth.users,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    status order_status DEFAULT 'pending_whatsapp',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- ORDER ITEMS
-- ============================================================
CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity_ordered INT NOT NULL,
    unit_price_applied DECIMAL(12,2) NOT NULL
);

-- Covering indexes for FK columns (Postgres does not auto-index FKs).
CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id         ON public.orders(user_id);

-- ============================================================
-- ATOMIC STOCK FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION decrement_stock_inventory(row_id UUID, steps INT)
RETURNS BOOLEAN AS $$
DECLARE
    rows_affected INT;
BEGIN
    UPDATE public.products
    SET available_stock_lots = available_stock_lots - steps,
        updated_at = NOW()
    WHERE id = row_id
      AND available_stock_lots >= steps;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION increment_stock_inventory(row_id UUID, steps INT)
RETURNS BOOLEAN AS $$
DECLARE
    rows_affected INT;
BEGIN
    UPDATE public.products
    SET available_stock_lots = available_stock_lots + steps,
        updated_at = NOW()
    WHERE id = row_id;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
