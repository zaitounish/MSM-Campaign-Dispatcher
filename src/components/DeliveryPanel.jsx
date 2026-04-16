import React, { useState } from "react";
import { DownloadCloud, Send, CheckCircle2, Layers, FileText, Loader2, AlertTriangle } from "lucide-react";

export default function DeliveryPanel({ merchants, emailDrafts, repSettings }) {
  const [isSending, setIsSending] = useState(false);
  const [dispatchMode, setDispatchMode] = useState("cc"); // 'cc', 'separate', 'primary'
  const [sendStatus, setSendStatus] = useState(null); // { type: 'success' | 'error', msg: string }

  const selectedMerchants = merchants.filter(m => m.selected);
  // Only include drafts for selected merchants
  const activeDrafts = emailDrafts.filter(d => 
    selectedMerchants.some(m => m.id === d.merchantId)
  );

  const handleApiDispatch = async (actionType = "send") => {
    if (!repSettings.gasUrl) {
      setSendStatus({
        type: 'error',
        msg: "Missing Google Apps Script URL. Please configure it in Settings first."
      });
      return;
    }

    setIsSending(true);
    setSendStatus(null);

    const payloads = activeDrafts.flatMap(draft => {
      const merchant = selectedMerchants.find(m => m.id === draft.merchantId);
      if (!merchant || !merchant.emails || merchant.emails.length === 0) return [];

      const primary = merchant.emails.find(e => e.isPrimary) || merchant.emails[0];
      const secondaries = merchant.emails.filter(e => !e.isPrimary).map(e => e.address);
      
      let targets = [];
      if (dispatchMode === "separate") {
         targets = merchant.emails.map(e => ({ to: e.address, cc: "" }));
      } else if (dispatchMode === "primary") {
         targets = [{ to: primary.address, cc: "" }];
      } else {
         targets = [{ to: primary.address, cc: secondaries.join(", ") }];
      }

      return targets.map(t => ({
        to: t.to,
        cc: t.cc,
        subject: draft.subject,
        htmlBody: draft.htmlBody,
        plainTextBody: draft.plainTextBody,
        name: `${repSettings.firstName || ''} ${repSettings.lastName || ''}`.trim() || 'DoorDash Merchant Success'
      }));
    });

    try {
      const response = await fetch(repSettings.gasUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionType, emails: payloads })
      });
      
      setSendStatus({
        type: 'success',
        msg: actionType === 'draft' 
          ? `Pushed ${payloads.length} fully-formatted HTML drafts to your Gmail!`
          : `Sent ${payloads.length} emails to Google infrastructure.`
      });
    } catch (err) {
      console.error("API dispatch failed:", err);
      setSendStatus({
        type: 'error',
        msg: err.message || "Network error occurred connecting to Google."
      });
    } finally {
      setIsSending(false);
    }
  };


  const handleExportSummary = () => {
    if (!window.XLSX) {
      alert("Excel utility not loaded yet.");
      return;
    }

    const wsData = [
      ["Merchant Name", "Target Email", "Subject", "Locations"]
    ];

    activeDrafts.forEach(draft => {
      const merchant = selectedMerchants.find(m => m.id === draft.merchantId);
      const primaryEmail = merchant.emails && merchant.emails.length > 0
        ? (merchant.emails.find(e => e.isPrimary) || merchant.emails[0]).address
        : "No Email";
      wsData.push([
        merchant.merchantName,
        primaryEmail,
        draft.subject,
        merchant.locationCount
      ]);
    });

    const ws = window.XLSX.utils.aoa_to_sheet(wsData);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Campaign Summary");
    
    window.XLSX.writeFile(wb, `Campaign_Dispatch_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  if (activeDrafts.length === 0) return null;

  return (
    <div className="bg-white border-t border-slate-200 p-8 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] mt-12 mb-16 rounded-3xl mx-6">
      
      <div className="max-w-4xl mx-auto mb-8 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5">
         <div className="flex items-start md:items-center justify-between flex-col md:flex-row gap-4">
             <div className="flex items-center gap-3">
                 <div className="bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                    <Layers className="w-5 h-5 text-slate-500" />
                 </div>
                 <div>
                    <h4 className="text-sm font-bold text-slate-800">Dispatch Routing Mode</h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">How should multi-contact merchants be handled?</p>
                 </div>
             </div>
             
             <div className="flex items-center bg-slate-200/50 p-1 rounded-xl w-full md:w-auto">
                <button 
                  onClick={() => setDispatchMode("cc")}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${dispatchMode === 'cc' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  CC Mode
                </button>
                <button 
                  onClick={() => setDispatchMode("separate")}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${dispatchMode === 'separate' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Separate Emails
                </button>
                <button 
                  onClick={() => setDispatchMode("primary")}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${dispatchMode === 'primary' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Primary Only
                </button>
             </div>
         </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between max-w-4xl mx-auto gap-6">
        
        <div>
          <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
            Ready to Dispatch
          </h3>
          <p className="text-slate-500 text-sm">
            {activeDrafts.length} customized emails have been generated and are ready to send.
          </p>

          {sendStatus && (
            <div className={`mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold ${
              sendStatus.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
            }`}>
              {sendStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              {sendStatus.msg}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          
          <button
            onClick={handleExportSummary}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors border border-slate-600"
            title="Download Excel Summary"
          >
            <DownloadCloud className="w-4 h-4" /> Export
          </button>

          <button
            onClick={() => handleApiDispatch('draft')}
            disabled={isSending}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold bg-green-600 hover:bg-green-500 text-white transition-all shadow-lg shadow-green-500/20 disabled:opacity-70"
            title="Create completely formatted rich HTML drafts straight in your Gmail Drafts folder"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Save to Gmail Drafts
          </button>

          <button
            onClick={() => handleApiDispatch('send')}
            disabled={isSending}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold bg-dd-red hover:bg-[#ff3019] text-white transition-all shadow-lg shadow-red-500/20 disabled:opacity-70"
            title="Primary: Send silently via Google Apps Script"
          >
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Bulk Send
          </button>

        </div>
      </div>
    </div>
  );
}
