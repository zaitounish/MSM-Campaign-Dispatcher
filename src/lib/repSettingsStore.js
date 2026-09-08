/**
 * repSettingsStore.js | Per-rep settings synced via Supabase
 *
 * Replaces `mcd_rep_settings` localStorage as the source of truth.
 * localStorage is kept only as an instant-paint cache + offline fallback
 * (see App.jsx) — the DB row always wins on load.
 *
 * Identity: keyed by login email (trimmed + lowercased, matching the OTP
 * flow). RLS on rep_settings is exact-match on auth.email(), so
 * normalization here is load-bearing — use it on both read and write.
 * NOTE (migration 003): there is intentionally NO foreign key to
 * reps_whitelist(email) — some whitelist emails contain uppercase chars and
 * a case-sensitive FK rejected those upserts. Ownership is enforced by RLS.
 *
 * Fire-and-forget convention (mirrors lib/analytics.js): helpers warn on
 * failure and never throw, so persistence problems can't break the app.
 */

import { supabase } from "./supabase";

const CACHE_KEY = "mcd_rep_settings";

/** Normalize an email to the canonical key form. */
export function normalizeRepEmail(email) {
  return (email || "").trim().toLowerCase();
}

/** DB row → app-shaped settings object. */
export function fromDbRow(row) {
  if (!row) return null;
  const settings = {};
  if (row.rep_id != null) settings.repId = row.rep_id;
  if (row.gas_url != null) settings.gasUrl = row.gas_url;
  if (row.gemini_api_key != null) settings.geminiApiKey = row.gemini_api_key;
  if (row.first_name != null) settings.firstName = row.first_name;
  if (row.last_name != null) settings.lastName = row.last_name;
  if (row.title != null) settings.title = row.title;
  if (row.phone != null) settings.phone = row.phone;
  if (row.signature != null) settings.signature = row.signature;
  return settings;
}

/** App-shaped settings → DB row. */
export function toDbRow(email, settings) {
  const s = settings || {};
  return {
    rep_email: email,
    rep_id: s.repId ?? null,
    gas_url: s.gasUrl ?? null,
    gemini_api_key: s.geminiApiKey ?? null,
    first_name: s.firstName ?? null,
    last_name: s.lastName ?? null,
    title: s.title ?? null,
    phone: s.phone ?? null,
    signature: s.signature ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Load the rep's settings row. Returns the app-shaped object,
 * or null when no row exists yet (first login) or on failure.
 */
export async function loadRepSettings(email) {
  const key = normalizeRepEmail(email);
  console.log("[repSettings] LOAD | raw email:", JSON.stringify(email), "→ normalized key:", JSON.stringify(key));
  if (!key) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn("[repSettings] LOAD skipped — no active Supabase session.");
      return null;
    }
    console.log("[repSettings] LOAD | session OK, user:", session.user?.email);

    // Attempt 1: Direct table query
    const { data, error } = await supabase
      .from("rep_settings")
      .select("rep_id, gas_url, gemini_api_key, first_name, last_name, title, phone, signature, updated_at")
      .eq("rep_email", key)
      .maybeSingle();

    if (!error) {
      console.log("[repSettings] LOAD result:", data
        ? `row found (rep_id=${data.rep_id}, gas_url=${data.gas_url ? "set" : "empty"}, signature=${data.signature ? "set" : "empty"})`
        : "NO ROW in DB — settings will be blank");
      return fromDbRow(data);
    }

    console.warn("[repSettings] Direct table LOAD failed:", error.code, error.message,
      "\n→ Attempting fallback via get_my_rep_settings RPC...");

    // Attempt 2: RPC fallback (bypasses table grant issues via SECURITY DEFINER)
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_my_rep_settings");
    if (!rpcError && rpcData) {
      console.log("[repSettings] LOAD success via RPC get_my_rep_settings ✓");
      return fromDbRow(rpcData);
    }

    console.error("[repSettings] LOAD ERROR: Table and RPC queries failed.",
      "\nTable error:", error?.code, error?.message,
      "\nRPC error:", rpcError?.code, rpcError?.message,
      "\n→ Run supabase-migrations/004_fix_rep_settings_permissions.sql in Supabase SQL Editor.");
    return null;
  } catch (e) {
    console.error("[repSettings] LOAD exception:", e.message);
    return null;
  }
}

/**
 * Upsert the rep's settings row. Returns { ok: boolean }.
 * Never throws — callers must not depend on the result for UI flow.
 */
export async function saveRepSettings(email, settings) {
  const key = normalizeRepEmail(email);
  console.log("[repSettings] SAVE | normalized key:", JSON.stringify(key),
    "| rep_id:", settings?.repId, "| gas_url:", settings?.gasUrl ? "set" : "empty",
    "| signature:", settings?.signature ? "set" : "empty");
  if (!key) return { ok: false };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn("[repSettings] SAVE skipped — no active Supabase session.");
      return { ok: false };
    }
    console.log("[repSettings] SAVE | session OK, user:", session.user?.email);

    const row = toDbRow(key, settings);
    console.log("[repSettings] SAVE | upsert payload:", JSON.stringify({ ...row, signature: row.signature ? `[${row.signature.length} chars]` : null }));

    // Attempt 1: Direct table upsert
    const { error } = await supabase
      .from("rep_settings")
      .upsert(row, { onConflict: "rep_email" });

    if (!error) {
      console.log("[repSettings] SAVE SUCCESS ✓ — row written to DB for", key);
      return { ok: true };
    }

    console.warn("[repSettings] Direct table SAVE failed:", error.code, error.message,
      "\n→ Attempting fallback via save_my_rep_settings RPC...");

    // Attempt 2: RPC fallback (bypasses table grant issues via SECURITY DEFINER)
    const { data: rpcSuccess, error: rpcError } = await supabase.rpc("save_my_rep_settings", {
      p_rep_id: row.rep_id,
      p_gas_url: row.gas_url,
      p_gemini_api_key: row.gemini_api_key,
      p_first_name: row.first_name,
      p_last_name: row.last_name,
      p_title: row.title,
      p_phone: row.phone,
      p_signature: row.signature,
    });

    if (!rpcError && rpcSuccess) {
      console.log("[repSettings] SAVE SUCCESS via RPC fallback ✓ for", key);
      return { ok: true };
    }

    console.error("[repSettings] SAVE ERROR: Table and RPC writes both failed.",
      "\nTable error:", error?.code, error?.message,
      "\nRPC error:", rpcError?.code, rpcError?.message,
      "\n→ Run supabase-migrations/004_fix_rep_settings_permissions.sql in Supabase SQL Editor.");
    return { ok: false };
  } catch (e) {
    console.error("[repSettings] SAVE exception:", e.message);
    return { ok: false };
  }
}

/**
 * Mirror the Assisted Rep ID into reps_whitelist.rep_id so the Admin panel
 * and the BulkSend rep list pick it up.
 *
 * Goes through the `set_my_rep_id` RPC (SECURITY DEFINER, updates only the
 * caller's own row) because RLS cannot scope an UPDATE to a single column.
 * Fire-and-forget: returns { ok } and never throws.
 */
export async function mirrorRepIdToWhitelist(repId) {
  const id = (repId || "").trim();
  if (!id) return { ok: false };
  try {
    const { error } = await supabase.rpc("set_my_rep_id", { p_rep_id: id });
    if (error) {
      console.warn("[repSettings] mirror rep_id:", error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[repSettings] mirror rep_id exception:", e.message);
    return { ok: false };
  }
}

/** Read the local instant-paint cache (may be stale — DB wins on load). */
export function readSettingsCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Write the local instant-paint cache. Failure is non-critical. */
export function writeSettingsCache(settings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings || {}));
  } catch (e) {
    console.warn("[repSettings] Could not write settings cache:", e.message);
  }
}
