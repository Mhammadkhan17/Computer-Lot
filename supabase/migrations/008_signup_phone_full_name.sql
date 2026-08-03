-- ============================================================
-- 008: SIGNUP FIELDS — full_name + phone into profiles
-- Fixes:
--   - handle_new_user trigger now copies `phone` from signup metadata into
--     public.profiles.phone (the order_intake adapter uses profile.phone as
--     the WhatsApp customer_phone, so it must be collectable at signup).
--   - full_name is taken from the signup form (no longer the email prefix);
--     empty/whitespace-only values fall back to 'User'.
-- Never edits applied migrations 001-007.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    _company_name VARCHAR(255);
    _tax_id VARCHAR(100);
    _phone VARCHAR(50);
    _role user_role;
BEGIN
    _company_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), '');
    _tax_id := NULLIF(TRIM(NEW.raw_user_meta_data->>'tax_registration_id'), '');
    _phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');

    IF _company_name IS NOT NULL THEN
        _role := 'wholesale_pending';
    ELSE
        _role := 'retail';
    END IF;

    INSERT INTO public.profiles (id, full_name, company_name, tax_registration_id, phone, role)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), 'User'),
        _company_name,
        _tax_id,
        _phone,
        _role
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
