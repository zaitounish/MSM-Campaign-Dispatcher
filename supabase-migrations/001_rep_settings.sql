-- 001_rep_settings.sql | Per-rep settings synced across devices
--
-- APPLY MANUALLY: Supabase dashboard → SQL editor → paste & run.
-- This file is the record of what was applied (repo has no supabase/ folder).
--
-- One tiny row per rep, keyed by login email (mirrors rep_sessions /
-- rep_activity_log convention). Owner-only RLS: no manager/ultimate
-- SELECT policy on purpose — the row holds API secrets (GAS URL, Gemini key).
-- service_role bypasses RLS for ops.
--
-- Field mapping (see src/lib/repSettingsStore.js):
--   repId ↔ rep_id, gasUrl ↔ gas_url, geminiApiKey ↔ gemini_api_key,
--   firstName ↔ first_name, lastName ↔ last_name, title, phone, signature.

create table if not exists rep_settings (
  rep_email      text primary key references reps_whitelist(email) on delete cascade,
  rep_id         text,
  gas_url        text,
  gemini_api_key text,
  first_name     text,
  last_name      text,
  title          text,
  phone          text,
  signature      text,
  updated_at     timestamptz not null default now()
);

alter table rep_settings enable row level security;

drop policy if exists "Reps manage own settings" on rep_settings;
create policy "Reps manage own settings" on rep_settings for all
  to authenticated
  using (rep_email = auth.email())
  with check (rep_email = auth.email());
