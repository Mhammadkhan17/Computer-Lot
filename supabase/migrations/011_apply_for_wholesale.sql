-- 011: SELF-SERVE WHOLESALE APPLICATION
-- ============================================================
-- Lets an authenticated retail user apply for wholesale in one
-- step: role retail -> wholesale_pending, recording company/tax info.
-- SECURITY DEFINER because profiles.role is not API-writable and
-- admin_set_profile_role is admin-guarded (004_security_hardening).
-- search_path is pinned to public (hardening requirement, matches
-- every existing SECURITY DEFINER function). Idempotent: pending,
-- approved, and admin callers get their status back with no write.
-- The admin branch is a safety guard so an admin is NEVER downgraded.

CREATE OR REPLACE FUNCTION public.apply_for_wholesale(
    p_company_name VARCHAR,
    p_tax_id VARCHAR
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_company_name VARCHAR(255);
    v_tax_id VARCHAR(100);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    v_company_name := NULLIF(TRIM(p_company_name), '');
    IF v_company_name IS NULL THEN
        RETURN jsonb_build_object('status', 'error');
    END IF;
    v_tax_id := NULLIF(TRIM(p_tax_id), '');

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;

    IF v_role IS NULL THEN
        RETURN jsonb_build_object('status', 'error');
    END IF;

    IF v_role = 'retail' THEN
        UPDATE public.profiles
        SET role = 'wholesale_pending',
            company_name = v_company_name,
            tax_registration_id = v_tax_id,
            updated_at = NOW()
        WHERE id = v_user_id;
        RETURN jsonb_build_object('status', 'applied');
    ELSIF v_role = 'wholesale_pending' THEN
        RETURN jsonb_build_object('status', 'pending');
    ELSIF v_role = 'wholesale_approved' THEN
        RETURN jsonb_build_object('status', 'approved');
    ELSIF v_role = 'admin' THEN
        RETURN jsonb_build_object('status', 'admin');
    ELSE
        RETURN jsonb_build_object('status', 'error');
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_for_wholesale(VARCHAR, VARCHAR) FROM public;
REVOKE EXECUTE ON FUNCTION public.apply_for_wholesale(VARCHAR, VARCHAR) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_for_wholesale(VARCHAR, VARCHAR) TO authenticated;
