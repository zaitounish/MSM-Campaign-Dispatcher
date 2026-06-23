/**
 * supabase.js | Supabase client singleton
 *
 * All API calls go through this one shared instance.
 * Values are loaded from .env.local (never committed to git).
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
    .select("id, email, full_name, rep_id, role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  console.log("[whitelist] data:", data);
  console.log("[whitelist] error:", error?.message, error?.code, error?.details);

  if (error || !data) return null;
  return data;
}

/**
 * Log an email send event to the tracking table.
 * Fire-and-forget | does not block the send flow.
 */
export async function logEmailSend({
  repEmail, repName, merchantName, merchantId,
  toEmail, ccEmails, subject, promoTypes, deliveryMethod, emailFormat,
}) {
  const { error } = await supabase.from("email_send_log").insert({
    rep_email: repEmail,
    rep_name: repName,
    merchant_name: merchantName,
    merchant_id: merchantId,
    to_email: toEmail,
    cc_emails: ccEmails,
    subject,
    promo_types: promoTypes,
    delivery_method: deliveryMethod,
    email_format: emailFormat,
  });
  if (error) console.warn("[logEmailSend]", error.message);
}
