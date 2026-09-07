-- 002_set_my_rep_id.sql | Let reps mirror their Assisted Rep ID to the whitelist
--
-- APPLY MANUALLY: Supabase dashboard → SQL editor → paste & run.
--
-- Why an RPC and not an RLS UPDATE policy: RLS cannot scope an UPDATE to a
-- single column. A plain "reps can update own whitelist row" policy would let
-- reps change their role, limits, or active flag. This SECURITY DEFINER
-- function updates ONLY rep_id, ONLY on the caller's own row
-- (matched by auth.email()).
--
-- Client: mirrorRepIdToWhitelist() in src/lib/repSettingsStore.js.
--
-- Verify after applying (paste separately):
--   select routine_name from information_schema.routines
--    where routine_schema = 'public' and routine_name = 'set_my_rep_id';
--   select tablename, policyname, cmd from pg_policies
--    where tablename = 'rep_settings';

create or replace function set_my_rep_id(p_rep_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update reps_whitelist
     set rep_id = nullif(trim(p_rep_id), '')
   where email = auth.email();
end;
$$;

grant execute on function set_my_rep_id(text) to authenticated;
