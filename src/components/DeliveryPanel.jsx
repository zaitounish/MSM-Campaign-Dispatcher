import React, { useState, useMemo } from "react";
import {
  DownloadCloud, CheckCircle2, Layers, FileText,
  Loader2, AlertTriangle, Mail, ExternalLink, ChevronDown,
  ChevronUp, Copy, Check,
} from "lucide-react";

// ─── Gmail Compose URL builder ────────────────────────────────────────────────
// Opens Gmail's web compose window in a new tab. Zero setup, works with any
// Gmail account already logged in the browser.
const buildGmailUrl = ({ to, cc, draft }) => {
  const base   = "https://mail.google.com/mail/?view=cm&fs=1";
  const body   = draft.plainTextBody || "";
  const parts  = [
    `to=${encodeURIComponent(to)}`,
    cc ? `cc=${encodeURIComponent(cc)}` : "",
    `su=${encodeURIComponent(draft.subject || "")}`,
    `body=${encodeURIComponent(body)}`,
  ].filter(Boolean);
  return `${base}&${parts.join("&")}`;
};

// GAS script the user deploys once to enable rich HTML drafts
const GAS_SCRIPT = `// Paste this into script.google.com → New Project → Deploy as Web App
// Permissions: Run as → Me | Access → Anyone (even anonymous)
function doPost(e) {
  const { action, emails } = JSON.parse(e.postData.contents);
  emails.forEach(function(email) {
    const opts = {
      cc:       email.cc || "",
      htmlBody: email.htmlBody,
      name:     email.name || "DoorDash Merchant Success",
    };
    if (action === "draft") {
      GmailApp.createDraft(email.to, email.subject, email.plainTextBody, opts);
    } else {
      GmailApp.sendEmail(email.to, email.subject, email.plainTextBody, opts);
    }
  });
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

export default function DeliveryPanel({
  merchants, emailDrafts, repSettings, dispatchMode, setDispatchMode,
}) {
  const [queue,       setQueue]       = useState(null);  // { items[], opened: Set }
  const [isSending,   setIsSending]   = useState(false);
  const [sendStatus,  setSendStatus]  = useState(null);
  const [gasExpanded, setGasExpanded] = useState(false);
  const [copied,      setCopied]      = useState(false);

  const selectedMerchants = merchants.filter(m => m.selected);
  const activeDrafts = emailDrafts.filter(d =>
    selectedMerchants.some(m => m.id === d.merchantId)
  );

  const totalCount = useMemo(() => {
    let n = 0;
    activeDrafts.forEach(d => {
      const m = selectedMerchants.find(m => m.id === d.merchantId);
      if (!m?.emails?.length) return;
      n += dispatchMode === "separate" ? m.emails.length : 1;
    });
    return n;
  }, [activeDrafts, dispatchMode, selectedMerchants]);

  // ── Build targets list ───────────────────────────────────────────────────────
  const buildTargets = () => {
    const targets = [];
    activeDrafts.forEach(draft => {
      const m = selectedMerchants.find(m => m.id === draft.merchantId);
      if (!m?.emails?.length) return;
      const primary     = m.emails.find(e => e.isPrimary) || m.emails[0];
      const secondaries = m.emails.filter(e => !e.isPrimary).map(e => e.address);

      if (dispatchMode === "separate") {
        m.emails.forEach(e => targets.push({ to: e.address, cc: "", draft, label: m.merchantName }));
      } else if (dispatchMode === "primary") {
        targets.push({ to: primary.address, cc: "", draft, label: m.merchantName });
      } else {
        targets.push({ to: primary.address, cc: secondaries.join(", "), draft, label: m.merchantName });
      }
    });
    return targets;
  };

  // ── Open Gmail Queue ─────────────────────────────────────────────────────────
  const handleOpenGmailQueue = () => {
    const items = buildTargets();
    setQueue({ items, opened: new Set() });
    setSendStatus(null);
  };

  const openOneInGmail = (idx) => {
    const target = queue.items[idx];
    const url    = buildGmailUrl(target);
    window.open(url, "_blank", "noopener");
    setQueue(prev => {
      const opened = new Set(prev.opened);
      opened.add(idx);
      return { ...prev, opened };
    });
  };

  const closeQueue = () => {
    const doneCount = queue?.opened?.size || 0;
    setQueue(null);
    if (doneCount > 0) {
      setSendStatus({
        type: "success",
        msg: `Opened ${doneCount} Gmail compose window${doneCount > 1 ? "s" : ""}. Review each draft and click Send.`,
      });
    }
  };

  // ── GAS Bridge (HTML rich drafts) ────────────────────────────────────────────
  const handleGasDraft = async () => {
    if (!repSettings.gasUrl) {
      setSendStatus({ type: "error", msg: "No GAS URL in Settings. See setup instructions below." });
      setGasExpanded(true);
      return;
    }
    setIsSending(true);
    setSendStatus(null);
    const payloads = buildTargets().map(t => ({
      to:            t.to,
      cc:            t.cc,
      subject:       t.draft.subject,
      htmlBody:      t.draft.htmlBody,
      plainTextBody: t.draft.plainTextBody,
      name:          `${repSettings.firstName || ""} ${repSettings.lastName || ""}`.trim() || "DoorDash Merchant Success",
    }));
    try {
      await fetch(repSettings.gasUrl, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", emails: payloads }),
      });
      setSendStatus({ type: "success", msg: `Pushed ${payloads.length} rich HTML draft${payloads.length > 1 ? "s" : ""} to your Gmail Drafts folder. Open Gmail to review and send.` });
    } catch (err) {
      setSendStatus({ type: "error", msg: err.message || "Network error." });
    } finally {
      setIsSending(false);
    }
  };

  // ── Export Excel ─────────────────────────────────────────────────────────────
  const handleExport = () => {
    const XLSX = window.XLSX;
    if (!XLSX) { alert("Excel utility not loaded."); return; }
    const rows = [["Merchant", "To", "CC", "Subject"]];
    buildTargets().forEach(t => rows.push([t.label, t.to, t.cc, t.draft.subject]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dispatch");
    XLSX.writeFile(wb, `Campaign_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(GAS_SCRIPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (activeDrafts.length === 0) return null;

  return (
    <div className="bg-white border-t border-slate-200 p-8 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] mt-12 mb-16 rounded-3xl mx-6">

      {/* Dispatch mode */}
      <div className="max-w-4xl mx-auto mb-6 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-col md:flex-row">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-slate-500" />
            <div>
              <p className="text-sm font-bold text-slate-800">Routing Mode</p>
              <p className="text-xs text-slate-500">How to handle merchants with multiple contacts?</p>
            </div>
          </div>
          <div className="flex items-center bg-slate-200/60 p-1 rounded-xl gap-1 w-full md:w-auto">
            {[["cc","CC Mode"],["separate","Separate"],["primary","Primary Only"]].map(([v,l]) => (
              <button key={v} onClick={() => setDispatchMode(v)}
                className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${dispatchMode===v ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-5">

        {/* Status banner */}
        {sendStatus && (
          <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl text-sm font-semibold ${sendStatus.type==="success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {sendStatus.type==="success" ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0"/> : <AlertTriangle className="w-5 h-5 text-red-500 shrink-0"/>}
            {sendStatus.msg}
          </div>
        )}

        {/* Action row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-5">
          <div>
            <h3 className="text-xl font-bold text-slate-800 mb-1">Ready to Dispatch</h3>
            <p className="text-sm text-slate-500">
              <span className="font-bold text-slate-800 bg-slate-200 px-2.5 py-0.5 rounded-md mr-1">{totalCount}</span>
              emails ready to send through Gmail.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button onClick={handleExport}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors text-sm">
              <DownloadCloud className="w-4 h-4"/> Export
            </button>

            {/* Gmail Drafts via GAS — rich HTML */}
            <button onClick={handleGasDraft} disabled={isSending}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md disabled:opacity-60 text-sm">
              {isSending ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>}
              Gmail Drafts (HTML)
            </button>

            {/* Primary: Gmail Compose Queue */}
            <button onClick={handleOpenGmailQueue}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold bg-dd-red hover:bg-[#ff3019] text-white transition-all shadow-md text-sm">
              <Mail className="w-4 h-4"/> Open in Gmail →
            </button>
          </div>
        </div>

        {/* Gmail info strip */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 text-xs text-blue-800">
          <ExternalLink className="w-4 h-4 text-blue-500 mt-0.5 shrink-0"/>
          <div className="space-y-1">
            <p><strong>Open in Gmail →</strong> opens each email as a Gmail compose window in your browser — pre-filled with recipient, subject, and body. You review and click Send in Gmail.</p>
            <p><strong>Gmail Drafts (HTML)</strong> creates fully-formatted rich HTML drafts directly in your Gmail Drafts folder via Google Apps Script. Requires one-time setup below.</p>
          </div>
        </div>

        {/* GAS Setup Guide (collapsible) */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <button onClick={() => setGasExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-bold text-slate-700">
            <span className="flex items-center gap-2">
              ⚡ Gmail Drafts Setup — One-time Google Apps Script deploy
              {repSettings.gasUrl
                ? <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-bold">✓ Configured</span>
                : <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">Not set up</span>
              }
            </span>
            {gasExpanded ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
          </button>

          {gasExpanded && (
            <div className="px-5 py-5 bg-white space-y-4 border-t border-slate-200 text-sm text-slate-700">
              <ol className="list-decimal list-inside space-y-2 text-slate-600">
                <li>Go to <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">script.google.com</a> and create a <strong>New Project</strong>.</li>
                <li>Delete any existing code and paste the script below.</li>
                <li>Click <strong>Deploy → New Deployment → Web App</strong>.</li>
                <li>Set <em>Execute as</em> = <strong>Me</strong>, <em>Who has access</em> = <strong>Anyone</strong>.</li>
                <li>Click Deploy, authorize permissions, and <strong>copy the Web App URL</strong>.</li>
                <li>Paste that URL into <strong>⚙ Settings → Google Apps Script URL</strong>.</li>
              </ol>

              <div className="relative">
                <pre className="bg-slate-900 text-green-300 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed font-mono whitespace-pre">
{GAS_SCRIPT}
                </pre>
                <button onClick={handleCopyScript}
                  className="absolute top-3 right-3 flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                  {copied ? <><Check className="w-3 h-3"/> Copied!</> : <><Copy className="w-3 h-3"/> Copy</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gmail Queue Modal */}
      {queue && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Gmail Send Queue</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Click <strong>"Open in Gmail →"</strong> for each email. Review it and hit Send inside Gmail.
                </p>
              </div>
              <span className="text-sm font-bold text-slate-500">
                {queue.opened.size}/{queue.items.length} opened
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {queue.items.map((item, idx) => {
                const isOpened = queue.opened.has(idx);
                return (
                  <div key={idx} className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${isOpened ? "bg-green-50" : "hover:bg-slate-50"}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${isOpened ? "bg-green-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {isOpened ? <CheckCircle2 className="w-4 h-4"/> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{item.label}</p>
                      <p className="text-xs text-slate-500 truncate">{item.to}{item.cc ? ` · CC: ${item.cc}` : ""}</p>
                    </div>
                    <button
                      onClick={() => openOneInGmail(idx)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                        isOpened
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-dd-red text-white hover:bg-[#ff3019] shadow-sm"
                      }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5"/>
                      {isOpened ? "Re-open" : "Open in Gmail →"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {queue.opened.size === 0
                  ? "No emails opened yet."
                  : queue.opened.size === queue.items.length
                  ? "✅ All emails opened — close when done."
                  : `${queue.items.length - queue.opened.size} remaining.`}
              </p>
              <button onClick={closeQueue}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
