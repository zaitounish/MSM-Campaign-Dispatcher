import React, { useState, useRef, useEffect } from "react";
import { Mail, Shield, ShieldCheck, ArrowRight, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { supabase, getWhitelistProfile } from "../lib/supabase";

/**
 * OTPLoginScreen
 *
 * Two-step authentication flow:
 *   Step 1 | Enter email → Supabase sends OTP
 *   Step 2 | Enter OTP  → Verify → Check whitelist → Grant access
 *
 * OTP_LENGTH must match Supabase Auth → Settings → "OTP length".
 * Change this one constant if you ever change the Supabase setting.
 */
const OTP_LENGTH = 8; // ← change to 6 here AND in Supabase to use 6-digit codes

export default function OTPLoginScreen({ onAuthenticated }) {
  const emptyOtp = () => Array(OTP_LENGTH).fill("");

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(emptyOtp);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [shaking, setShaking] = useState(false);
  const otpRefs = useRef([]);
  const timerRef = useRef(null);

  // Cooldown countdown for resend button
  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setTimeout(() => setCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  const shake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const resetOtp = () => setOtp(emptyOtp());

  // ── Step 1: Send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e?.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || loading) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      shake();
      return;
    }

    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message || "Failed to send OTP. Please try again.");
      shake();
      return;
    }

    setStep("otp");
    setCooldown(60);
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  };

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length !== OTP_LENGTH || loading) return;

    setLoading(true);
    setError("");

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: "email",
    });

    if (verifyError || !data?.user) {
      setLoading(false);
      setError("Incorrect or expired code. Check your inbox and try again.");
      resetOtp();
      shake();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
      return;
    }

    // Check whitelist
    const profile = await getWhitelistProfile(data.user.email);
    setLoading(false);

    if (!profile) {
      await supabase.auth.signOut();
      setError(
        "Your email is not on the approved access list. " +
        "Contact your ASM to request access."
      );
      shake();
      setStep("email");
      resetOtp();
      return;
    }

    if (!profile.is_active) {
      await supabase.auth.signOut();
      setError(
        "Your account was found, but it is marked as INACTIVE. "
      );
      shake();
      setStep("email");
      resetOtp();
      return;
    }

    onAuthenticated(profile);
  };

  // ── OTP input handling ────────────────────────────────────────────────────
  const handleOtpChange = (idx, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    // Advance focus
    if (digit && idx < OTP_LENGTH - 1) {
      otpRefs.current[idx + 1]?.focus();
    }
    // Auto-verify when all digits filled
    if (digit && idx === OTP_LENGTH - 1 && next.every(d => d !== "")) {
      setTimeout(() => handleVerifyOtp(), 50);
    }
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === "Backspace") {
      if (otp[idx]) {
        const next = [...otp]; next[idx] = ""; setOtp(next);
      } else if (idx > 0) {
        otpRefs.current[idx - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && idx > 0) otpRefs.current[idx - 1]?.focus();
    else if (e.key === "ArrowRight" && idx < OTP_LENGTH - 1) otpRefs.current[idx + 1]?.focus();
    else if (e.key === "Enter" && otp.every(d => d !== "")) handleVerifyOtp();
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = emptyOtp();
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setOtp(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    otpRefs.current[focusIdx]?.focus();
    if (pasted.length === OTP_LENGTH) setTimeout(() => handleVerifyOtp(), 50);
  };

  const filledCount = otp.filter(d => d !== "").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-red-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-red-600/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-slate-700/20 rounded-full blur-3xl" />
      </div>

      <div
        className="relative w-full max-w-sm"
        style={shaking ? { animation: "shake 0.45s ease-in-out" } : {}}
      >
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">

          {/* Logo + branding */}
          <div className="flex flex-col items-center mb-8">
            <div className={`p-4 rounded-2xl mb-4 transition-all duration-500 ${step === "otp"
              ? "bg-green-500/10 border border-green-500/20"
              : "bg-red-600/10 border border-red-600/20"
              }`}>
              {step === "otp"
                ? <ShieldCheck className="w-8 h-8 text-green-400" />
                : <Shield className="w-8 h-8 text-red-400" />
              }
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">MSM Campaign Dispatcher</h1>
            <p className="text-slate-400 text-sm mt-1 text-center">
              {step === "email"
                ? "Enter your email to receive a one-time access code"
                : `We sent a ${OTP_LENGTH}-digit code to`
              }
            </p>
            {step === "otp" && (
              <p className="text-white font-semibold text-sm mt-1">{email}</p>
            )}
          </div>

          {/* ── Step 1: Email form ── */}
          {step === "email" && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(""); }}
                    disabled={loading}
                    placeholder="you@example.com"
                    autoFocus
                    className="w-full bg-white/10 border border-white/10 text-white placeholder-slate-500 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all text-sm disabled:opacity-40"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-400 leading-relaxed">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-900/30 hover:-translate-y-0.5 active:translate-y-0"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending code…</>
                ) : (
                  <>Send Access Code <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          )}

          {/* ── Step 2: OTP entry ── */}
          {step === "otp" && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-center">
                  Enter your {OTP_LENGTH}-digit code
                </label>
                {/* OTP boxes | dynamically renders OTP_LENGTH boxes */}
                <div className="flex gap-1.5 justify-center" onPaste={handleOtpPaste}>
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={el => otpRefs.current[idx] = el}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(idx, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(idx, e)}
                      disabled={loading}
                      className={`w-10 text-center text-xl font-bold rounded-xl border transition-all outline-none
                        bg-white/10 text-white
                        ${digit
                          ? "border-red-500 bg-red-500/10 shadow-[0_0_0_1px_rgba(239,68,68,0.4)]"
                          : "border-white/10 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                        }
                        disabled:opacity-40
                      `}
                      style={{ height: "48px", padding: "0" }}
                    />
                  ))}
                </div>
                <p className="text-center text-xs text-slate-500 mt-2">
                  {filledCount < OTP_LENGTH
                    ? `${OTP_LENGTH - filledCount} digit${OTP_LENGTH - filledCount !== 1 ? "s" : ""} remaining`
                    : "Verifying…"}
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-400 leading-relaxed">{error}</p>
                </div>
              )}

              <button
                onClick={handleVerifyOtp}
                disabled={loading || filledCount < OTP_LENGTH}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-900/30 hover:-translate-y-0.5 active:translate-y-0"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                ) : (
                  <><ShieldCheck className="w-4 h-4" /> Verify &amp; Enter</>
                )}
              </button>

              {/* Resend / change email */}
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => { setStep("email"); resetOtp(); setError(""); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ← Change email
                </button>
                <button
                  onClick={handleSendOtp}
                  disabled={cooldown > 0 || loading}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-xs text-slate-600 mt-8">
            DoorDash Internal Tool · Merchant Success
          </p>
        </div>
      </div>

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
