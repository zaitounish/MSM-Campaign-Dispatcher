import React, { useState, useEffect, useCallback } from "react";
import {
  X, Send, Users, RefreshCw, Upload, CheckCircle, AlertCircle,
  ChevronRight, Mail, Zap, FileText,
} from "lucide-react";
import { supabase } from "../lib/supabase";

/**
 * BulkSendModal Manager / Ultimate only
 *
 * Allows managers to send bulk emails on behalf of their reps.
 * Uses the GAS bridge (gasUrl from repSettings) to push emails.
 *
 * Props:
 *   userProfile  { email, role, full_name, id }
 *   repSettings  { gasUrl, … }
 *   onClose      () => void
 */
export default function BulkSendModal({ userProfile, repSettings, onClose }) {
  const [step, setStep] = useState(1); // 1=rep, 2=template, 3=confirm
  const [teamReps, setTeamReps] = useState([]);
  const [loadingReps, setLoadingReps] = useState(true);
  const [selectedRep, setSelectedRep] = useState(null);

  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [toEmails, setToEmails] = useState(""); // comma/newline separated
  const [sendMode, setSendMode] = useState("draft"); // "draft" | "send"

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  const role = userProfile?.role || "rep";
  const gasUrl = repSettings?.gasUrl || "";

  // ── Fetch team reps ─────────────────────────────────────────────────────────
  const fetchTeamReps = useCallback(async () => {
    setLoadingReps(true);
    let query = supabase
      .from("reps_whitelist")
      .select("id, email, full_name, rep_id, role")
      .eq("is_active", true)
      .eq("role", "rep");

    // Manager: only their team; Ultimate: everyone
    if (role === "manager") {
      query = query.eq("manager_id", userProfile?.id);
    }

    const { data } = await query.order("full_name");
    setTeamReps(data || []);
    setLoadingReps(false);
  }, [role, userProfile?.id]);

  useEffect(() => { fetchTeamReps(); }, [fetchTeamReps]);

  // ── Send via GAS ────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!gasUrl) {
      setResult({ ok: false, message: "No GAS URL configured. Add it in Settings first." });
      return;
    }

    const emails = toEmails
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (emails.length === 0) {
      setResult({ ok: false, message: "No valid email addresses found. Please check the list." });
      return;
    }
    if (!subject.trim()) {
      setResult({ ok: false, message: "Subject is required." });
      return;
    }
    if (!htmlBody.trim()) {
      setResult({ ok: false, message: "Email body is required." });
      return;
    }

    setSending(true);
    setResult(null);

    const repName = selectedRep?.full_name || userProfile?.full_name || "MSM Rep";

    const payload = {
      action: sendMode,
      emails: emails.map(to => ({
        to,
        subject,
        htmlBody,
        plainTextBody: htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        name: repName,
      })),
    };

    try {
      await fetch(gasUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setResult({
        ok: true,
        message: sendMode === "draft"
          ? `✓ ${emails.length} draft${emails.length > 1 ? "s" : ""} pushed to Gmail Drafts`
          : `✓ ${emails.length} email${emails.length > 1 ? "s" : ""} sent via GAS`,
      });
    } catch (err) {
      setResult({ ok: false, message: `Send failed: ${err.message}` });
    }

    setSending(false);
  };

  // ── Step labels ─────────────────────────────────────────────────────────────
  const steps = [
    { n: 1, label: "Select Rep" },
    { n: 2, label: "Compose" },
    { n: 3, label: "Send" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-8 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-xl">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Bulk Email Send</h2>
              <p className="text-xs text-emerald-100 mt-0.5">Manager / Ultimate push emails via GAS bridge</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-emerald-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Step indicator ── */}
        <div className="flex items-center gap-0 px-8 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          {steps.map((s, i) => (
            <React.Fragment key={s.n}>
              <button
                onClick={() => { if (s.n < step || (s.n === 2 && selectedRep)) setStep(s.n); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${step === s.n
                  ? "bg-emerald-600 text-white"
                  : s.n < step
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : "text-slate-400"
                  }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${step === s.n ? "bg-white text-emerald-700" : s.n < step ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                  {s.n < step ? "✓" : s.n}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 mx-1" />}
            </React.Fragment>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-8">

          {/* GAS URL warning */}
          {!gasUrl && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                <strong>GAS URL not configured.</strong> You need to add your Google Apps Script URL in{" "}
                <span className="font-bold">Settings</span> before bulk sending. The GAS bridge handles the actual email delivery.
              </p>
            </div>
          )}

          {/* Step 1: Select Rep */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-slate-800 mb-1">Sending on behalf of which rep?</h3>
                <p className="text-sm text-slate-500">Select whose name will appear on the outgoing emails.</p>
              </div>

              {/* "Myself" option for manager */}
              <div className="space-y-2">
                <button
                  onClick={() => { setSelectedRep({ email: userProfile?.email, full_name: userProfile?.full_name, self: true }); setStep(2); }}
                  className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed border-emerald-300 rounded-xl text-sm text-emerald-700 font-semibold hover:bg-emerald-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs shrink-0">
                    {(userProfile?.full_name || userProfile?.email || "?")[0]?.toUpperCase()}
                  </div>
                  <span>{userProfile?.full_name || userProfile?.email} <span className="text-emerald-500 font-normal">(myself)</span></span>
                </button>

                {loadingReps ? (
                  <div className="flex items-center gap-2 text-slate-400 py-4 justify-center text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading reps…
                  </div>
                ) : teamReps.length > 0 ? (
                  <>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-2">Team Reps</p>
                    {teamReps.map(rep => (
                      <button
                        key={rep.id}
                        onClick={() => { setSelectedRep(rep); setStep(2); }}
                        className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 hover:border-emerald-300 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-xs shrink-0">
                          {(rep.full_name || rep.email || "?")[0]?.toUpperCase()}
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-slate-800">{rep.full_name || rep.email}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{rep.email}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
                      </button>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-slate-400 italic text-center py-4">
                    No reps assigned to your team yet. Add them via Manage Reps.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Compose */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-700">
                  Sending as <strong>{selectedRep?.full_name || selectedRep?.email}</strong>
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-slate-400" /> Recipient Emails
                </label>
                <textarea
                  value={toEmails}
                  onChange={e => setToEmails(e.target.value)}
                  placeholder={"merchant1@restaurant.com\nmerchant2@store.com\n…"}
                  rows={4}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">One email per line, or comma-separated</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Subject</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Exciting new promotion for your store!"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-slate-400" /> Email Body (HTML or plain text)
                </label>
                <textarea
                  value={htmlBody}
                  onChange={e => setHtmlBody(e.target.value)}
                  placeholder="Paste your email HTML or write plain text here…"
                  rows={8}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 resize-y"
                />
              </div>

              <button
                onClick={() => setStep(3)}
                disabled={!toEmails.trim() || !subject.trim() || !htmlBody.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Preview & Confirm <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 3: Confirm & Send */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-slate-800 text-sm">Send Summary</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Sender</p>
                    <p className="font-semibold text-slate-700">{selectedRep?.full_name || selectedRep?.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Recipients</p>
                    <p className="font-semibold text-slate-700">
                      {toEmails.split(/[\n,]+/).map(e => e.trim()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).length} valid emails
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Subject</p>
                    <p className="font-semibold text-slate-700 truncate">{subject}</p>
                  </div>
                </div>
              </div>

              {/* Mode selector */}
              <div>
                <p className="text-sm font-bold text-slate-700 mb-3">Delivery mode</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "draft", label: "Push to Drafts", desc: "Creates Gmail drafts you review before sending", icon: FileText, color: "border-blue-400 bg-blue-50" },
                    { id: "send", label: "Send Now", desc: "GAS sends immediately no review step", icon: Zap, color: "border-emerald-500 bg-emerald-50" },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSendMode(m.id)}
                      className={`flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all ${sendMode === m.id ? m.color : "border-slate-200 bg-white hover:border-slate-300"}`}
                    >
                      <div className="flex items-center gap-2">
                        <m.icon className={`w-4 h-4 ${sendMode === m.id ? "text-current" : "text-slate-400"}`} />
                        <span className="font-bold text-sm text-slate-800">{m.label}</span>
                      </div>
                      <p className="text-xs text-slate-500">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* GAS URL missing */}
              {!gasUrl && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">GAS URL is not configured. Go to Settings to add it.</p>
                </div>
              )}

              {/* Result */}
              {result && (
                <div className={`flex items-start gap-2 rounded-xl px-4 py-3 ${result.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                  {result.ok
                    ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    : <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  }
                  <p className={`text-sm font-semibold ${result.ok ? "text-green-700" : "text-red-700"}`}>{result.message}</p>
                </div>
              )}

              {/* Send button */}
              {!result?.ok && (
                <button
                  onClick={handleSend}
                  disabled={sending || !gasUrl}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</>
                    : <><Send className="w-4 h-4" /> {sendMode === "draft" ? "Push to Gmail Drafts" : "Send Now via GAS"}</>
                  }
                </button>
              )}

              {result?.ok && (
                <button
                  onClick={onClose}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Done Close
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
