-- ============================================================================
-- 005_create_assigned_leads.sql
-- Creates the persistent assigned_leads table for client campaign events
-- (e.g. Hot Ads - Hot Leads) and whitelists confirmed AppSheet reps.
--
-- HOW TO APPLY:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/phewzisycpiaokxgchnh
-- 2. Click "SQL Editor" in the left navigation sidebar.
-- 3. Click "New query", paste this entire script, and click "Run".
-- ============================================================================

-- 1. Create assigned_leads table
CREATE TABLE IF NOT EXISTS public.assigned_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_email       TEXT NOT NULL,
  rep_name        TEXT,
  manager_name    TEXT,
  store_id        TEXT NOT NULL,
  business_id     TEXT,
  business_name   TEXT,
  opp_type        TEXT,
  dm_first_name   TEXT,
  dm_last_name    TEXT,
  dm_name         TEXT,
  email           TEXT,            -- Merchant / Decision Maker email
  phone_number    TEXT,
  mx_role         TEXT,
  profile_type    TEXT,
  profile_id      TEXT,
  first_use       TEXT,
  last_use        TEXT,
  campaign_event  TEXT NOT NULL DEFAULT 'Hot Ads - Hot Leads',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. High-performance indexes for rep lead fetching and deduplication
CREATE INDEX IF NOT EXISTS idx_assigned_leads_rep_email ON public.assigned_leads (lower(rep_email));
CREATE INDEX IF NOT EXISTS idx_assigned_leads_store_id ON public.assigned_leads (store_id);
CREATE INDEX IF NOT EXISTS idx_assigned_leads_business_id ON public.assigned_leads (business_id);
CREATE INDEX IF NOT EXISTS idx_assigned_leads_campaign ON public.assigned_leads (campaign_event);

-- 3. Grant schema & table permissions to anon, authenticated, and service_role
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.assigned_leads TO anon, authenticated, service_role;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.assigned_leads ENABLE ROW LEVEL SECURITY;

-- 5. Policies:
-- Allow authenticated reps to view their own leads (case-insensitive email match)
DROP POLICY IF EXISTS "Reps can select own assigned leads" ON public.assigned_leads;
CREATE POLICY "Reps can select own assigned leads" ON public.assigned_leads
  FOR SELECT
  TO authenticated, anon
  USING (
    lower(rep_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR auth.jwt() ->> 'email' IS NULL -- fallback for anon client queries if authenticated session token is omitted
  );

-- Allow inserting leads (used by ingestion script / admin)
DROP POLICY IF EXISTS "Allow insert into assigned_leads" ON public.assigned_leads;
CREATE POLICY "Allow insert into assigned_leads" ON public.assigned_leads
  FOR INSERT
  TO authenticated, anon, service_role
  WITH CHECK (true);

-- Allow updating leads
DROP POLICY IF EXISTS "Allow update assigned_leads" ON public.assigned_leads;
CREATE POLICY "Allow update assigned_leads" ON public.assigned_leads
  FOR UPDATE
  TO authenticated, anon, service_role
  USING (true)
  WITH CHECK (true);

-- 6. Add confirmed AppSheet reps (George Shehata & Yousef Abdelkader) and Team Alaa to reps_whitelist
INSERT INTO public.reps_whitelist (email, full_name, role, is_active, manager_id, manager_name, daily_email_limit)
VALUES 
  ('george.shehata@ext.doordash.com', 'George Fayez Gouda Oweida Shehata', 'rep', true, NULL, NULL, 45),
  ('yousef.abdelkader@ext.doordash.com', 'Yousef Salah Eldin Abdullah Abdelkader Ali', 'rep', true, NULL, NULL, 45),
  -- Team Alaa Abdelaati (11 reps)
  ('alaa.ali@ext.doordash.com', 'Alaa Ali', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45),
  ('omar.abdelaziz@ext.doordash.com', 'Omar Abdelaziz', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45),
  ('samar.ragab@ext.doordash.com', 'Samar Ragab', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45),
  ('farah.abdelsalam@ext.doordash.com', 'Farah Abdelsalam', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45),
  ('mariam.aamer@ext.doordash.com', 'Mariam Aamer', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45),
  ('raneem.mohamed@ext.doordash.com', 'Raneem Mohamed', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45),
  ('abdallah.sobih@ext.doordash.com', 'Abdallah Sobih', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45),
  ('karim.eltouny@ext.doordash.com', 'Karim Eltouny', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45),
  ('marwan.attia@ext.doordash.com', 'Marwan Attia', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45),
  ('nabil.abdallah@ext.doordash.com', 'Nabil Abdallah', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45),
  ('abdallah.ghareeb@ext.doordash.com', 'Abdallah Ghareeb', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 45)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  manager_id = EXCLUDED.manager_id,
  manager_name = EXCLUDED.manager_name,
  is_active = true,
  daily_email_limit = 45;

