-- 003_rep_settings_case_insensitive.sql | Fix persistent "Sync failed" for mixed-case whitelist emails
--
-- APPLY MANUALLY: Supabase dashboard → SQL editor → paste & run.
--
-- Root cause: a few reps_whitelist.email values contain uppercase characters,
-- but the app keys rep_settings by the LOWERCASED login email (required: RLS
-- compares against auth.email(), which Supabase Auth always stores lowercase).
-- The case-sensitive FK rep_settings.rep_email → reps_whitelist(email) from
-- 001 rejected those upserts, so affected reps could never sync (and the
-- settings modal re-opened on every login because the load also missed).
--
-- Fix: drop the FK. Row ownership is still enforced by the RLS policy
-- "Reps manage own settings" (rep_email = auth.email()) plus the rep_email
-- primary key. Also make set_my_rep_id match case-insensitively — it had the
-- same blind spot (auth.email() is lowercase, whitelist email may not be),
-- so the Assisted Rep ID mirror silently updated 0 rows for those reps.
--
-- Safe to re-run (IF EXISTS / CREATE OR REPLACE).

alter table rep_settings
  drop constraint if exists rep_settings_rep_email_fkey;

create or replace function set_my_rep_id(p_rep_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update reps_whitelist
     set rep_id = nullif(trim(p_rep_id), '')
   where lower(email) = lower(auth.email());
end;
$$;

grant execute on function set_my_rep_id(text) to authenticated;

-- Verify after applying (paste separately):
--   select conname from pg_constraint where conrelid = 'rep_settings'::regclass;
--   -- rep_settings_rep_email_fkey must be GONE, rep_settings_pkey must remain.
