-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Admin checks must use public.is_admin() (SECURITY DEFINER) to avoid
-- infinite recursion from self-referential subqueries against profiles.
-- auth.uid() / is_admin() calls are wrapped in (select ...) so they are
-- evaluated once per query (initplan) rather than per row.

-- ============================================================
-- PROFILES
-- ============================================================
CREATE POLICY "Users can view own or admin can view all"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()) OR (select public.is_admin()));

CREATE POLICY "Users can update own or admin can update any"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()) OR (select public.is_admin()))
  WITH CHECK (id = (select auth.uid()) OR (select public.is_admin()));

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

-- Column-level protection: users may edit their own contact fields but the
-- `role` column is NOT writable via the API. A plain `REVOKE UPDATE (col)`
-- is a no-op in this environment (no column ACL is materialized), so we
-- revoke table-level UPDATE/INSERT and re-grant at column level. Role
-- changes are therefore only possible via service_role / backend.
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (full_name, company_name, tax_registration_id, phone) ON profiles TO authenticated;
REVOKE INSERT ON profiles FROM authenticated;
GRANT INSERT (id, full_name, company_name, tax_registration_id, phone) ON profiles TO authenticated;

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE POLICY "Public can read products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admin can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK ((select public.is_admin()));

CREATE POLICY "Admin can update products"
  ON products FOR UPDATE
  TO authenticated
  USING ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

CREATE POLICY "Admin can delete products"
  ON products FOR DELETE
  TO authenticated
  USING ((select public.is_admin()));

-- ============================================================
-- ORDERS
-- ============================================================
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()) OR (select public.is_admin()));

CREATE POLICY "Admin can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

-- ============================================================
-- ORDER ITEMS
-- ============================================================
CREATE POLICY "Users can view own order items"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (orders.user_id = (select auth.uid()) OR (select public.is_admin()))
    )
  );

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    _company_name VARCHAR(255);
    _tax_id VARCHAR(100);
    _role user_role;
BEGIN
    _company_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'::text), '');
    _tax_id := NULLIF(TRIM(NEW.raw_user_meta_data->>'tax_registration_id'::text), '');

    IF _company_name IS NOT NULL THEN
        _role := 'wholesale_pending';
    ELSE
        _role := 'retail';
    END IF;

    INSERT INTO public.profiles (id, full_name, company_name, tax_registration_id, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
        _company_name,
        _tax_id,
        _role
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
