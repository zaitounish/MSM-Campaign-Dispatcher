import React, { useState, useCallback } from "react";
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle } from "lucide-react";

/**
 * SHA-256 hash of the access password.
 * The raw password is NEVER stored | only this digest.
 * Computed via: crypto.createHash('sha256').update('KRGZ@CNX').digest('hex')
 */
const STORED_HASH = "213f3809dcd4f4f2fe9cc246d32cfe2bce299861ac31a9a5745b064aa8924997";
const SESSION_KEY  = "mcd_auth_token";
const MAX_ATTEMPTS = 5;

/** Returns the hex SHA-256 digest of a string using the browser Web Crypto API. */
async function sha256(str) {
  const buf    = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Check whether the current session was already authenticated. */
export function isSessionAuthenticated() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === STORED_HASH;
  } catch {
    return false;
  }
}

export default function LockScreen({ onUnlocked }) {
  const [password, setPassword]   = useState("");
  const [showPw,   setShowPw]     = useState(false);
  const [error,    setError]      = useState("");
  const [attempts, setAttempts]   = useState(0);
  const [loading,  setLoading]    = useState(false);
  const [shaking,  setShaking]    = useState(false);

  const locked = attempts >= MAX_ATTEMPTS;

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    if (loading || locked || !password.trim()) return;

    setLoading(true);
    setError("");

    try {
      const hash = await sha256(password);
      if (hash === STORED_HASH) {
        sessionStorage.setItem(SESSION_KEY, STORED_HASH);
        onUnlocked();
      } else {
        const next = attempts + 1;
        setAttempts(next);
        triggerShake();
        if (next >= MAX_ATTEMPTS) {
          setError(`Too many incorrect attempts. Refresh the page to try again.`);
        } else {
          setError(`Incorrect password. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next !== 1 ? "s" : ""} remaining.`);
        }
        setPassword("");
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [password, attempts, loading, locked, onUnlocked]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-dd-red/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-dd-red/5 rounded-full blur-3xl" />
      </div>

      <div
        className={`relative w-full max-w-sm transition-all duration-300 ${shaking ? "animate-shake" : ""}`}
        style={shaking ? { animation: "shake 0.45s ease-in-out" } : {}}
      >
        {/* Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">

          {/* Logo / Icon */}
          <div className="flex flex-col items-center mb-8">
            <div className="bg-dd-red/10 border border-dd-red/20 p-4 rounded-2xl mb-4">
              <Lock className="w-8 h-8 text-dd-red" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">MSM Campaign Dispatcher</h1>
            <p className="text-slate-400 text-sm mt-1 text-center">Enter your access password to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={locked || loading}
                  placeholder="Enter access password"
                  autoFocus
                  className="w-full bg-white/10 border border-white/10 text-white placeholder-slate-500 rounded-xl px-4 py-3 pr-11 outline-none focus:border-dd-red focus:ring-1 focus:ring-dd-red transition-all font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-400 leading-relaxed">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={locked || loading || !password.trim()}
              className="w-full flex items-center justify-center gap-2 bg-dd-red hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-dd-red/20 hover:shadow-dd-red/30 hover:-translate-y-0.5 active:translate-y-0"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Verifying...
                </span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Unlock
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-slate-600 mt-6">
            DoorDash Internal Tool · Merchant Success
          </p>
        </div>
      </div>

      {/* Shake keyframe | injected once */}
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-5px); }
          80%      { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
