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
  if (!key) return null;
  try {
    const { data, error } = await supabase
      .from("rep_settings")
      .select("rep_id, gas_url, gemini_api_key, first_name, last_name, title, phone, signature, updated_at")
      .eq("rep_email", key)
      .maybeSingle();
    if (error) {
      console.warn("[repSettings] load:", error.message);
      return null;
    }
    return fromDbRow(data);
  } catch (e) {
    console.warn("[repSettings] load exception:", e.message);
    return null;
  }
}

/**
 * Upsert the rep's settings row. Returns { ok: boolean }.
 * Never throws — callers must not depend on the result for UI flow.
 */
export async function saveRepSettings(email, settings) {
  const key = normalizeRepEmail(email);
  if (!key) return { ok: false };
  try {
    const { error } = await supabase
      .from("rep_settings")
      .upsert(toDbRow(key, settings), { onConflict: "rep_email" });
    if (error) {
      console.warn("[repSettings] save:", error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[repSettings] save exception:", e.message);
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
