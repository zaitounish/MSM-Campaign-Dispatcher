import React, { useState, useEffect, useMemo } from "react";
import Header from "./components/Header";
import StepIndicator from "./components/StepIndicator";
import UploadZone from "./components/UploadZone";
import MerchantTable from "./components/MerchantTable";
import PromoSelector from "./components/PromoSelector";
import PromoCustomizer from "./components/PromoCustomizer";
import EmailPreview from "./components/EmailPreview";
import DeliveryPanel from "./components/DeliveryPanel";
import RepSettingsModal from "./components/RepSettingsModal";
import { ArrowRight, Settings } from "lucide-react";
import { buildAllDeepLinks } from "./lib/deepLinkBuilder";
import { generateEmail } from "./lib/emailTemplates";

// Catches any unhandled render crash and shows a message instead of a blank page
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("[App ErrorBoundary]", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="bg-white border border-red-200 rounded-2xl p-10 max-w-lg text-center shadow-lg">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Something went wrong</h2>
            <p className="text-slate-500 text-sm mb-6">{this.state.error?.message || "An unexpected error occurred."}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-6 py-2.5 bg-dd-red text-white font-bold rounded-xl hover:bg-red-700 transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  const [phase, setPhase] = useState("upload");
  const [merchants, setMerchants] = useState([]);
  const [activeMerchantIds, setActiveMerchantIds] = useState(new Set());
  
  // Phase 3 states
  const [selectedPromos, setSelectedPromos] = useState([]);
  const [promoConfigs, setPromoConfigs] = useState({});
  const [dispatchMode, setDispatchMode] = useState("cc");
  
  // Scaffolding states for later phases
  const [repSettings, setRepSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("mcd_rep_settings");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Auto-open settings if repId is missing on App mount
  useEffect(() => {
    if (!repSettings.repId) {
      setIsSettingsOpen(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("mcd_rep_settings", JSON.stringify(repSettings));
  }, [repSettings]);

  // Derived phase 4 states
  const targetMerchants = useMemo(() => {
    return merchants.filter(m => activeMerchantIds.has(m.id));
  }, [merchants, activeMerchantIds]);

  const deepLinks = useMemo(() => {
    return buildAllDeepLinks(targetMerchants, selectedPromos, promoConfigs, repSettings.repId);
  }, [targetMerchants, selectedPromos, promoConfigs, repSettings.repId]);

  const emailDrafts = useMemo(() => {
    return targetMerchants.map(m => generateEmail({ 
      merchant: m, 
      selectedPromos, 
      promoConfigs, 
      repSettings, 
      deepLinks: deepLinks[m.id] 
    })).map((draft, i) => ({ merchantId: targetMerchants[i].id, ...draft }));
  }, [targetMerchants, selectedPromos, promoConfigs, repSettings, deepLinks]);

  const handleDataLoaded = (parsedData) => {
    setMerchants(parsedData);
    setPhase("select");
  };

  const selectedCount = merchants.filter(m => m.selected).length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <Header onOpenSettings={() => setIsSettingsOpen(true)} />
      
      <RepSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        repSettings={repSettings} 
        setRepSettings={setRepSettings} 
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-8">
        <StepIndicator 
          currentPhase={phase} 
          setPhase={setPhase} 
          hasMerchants={merchants.length > 0}
          hasPromos={selectedPromos.length > 0}
        />

        {phase === "upload" && (
          <UploadZone onDataLoaded={handleDataLoaded} />
        )}

        {phase === "select" && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
               <h3 className="text-xl font-bold text-slate-800 mb-2">Review Your Book of Business</h3>
               <p className="text-slate-500 max-w-3xl">
                 We've automatically consolidated multiple locations under the same business ID and extracted the best target email for each franchise. Check the merchants you want to pitch campaigns to today.
               </p>
            </div>
            
            <MerchantTable 
              merchants={merchants} 
              setMerchants={setMerchants} 
              onActiveMerchantsChange={setActiveMerchantIds}
              onContinue={(payloadIds) => {
                if (payloadIds) setActiveMerchantIds(payloadIds);
                setPhase("build");
              }} 
            />
          </div>
        )}

        {phase === "build" && (
          <div className="space-y-4">
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
                <h3 className="text-xl font-bold text-slate-800 mb-2">Configure Promotions</h3>
                <p className="text-slate-500">
                  Select one or more marketing campaigns. We will generate specific deep links mapped perfectly to your choices below.
                </p>
             </div>
             
             <PromoSelector selectedPromos={selectedPromos} setSelectedPromos={setSelectedPromos} />
             <PromoCustomizer selectedPromos={selectedPromos} promoConfigs={promoConfigs} setPromoConfigs={setPromoConfigs} />
             
             <div className="flex justify-end pt-8">
               <button
                 onClick={() => setPhase("deliver")}
                 disabled={selectedPromos.length === 0}
                 className="flex items-center gap-2 px-8 py-3.5 bg-dd-red text-white font-bold rounded-xl shadow-md hover:bg-dd-red-dark hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
               >
                 Preview & Send Emails
                 <ArrowRight className="w-5 h-5" />
               </button>
             </div>
          </div>
        )}

        {phase === "deliver" && (
          <div className="space-y-4">
            {selectedPromos.length === 0 || targetMerchants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                <div className="text-6xl mb-4">📭</div>
                <h3 className="text-xl font-bold text-slate-600 mb-2">Nothing to Preview Yet</h3>
                <p className="text-slate-500 text-center max-w-sm">
                  {targetMerchants.length === 0
                    ? "Go back to Step 2 and select at least one merchant."
                    : "Go back to Step 3 and select at least one promotion."
                  }
                </p>
              </div>
            ) : (
              <>
                <EmailPreview 
                  merchants={targetMerchants} 
                  emailDrafts={emailDrafts} 
                  setMerchants={setMerchants} 
                  dispatchMode={dispatchMode}
                />
                <DeliveryPanel 
                  merchants={targetMerchants} 
                  emailDrafts={emailDrafts} 
                  repSettings={repSettings} 
                  dispatchMode={dispatchMode}
                  setDispatchMode={setDispatchMode}
                />
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
