/**
 * analytics.js | MSM Campaign Dispatcher   Tool Utilization Tracking
 *
 * Fire-and-forget analytics helpers. None of these will ever throw or block
 * the main application flow. All errors are swallowed with a console.warn.
 *
 * Roles:
 *   rep      → their own data is written here; they can only read own rows (RLS)
 *   manager  → same write path; reads managed by RLS
 *   ultimate → same write path; reads all rows via RLS
 */

import { supabase } from "./supabase";

// ─── Device / browser fingerprint ──────────────────────────────────────────────

/**
 * Collect lightweight, non-PII device info for session context.
 * Stored as JSONB in rep_sessions.device_info.
 */
export function getDeviceInfo() {
  try {
    const nav = window.navigator || {};
    const scr = window.screen || {};
    return {
      browser: getBrowserName(nav.userAgent || ""),
      os: getOsName(nav.userAgent || ""),
      language: nav.language || null,
      screenWidth: scr.width || null,
      screenHeight: scr.height || null,
      timezone: Intl?.DateTimeFormat()?.resolvedOptions()?.timeZone || null,
    };
  } catch {
    return {};
  }
}

function getBrowserName(ua) {
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Safari/") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  return "Unknown";
}

function getOsName(ua) {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown";
}

// ─── Session lifecycle ─────────────────────────────────────────────────────────

/**
 * Call on successful login. Creates a new rep_session row.
 * Returns the session UUID or null on failure.
 */
export async function startRepSession(repEmail) {
  if (!repEmail) return null;
  try {
    const { data, error } = await supabase
      .from("rep_sessions")
      .insert({
        rep_email: repEmail,
        session_start: new Date().toISOString(),
        device_info: getDeviceInfo(),
        is_active: true,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("[analytics] startRepSession:", error.message);
      return null;
    }
    return data?.id || null;
  } catch (e) {
    console.warn("[analytics] startRepSession exception:", e.message);
    return null;
  }
}

/**
 * Call on sign-out or page unload. Closes the session row.
 */
export async function endRepSession(sessionId) {
  if (!sessionId) return;
  try {
    const { error } = await supabase
      .from("rep_sessions")
      .update({
        session_end: new Date().toISOString(),
        is_active: false,
      })
      .eq("id", sessionId);
    if (error) console.warn("[analytics] endRepSession:", error.message);
  } catch (e) {
    console.warn("[analytics] endRepSession exception:", e.message);
  }
}

// ─── Event tracking ────────────────────────────────────────────────────────────

/**
 * Core event logger. Inserts one row into rep_activity_log.
 *
 * @param {object} opts
 * @param {string}  opts.sessionId   - UUID from startRepSession
 * @param {string}  opts.repEmail    - rep's email address
 * @param {string}  opts.eventType   - 'login'|'logout'|'feature_access'|'tool_use'|'form_submit'|'navigation'
 * @param {string=} opts.featureName - e.g. 'promo_customizer', 'delivery_panel', 'bob_dashboard'
 * @param {string=} opts.toolUsed    - specific action within the feature (optional)
 * @param {object=} opts.details     - arbitrary JSONB payload (no PII)
 * @param {number=} opts.durationMs  - elapsed time for timed actions
 */
export async function trackEvent({
  sessionId,
  repEmail,
  eventType,
  featureName = null,
  toolUsed = null,
  details = {},
  durationMs = null,
}) {
  if (!repEmail || !sessionId) return;
  try {
    const { error } = await supabase.from("rep_activity_log").insert({
      rep_email: repEmail,
      session_id: sessionId,
      event_type: eventType,
      feature_name: featureName,
      tool_used: toolUsed,
      action_details: details,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs ?? null,
    });
    if (error) console.warn("[analytics] trackEvent:", error.message);
  } catch (e) {
    console.warn("[analytics] trackEvent exception:", e.message);
  }
}

// ─── Convenience wrappers ──────────────────────────────────────────────────────

/**
 * Track a phase/page navigation event.
 * Call whenever the user moves between phases in App.jsx.
 */
export async function trackNavigation(sessionId, repEmail, phaseName) {
  return trackEvent({
    sessionId,
    repEmail,
    eventType: "navigation",
    featureName: phaseName,
    toolUsed: null,
    details: { phase: phaseName },
  });
}

/**
 * Track a feature panel being accessed.
 * Call when a major component mounts or becomes visible.
 */
export async function trackFeatureAccess(sessionId, repEmail, featureName, details = {}) {
  return trackEvent({
    sessionId,
    repEmail,
    eventType: "feature_access",
    featureName,
    details,
  });
}

/**
 * Track a meaningful tool-use action (button clicks, toggle changes, etc.)
 */
export async function trackToolUse(sessionId, repEmail, featureName, toolUsed, details = {}) {
  return trackEvent({
    sessionId,
    repEmail,
    eventType: "tool_use",
    featureName,
    toolUsed,
    details,
  });
}

/**
 * Track a form submission (email send, promo config save, etc.)
 */
export async function trackFormSubmit(sessionId, repEmail, featureName, details = {}) {
  return trackEvent({
    sessionId,
    repEmail,
    eventType: "form_submit",
    featureName,
    details,
  });
}

// ─── Feature aggregate upsert ───────────────────────────────────────────────────

/**
 * Upsert today's aggregate row for this rep + feature.
 * Called after key actions so the aggregates table stays fresh.
 * Uses postgres upsert with conflict on (rep_email, feature_name, date).
 */
export async function incrementFeatureAggregate(repEmail, featureName, { toolUseIncrement = 0, sessionIncrement = 0 } = {}) {
  if (!repEmail || !featureName) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    // Try to increment existing row via RPC if available,
    // otherwise do a simple upsert (idempotent)
    const { error } = await supabase.rpc("upsert_feature_aggregate", {
      p_rep_email: repEmail,
      p_feature_name: featureName,
      p_date: todayStr,
      p_tool_use_increment: toolUseIncrement,
      p_session_increment: sessionIncrement,
    });
    if (error) {
      // Fallback: plain upsert (won't increment, but won't break)
      await supabase.from("feature_usage_aggregates").upsert({
        rep_email: repEmail,
        feature_name: featureName,
        date: todayStr,
        last_updated: new Date().toISOString(),
      }, { onConflict: "rep_email,feature_name,date" });
    }
  } catch (e) {
    console.warn("[analytics] incrementFeatureAggregate exception:", e.message);
  }
}

// ─── Engagement score (client-side) ────────────────────────────────────────────

/**
 * Compute a composite utilization score (0–100) for a single rep
 * based on their aggregated metrics.
 *
 * Weights:
 *   login_frequency   30%
 *   session_duration  25%
 *   feature_breadth   25%
 *   email_volume      20%
 *
 * All inputs are normalized against team-wide max values.
 */
export function computeEngagementScore(repMetrics, teamMaxValues) {
  const {
    sessionCount = 0,
    avgSessionDurationMinutes = 0,
    uniqueFeaturesUsed = 0,
    emailsSent = 0,
  } = repMetrics;

  const {
    maxSessionCount = 1,
    maxAvgDuration = 1,
    maxFeatures = 1,
    maxEmails = 1,
  } = teamMaxValues;

  const loginScore = Math.min(sessionCount / maxSessionCount, 1) * 30;
  const durationScore = Math.min(avgSessionDurationMinutes / maxAvgDuration, 1) * 25;
  const breadthScore = Math.min(uniqueFeaturesUsed / maxFeatures, 1) * 25;
  const volumeScore = Math.min(emailsSent / maxEmails, 1) * 20;

  return Math.round(loginScore + durationScore + breadthScore + volumeScore);
}

/**
 * Classify a score into utilization tier.
 * Returns 'high' | 'medium' | 'low'
 */
export function getUtilizationTier(score) {
  if (score >= 70) return "high";
  if (score >= 35) return "medium";
  return "low";
}

/**
 * Determine trend direction vs. prior period.
 * Returns 'up' | 'stable' | 'down'
 */
export function getTrendDirection(currentScore, priorScore) {
  const delta = currentScore - priorScore;
  if (delta > 5) return "up";
  if (delta < -5) return "down";
  return "stable";
}
