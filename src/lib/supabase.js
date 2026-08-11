/**
 * supabase.js | Supabase client singleton
 *
 * All API calls go through this one shared instance.
 * Values are loaded from .env.local (never committed to git).
 *
 * NOTE: Session/event tracking helpers live in lib/analytics.js.
 * They are fire-and-forget and never block the main app flow.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  console.error(
    "[Supabase] Missing env vars. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession: true,    // survives page refresh
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ─── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Fetches the whitelist profile for the current signed-in user.
 * Returns null if the email is not in the whitelist or is inactive.
 */
export async function getWhitelistProfile(email) {
  console.log("[whitelist] querying for email:", JSON.stringify(email));

  const { data, error } = await supabase
    .from("reps_whitelist")
    .select("id, email, full_name, rep_id, role, is_active, manager_id, daily_email_limit")
    .ilike("email", email.trim())
    .maybeSingle();

  console.log("[whitelist] data:", data);
  console.log("[whitelist] error:", error?.message, error?.code, error?.details);

  if (error || !data) return null;
  return data;
}

/**
 * Fetch the distinct set of rep_emails that have ever sent at least one email.
 * This is the backend source of truth for populating filter dropdowns  
 * it is NOT filtered by date range, rep, or any UI state.
 * Returns a Set<string> of email addresses.
 */
export async function getActiveSenders() {
  const { data, error } = await supabase
    .from("email_send_log")
    .select("rep_email")
    .not("rep_email", "is", null);

  if (error) {
    console.warn("[getActiveSenders]", error.message);
    return new Set();
  }
  const s = new Set();
  (data || []).forEach(r => { if (r.rep_email) s.add(r.rep_email); });
  return s;
}

/**
 * Log an email send event to the tracking table.
 * Supports both single object or array of objects for bulk insert.
 */
export async function logEmailSend(eventOrEvents) {
  const payload = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
  if (payload.length === 0) return;

  const mapped = payload.map(e => ({
    rep_email: e.repEmail,
    rep_name: e.repName,
    merchant_name: e.merchantName,
    merchant_id: e.merchantId,
    to_email: e.toEmail,
    cc_emails: e.ccEmails,
    subject: e.subject,
    promo_types: e.promoTypes,
    delivery_method: e.deliveryMethod,
    email_format: e.emailFormat,
  }));

  const { error } = await supabase.from("email_send_log").insert(mapped);
  if (error) console.warn("[logEmailSend]", error.message);
}

/**
 * Count how many emails the rep has sent today, excluding blank promo sends.
 * Used to enforce the 45-email daily limit for reps.
 */
export async function getRepDailyCount(repEmail) {
  if (!repEmail) return 0;
  // Always use UTC midnight so the window matches Supabase's stored timestamps
  // regardless of the rep's local timezone.
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const { data, error } = await supabase
    .from("email_send_log")
    .select("id, promo_types")
    .eq("rep_email", repEmail)
    .gte("sent_at", todayStart.toISOString());

  if (error) {
    console.warn("[getRepDailyCount]", error.message);
    return 0;
  }

  // Exclude sends that are purely blank (blank campaign doesn't count toward quota)
  const nonBlank = (data || []).filter(row => {
    const types = Array.isArray(row.promo_types) ? row.promo_types : [];
    return !(types.length === 1 && types[0] === "blank");
  });
  return nonBlank.length;
}

/**
 * Fetch the rep's active daily limit override for today (if any).
 * Returns the override limit (e.g. 60) or null if no override is active.
 */
export async function getRepDailyLimitOverride(repEmail) {
  if (!repEmail) return null;
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("reps_whitelist")
    .select("daily_limit_override, daily_limit_override_date")
    .eq("email", repEmail)
    .maybeSingle();

  if (error || !data) return null;
  if (data.daily_limit_override && data.daily_limit_override_date === todayStr) {
    return data.daily_limit_override;
  }
  return null;
}

/**
 * Submit a limit increase approval request to the manager (or ultimates if unassigned).
 * Writes to the `limit_approval_requests` table.
 */
export async function submitLimitApprovalRequest({ repEmail, repName, managerId }) {
  const { error } = await supabase.from("limit_approval_requests").insert({
    rep_email: repEmail,
    rep_name: repName,
    manager_id: managerId || null,
    status: "pending",
  });
  if (error) console.warn("[submitLimitApprovalRequest]", error.message);
  return !error;
}

/**
 * Fetch pending approval requests for a given manager (by their whitelist id).
 * Ultimates fetch ALL pending requests (managerId === null means fetch all).
 */
export async function fetchPendingApprovals({ managerId, isUltimate }) {
  let query = supabase
    .from("limit_approval_requests")
    .select("*")
    .eq("status", "pending")
    .order("requested_at", { ascending: false });

  if (!isUltimate && managerId) {
    // Managers see requests assigned to them OR unassigned (manager_id IS NULL)
    query = query.or(`manager_id.eq.${managerId},manager_id.is.null`);
  }
  // Ultimates see everything (no extra filter)

  const { data, error } = await query;
  if (error) console.warn("[fetchPendingApprovals]", error.message);
  return data || [];
}

/**
 * Approve or deny a limit request.
 * On approval, also writes daily_limit_override to reps_whitelist for the rep.
 */
export async function resolveApprovalRequest({ requestId, repEmail, approved, approvedLimit = 65 }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const resolvedBy = (await supabase.auth.getUser())?.data?.user?.id || null;

  // Update the request row
  const { error: reqErr } = await supabase
    .from("limit_approval_requests")
    .update({
      status: approved ? "approved" : "denied",
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      approved_limit: approved ? approvedLimit : null,
    })
    .eq("id", requestId);

  if (reqErr) { console.warn("[resolveApprovalRequest] request update", reqErr.message); return false; }

  // On approval, write the override to reps_whitelist
  if (approved && repEmail) {
    const { error: wlErr } = await supabase
      .from("reps_whitelist")
      .update({
        daily_limit_override: approvedLimit,
        daily_limit_override_date: todayStr,
      })
      .eq("email", repEmail);
    if (wlErr) console.warn("[resolveApprovalRequest] whitelist update", wlErr.message);
  }
  return true;
}
