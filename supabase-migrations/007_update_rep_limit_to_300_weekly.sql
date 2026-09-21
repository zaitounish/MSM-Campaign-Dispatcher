-- ==============================================================================
-- 007_update_rep_limit_to_300_weekly.sql
-- FLOOR-WIDE: Upgrades all sales reps across the ENTIRE floor (all teams & managers)
-- to the new 300 emails per WEEK quota (Monday to Sunday).
-- ==============================================================================

-- 1. Upgrade all sales floor reps across all teams/managers to 300 weekly quota
UPDATE public.reps_whitelist
SET daily_email_limit = 300
WHERE role = 'rep' OR daily_email_limit = 45 OR daily_email_limit IS NULL;

-- 2. Update default column value to 300 so any future rep added to the floor gets 300
ALTER TABLE public.reps_whitelist
ALTER COLUMN daily_email_limit SET DEFAULT 300;

-- 3. Ensure weekly_email_limit column exists for clean schema semantics
ALTER TABLE public.reps_whitelist
ADD COLUMN IF NOT EXISTS weekly_email_limit integer DEFAULT 300;

UPDATE public.reps_whitelist
SET weekly_email_limit = 300
WHERE role = 'rep' OR weekly_email_limit IS NULL;
