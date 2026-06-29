import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Edit, Undo2, Wand2, Sparkles, UserCircle, Mail } from "lucide-react";
import MerchantEmailEditor from "./MerchantEmailEditor";
import MerchantEmailManager from "./MerchantEmailManager";

export default function EmailPreview({
  merchants,
  emailDrafts,
  setMerchants,
  dispatchMode,
  repSettings,
  setGlobalHtmlTemplate,
  emailFormat = "html",
  setEmailFormat,
  userProfile,
}) {
  const selectedMerchants = React.useMemo(
    () => merchants.filter(m => m.selected),
    [merchants]
  );

  const expandedDrafts = React.useMemo(() => {
    let targets = [];
    selectedMerchants.forEach(merchant => {
      const draft = emailDrafts.find(d => d.merchantId === merchant.id);
      if (!draft || !merchant.emails || merchant.emails.length === 0) return;

      const primary = merchant.emails.find(e => e.isPrimary) || merchant.emails[0];
      const secondaries = merchant.emails.filter(e => !e.isPrimary).map(e => e.address);

      if (dispatchMode === "separate") {
        merchant.emails.forEach(e => targets.push({ merchant, draft, targetDisplay: e.address, ccDisplay: "" }));
      } else if (dispatchMode === "primary") {
        targets.push({ merchant, draft, targetDisplay: primary.address, ccDisplay: "" });
      } else {
        targets.push({ merchant, draft, targetDisplay: primary.address, ccDisplay: secondaries.join(", ") });
      }
    });
    return targets;
  }, [selectedMerchants, emailDrafts, dispatchMode]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEmailEditorOpen, setIsEmailEditorOpen] = useState(false);

  useEffect(() => { setCurrentIndex(0); }, [expandedDrafts.length]);

  if (expandedDrafts.length === 0) return null;

  const safeIndex = Math.min(currentIndex, expandedDrafts.length - 1);
  const currentItem = expandedDrafts[safeIndex];
  if (!currentItem) return null;

  const { merchant: currentMerchant, draft, targetDisplay, ccDisplay } = currentItem;

  const hasOverride = !!(currentMerchant.emailOverride || currentMerchant.cleanOverride);

  // Save: persists Rich override, Clean override, and subject independently
  const handleSave = ({ html, cleanHtml, subject, applyToAll }) => {
    if (applyToAll) {
      // Rich: push to global template; Clean: save override on every selected merchant
      setGlobalHtmlTemplate(html);
      setMerchants(prev => prev.map(m =>
        m.selected
          ? { ...m, emailOverride: null, cleanOverride: cleanHtml || null, subjectOverride: subject || undefined }
          : m
      ));
    } else {
      setMerchants(prev => prev.map(m =>
        m.id === currentMerchant.id
          ? { ...m, emailOverride: html || null, cleanOverride: cleanHtml || null, subjectOverride: subject || undefined }
          : m
      ));
    }
    setIsEditorOpen(false);
  };

  const handleEmailUpdate = (merchantId, newEmails) => {
    setMerchants(prev => prev.map(m =>
      m.id === merchantId ? { ...m, emails: newEmails } : m
    ));
    setIsEmailEditorOpen(false);
  };

  const handleClearOverride = () => {
    setMerchants(prev => prev.map(m =>
      m.id === currentMerchant.id
        ? { ...m, emailOverride: null, cleanOverride: null, subjectOverride: undefined }
        : m    ));
  };

  // draft.htmlBody is already fully resolved (tokens injected by App.jsx emailDrafts memo)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500 mt-8">

      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            Email Preview
            {hasOverride && (
              <span className="bg-violet-100 text-violet-700 text-xs px-2 py-0.5 rounded-full font-bold ml-1 flex items-center gap-1">
                <Wand2 className="w-3 h-3" /> Custom
              </span>
            )}
          </h3>
          <p className="text-sm text-slate-500">Live preview of exactly what will be sent.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Format toggle Rich (branded) vs Clean (personal) */}
          {setEmailFormat && (
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm gap-0.5">
              <button
                onClick={() => setEmailFormat("html")}
                title="Rich DoorDash branded design"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${emailFormat === "html"
                  ? "bg-dd-red text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
                  }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> Rich
              </button>
              <button
                onClick={() => setEmailFormat("plain")}
                title="Clean professional personal email style"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${emailFormat === "plain"
                  ? "bg-slate-700 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
                  }`}
              >
                <UserCircle className="w-3.5 h-3.5" /> Clean
              </button>
            </div>
          )}

          <span className="text-sm font-semibold text-slate-500 flex items-center gap-2">
            Email <span className="bg-white border shadow-sm px-2 py-0.5 rounded-md text-slate-800">{safeIndex + 1}</span> of {expandedDrafts.length}
          </span>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={safeIndex === 0}
              className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors">
              <ChevronLeft className="w-5 h-5 text-slate-700" />
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <button onClick={() => setCurrentIndex(i => Math.min(expandedDrafts.length - 1, i + 1))} disabled={safeIndex === expandedDrafts.length - 1}
              className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors">
              <ChevronRight className="w-5 h-5 text-slate-700" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row min-h-[500px]">
        {/* Left: Metadata & Actions */}
        <div className="w-full lg:w-1/3 border-r border-slate-200 bg-slate-50/50 p-6 flex flex-col">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <MetaField label="To" value={targetDisplay} mono />
              </div>
              <button
                onClick={() => setIsEmailEditorOpen(true)}
                className="shrink-0 mt-5 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-dd-red hover:text-dd-red rounded-lg text-xs font-bold text-slate-500 transition-colors"
                title="Manage emails for this merchant"
              >
                <Mail className="w-3.5 h-3.5" />
                Edit Emails
              </button>
            </div>
            {ccDisplay && <MetaField label="Cc" value={ccDisplay} mono />}
            <MetaField label="Subject" value={currentMerchant.subjectOverride || draft.subject} />
            {currentMerchant.businessId && (
              <MetaField label="Business ID" value={currentMerchant.businessId} mono />
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
            <button
              onClick={() => setIsEditorOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-white border-2 border-slate-200 text-slate-700 py-2.5 rounded-xl font-bold hover:border-dd-red hover:text-dd-red transition-colors"
            >
              <Edit className="w-4 h-4" /> Edit Email Content
            </button>

            {hasOverride && (
              <button
                onClick={handleClearOverride}
                className="w-full flex items-center justify-center gap-2 text-slate-500 py-2 text-sm font-semibold hover:text-red-600 transition-colors"
              >
                <Undo2 className="w-4 h-4" /> Revert to Global Template
              </button>
            )}
          </div>
        </div>

        {/* Right: email preview Rich (branded) or Clean (personal) */}
        <div className="w-full lg:w-2/3 bg-slate-100 flex items-start justify-center overflow-y-auto" style={{ minHeight: 500 }}>
          {emailFormat === "plain" ? (
            // Clean mode: white background, generous padding reads like Gmail
            <div className="w-full h-full bg-white">
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:32px;background:#fff;">${draft.cleanBody || draft.htmlBody}</body></html>`}
                sandbox=""
                className="w-full border-0"
                title="Clean Email Preview"
                style={{ height: 540, minHeight: 400 }}
              />
            </div>
          ) : (
            // Rich mode: full branded DoorDash design in a light grey container
            <div className="w-full h-full">
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9;">${draft.richBody || draft.htmlBody}</body></html>`}
                sandbox=""
                className="w-full border-0"
                title="Rich Email Preview"
                style={{ height: 540, minHeight: 400 }}
              />
            </div>
          )}
        </div>
      </div>

      {isEmailEditorOpen && (
        <MerchantEmailManager
          merchant={currentMerchant}
          onSave={(newEmails) => handleEmailUpdate(currentMerchant.id, newEmails)}
          onClose={() => setIsEmailEditorOpen(false)}
        />
      )}

      {isEditorOpen && (
        <MerchantEmailEditor
          merchant={currentMerchant}
          initialRichHtml={currentMerchant.emailOverride || draft.htmlBody}
          initialCleanHtml={currentMerchant.cleanOverride || draft.cleanBody}
          initialTokenHtml={draft.tokenBody || null}
          dlMap={draft.dlMap || {}}
          initialSubject={currentMerchant.subjectOverride || draft.subject}
          onSave={handleSave}
          onCancel={() => setIsEditorOpen(false)}
          geminiApiKey={repSettings?.geminiApiKey}
          emailFormat={emailFormat}
          setEmailFormat={setEmailFormat}
        />
      )}
    </div>
  );
}

function MetaField({ label, value, mono }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <div className={`bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-800 font-medium break-all ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
