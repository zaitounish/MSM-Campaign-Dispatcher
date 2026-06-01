import React, { useState, useMemo } from "react";
import { logEmailSend } from "../lib/supabase";
import {
  DownloadCloud, CheckCircle2, Layers, FileText,
  Loader2, AlertTriangle, Mail, ExternalLink, ChevronDown,
  ChevronUp, Copy, Check,
} from "lucide-react";

// ─── Gmail Compose URL builder ────────────────────────────────────────────────
// Opens Gmail compose with To, CC, Subject pre-filled.
// Body is NOT included in the URL | we copy the full rich HTML to clipboard
// instead so the rep presses Ctrl+V to paste formatted content with buttons.
const buildGmailComposeUrl = ({ to, cc, draft }) => {
  const parts = [
    `to=${encodeURIComponent(to)}`,
    cc ? `cc=${encodeURIComponent(cc)}` : "",
    `su=${encodeURIComponent(draft.subject || "")}`,
  ].filter(Boolean);
  return `https://mail.google.com/mail/?view=cm&fs=1&${parts.join("&")}`;
};

// Copy the email's HTML to clipboard so Ctrl+V in Gmail pastes rich content
const copyHtmlToClipboard = async (draft) => {
  const html = draft.htmlBody || "";
  const text = draft.plainTextBody || "";
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ]);
    return true;
  } catch {
    // Fallback: plain text only
    try { await navigator.clipboard.writeText(text); return "text"; } catch { return false; }
  }
};

// GAS script the user deploys once to enable rich HTML drafts
const GAS_SCRIPT = `// 1. Go to script.google.com → New Project
// 2. Paste this code, replacing any existing content
// 3. Click Deploy → New Deployment → Web App
//    - Execute as: Me
//    - Who has access: Anyone within DoorDash  ← (your Google Workspace domain)
// 4. Click Deploy → authorize → copy the Web App URL → paste into Settings
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
  emailFormat = "html", setEmailFormat,
  userProfile, selectedPromos = [],
}) {
  const [queue, setQueue] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState(null);
  const [gasExpanded, setGasExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isRep = userProfile?.role === "rep";

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
      const primary = m.emails.find(e => e.isPrimary) || m.emails[0];
      const secondaries = m.emails.filter(e => !e.isPrimary).map(e => e.address);

      if (dispatchMode === "separate") {
        m.emails.forEach(e => targets.push({ to: e.address, cc: "", draft, label: m.merchantName, merchant: m }));
      } else if (dispatchMode === "primary") {
        targets.push({ to: primary.address, cc: "", draft, label: m.merchantName, merchant: m });
      } else {
        targets.push({ to: primary.address, cc: secondaries.join(", "), draft, label: m.merchantName, merchant: m });
      }
    });
    return targets;
  };

  // ── Open Gmail Queue (one by one) ──────────────────────────────────────────
  const handleOpenGmailQueue = () => {
    const items = buildTargets();
    setQueue({ items, opened: new Set(), allOpened: false });
    setSendStatus(null);
    setClipStatus({});
  };

  // ── Open ALL: opens first tab immediately, queue shows rest for rapid clicking ──
  // Browsers block window.open() after the first call per user gesture (popup
  // blocker). We open tab #1 immediately, then show the queue so the user can
  // rapidly click the remaining ones.
  const handleOpenAllInGmail = () => {
    const items = buildTargets();
    if (items.length === 0) return;
    // Open first tab right now (within the user gesture)
    const firstUrl = buildGmailComposeUrl(items[0]);
    window.open(firstUrl, "_blank", "noopener,noreferrer");
    copyHtmlToClipboard(items[0].draft).then(ok =>
      setClipStatus(p => ({ ...p, 0: ok ? "done" : "error" }))
    );
    // Show queue with first marked as opened, all others waiting
    const opened = new Set([0]);
    setQueue({ items, opened, allOpened: true, rapidMode: true });
    setSendStatus(null);
    setClipStatus({ 0: "copying" });
  };

  const [clipStatus, setClipStatus] = useState({}); // idx -> 'copying'|'done'|'error'

  const openOneInGmail = async (idx) => {
    const target = queue.items[idx];
    setClipStatus(prev => ({ ...prev, [idx]: "copying" }));
    const url = buildGmailComposeUrl(target);
    window.open(url, "_blank", "noopener,noreferrer");

    // Copy the right body to clipboard based on mode
    let ok;
    if (emailFormat === "plain") {
      // Clean mode: copy personal HTML (Gmail will render it cleanly when pasted)
      const cleanHtml = target.draft.cleanBody || target.draft.htmlBody || "";
      const plainFall = target.draft.plainTextBody || "";
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([cleanHtml], { type: "text/html" }),
            "text/plain": new Blob([plainFall], { type: "text/plain" }),
          }),
        ]);
        ok = "text";
      } catch {
        try { await navigator.clipboard.writeText(plainFall); ok = "text"; } catch { ok = false; }
      }
    } else {
      // Rich mode: copy premium branded HTML
      ok = await copyHtmlToClipboard({ ...target.draft, htmlBody: target.draft.richBody || target.draft.htmlBody });
    }
    setClipStatus(prev => ({ ...prev, [idx]: ok ? "done" : "error" }));
    setQueue(prev => {
      const opened = new Set(prev.opened);
      opened.add(idx);
      return { ...prev, opened };
    });
    logEmailSend({
      repEmail: userProfile?.email || repSettings?.email || "",
      repName: userProfile?.full_name || `${repSettings?.firstName || ""} ${repSettings?.lastName || ""}`.trim() || "",
      merchantName: target.merchant?.merchantName || "",
      merchantId: target.merchant?.businessId || target.merchant?.id || "",
      toEmail: target.to,
      ccEmails: target.cc || "",
      subject: target.draft.subject,
      promoTypes: selectedPromos,
      deliveryMethod: "gmail_tab",
      emailFormat,
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
    const senderName = `${repSettings.firstName || ""} ${repSettings.lastName || ""}`.trim() || "DoorDash Merchant Success";
    const targets = buildTargets();
    const payloads = targets.map(t => ({
      to: t.to,
      cc: t.cc,
      subject: t.draft.subject,
      // Rich mode sends fully-wrapped branded HTML; Clean sends personal-email HTML
      htmlBody: emailFormat === "plain"
        ? (t.draft.cleanBody || t.draft.htmlBody)
        : (t.draft.richBody || t.draft.htmlBody),
      plainTextBody: t.draft.plainTextBody,
      name: senderName,
    }));
    try {
      await fetch(repSettings.gasUrl, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", emails: payloads }),
      });
      setSendStatus({ type: "success", msg: `Pushed ${payloads.length} ${emailFormat === "plain" ? "plain-text" : "rich HTML"} draft${payloads.length > 1 ? "s" : ""} to your Gmail Drafts folder.` });
      // Log each send event (fire-and-forget)
      targets.forEach(t => {
        logEmailSend({
          repEmail: userProfile?.email || repSettings?.email || "",
          repName: userProfile?.full_name || senderName,
          merchantName: t.merchant?.merchantName || "",
          merchantId: t.merchant?.businessId || t.merchant?.id || "",
          toEmail: t.to,
          ccEmails: t.cc || "",
          subject: t.draft.subject,
          promoTypes: selectedPromos,
          deliveryMethod: "gas_draft",
          emailFormat,
        });
      });
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

      {/* Dispatch mode toggle — all roles see this */}
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
            {[["cc", "CC Mode"], ["separate", "Separate"], ["primary", "Primary Only"]].map(([v, l]) => (
              <button key={v} onClick={() => setDispatchMode(v)}
                className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${dispatchMode === v ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-5">

        {/* Status banner */}
        {sendStatus && (
          <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl text-sm font-semibold ${sendStatus.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {sendStatus.type === "success" ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />}
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
            {/* Export — manager/ultimate only */}
            {!isRep && (
              <button onClick={handleExport}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors text-sm">
                <DownloadCloud className="w-4 h-4" /> Export
              </button>
            )}

            {/* Gmail Drafts via GAS — manager/ultimate only */}
            {!isRep && (
              <button onClick={handleGasDraft} disabled={isSending}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md disabled:opacity-60 text-sm">
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Gmail Drafts (HTML)
              </button>
            )}

            {/* Open One by One — all roles */}
            <button onClick={handleOpenGmailQueue}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-dd-red hover:bg-[#ff3019] text-white transition-all shadow-md text-sm">
              <Mail className="w-4 h-4" /> Open One by One
            </button>

            {/* Open All — manager/ultimate only */}
            {!isRep && (
              <button onClick={handleOpenAllInGmail}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-white transition-all shadow-md text-sm">
                <ExternalLink className="w-4 h-4" /> Open All ({totalCount})
              </button>
            )}
          </div>
        </div>

        {/* Gmail info + GAS setup — manager/ultimate only */}
        {!isRep && (
          <>
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 text-xs text-blue-800">
              <ExternalLink className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p><strong>Open in Gmail →</strong> copies the full rich email to your clipboard, then opens Gmail compose pre-filled with recipient &amp; subject. Just press <strong>Ctrl+V</strong> inside Gmail to paste the formatted email with all links intact.</p>
                <p><strong>Gmail Drafts (HTML)</strong> creates fully-formatted rich HTML drafts in your Gmail Drafts folder via Google Apps Script | no paste needed. Requires one-time setup below.</p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <button onClick={() => setGasExpanded(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-bold text-slate-700">
                <span className="flex items-center gap-2">
                  ⚡ Gmail Drafts Setup | One-time Google Apps Script deploy
                  {repSettings.gasUrl
                    ? <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-bold">✓ Configured</span>
                    : <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">Not set up</span>
                  }
                </span>
                {gasExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
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
                      {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Gmail Queue Modal */}
      {queue && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Gmail Send Queue</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {queue.rapidMode
                    ? <>Tab 1 opened. Click <strong>"Open in Gmail"</strong> for each remaining row | content is pre-filled automatically.</>
                    : <>Gmail opens with content pre-filled. Optionally press <kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono">Ctrl+V</kbd> to upgrade to rich HTML formatting.</>
                  }
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
                      {isOpened ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{item.label}</p>
                      <p className="text-xs text-slate-500 truncate">{item.to}{item.cc ? ` · CC: ${item.cc}` : ""}</p>
                      {clipStatus[idx] === "done" && (
                        <p className="text-[10px] text-emerald-600 font-bold mt-0.5">✓ Copied | press Ctrl+V in Gmail</p>
                      )}
                      {clipStatus[idx] === "error" && (
                        <p className="text-[10px] text-amber-600 font-bold mt-0.5">⚠ Clipboard unavailable | paste manually</p>
                      )}
                    </div>
                    <button
                      onClick={() => openOneInGmail(idx)}
                      disabled={clipStatus[idx] === "copying"}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap disabled:opacity-60 ${queue.opened.has(idx)
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-dd-red text-white hover:bg-[#ff3019] shadow-sm"
                        }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {clipStatus[idx] === "copying" ? "Opening…"
                        : queue.opened.has(idx) ? "Re-open"
                          : "Open in Gmail"}
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
                    ? "✅ All emails opened | close when done."
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
