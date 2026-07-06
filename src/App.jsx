import React, { useState, useEffect, useMemo, useCallback } from "react";
import Header from "./components/Header";
import StepIndicator from "./components/StepIndicator";
import UploadZone from "./components/UploadZone";
import MerchantTable from "./components/MerchantTable";
import PromoSelector from "./components/PromoSelector";
import PromoCustomizer, { getPromoConfigErrors } from "./components/PromoCustomizer";
import EmailPreview from "./components/EmailPreview";
import DeliveryPanel from "./components/DeliveryPanel";
import RepSettingsModal from "./components/RepSettingsModal";
import BOBDashboard from "./components/BOBDashboard";
import SendLogDashboard from "./components/SendLogDashboard";
import AdminPanel from "./components/AdminPanel";
import { ArrowRight, Settings } from "lucide-react";
import { buildAllDeepLinks } from "./lib/deepLinkBuilder";
import { trackNavigation } from "./lib/analytics";
import {
  generateInitialBlocks,
  buildEmailSubject,
  compileBlocksToHtml,
  compileBlocksToText,
  compileBlocksToCleanHtml,
  wrapForRichEmail,
  htmlToPlainText,
  injectDeepLinks,
  stripDeepLinkTokens,
  formatDmName,
} from "./lib/emailBlockEngine";

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

export default function App({ userProfile, onSignOut, sessionId }) {
  return (
    <ErrorBoundary>
      <AppInner userProfile={userProfile} onSignOut={onSignOut} sessionId={sessionId} />
    </ErrorBoundary>
  );
}

function AppInner({ userProfile, onSignOut, sessionId }) {
  // ── Phase: plain state | no router dependency ─────────────────────────
  // Using useState instead of useNavigate/useLocation keeps navigation
  // simple and reliable. The router context is still available for any
  // component that needs it, but phase transitions are instant state updates.
  const [phase, setPhase] = useState("upload");
  const repEmail = userProfile?.email || "";

  // Track every phase transition as a navigation event
  useEffect(() => {
    if (sessionId && repEmail) {
      trackNavigation(sessionId, repEmail, phase);
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const [merchants, setMerchants] = useState([]);
  const [activeMerchantIds, setActiveMerchantIds] = useState(new Set());
  const [analyticsPayload, setAnalyticsPayload] = useState(null);  // BOB Intelligence Suite data

  // Phase 3 states
  const [selectedPromos, setSelectedPromos] = useState([]);
  const [promoConfigs, setPromoConfigs] = useState({});
  const [dispatchMode, setDispatchMode] = useState("cc");
  const [emailFormat, setEmailFormat] = useState("html");  // "html" | "plain"

  // Block generation state (blocks → initial HTML only; editing path uses raw HTML override)
  const [globalBlocks, setGlobalBlocks] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState("momentum");

  // Raw HTML override state (written by MerchantEmailEditor "Apply to All" save)
  // Contains %%DD_LINK_<promoId>%% tokens | resolved per merchant at render time
  const [globalHtmlTemplate, setGlobalHtmlTemplate] = useState("");

  // ── Promo change handler ──────────────────────────────────────────────────────
  const applyPromoWipe = useCallback((newPromos) => {
    setSelectedPromos(newPromos);
    setGlobalBlocks([]);
    setGlobalHtmlTemplate("");
    // We intentionally NEVER wipe the merchant.emailOverride / subjectOverride here
    // based on user feedback to keep edits regardless of promo changes.
  }, []);

  const handlePromoChange = useCallback((newPromos) => {
    const resolvedPromos = typeof newPromos === "function" ? newPromos(selectedPromos) : newPromos;
    applyPromoWipe(resolvedPromos);
  }, [applyPromoWipe, selectedPromos]);

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
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

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

  // Initialize globalBlocks lazily | only when we have promos and no blocks yet.
  // We do this in a useMemo so it is always in sync with promoConfigs.
  const resolvedGlobalBlocks = useMemo(() => {
    if (globalBlocks.length > 0) return globalBlocks;
    if (selectedPromos.length === 0) return [];
    return generateInitialBlocks(selectedPromos, promoConfigs, repSettings);
  }, [globalBlocks, selectedPromos, promoConfigs, repSettings]);

  const emailDrafts = useMemo(() => {
    if (resolvedGlobalBlocks.length === 0 && !globalHtmlTemplate) return [];

    // Build a token-only version of the global template using generic placeholders.
    // This is passed to the editor so "Apply to All" preserves %%DD_LINK_xxx%% tokens
    // rather than baking in the first merchant's real URLs.
    const TEMPLATE_MERCHANT = { merchantName: "{Store Name}", dmName: "{DM Name}" };
    const sharedTokenBody = resolvedGlobalBlocks.length > 0
      ? compileBlocksToHtml(resolvedGlobalBlocks, {}, TEMPLATE_MERCHANT, selectedTheme, true)
      : null;

    return targetMerchants.map(m => {
      // Use saved subject override (may contain {Store Name}/{DM Name} tokens from
      // "Apply to All" save these get re-resolved below per merchant)
      const rawSubject = m.subjectOverride || buildEmailSubject(m, selectedPromos);
      const dmFirst = formatDmName(m.dmName);
      const dmFallback = m.merchantName ? `${m.merchantName} team` : "there";
      const dmResolved = dmFirst || dmFallback;
      const subject = rawSubject
        .replace(/\{Store\s*Name\}/gi, m.merchantName || "Merchant Partner")
        .replace(/\{DM\s*Name\}/gi, dmResolved);

      const dlMap = deepLinks[m.id] || {};

      // Priority 1: per-merchant HTML override
      if (m.emailOverride) {
        let html = injectDeepLinks(m.emailOverride, dlMap)
          .replace(/\{Store\s*Name\}/gi, m.merchantName || "Merchant Partner")
          .replace(/\{DM\s*Name\}/gi, dmResolved);
        // Use independent clean override if set, otherwise fall back to same HTML
        const cleanHtml = m.cleanOverride
          ? injectDeepLinks(m.cleanOverride, dlMap)
            .replace(/\{Store\s*Name\}/gi, m.merchantName || "Merchant Partner")
            .replace(/\{DM\s*Name\}/gi, dmResolved)
          : html;
        return {
          merchantId: m.id, subject,
          htmlBody: html,
          richBody: wrapForRichEmail(html),
          cleanBody: cleanHtml,
          plainTextBody: htmlToPlainText(html),
          tokenBody: sharedTokenBody,
          dlMap,
        };
      }

      // Priority 2: global HTML template
      if (globalHtmlTemplate) {
        let html = injectDeepLinks(globalHtmlTemplate, dlMap)
          .replace(/\{Store\s*Name\}/gi, m.merchantName || "Merchant Partner")
          .replace(/\{DM\s*Name\}/gi, dmResolved);
        const cleanHtml = m.cleanOverride
          ? injectDeepLinks(m.cleanOverride, dlMap)
            .replace(/\{Store\s*Name\}/gi, m.merchantName || "Merchant Partner")
            .replace(/\{DM\s*Name\}/gi, dmResolved)
          : html;
        return {
          merchantId: m.id, subject,
          htmlBody: html,
          richBody: wrapForRichEmail(html),
          cleanBody: cleanHtml,
          plainTextBody: htmlToPlainText(html),
          tokenBody: sharedTokenBody,
          dlMap,
        };
      }

      // Priority 3: compile from blocks (default path)
      const rawHtml = compileBlocksToHtml(resolvedGlobalBlocks, dlMap, m, selectedTheme);
      return {
        merchantId: m.id,
        subject,
        htmlBody: rawHtml,
        richBody: wrapForRichEmail(rawHtml),
        // Use independent clean override if the rep edited Clean separately
        cleanBody: m.cleanOverride
          ? injectDeepLinks(m.cleanOverride, dlMap)
            .replace(/\{Store\s*Name\}/gi, m.merchantName || "Merchant Partner")
            .replace(/\{DM\s*Name\}/gi, m.dmName || m.merchantName || "there")
          : compileBlocksToCleanHtml(resolvedGlobalBlocks, dlMap, m),
        plainTextBody: compileBlocksToText(resolvedGlobalBlocks, dlMap, m),
        tokenBody: sharedTokenBody,
        dlMap,
      };
    });
  }, [resolvedGlobalBlocks, globalHtmlTemplate, targetMerchants, deepLinks, selectedTheme, selectedPromos]);

  const handleDataLoaded = (parsedData, payload) => {
    setMerchants(parsedData);
    setAnalyticsPayload(payload || null);

    // 🧹 Clear all stale state from the previous upload so old promo selections,
    // block edits, and template overrides don't bleed into the new session.
    setSelectedPromos([]);
    setPromoConfigs({});
    setGlobalBlocks([]);
    setGlobalHtmlTemplate("");

    // Navigate to analyze if we have analytics data, otherwise straight to select
    setPhase(payload ? "analyze" : "select");
  };

  const selectedCount = merchants.filter(m => m.selected).length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        userProfile={userProfile}
        onSignOut={onSignOut}
      />

      <RepSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        repSettings={repSettings}
        setRepSettings={setRepSettings}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-8">
        <StepIndicator
          phase={phase}
          setPhase={setPhase}
          hasMerchants={merchants.length > 0}
          hasPromos={selectedPromos.length > 0}
          onOpenAnalysis={() => setPhase("analyze")}
        />

        {phase === "upload" && (
          <UploadZone onDataLoaded={handleDataLoaded} />
        )}

        {phase === "analyze" && (
          <BOBDashboard
            analyticsPayload={analyticsPayload}
            merchants={merchants}
            repSettings={repSettings}
            onPayloadUpdate={(updated) => setAnalyticsPayload(updated)}
            onContinue={() => setPhase("select")}
          />
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
              analyticsPayload={analyticsPayload}
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
              <h3 className="text-xl font-bold text-slate-800 mb-2">Configure Campaigns</h3>
              <p className="text-slate-500">
                Select one or more marketing campaigns. We will generate specific deep links mapped perfectly to your choices below.
              </p>
            </div>

            <PromoSelector selectedPromos={selectedPromos} setSelectedPromos={handlePromoChange} />
            <PromoCustomizer selectedPromos={selectedPromos} promoConfigs={promoConfigs} setPromoConfigs={setPromoConfigs} userProfile={userProfile} />

            <div className="flex flex-col items-end gap-3 pt-8">
              {/* Promo config error gate   reps & managers only */}
              {(() => {
                const isUltimate = userProfile?.role === "ultimate";
                const promoErrors = getPromoConfigErrors(selectedPromos, promoConfigs, isUltimate);
                const canProceed = selectedPromos.length > 0 && promoErrors.length === 0;
                return (
                  <>
                    {promoErrors.length > 0 && (
                      <div className="w-full bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <p className="text-xs font-bold text-red-700 mb-1">⛔ Fix the following before continuing:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {promoErrors.map((e, i) => (
                            <li key={i} className="text-xs text-red-600">{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button
                      onClick={() => setPhase("deliver")}
                      disabled={!canProceed}
                      className="flex items-center gap-2 px-8 py-3.5 bg-dd-red text-white font-bold rounded-xl shadow-md hover:bg-dd-red-dark hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                    >
                      Preview &amp; Send Emails
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </>
                );
              })()}
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
                  repSettings={repSettings}
                  setGlobalHtmlTemplate={setGlobalHtmlTemplate}
                  selectedPromos={selectedPromos}
                  emailFormat={emailFormat}
                  setEmailFormat={setEmailFormat}
                  userProfile={userProfile}
                />
                <DeliveryPanel
                  merchants={targetMerchants}
                  emailDrafts={emailDrafts}
                  repSettings={repSettings}
                  dispatchMode={dispatchMode}
                  setDispatchMode={setDispatchMode}
                  emailFormat={emailFormat}
                  setEmailFormat={setEmailFormat}
                  userProfile={userProfile}
                  selectedPromos={selectedPromos}
                  sessionId={sessionId}
                />
              </>
            )}
          </div>
        )}
      </main>



      {isDashboardOpen && (
        <SendLogDashboard
          userProfile={userProfile}
          onClose={() => setIsDashboardOpen(false)}
        />
      )}
      {isAdminOpen && (userProfile?.role === "ultimate" || userProfile?.role === "manager") && (
        <AdminPanel
          onClose={() => setIsAdminOpen(false)}
          userProfile={userProfile}
          repSettings={repSettings}
        />
      )}
    </div>
  );
}
