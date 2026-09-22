-- ============================================================================
-- 008_remedy_phantom_gas_drafts.sql
-- NON-DESTRUCTIVE QUOTA RESET FOR REPS AT 50%+ USAGE
--
-- This script does NOT delete any logs from email_send_log.
-- All historical send logs and audit trails remain 100% intact.
--
-- How it works:
-- For reps who consumed 50% or more of their weekly quota (due to failed
-- GAS draft attempts or high volume), this updates `daily_limit_override`
-- in `reps_whitelist` to grant them fresh quota for the remainder of the week.
--
-- HOW TO USE:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/phewzisycpiaokxgchnh
-- 2. Click "SQL Editor" in the left sidebar.
-- 3. Run SECTION 1 to inspect reps who used 50% or more of their quota.
-- 4. Run SECTION 2 (Strategy A: Dynamic +300 fresh sends) OR SECTION 3 (Strategy B: Flat 600 limit).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- SECTION 1: INSPECTION — View all reps who have reached 50% or more of their quota
-- ----------------------------------------------------------------------------
WITH weekly_sends AS (
  SELECT 
    LOWER(TRIM(rep_email)) AS rep_email,
    COUNT(*) AS total_sends,
    COUNT(*) FILTER (WHERE delivery_method = 'gas_draft') AS gas_draft_attempts,
    COUNT(*) FILTER (WHERE delivery_method = 'gmail_tab') AS manual_sends
  FROM public.email_send_log
  WHERE sent_at >= date_trunc('week', now())
    AND NOT (promo_types = ARRAY['blank']::text[])
  GROUP BY LOWER(TRIM(rep_email))
)
SELECT 
  rw.email,
  rw.full_name,
  COALESCE(s.total_sends, 0) AS sends_this_week,
  COALESCE(s.gas_draft_attempts, 0) AS gas_drafts,
  COALESCE(s.manual_sends, 0) AS manual_sends,
  COALESCE(
    CASE 
      WHEN rw.daily_limit_override IS NOT NULL 
           AND rw.daily_limit_override_date >= date_trunc('week', now())::date 
      THEN rw.daily_limit_override 
      ELSE NULL 
    END,
    rw.daily_email_limit,
    300
  ) AS current_limit,
  ROUND(
    (COALESCE(s.total_sends, 0)::numeric / 
     COALESCE(
       CASE 
         WHEN rw.daily_limit_override IS NOT NULL 
              AND rw.daily_limit_override_date >= date_trunc('week', now())::date 
         THEN rw.daily_limit_override 
         ELSE NULL 
       END,
       rw.daily_email_limit,
       300
     )::numeric) * 100, 1
  ) AS pct_quota_used
FROM public.reps_whitelist rw
LEFT JOIN weekly_sends s ON LOWER(TRIM(rw.email)) = s.rep_email
WHERE rw.role = 'rep'
  AND COALESCE(s.total_sends, 0) >= (
    COALESCE(
      CASE 
        WHEN rw.daily_limit_override IS NOT NULL 
             AND rw.daily_limit_override_date >= date_trunc('week', now())::date 
        THEN rw.daily_limit_override 
        ELSE NULL 
      END,
      rw.daily_email_limit,
      300
    ) * 0.5
  )
ORDER BY sends_this_week DESC;


-- ----------------------------------------------------------------------------
-- SECTION 2: STRATEGY A (RECOMMENDED) — DYNAMIC RESET (+300 Fresh Sends)
-- Gives any rep who hit 50%+ usage exactly 300 fresh sends on top of their
-- current count (e.g. if they logged 280 sends, limit becomes 580 -> 300 remaining).
-- ----------------------------------------------------------------------------
WITH rep_usage AS (
  SELECT 
    LOWER(TRIM(rep_email)) AS rep_email,
    COUNT(*) AS sends_this_week
  FROM public.email_send_log
  WHERE sent_at >= date_trunc('week', now())
    AND NOT (promo_types = ARRAY['blank']::text[])
  GROUP BY LOWER(TRIM(rep_email))
)
UPDATE public.reps_whitelist rw
SET 
  daily_limit_override = u.sends_this_week + 300,
  daily_limit_override_date = CURRENT_DATE
FROM rep_usage u
WHERE LOWER(TRIM(rw.email)) = u.rep_email
  AND rw.role = 'rep'
  AND u.sends_this_week >= (
    COALESCE(
      CASE 
        WHEN rw.daily_limit_override IS NOT NULL 
             AND rw.daily_limit_override_date >= date_trunc('week', now())::date 
        THEN rw.daily_limit_override 
        ELSE NULL 
      END,
      rw.daily_email_limit,
      300
    ) * 0.5
  );


-- ----------------------------------------------------------------------------
-- SECTION 3: STRATEGY B — FLAT 600 WEEKLY LIMIT FOR ALL REPS AT 50%+
-- Simple flat override: sets weekly quota to 600 for anyone who sent >= 150.
-- ----------------------------------------------------------------------------
-- UPDATE public.reps_whitelist rw
-- SET 
--   daily_limit_override = 600,
--   daily_limit_override_date = CURRENT_DATE
-- WHERE email IN (
--   SELECT LOWER(TRIM(rep_email))
--   FROM public.email_send_log
--   WHERE sent_at >= date_trunc('week', now())
--     AND NOT (promo_types = ARRAY['blank']::text[])
--   GROUP BY LOWER(TRIM(rep_email))
--   HAVING COUNT(*) >= 150
-- );


-- ----------------------------------------------------------------------------
-- SECTION 4: TARGETED SINGLE REP RESET (Optional)
-- To reset or bump the limit for one specific rep without affecting others:
-- ----------------------------------------------------------------------------
-- UPDATE public.reps_whitelist
-- SET 
--   daily_limit_override = 600,
--   daily_limit_override_date = CURRENT_DATE
-- WHERE LOWER(TRIM(email)) = 'rep_email_here@ext.doordash.com';
