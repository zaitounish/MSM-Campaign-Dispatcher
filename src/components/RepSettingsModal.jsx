import React, { useState, useRef, useEffect } from "react";
import { Database, Settings, Save, AlertCircle, Sparkles, FileText } from "lucide-react";

export default function RepSettingsModal({ isOpen, onClose, repSettings, setRepSettings }) {
  const [formData, setFormData] = useState({
    repId: repSettings.repId || "",
    gasUrl: repSettings.gasUrl || "",
    geminiApiKey: repSettings.geminiApiKey || "",
    // Legacy structured fields — kept so existing data isn't lost
    firstName: repSettings.firstName || "",
    lastName: repSettings.lastName || "",
    title: repSettings.title || "Merchant Success Manager",
    phone: repSettings.phone || "",
  });

  // Signature is rich HTML (images + formatting) — managed via ref to avoid
  // React-controlled cursor-jump issues with contentEditable
  const signatureRef = useRef(null);
  const [sigEmpty, setSigEmpty] = useState(!repSettings.signature);

  // Seed the contentEditable div once on mount
  useEffect(() => {
    if (signatureRef.current && repSettings.signature) {
      signatureRef.current.innerHTML = repSettings.signature;
      setSigEmpty(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    // Read rich HTML from the contentEditable ref for signature
    const rawSig = signatureRef.current?.innerHTML || "";
    const sig = (rawSig === "<br>" || rawSig.trim() === "") ? "" : rawSig;
    setRepSettings({ ...formData, signature: sig });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* max-h + flex-col so the footer (Save button) is always visible */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">

        {/* ── Header ── */}
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 flex items-center gap-3 shrink-0">
          <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-200">
            <Settings className="w-6 h-6 text-slate-700" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Rep Configuration</h2>
            <p className="text-sm text-slate-500 font-medium">Saved locally in your browser. Used for emails and deep links.</p>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">

          {/* Email Signature — rich paste from Gmail (images supported) */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" /> Email Signature
            </h3>

            {/* contentEditable so images paste in natively */}
            <div className="relative">
              <div
                ref={signatureRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => setSigEmpty(!signatureRef.current?.textContent?.trim())}
                style={{ minHeight: 128 }}
                className={`w-full bg-white border rounded-xl px-4 py-3 outline-none
                  text-sm text-slate-800 leading-relaxed transition-all
                  focus:border-dd-red focus:ring-1 focus:ring-dd-red
                  [&_img]:max-h-16 [&_img]:max-w-[180px] [&_img]:object-contain [&_img]:inline-block
                  ${sigEmpty ? "border-slate-300" : "border-slate-400"}
                `}
              />
              {sigEmpty && (
                <p className="absolute top-3 left-4 text-sm text-slate-400 pointer-events-none select-none">
                  Paste your Outreach signature here (Ctrl+V)…
                </p>
              )}
            </div>
          </div>

          <div className="h-px w-full bg-slate-100" />

          {/* System Integration */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              System Integration
            </h3>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-slate-400" /> Assisted Rep ID (Salesforce)
              </label>
              <input
                type="text"
                name="repId"
                value={formData.repId}
                onChange={handleChange}
                placeholder="e.g. 563543"
                className="w-full bg-slate-50 border border-slate-300 font-mono text-sm rounded-xl px-4 py-2.5 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all"
              />
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Crucial for attribution. This ID is injected into every deep link generated by the system.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-dd-red" /> Google Apps Script Web App URL
              </label>
              <input
                type="url"
                name="gasUrl"
                value={formData.gasUrl}
                onChange={handleChange}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full bg-slate-50 border border-slate-300 font-mono text-xs rounded-xl px-4 py-2.5 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all"
              />
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Used exclusively by the "Bulk Send" feature to bypass local mail clients via Google's infrastructure.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-violet-500" /> Gemini API Key (AI Insights)
              </label>
              <input
                type="password"
                name="geminiApiKey"
                value={formData.geminiApiKey}
                onChange={handleChange}
                placeholder="AIza..."
                className="w-full bg-slate-50 border border-slate-300 font-mono text-xs rounded-xl px-4 py-2.5 focus:border-violet-500 focus:ring-1 focus:ring-violet-400 outline-none transition-all"
              />
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Free key from <strong>ai.google.dev</strong>. Used locally to generate AI pipeline insights. Never sent to our servers.
              </p>
            </div>
          </div>

        </div>

        {/* ── Footer — always visible ── */}
        <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0">
          {formData.repId && (
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition-colors shadow-sm"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!formData.repId}
            className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-dd-red hover:bg-dd-red-dark shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" /> Save Configuration
          </button>
        </div>

      </div>
    </div>
  );
}
