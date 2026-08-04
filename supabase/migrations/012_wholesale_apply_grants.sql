-- 012: FOLLOW-UP TO 011 — GRANT HYGIENE + DB-LAYER VALIDATION
-- ============================================================
-- Follow-up to 011_apply_for_wholesale.sql (already applied live):
--   1. The function is SECURITY DEFINER and 007_security_round3
--      revoked service_role EXECUTE from every security-definer
--      function as a grant-hygiene contract. 011 re-granted
--      EXECUTE to service_role implicitly (project default for new
--      public functions). service_role's auth.uid() is NULL so the
--      RPC RAISEs for that caller, but the stray grant is drift.
--      REVOKE it here so final grants are authenticated-only.
--   2. The RPC is directly callable by any authenticated client
--      (bypassing FastAPI). Blank company name returns
--      {"status":"error"} cleanly, but p_company_name > 255 or
--      p_tax_id > 100 raised a raw Postgres 22001 truncation
--      exception instead. Add explicit length guards so oversize
--      input returns {"status":"error"}.
-- Behavior (auth check, admin safety guard, search_path = public)
-- is otherwise identical to 011.

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

    IF length(p_company_name) > 255 OR length(p_tax_id) > 100 THEN
        RETURN jsonb_build_object('status', 'error');
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
REVOKE EXECUTE ON FUNCTION public.apply_for_wholesale(VARCHAR, VARCHAR) FROM service_role;
GRANT EXECUTE ON FUNCTION public.apply_for_wholesale(VARCHAR, VARCHAR) TO authenticated;
