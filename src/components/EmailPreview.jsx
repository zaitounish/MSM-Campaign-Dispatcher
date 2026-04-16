import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Edit, Undo2 } from "lucide-react";
import MerchantEmailEditor from "./MerchantEmailEditor";

export default function EmailPreview({ 
  merchants, 
  emailDrafts, 
  setMerchants 
}) {
  const selectedMerchants = merchants.filter(m => m.selected);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Reset index whenever selected merchant list changes length to avoid out-of-bounds crash
  useEffect(() => {
    setCurrentIndex(0);
  }, [selectedMerchants.length]);

  if (selectedMerchants.length === 0 || emailDrafts.length === 0) return null;

  // Clamp index in case it's still stale before the useEffect fires
  const safeIndex = Math.min(currentIndex, selectedMerchants.length - 1);
  const currentMerchant = selectedMerchants[safeIndex];
  if (!currentMerchant) return null;

  const draft = emailDrafts.find(d => d.merchantId === currentMerchant.id);
  if (!draft) return null;

  const handleNext = () => {
    if (safeIndex < selectedMerchants.length - 1) setCurrentIndex(safeIndex + 1);
  };

  const handlePrev = () => {
    if (safeIndex > 0) setCurrentIndex(safeIndex - 1);
  };

  const handleSaveOverride = ({ html, subject }) => {
    setMerchants(prev => prev.map(m => 
      m.id === currentMerchant.id 
        ? { ...m, emailOverride: html, subjectOverride: subject || undefined }
        : m
    ));
    setIsEditorOpen(false);
  };

  // Apply the same override to every selected merchant
  // subjectMode: 'title' = each gets their own name prepended; 'full' = exact same subject
  const handleSaveAllOverride = ({ html, subjectMode, subjectTitle, subjectFull }) => {
    setMerchants(prev => prev.map(m => {
      if (!m.selected) return m;
      let subjectOverride;
      if (subjectMode === "full") {
        subjectOverride = subjectFull;
      } else if (subjectTitle) {
        subjectOverride = `${m.merchantName} \u2014 ${subjectTitle}`;
      }
      return { ...m, emailOverride: html, subjectOverride };
    }));
    setIsEditorOpen(false);
  };

  const handleClearOverride = () => {
    setMerchants(prev => prev.map(m => 
      m.id === currentMerchant.id ? { ...m, emailOverride: null } : m
    ));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500 mt-8">
      
      {/* Header and Navigator */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            Email Preview
            {draft.isCustom && (
              <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-bold ml-2">
                Custom Edit
              </span>
            )}
          </h3>
          <p className="text-sm text-slate-500">Live preview of exactly what will be sent.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-500">
            Merchant {safeIndex + 1} of {selectedMerchants.length}
          </span>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <button 
              onClick={handlePrev} 
              disabled={safeIndex === 0}
              className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-700" />
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <button 
              onClick={handleNext} 
              disabled={safeIndex === selectedMerchants.length - 1}
              className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-slate-700" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row min-h-[500px]">
        {/* Left: Metadata & Actions */}
        <div className="w-full lg:w-1/3 border-r border-slate-200 bg-slate-50/50 p-6 flex flex-col">
           <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">To</label>
                <div className="bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-800 font-medium break-all">
                  {currentMerchant.emails && currentMerchant.emails.length > 0
                    ? (currentMerchant.emails.find(e => e.isPrimary) || currentMerchant.emails[0]).address
                    : "No Email"}
                </div>
              </div>
              {currentMerchant.emails && currentMerchant.emails.filter(e => !e.isPrimary).length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cc</label>
                  <div className="bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-800 font-medium break-all text-slate-600">
                    {currentMerchant.emails.filter(e => !e.isPrimary).map(e => e.address).join(", ")}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Subject</label>
                <div className="bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-800 font-medium">
                  {draft.subject}
                </div>
              </div>
              {currentMerchant.businessId && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Business ID</label>
                  <div className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded w-fit">
                    {currentMerchant.businessId}
                  </div>
                </div>
              )}
           </div>

           <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
              <button 
                onClick={() => setIsEditorOpen(true)}
                className="w-full flex items-center justify-center gap-2 bg-white border-2 border-slate-200 text-slate-700 py-2.5 rounded-xl font-bold hover:border-dd-red hover:text-dd-red transition-colors"
              >
                <Edit className="w-4 h-4" /> Edit Email Content
              </button>
              
              {draft.isCustom && (
                <button 
                  onClick={handleClearOverride}
                  className="w-full flex items-center justify-center gap-2 text-slate-500 py-2 text-sm font-semibold hover:text-red-600 transition-colors"
                >
                  <Undo2 className="w-4 h-4" /> Revert to Template
                </button>
              )}
           </div>
        </div>

        {/* Right: HTML Preview - sandboxed iframe prevents clicking live links */}
        <div className="w-full lg:w-2/3 p-0 md:p-8 bg-slate-100 flex items-center justify-center">
            <div className="bg-white w-full max-w-2xl min-h-[400px] shadow-sm border border-slate-200 rounded-xl overflow-hidden">
               <iframe
                 srcDoc={`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;margin:0">${draft.htmlBody}</body></html>`}
                 sandbox=""
                 className="w-full min-h-[400px] border-0"
                 title="Email Preview"
                 style={{ height: "500px" }}
               />
            </div>
        </div>
      </div>

      {isEditorOpen && (
        <MerchantEmailEditor 
           merchant={currentMerchant}
           initialHtml={draft.htmlBody}
           initialSubject={draft.subject}
           onSave={handleSaveOverride}
           onSaveAll={handleSaveAllOverride}
           onCancel={() => setIsEditorOpen(false)}
        />
      )}
    </div>
  );
}
