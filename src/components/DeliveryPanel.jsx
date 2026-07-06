import React, { useState, useMemo, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { logEmailSend, getRepDailyCount, getRepDailyLimitOverride, submitLimitApprovalRequest } from "../lib/supabase";
import { trackFormSubmit } from "../lib/analytics";
import {
  DownloadCloud, CheckCircle2, Layers, FileText,
  Loader2, AlertTriangle, Mail, ExternalLink, ChevronDown,
  ChevronUp, Copy, Check, Clipboard, TrendingUp, Send,
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

// ─── Clipboard Copy Helper ──────────────────────────────────────────────────
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

// GAS script the user deploys once to enable rich HTML drafts.
const GAS_SCRIPT = `/**
 * MSM Campaign Dispatcher – Gmail Drafts Bridge
 *
 * Deploy as a Web App:
 *   Execute as : Me
 *   Who has access : Anyone within DoorDash
 *
 * After deploying, open the Web App URL once in your browser to grant Gmail
 * permissions, then paste the URL into ⚙ Settings → Google Apps Script URL.
 */

function doGet(e) {
  // Simple GET endpoint to confirm the script is authorized and reachable.
  return ContentService
    .createTextOutput(
      "✅ Authorization successful! You can close this tab and return to the Dispatcher."
    )
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * POST endpoint used by the Dispatcher.
 * Expects either:
 *   - payload_encoded : URL-encoded JSON string (preferred, preserves emojis)
 *   - payload         : Base64-encoded JSON string
 *   - emails          : raw JSON string (fallback)
 *
 * It ONLY creates drafts; it never sends mail directly.
 * The rep must open Gmail Drafts and click Send manually  
 * this ensures Salesforce logs the email as manual ([outreach] [Email] manual [out]).
 */
function doPost(e) {
  var emails = [];

  try {
    // Prefer the explicitly encoded payload to avoid emoji corruption.
    if (e.parameter.payload_encoded) {
      var jsonStr = decodeURIComponent(e.parameter.payload_encoded);
      emails = JSON.parse(jsonStr);
    } else if (e.parameter.payload) {
      // Base64-encoded fallback.
      var decodedBytes = Utilities.base64Decode(e.parameter.payload);
      var jsonStr = Utilities.newBlob(decodedBytes).getDataAsString();
      emails = JSON.parse(jsonStr);
    } else {
      // Legacy fallback.
      emails = JSON.parse(e.parameter.emails || "[]");
    }
  } catch (err) {
    // If parsing fails, treat as empty list so the script doesn't crash.
    emails = [];
  }

  // Create a draft for each email object.
  // NOTE: We never call GmailApp.sendEmail() here.
  // Sending must be done manually by the rep inside Gmail
  // so that Salesforce/Outreach tags the message as [manual out].
  emails.forEach(function (email) {
    var opts = {
      cc:       email.cc || "",
      htmlBody: email.htmlBody || "",
      name:     email.name || "DoorDash Merchant Success"
    };
    GmailApp.createDraft(
      email.to,
      email.subject,
      email.plainTextBody || "",  // plain-text body (required)
      opts
    );
  });

  // Respond with a simple JSON payload so the frontend can show a count.
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, count: emails.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * OPTIONAL: Helper to send a limited number of existing drafts from the script editor.
 * WARNING: Do NOT call this from the web-app endpoint if you need the "manual" tag
 * in Salesforce. Sending from Apps Script will always tag as automated.
 */
// function sendAllMyDrafts() {
//   var MAX_SENDS = 50; // adjust as needed
//   var drafts = GmailApp.getDrafts();
//   var sentCount = 0;
// 
//   for (var i = 0; i < drafts.length; i++) {
//     if (sentCount >= MAX_SENDS) {
//       Logger.log("Reached maximum limit of " + MAX_SENDS + " sends. Stopping.");
//       break;
//     }
//     var toAddress = drafts[i].getMessage().getTo();
//     if (!toAddress || toAddress.trim() === "") {
//       break; 
//     }
//     
//     drafts[i].send();
//     sentCount++;
//   }
//   
//   Logger.log("Finished! Total emails sent this run: " + sentCount);
// }`;

// Fallback only   real limit comes from reps_whitelist.daily_email_limit
const DEFAULT_DAILY_LIMIT = 45;

export default function DeliveryPanel({
  merchants, emailDrafts, repSettings, dispatchMode, setDispatchMode,
  emailFormat = "html", setEmailFormat,
  userProfile, selectedPromos = [], sessionId = null,
}) {
  // Base daily limit: from backend (reps_whitelist.daily_email_limit), fallback to 45
  const baseLimit = userProfile?.daily_email_limit ?? DEFAULT_DAILY_LIMIT;

  const [queue, setQueue] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState(null);
  const [gasExpanded, setGasExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Daily quota state (reps only) ────────────────────────────────────────────
  const [dailySentCount, setDailySentCount] = useState(0);
  const [effectiveLimit, setEffectiveLimit] = useState(baseLimit);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [approvalRequesting, setApprovalRequesting] = useState(false);
  const [approvalSent, setApprovalSent] = useState(false);

  const isRep = userProfile?.role === "rep";
  // Blank campaign sends don't count against the daily limit
  const isBlankSend = selectedPromos.length === 1 && selectedPromos[0] === "blank";

  const repEmail = userProfile?.email || repSettings?.email || "";

  // Fetch today's send count for this rep on mount and after every send
  const refreshQuota = useCallback(async () => {
    if (!isRep || !repEmail) return;
    setQuotaLoading(true);
    const [count, override] = await Promise.all([
      getRepDailyCount(repEmail),
      getRepDailyLimitOverride(repEmail),
    ]);
    setDailySentCount(count);
    // override (manager-granted today-only bump) takes priority over the base backend limit
    setEffectiveLimit(override ?? baseLimit);
    setQuotaLoading(false);
  }, [isRep, repEmail, baseLimit]);

  useEffect(() => { refreshQuota(); }, [refreshQuota]);

  // Handle the "Request Manager Approval" flow
  const handleRequestApproval = async () => {
    if (approvalRequesting || approvalSent) return;
    setApprovalRequesting(true);
    const repName = userProfile?.full_name ||
      `${repSettings?.firstName || ""} ${repSettings?.lastName || ""}`.trim() || repEmail;
    // manager_id comes from the whitelist profile   we expose it via userProfile if available
    const managerId = userProfile?.manager_id || null;
    const ok = await submitLimitApprovalRequest({ repEmail, repName, managerId });
    setApprovalRequesting(false);
    setApprovalSent(ok);
    if (!ok) {
      setSendStatus({ type: "error", msg: "Failed to submit approval request. Please contact your manager directly." });
    }
  };

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
    setDraftStatus({});
  };


  const [clipStatus, setClipStatus] = useState({});       // idx -> 'copying'|'done'|'error'
  const [draftStatus, setDraftStatus] = useState({}); // idx -> 'drafting'|'done'|'error'

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
    // Fire analytics event (fire-and-forget)
    trackFormSubmit(sessionId, userProfile?.email || repSettings?.email || "", "delivery_panel", {
      deliveryMethod: "gmail_tab",
      promoTypes: selectedPromos,
      merchantCount: 1,
      emailFormat,
    });
    // Refresh quota after each send (non-blocking)
    if (isRep && !isBlankSend) refreshQuota();
  };

  // Create a draft for a single email via GAS
  const createOneGasDraft = (idx) => {
    if (!repSettings.gasUrl) {
      setSendStatus({ type: "error", msg: "No GAS URL configured. Please set up Gmail Drafts in settings." });
      return;
    }

    setDraftStatus(prev => ({ ...prev, [idx]: "drafting" }));

    const t = queue.items[idx];
    const senderName = userProfile?.full_name || `${repSettings.firstName || ""} ${repSettings.lastName || ""}`.trim() || "DoorDash Merchant Success";
    const payload = {
      to: t.to,
      cc: t.cc,
      subject: t.draft.subject,
      htmlBody: emailFormat === "plain"
        ? (t.draft.cleanBody || t.draft.htmlBody)
        : (t.draft.richBody || t.draft.htmlBody),
      plainTextBody: t.draft.plainTextBody,
      name: senderName,
    };

    const FRAME_ID = "__gas_bridge_frame__";
    let iframe = document.getElementById(FRAME_ID);
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = FRAME_ID;
      iframe.name = FRAME_ID;
      iframe.style.cssText = "position:fixed;width:1px;height:1px;top:-9999px;left:-9999px;border:0;opacity:0;pointer-events:none;";
      document.body.appendChild(iframe);
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = repSettings.gasUrl;
    form.target = FRAME_ID;
    form.style.display = "none";

    const addField = (name, value) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };

    const jsonStr = JSON.stringify([payload]);
    const encodedPayload = encodeURIComponent(jsonStr);

    addField("action", "draft");
    addField("payload_encoded", encodedPayload);

    document.body.appendChild(form);
    form.submit();
    requestAnimationFrame(() => document.body.removeChild(form));

    setTimeout(() => {
      setDraftStatus(prev => ({ ...prev, [idx]: "done" }));
      setQueue(prev => {
        const opened = new Set(prev.opened);
        opened.add(idx);
        return { ...prev, opened };
      });
      logEmailSend({
        repEmail: userProfile?.email || repSettings?.email || "",
        repName: userProfile?.full_name || senderName,
        merchantName: t.merchant?.merchantName || "",
        merchantId: t.merchant?.businessId || t.merchant?.id || "",
        toEmail: t.to,
        ccEmails: t.cc || "",
        subject: t.draft.subject,
        promoTypes: selectedPromos,
        deliveryMethod: "gmail_tab",
        emailFormat,
      });
      if (isRep && !isBlankSend) refreshQuota();
    }, 1500);
  };

  const closeQueue = () => {
    const doneCount = queue?.opened?.size || 0;
    setQueue(null);
    if (doneCount > 0) {
      setSendStatus({
        type: "success",
        msg: `Opened ${doneCount} Gmail compose window${doneCount > 1 ? "s" : ""}. Review each draft and click Send.`,
      });
      // Refresh quota to reflect newly sent emails
      if (isRep && !isBlankSend) refreshQuota();
    }
  };

  // ── GAS Bridge hidden form POST ────────────────────────────────────────────
  // We use a hidden <form> + <iframe> instead of fetch() so the browser
  // automatically includes the rep's Google session cookies in the request.
  // This lets GAS authenticate via "Anyone within DoorDash" without any
  // OAuth setup. The response lands in the invisible iframe we never read
  // it cross-origin, but the drafts are created in the rep's Gmail.
  const handleGasDraft = () => {
    if (!repSettings.gasUrl) {
      setSendStatus({ type: "error", msg: "No GAS URL configured. Expand the setup guide below and paste your Web App URL into ⚙ Settings." });
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
      htmlBody: emailFormat === "plain"
        ? (t.draft.cleanBody || t.draft.htmlBody)
        : (t.draft.richBody || t.draft.htmlBody),
      plainTextBody: t.draft.plainTextBody,
      name: senderName,
    }));

    // Ensure a persistent hidden iframe exists for receiving the GAS response
    const FRAME_ID = "__gas_bridge_frame__";
    let iframe = document.getElementById(FRAME_ID);
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = FRAME_ID;
      iframe.name = FRAME_ID;
      iframe.style.cssText = "position:fixed;width:1px;height:1px;top:-9999px;left:-9999px;border:0;opacity:0;pointer-events:none;";
      document.body.appendChild(iframe);
    }

    // Build a hidden form targeting the iframe
    const form = document.createElement("form");
    form.method = "POST";
    form.action = repSettings.gasUrl;
    form.target = FRAME_ID;
    form.style.display = "none";

    const addField = (name, value) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };

    // Use encodeURIComponent to completely protect emojis (like 🚀)
    // from being garbled by the form POST process or Apps Script's backend.
    const jsonStr = JSON.stringify(payloads);
    const encodedPayload = encodeURIComponent(jsonStr);

    addField("action", "draft");
    addField("payload_encoded", encodedPayload);

    document.body.appendChild(form);
    form.submit();
    // Clean up the form element immediately after submit
    requestAnimationFrame(() => document.body.removeChild(form));

    // GAS typically processes within 3–8 seconds.
    // We can't read the iframe response cross-origin, so we show a
    // "check your drafts" message after a short delay.
    setTimeout(() => {
      setIsSending(false);
      setSendStatus({
        type: "success",
        msg: `${payloads.length} draft${payloads.length > 1 ? "s" : ""} created in Gmail. Open your Drafts folder, then send each one manually   this ensures Salesforce logs them as manual.`,
        draftsUrl: "https://mail.google.com/mail/u/0/#drafts",
      });
      // Log each draft creation event
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
      // Refresh quota after GAS send (non-blocking)
      if (isRep && !isBlankSend) refreshQuota();
    }, 1500);
  };

  // Open the GAS URL directly in a new tab so the rep can grant Gmail
  // permissions on first use (one-time step subsequent form POSTs are silent)
  const handleAuthorizeGas = () => {
    if (!repSettings.gasUrl) {
      setSendStatus({ type: "error", msg: "Paste your Web App URL into ⚙ Settings first." });
      return;
    }
    window.open(repSettings.gasUrl, "_blank", "noopener,noreferrer");
    setSendStatus({ type: "success", msg: "GAS opened in a new tab. If you see a Google permissions screen, click Allow. After that, Gmail Drafts will work silently." });
  };

  // ── Export Excel ─────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = [["Merchant", "To", "CC", "Subject", "Deep Links"]];
    buildTargets().forEach(t => {
      const dlLinks = Object.entries(t.draft.dlMap || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");
      rows.push([t.label, t.to, t.cc, t.draft.subject, dlLinks]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Auto-size columns
    ws["!cols"] = rows[0].map((_, ci) => ({
      wch: Math.max(...rows.map(r => String(r[ci] || "").length), 12),
    }));
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

      {/* Dispatch mode toggle all roles see this */}
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

        {/* ── Daily Quota Bar (reps only, skip for blank sends) ──────────────── */}
        {!isRep ? null : isBlankSend ? (
          <div className="rounded-2xl border px-5 py-3 bg-violet-50 border-violet-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-violet-700">Blank Email Selected</span>
            </div>
            <p className="text-xs text-violet-600 font-semibold">These emails do not count toward your daily limit.</p>
          </div>
        ) : (() => {
          const pct = Math.min((dailySentCount / effectiveLimit) * 100, 100);
          const remaining = Math.max(effectiveLimit - dailySentCount, 0);
          const isAtLimit = dailySentCount >= effectiveLimit;
          const wouldExceed = isRep && !isBlankSend && (dailySentCount + totalCount) > effectiveLimit;

          return (
            <div className={`rounded-2xl border px-5 py-4 space-y-3 ${isAtLimit
                ? "bg-red-50 border-red-200"
                : wouldExceed
                  ? "bg-amber-50 border-amber-200"
                  : "bg-slate-50 border-slate-200"
              }`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className={`w-4 h-4 ${isAtLimit ? "text-red-500" : "text-slate-500"}`} />
                  <span className={`text-sm font-bold ${isAtLimit ? "text-red-700" : "text-slate-700"}`}>
                    Daily Email Quota
                  </span>
                  {effectiveLimit > baseLimit && (
                    <span className="text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">
                      ✓ Manager Extended
                    </span>
                  )}
                </div>
                <span className={`text-sm font-bold tabular-nums ${isAtLimit ? "text-red-700" : wouldExceed ? "text-amber-700" : "text-slate-700"
                  }`}>
                  {quotaLoading ? "…" : `${dailySentCount} / ${effectiveLimit}`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isAtLimit ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-dd-red"
                    }`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {isAtLimit ? (
                // Limit reached   show approval request
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-red-700">
                    ⛔ You've reached your {effectiveLimit}-email daily limit. Ask your manager to grant you additional sends.
                  </p>
                  {approvalSent ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Request sent! Your manager will review it shortly.
                    </div>
                  ) : (
                    <button
                      onClick={handleRequestApproval}
                      disabled={approvalRequesting}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors disabled:opacity-60 shadow-sm"
                    >
                      {approvalRequesting
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending request…</>
                        : <><Send className="w-3.5 h-3.5" /> Request Manager Approval</>}
                    </button>
                  )}
                </div>
              ) : wouldExceed ? (
                <p className="text-xs font-semibold text-amber-700">
                  ⚠ Sending this batch ({totalCount} email{totalCount > 1 ? "s" : ""}) will exceed your daily limit. {remaining} remaining today.
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  {remaining} email{remaining !== 1 ? "s" : ""} remaining today (limit: {effectiveLimit}).
                </p>
              )}
            </div>
          );
        })()}

        {/* Blank send note */}
        {isRep && isBlankSend && (
          <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-2xl px-5 py-3">
            <span className="text-xs font-bold text-violet-700">✦ Blank emails don't count toward your 45-email daily limit.</span>
          </div>
        )}

        {/* Status banner */}
        {sendStatus && (
          <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl text-sm font-semibold ${sendStatus.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {sendStatus.type === "success" ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />}
            <span className="flex-1">{sendStatus.msg}</span>
            {sendStatus.draftsUrl && (
              <a
                href={sendStatus.draftsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View Drafts →
              </a>
            )}
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
            {/* hidden export from phase 4: manager/ultimate only */}
            {false && !isRep && (
              <button onClick={handleExport}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors text-sm">
                <DownloadCloud className="w-4 h-4" /> Export
              </button>
            )}

            {/* Quota gate for reps: if at limit and not a blank send, disable all send buttons */}
            {isRep && !isBlankSend && dailySentCount >= effectiveLimit ? (
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-slate-200 text-slate-400 text-sm cursor-not-allowed select-none">
                <AlertTriangle className="w-4 h-4" /> Daily Limit Reached
              </div>
            ) : (
              <>
                {/* Gmail Drafts via GAS manager/ultimate only */}
                {!isRep && (
                  <button onClick={handleGasDraft} disabled={isSending}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md disabled:opacity-60 text-sm">
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    Gmail Drafts (HTML)
                  </button>
                )}

                {/* Open One by One   all roles */}
                <button onClick={handleOpenGmailQueue}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-dd-red hover:bg-[#ff3019] text-white transition-all shadow-md text-sm">
                  <Mail className="w-4 h-4" /> Open One by One
                </button>
              </>
            )}
          </div>
        </div>

        {/* Gmail info + GAS setup manager/ultimate only */}
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

                  {/* Step-by-step instructions */}
                  <ol className="list-decimal list-inside space-y-2 text-slate-600">
                    <li>Go to <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">script.google.com</a> and create a <strong>New Project</strong>.</li>
                    <li>Delete any existing code and paste the script below.</li>
                    <li>Click <strong>Deploy → New Deployment → Web App</strong>. <span className="text-xs text-amber-600 font-bold">(Always choose "New Deployment" if updating!)</span></li>
                    <li>Set <em>Execute as</em> = <strong>Me</strong>, <em>Who has access</em> = <strong>Anyone within DoorDash</strong>.</li>
                    <li>Click Deploy, authorize Gmail permissions, and <strong>copy the Web App URL</strong>.</li>
                    <li>Paste that URL into <strong>⚙ Settings → Google Apps Script URL</strong>.</li>
                    <li className="font-semibold text-slate-800">Click the <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md text-xs">Authorize GAS</span> button below this opens your script once so Google records your approval. Only needed the first time.</li>
                  </ol>

                  {/* Authorize button */}
                  <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-800">⚡ First-time authorization required</p>
                      <p className="text-xs text-amber-700 mt-0.5">Opens your GAS script in a new tab. If Google shows a permissions screen, click <strong>Allow</strong>. Only needed once per browser.</p>
                    </div>
                    <button onClick={handleAuthorizeGas}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap shadow-sm">
                      <ExternalLink className="w-3 h-3" /> Authorize GAS
                    </button>
                  </div>

                  {/* Script code block */}
                  <div className="relative">
                    <pre className="bg-slate-900 text-green-300 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed font-mono whitespace-pre">
                      {GAS_SCRIPT}
                    </pre>
                    <button onClick={handleCopyScript}
                      className="absolute top-3 right-3 flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                      {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>

                  {/* How it works note */}
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <strong>How it works:</strong> Instead of a network API call, the app submits a hidden browser form to your GAS URL. This automatically includes your DoorDash Google session cookies, so GAS authenticates you silently no CORS issues, no IT approvals needed.
                  </p>
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
                  <div key={idx} className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${isOpened ? "bg-green-50" : "hover:bg-slate-50"}`}>
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
                      {draftStatus[idx] === "done" && (
                        <p className="text-[10px] text-blue-600 font-bold mt-0.5">✓ Draft created in Gmail</p>
                      )}
                    </div>
                    {/* Draft - one by one */}
                    {!isRep && (
                      <button
                        onClick={() => createOneGasDraft(idx)}
                        disabled={draftStatus[idx] === "drafting" || draftStatus[idx] === "done"}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${draftStatus[idx] === "done"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                          }`}
                        title="Create Gmail Draft"
                      >
                        {draftStatus[idx] === "drafting"
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting…</>
                          : draftStatus[idx] === "done"
                            ? <><Check className="w-3.5 h-3.5" /> Drafted!</>
                            : <><FileText className="w-3.5 h-3.5" /> Draft</>}
                      </button>
                    )}
                    {/* Open in Gmail */}
                    <button
                      onClick={() => openOneInGmail(idx)}
                      disabled={clipStatus[idx] === "copying"}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap disabled:opacity-60 ${isOpened
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-dd-red text-white hover:bg-[#ff3019] shadow-sm"
                        }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {clipStatus[idx] === "copying" ? "Opening…" : isOpened ? "Re-open" : "Open in Gmail"}
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
