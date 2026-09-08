-- ============================================================================
-- 004_fix_rep_settings_permissions.sql
-- Fixes: "42501 permission denied for table rep_settings" on LOAD and SAVE
--
-- HOW TO APPLY:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/phewzisycpiaokxgchnh
-- 2. Click "SQL Editor" in the left navigation sidebar.
-- 3. Click "New query", paste this entire script, and click "Run".
-- ============================================================================

-- 1. Ensure table exists with all required columns
CREATE TABLE IF NOT EXISTS public.rep_settings (
  rep_email      TEXT PRIMARY KEY,
  rep_id         TEXT,
  gas_url        TEXT,
  gemini_api_key TEXT,
  first_name     TEXT,
  last_name      TEXT,
  title          TEXT,
  phone          TEXT,
  signature      TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Drop any foreign key to reps_whitelist so email casing differences never block saves
ALTER TABLE public.rep_settings
  DROP CONSTRAINT IF EXISTS rep_settings_rep_email_fkey;

-- 3. CRITICAL FIX FOR 42501: Grant table-level permissions to authenticated role.
-- PostgreSQL requires table-level GRANT before Row Level Security (RLS) is evaluated.
-- Without this GRANT, PostgREST returns:
--   403 Forbidden / 42501 "permission denied for table rep_settings"
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.rep_settings TO authenticated;
GRANT ALL ON TABLE public.rep_settings TO service_role;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.rep_settings ENABLE ROW LEVEL SECURITY;

-- 5. Drop any existing/conflicting policies
DROP POLICY IF EXISTS "Reps manage own settings" ON public.rep_settings;
DROP POLICY IF EXISTS "Reps can select own settings" ON public.rep_settings;
DROP POLICY IF EXISTS "Reps can insert own settings" ON public.rep_settings;
DROP POLICY IF EXISTS "Reps can update own settings" ON public.rep_settings;

-- 6. Create robust RLS policy using standard Supabase JWT extraction
-- Uses auth.jwt() ->> 'email' (with lowercase normalization)
CREATE POLICY "Reps manage own settings" ON public.rep_settings
  FOR ALL
  TO authenticated
  USING (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  WITH CHECK (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- 7. Ensure auth.email() helper function exists (for any legacy callers)
CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text;
$$;

-- 8. RPC: set_my_rep_id with case-insensitive email match
CREATE OR REPLACE FUNCTION public.set_my_rep_id(p_rep_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.reps_whitelist
     SET rep_id = NULLIF(TRIM(p_rep_id), '')
   WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_rep_id(text) TO authenticated;

-- 9. RPC fallback: get_my_rep_settings (bypasses RLS/grant issues via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_my_rep_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_row record;
BEGIN
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF v_email IS NULL OR v_email = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
    FROM public.rep_settings
   WHERE lower(rep_email) = v_email;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_rep_settings() TO authenticated;

-- 10. RPC fallback: save_my_rep_settings (bypasses RLS/grant issues via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.save_my_rep_settings(
  p_rep_id text DEFAULT NULL,
  p_gas_url text DEFAULT NULL,
  p_gemini_api_key text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_signature text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF v_email IS NULL OR v_email = '' THEN
    RETURN false;
  END IF;

  INSERT INTO public.rep_settings (
    rep_email,
    rep_id,
    gas_url,
    gemini_api_key,
    first_name,
    last_name,
    title,
    phone,
    signature,
    updated_at
  )
  VALUES (
    v_email,
    p_rep_id,
    p_gas_url,
    p_gemini_api_key,
    p_first_name,
    p_last_name,
    p_title,
    p_phone,
    p_signature,
    now()
  )
  ON CONFLICT (rep_email) DO UPDATE SET
    rep_id = EXCLUDED.rep_id,
    gas_url = EXCLUDED.gas_url,
    gemini_api_key = EXCLUDED.gemini_api_key,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    title = EXCLUDED.title,
    phone = EXCLUDED.phone,
    signature = EXCLUDED.signature,
    updated_at = now();

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_my_rep_settings(text, text, text, text, text, text, text, text) TO authenticated;
