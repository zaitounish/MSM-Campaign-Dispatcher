import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import { ArrowRight, Settings, Flame, UploadCloud } from "lucide-react";
import { buildAllDeepLinks } from "./lib/deepLinkBuilder";
import { trackNavigation } from "./lib/analytics";
import {
  loadRepSettings,
  saveRepSettings,
  mirrorRepIdToWhitelist,
  readSettingsCache,
  writeSettingsCache,
} from "./lib/repSettingsStore";
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
import { fetchAssignedLeads } from "./lib/supabase";
import { transformAssignedLeadsToMerchants } from "./lib/assignedLeadsAdapter";

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

  // ── Pipeline persistence ─────────────────────────────────────────────────
  // The parsed merchant pipeline is saved to localStorage so reps don't need
  // to re-upload their BOB every time they open the app. It is scoped to the
  // current calendar date — stale pipelines from previous days are ignored
  // automatically since BOBs change daily.
  const PIPELINE_KEY = "mcd_pipeline_v3";
  const todayDateStr = new Date().toLocaleDateString("en-CA"); // "YYYY-MM-DD" in local time

  const [cachedPipelineMeta, setCachedPipelineMeta] = useState(() => {
    // On mount: check if a same-day pipeline exists in localStorage
    try {
      localStorage.removeItem("mcd_pipeline_v1");
      localStorage.removeItem("mcd_pipeline_v2");
      const raw = localStorage.getItem(PIPELINE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (saved.date !== todayDateStr) return null; // stale — ignore
      return { fileName: saved.fileName, merchantCount: saved.merchantCount, date: saved.date };
    } catch {
      return null;
    }
  });

  const [merchants, setMerchants] = useState([]);
  const [activeMerchantIds, setActiveMerchantIds] = useState(new Set());
  const [analyticsPayload, setAnalyticsPayload] = useState(null);  // BOB Intelligence Suite data
  const [defaultLeadsCount, setDefaultLeadsCount] = useState(0);
  const [defaultLeadsRaw, setDefaultLeadsRaw] = useState(null);
  const [leadsLoading, setLeadsLoading] = useState(true);

  const handleDataLoaded = useCallback((parsedData, payload, fileName) => {
    setMerchants(parsedData);
    setAnalyticsPayload(payload || null);

    // 🧹 Clear all stale state from the previous upload so old promo selections,
    // block edits, and template overrides don't bleed into the new session.
    setSelectedPromos([]);
    setPromoConfigs({});
    setGlobalBlocks([]);
    setGlobalHtmlTemplate("");

    // 💾 Persist parsed pipeline to localStorage so the rep doesn't need to
    // re-upload on refresh. Scoped to today's date — automatically ignored tomorrow.
    try {
      const meta = { fileName: fileName || "pipeline", merchantCount: parsedData.length, date: todayDateStr };
      localStorage.setItem(PIPELINE_KEY, JSON.stringify({
        ...meta,
        merchants: parsedData,
        analyticsPayload: payload || null,
      }));
      setCachedPipelineMeta(meta);
    } catch (e) {
      console.warn("[pipeline] Could not persist to localStorage:", e.message);
    }

    setPhase(payload ? "analyze" : "select");
  }, [todayDateStr]);

  const handleLoadDefaultLeads = useCallback(async () => {
    if (!repEmail) return;
    try {
      let leads = defaultLeadsRaw;
      if (!leads || leads.length === 0) {
        leads = await fetchAssignedLeads(repEmail);
        if (leads) setDefaultLeadsRaw(leads);
      }
      if (leads && leads.length > 0) {
        setDefaultLeadsCount(leads.length);
        const transformed = transformAssignedLeadsToMerchants(leads);
        if (transformed.length > 0) {
          handleDataLoaded(transformed, null, "Hot Ads Pipeline");
        }
      }
    } catch (err) {
      console.error("[defaultLeads] Error loading assigned leads:", err);
    }
  }, [repEmail, defaultLeadsRaw, handleDataLoaded]);

  // Restore pipeline from localStorage on mount, or auto-load persistent default assigned leads
  useEffect(() => {
    let hasRestoredLocal = false;
    try {
      localStorage.removeItem("mcd_pipeline_v1");
      localStorage.removeItem("mcd_pipeline_v2");
      const raw = localStorage.getItem(PIPELINE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.date === todayDateStr && saved.merchants && saved.merchants.length > 0) {
          const hasOppType = saved.merchants.some(m => m.oppType && m.oppType.trim() && m.oppType !== "#N/A");
          if (saved.fileName === "Hot Ads Pipeline" && !hasOppType) {
            localStorage.removeItem(PIPELINE_KEY);
          } else {
            setMerchants(saved.merchants);
            setAnalyticsPayload(saved.analyticsPayload || null);
            setPhase(saved.analyticsPayload ? "analyze" : "select");
            hasRestoredLocal = true;
          }
        }
      }
    } catch {
      /* silently ignore corrupt data */
    }

    // Always fetch default leads count for the rep so it's ready in UploadZone if cleared
    if (repEmail) {
      setLeadsLoading(true);
      fetchAssignedLeads(repEmail).then(leads => {
        setLeadsLoading(false);
        if (leads && leads.length > 0) {
          setDefaultLeadsCount(leads.length);
          setDefaultLeadsRaw(leads);
          const transformed = transformAssignedLeadsToMerchants(leads);
          // If no local pipeline was active, or if current is Hot Ads without oppType, auto-load!
          if (!hasRestoredLocal) {
            if (transformed.length > 0) {
              handleDataLoaded(transformed, null, "Hot Ads Pipeline");
            }
          }
        } else {
          setDefaultLeadsCount(0);
          setDefaultLeadsRaw([]);
        }
      }).catch(err => {
        setLeadsLoading(false);
        console.warn("[assignedLeads] Could not fetch default leads:", err.message);
      });
    } else {
      setLeadsLoading(false);
    }
  }, [repEmail, todayDateStr, handleDataLoaded]);

  // Track every phase transition as a navigation event
  useEffect(() => {
    if (sessionId && repEmail) {
      trackNavigation(sessionId, repEmail, phase);
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Full reset used when "Blank Email" is selected: clears global state AND all
  // per-merchant email/subject overrides so old promo deep links can't bleed in.
  const applyBlankReset = useCallback((newPromos) => {
    setSelectedPromos(newPromos);
    setGlobalBlocks([]);
    setGlobalHtmlTemplate("");
    setMerchants(prev =>
      prev.map(m => ({ ...m, emailOverride: null, cleanOverride: null, subjectOverride: undefined }))
    );
  }, []);

  const handlePromoChange = useCallback((newPromos) => {
    const resolvedPromos = typeof newPromos === "function" ? newPromos(selectedPromos) : newPromos;
    // If the new selection is blank, perform a full reset including per-merchant overrides
    // so that previously-selected promo deep links don't bleed into the blank email.
    if (resolvedPromos.length === 1 && resolvedPromos[0] === "blank") {
      applyBlankReset(resolvedPromos);
    } else {
      applyPromoWipe(resolvedPromos);
    }
  }, [applyBlankReset, applyPromoWipe, selectedPromos]);

  // ── Rep settings: Supabase is the source of truth ────────────────────────
  // Stored in the `rep_settings` table keyed per rep email, so settings
  // (Rep ID, GAS URL, signature, name, etc.) follow the rep across devices
  // and survive browser data wipes. localStorage is only an instant-paint
  // cache + offline fallback — the DB row always wins on load.
  const [repSettings, setRepSettings] = useState({});
  // settingsLoaded is reset to false whenever repEmail changes so that the
  // save-guard stays correct across multiple login cycles without a page reload.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // "saving" | "saved" | "failed" | null — passed to RepSettingsModal footer.
  const [settingsSyncState, setSettingsSyncState] = useState(null);
  // Snapshot of settings as loaded (JSON) — skips echo saves of unmodified data.
  const loadedSnapshotRef = useRef(null);
  // Last repId mirrored into reps_whitelist — avoids redundant RPC calls.
  const mirroredRepIdRef = useRef(null);
  // Latest settings for the beforeunload flush.
  const latestSettingsRef = useRef({});
  useEffect(() => { latestSettingsRef.current = repSettings; });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // Load: reset settingsLoaded + paint instantly from cache, then converge on DB row.
  // settingsLoaded is reset at the top so the save-guard is never stale on re-login.
  useEffect(() => {
    if (!repEmail) return;
    let cancelled = false;
    setSettingsLoaded(false); // ← guard reset: must precede any setRepSettings call
    loadedSnapshotRef.current = null;
    mirroredRepIdRef.current = null;
    setSettingsSyncState(null);
    // Instant paint from cache (may be stale — DB wins below).
    setRepSettings(readSettingsCache());
    (async () => {
      const dbSettings = await loadRepSettings(repEmail);
      if (cancelled) return;
      if (dbSettings && Object.keys(dbSettings).length > 0) {
        setRepSettings(dbSettings);
        writeSettingsCache(dbSettings);
        loadedSnapshotRef.current = JSON.stringify(dbSettings);
        mirroredRepIdRef.current = dbSettings.repId || null;
      }
      // No DB row (first login, or pre-migration cache): the save effect
      // below backfills the row once settingsLoaded flips true.
      setSettingsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [repEmail]);

  // Auto-open settings once loaded if repId is still missing
  useEffect(() => {
    if (settingsLoaded && !repSettings.repId) {
      setIsSettingsOpen(true);
    }
  }, [settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save: synchronous cache write + IMMEDIATE DB upsert (fire-and-forget).
  // Deliberately no debounce — settings only change on explicit modal saves
  // (rare discrete events), and a delayed write can be lost if the tab closes.
  // Covers: rep_id, gas_url, signature, first_name, last_name, title, phone.
  useEffect(() => {
    if (!repEmail || !settingsLoaded) return;
    if (Object.keys(repSettings).length === 0) return; // nothing to persist yet
    const snap = JSON.stringify(repSettings);
    if (snap === loadedSnapshotRef.current) return; // echo of load — no-op
    loadedSnapshotRef.current = snap;
    writeSettingsCache(repSettings);
    setSettingsSyncState("saving");
    saveRepSettings(repEmail, repSettings).then(({ ok }) => {
      setSettingsSyncState(ok ? "saved" : "failed");
      if (!ok) console.warn("[repSettings] DB sync failed — kept in local cache");
    });
    // Mirror Assisted Rep ID into the whitelist so the Admin panel and the
    // BulkSend rep list pick it up. Only fires when the repId actually changed.
    if (repSettings.repId && repSettings.repId !== mirroredRepIdRef.current) {
      mirroredRepIdRef.current = repSettings.repId;
      mirrorRepIdToWhitelist(repSettings.repId).then(({ ok }) => {
        if (!ok) mirroredRepIdRef.current = null; // retry on next change
      });
    }
  }, [repSettings, repEmail, settingsLoaded]);

  // Best-effort flush if the tab closes mid-save.
  useEffect(() => {
    if (!repEmail) return;
    const flush = () => {
      const s = latestSettingsRef.current;
      if (s && Object.keys(s).length > 0) saveRepSettings(repEmail, s);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [repEmail]);

  // Derived phase 4 states
  const targetMerchants = useMemo(() => {
    return merchants.filter(m => activeMerchantIds.has(m.id));
  }, [merchants, activeMerchantIds]);

  const deepLinks = useMemo(() => {
    // Null-guards at call site only — builder is frozen DoorDash contract.
    // Pass values verbatim, no coercion before the builder.
    const safePromos = selectedPromos ?? [];
    const safeConfigs = promoConfigs ?? {};
    return buildAllDeepLinks(targetMerchants, safePromos, safeConfigs, repSettings.repId);
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

  // Allow the rep to wipe the saved pipeline and return to the upload screen
  const handleClearPipeline = () => {
    localStorage.removeItem(PIPELINE_KEY);
    setCachedPipelineMeta(null);
    setMerchants([]);
    setActiveMerchantIds(new Set());
    setAnalyticsPayload(null);
    setSelectedPromos([]);
    setPromoConfigs({});
    setGlobalBlocks([]);
    setGlobalHtmlTemplate("");
    setPhase("upload");
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
        syncState={settingsSyncState}
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
          <UploadZone
            onDataLoaded={handleDataLoaded}
            cachedPipelineMeta={cachedPipelineMeta}
            onClearPipeline={handleClearPipeline}
            defaultLeadsCount={defaultLeadsCount}
            onLoadDefaultLeads={handleLoadDefaultLeads}
            leadsLoading={leadsLoading}
          />
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

        {phase === "select" && (() => {
          const isSpiffPipeline = !analyticsPayload;
          return (
            <div className="space-y-6">
              <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative overflow-hidden">
                <div className={`absolute top-0 left-0 right-0 h-1 ${isSpiffPipeline ? "bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" : "bg-gradient-to-r from-slate-400 to-slate-600"}`} />
                <div>
                  {isSpiffPipeline ? (
                    <>
                      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-50 text-dd-red text-xs font-bold uppercase tracking-wider mb-2.5 border border-red-100">
                        <Flame className="w-4 h-4 fill-dd-red text-dd-red" /> Client Ads Spiff
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                        Hot Ads Pipeline
                      </h2>
                      <p className="text-slate-500 text-sm mt-1 max-w-2xl">
                        Review and select the businesses you want to pitch campaigns to for the Client Ads Spiff.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider mb-2.5 border border-slate-200">
                        Custom Book of Business
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                        Merchant Pipeline
                      </h2>
                      <p className="text-slate-500 text-sm mt-1 max-w-2xl">
                        Review and select the businesses from your uploaded BOB file.
                      </p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {!isSpiffPipeline && defaultLeadsCount > 0 && (
                    <button
                      onClick={handleLoadDefaultLeads}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-red-50 hover:bg-red-100 text-dd-red text-xs font-bold rounded-xl border border-red-200 transition-colors cursor-pointer"
                    >
                      <Flame className="w-3.5 h-3.5 fill-dd-red" /> Return to Hot Ads ({defaultLeadsCount})
                    </button>
                  )}
                  <button
                    onClick={() => setPhase("upload")}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-slate-500" /> {isSpiffPipeline ? "Upload Custom BOB" : "Upload Another BOB"}
                  </button>
                </div>
              </div>

              <MerchantTable
                merchants={merchants}
                setMerchants={setMerchants}
                onActiveMerchantsChange={setActiveMerchantIds}
                analyticsPayload={analyticsPayload}
                isSpiff={isSpiffPipeline}
                onContinue={(payloadIds) => {
                  if (payloadIds) setActiveMerchantIds(payloadIds);
                  setPhase("build");
                }}
              />
            </div>
          );
        })()}

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
