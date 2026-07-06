/**
 * useActivityData.js | Fetches rep utilization data for the Ultimate dashboard.
 *
 * Returns aggregate metrics for all reps, keyed to the date range requested.
 * Data is fetched on mount and can be refreshed manually.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { computeEngagementScore, getUtilizationTier, getTrendDirection } from "../lib/analytics";

const DEFAULT_DAYS = 30;

export function useActivityData(daysBack = DEFAULT_DAYS, userProfile = null) {
  const [repMetrics, setRepMetrics] = useState([]);       // per-rep summary rows
  const [emailVolume, setEmailVolume] = useState([]);     // daily email send time series
  const [featureUsage, setFeatureUsage] = useState([]);   // feature name → usage count
  const [promoDistribution, setPromoDistribution] = useState([]); // promo type → count
  const [dailyActivity, setDailyActivity] = useState([]); // DAU time series
  const [rawSessions, setRawSessions] = useState([]);     // pure sessions history
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);
      const sinceStr = since.toISOString();
      const sinceDateStr = sinceStr.slice(0, 10);

      // ── 1. All reps from whitelist ─────────────────────────────────────────
      let repsQuery = supabase
        .from("reps_whitelist")
        .select("id, email, full_name, role, is_active, manager_id")
        .eq("is_active", true)
        .order("full_name");

      if (userProfile?.role === "manager") {
        repsQuery = repsQuery.eq("manager_id", userProfile.id);
      }

      const { data: reps, error: repsErr } = await repsQuery;
      if (repsErr) throw repsErr;

      const targetEmails = (reps || []).map(r => r.email);

      // If manager has no reps, just return empty state
      if (targetEmails.length === 0) {
        setRepMetrics([]);
        setEmailVolume([]);
        setFeatureUsage([]);
        setPromoDistribution([]);
        setDailyActivity([]);
        setRawSessions([]);
        setLoading(false);
        return;
      }

      // ── 2. Sessions for the period ─────────────────────────────────────────
      const { data: sessions, error: sessErr } = await supabase
        .from("rep_sessions")
        .select("rep_email, session_start, session_end, duration_minutes, is_active")
        .gte("session_start", sinceStr)
        .in("rep_email", targetEmails)
        .order("session_start", { ascending: false });

      if (sessErr) throw sessErr;
      setRawSessions(sessions || []);

      // ── 3. Activity log for the period ────────────────────────────────────
      const { data: events, error: eventsErr } = await supabase
        .from("rep_activity_log")
        .select("rep_email, event_type, feature_name, tool_used, timestamp, action_details")
        .gte("timestamp", sinceStr)
        .in("rep_email", targetEmails);

      if (eventsErr) throw eventsErr;

      // ── 4. Email send log for the period ──────────────────────────────────
      const { data: sends, error: sendsErr } = await supabase
        .from("email_send_log")
        .select("rep_email, rep_name, sent_at, promo_types")
        .gte("sent_at", sinceStr)
        .in("rep_email", targetEmails);

      if (sendsErr) throw sendsErr;

      // ── Compute per-rep aggregate metrics ─────────────────────────────────
      const repMap = {};
      (reps || []).forEach(r => {
        repMap[r.email] = {
          email: r.email,
          fullName: r.full_name || r.email,
          role: r.role,
          managerId: r.manager_id,
          sessionCount: 0,
          avgSessionDurationMinutes: 0,
          sessionsToday: 0,
          emailsSent: 0,
          blankEmailsSent: 0,
          promoTypesUsed: new Set(),
          featuresAccessed: new Set(),
          lastLogin: null,
          lastActivity: null,
          dailyLimitStatus: null,
        };
      });

      const today = new Date().toISOString().slice(0, 10);

      // Aggregate sessions
      const sessionsByRep = {};
      (sessions || []).forEach(s => {
        if (!sessionsByRep[s.rep_email]) sessionsByRep[s.rep_email] = [];
        sessionsByRep[s.rep_email].push(s);
        if (repMap[s.rep_email]) {
          repMap[s.rep_email].sessionCount += 1;
          const sessionDate = s.session_start?.slice(0, 10);
          if (!repMap[s.rep_email].lastLogin || s.session_start > repMap[s.rep_email].lastLogin) {
            repMap[s.rep_email].lastLogin = s.session_start;
          }
          if (sessionDate === today) {
            repMap[s.rep_email].sessionsToday += 1;
          }
        }
      });

      // Compute avg session duration per rep
      Object.entries(sessionsByRep).forEach(([email, repSessions]) => {
        if (!repMap[email]) return;
        const finished = repSessions.filter(s => s.duration_minutes != null);
        if (finished.length > 0) {
          const avg = finished.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / finished.length;
          repMap[email].avgSessionDurationMinutes = Math.round(avg * 10) / 10;
        }
      });

      // Aggregate activity events
      (events || []).forEach(e => {
        if (!repMap[e.rep_email]) return;
        if (e.feature_name) repMap[e.rep_email].featuresAccessed.add(e.feature_name);
        if (!repMap[e.rep_email].lastActivity || e.timestamp > repMap[e.rep_email].lastActivity) {
          repMap[e.rep_email].lastActivity = e.timestamp;
        }
      });

      // Aggregate email sends
      (sends || []).forEach(s => {
        if (!repMap[s.rep_email]) return;
        const types = Array.isArray(s.promo_types) ? s.promo_types : [];
        const isBlank = types.length === 1 && types[0] === "blank";
        if (isBlank) {
          repMap[s.rep_email].blankEmailsSent += 1;
        } else {
          repMap[s.rep_email].emailsSent += 1;
        }
        types.forEach(t => repMap[s.rep_email].promoTypesUsed.add(t));
      });

      // Compute engagement scores
      const allMetrics = Object.values(repMap);
      const maxSessionCount = Math.max(1, ...allMetrics.map(r => r.sessionCount));
      const maxAvgDuration = Math.max(1, ...allMetrics.map(r => r.avgSessionDurationMinutes));
      const maxFeatures = Math.max(1, ...allMetrics.map(r => r.featuresAccessed.size));
      const maxEmails = Math.max(1, ...allMetrics.map(r => r.emailsSent));
      const teamMaxValues = { maxSessionCount, maxAvgDuration, maxFeatures, maxEmails };

      const enrichedMetrics = allMetrics.map(r => {
        const score = computeEngagementScore(
          {
            sessionCount: r.sessionCount,
            avgSessionDurationMinutes: r.avgSessionDurationMinutes,
            uniqueFeaturesUsed: r.featuresAccessed.size,
            emailsSent: r.emailsSent,
          },
          teamMaxValues
        );
        const tier = getUtilizationTier(score);
        const daysSinceLogin = r.lastLogin
          ? Math.floor((Date.now() - new Date(r.lastLogin).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          ...r,
          promoTypesUsed: Array.from(r.promoTypesUsed),
          featuresAccessed: Array.from(r.featuresAccessed),
          engagementScore: score,
          tier,
          daysSinceLastLogin: daysSinceLogin,
          needsCheckIn: daysSinceLogin === null || daysSinceLogin > 3,
          onlyBlankSends: r.blankEmailsSent > 0 && r.emailsSent === 0,
        };
      });

      setRepMetrics(enrichedMetrics);

      // ── Daily active users time series ────────────────────────────────────
      const dauMap = {};
      (sessions || []).forEach(s => {
        const day = s.session_start?.slice(0, 10);
        if (!day) return;
        if (!dauMap[day]) dauMap[day] = new Set();
        dauMap[day].add(s.rep_email);
      });
      const dauSeries = Object.entries(dauMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, repsSet]) => ({ date, activeReps: repsSet.size }));
      setDailyActivity(dauSeries);

      // ── Email volume time series ───────────────────────────────────────────
      const emailByDay = {};
      (sends || []).forEach(s => {
        const day = s.sent_at?.slice(0, 10);
        if (!day) return;
        if (!emailByDay[day]) emailByDay[day] = 0;
        const types = Array.isArray(s.promo_types) ? s.promo_types : [];
        const isBlank = types.length === 1 && types[0] === "blank";
        if (!isBlank) emailByDay[day] += 1;
      });
      setEmailVolume(
        Object.entries(emailByDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, emails: count }))
      );

      // ── Feature usage (top N) ─────────────────────────────────────────────
      const featureMap = {};
      (events || []).forEach(e => {
        if (!e.feature_name) return;
        featureMap[e.feature_name] = (featureMap[e.feature_name] || 0) + 1;
      });
      setFeatureUsage(
        Object.entries(featureMap)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => ({ name, count }))
      );

      // ── Promo type distribution ────────────────────────────────────────────
      const promoMap = {};
      (sends || []).forEach(s => {
        const types = Array.isArray(s.promo_types) ? s.promo_types : [];
        types.forEach(t => {
          promoMap[t] = (promoMap[t] || 0) + 1;
        });
      });
      setPromoDistribution(
        Object.entries(promoMap)
          .sort(([, a], [, b]) => b - a)
          .map(([name, value]) => ({ name, value }))
      );

    } catch (err) {
      console.warn("[useActivityData]", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [daysBack]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    repMetrics,
    emailVolume,
    featureUsage,
    promoDistribution,
    dailyActivity,
    rawSessions,
    loading,
    error,
    refresh: fetchAll,
  };
}
