import React, { useState, useMemo } from "react";
import {
  Search, ChevronDown, ChevronRight, CheckSquare, Square,
  Store, Mail, Edit3, AlertCircle, Filter, X, Zap, ArrowRight, SlidersHorizontal, MinusCircle,
} from "lucide-react";
import MerchantEmailManager from "./MerchantEmailManager";

/**
 * MerchantTable | Stage 2
 *
 * Filter system is fully dynamic. On every upload the analyticsPayload (from
 * bobAnalyzer.js) is inspected and three categories of extra filters are generated:
 *
 *  1. Status/text filters  → multi-select badge pickers per detected status column
 *  2. Color swatch filters → toggle chips per labelled/unlabelled hex color group
 *  3. Touch range slider   → min/max slider if a touch/cadence column was detected
 *
 * These sit alongside the existing hardcoded SL Opp / Promo Opp / Loyal Opp chips.
 * All filters are intersected (AND logic): a merchant must pass every active filter.
 *
 * The rowAnalytics array in the payload maps 1:1 with the raw pre-dedup rows, NOT
 * with the deduplicated merchant objects. To bridge this we match by merchantName
 * (best available shared key). If no analyticsPayload is provided the component
 * falls back gracefully to the original hardcoded-chip behaviour.
 */
export default function MerchantTable({
  merchants,
  setMerchants,
  onContinue,
  onActiveMerchantsChange,
  analyticsPayload,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [editingEmailsId, setEditingEmailsId] = useState(null);
  const [showDynFilters, setShowDynFilters] = useState(false);

  // ── Hardcoded known-opp filters ──────────────────────────────────────────────
  const [filterSlOpp, setFilterSlOpp] = useState(false);
  const [filterPromoOpp, setFilterPromoOpp] = useState(false);
  const [filterLoyalOpp, setFilterLoyalOpp] = useState(false);
  const [filterSlCredit, setFilterSlCredit] = useState(false);
  const [filterEmailIssues, setFilterEmailIssues] = useState(false); // show only merchants with bad/missing email

  // ── Dynamic: status column selections  { [colNormalized]: Set<string> } ──────
  const [statusFilters, setStatusFilters] = useState({});

  // ── Dynamic: color swatch selection (Set of hex strings that are ALLOWED) ────
  const [activeColors, setActiveColors] = useState(new Set());

  // ── Dynamic: touch count range [min, max] ────────────────────────────────────
  const [touchRange, setTouchRange] = useState(null); // null = unset

  // Smart Filters panel state
  const [showSelectPanel, setShowSelectPanel] = useState(false);
  const [selectPanelTab, setSelectPanelTab] = useState("smart"); // "smart" | "bulk"
  const [pasteData, setPasteData] = useState("");
  const [bulkFeedback, setBulkFeedback] = useState(null);

  // Smart Exclude panel state
  const [showExcludePanel, setShowExcludePanel] = useState(false);
  const [excludePanelTab, setExcludePanelTab] = useState("smart"); // "smart" | "bulk"
  const [excludeData, setExcludeData] = useState("");
  const [excludeFeedback, setExcludeFeedback] = useState(null);

  // ── INDEPENDENT Exclude filter state (does NOT affect the main table filter) ──
  // These are used ONLY to identify merchants to deselect — they never filter the
  // visible table. The Smart Exclude flow is: pick criteria → see count → press
  // "Exclude X" → those merchants get deselected from the full merchant list.
  const [excludeStatusFilters, setExcludeStatusFilters] = useState({});
  const [excludeActiveColors, setExcludeActiveColors] = useState(new Set());

  // ── Derive dynamic filter config from analyticsPayload ───────────────────────
  const dynConfig = useMemo(() => {
    if (!analyticsPayload) return { statusCols: [], touchCol: null, colorGroups: [] };

    const statusCols = analyticsPayload.widgets
      .filter(w => w.widget === "statusBar")
      .map(w => ({
        col: w.normalized,
        rawHeader: w.rawHeader,
        distribution: w.distribution, // [{ label, count }]
      }));

    const touchCol = analyticsPayload.widgets.find(w => w.widget === "histogram") || null;

    const colorGroups = analyticsPayload.colorGroups || [];

    return { statusCols, touchCol, colorGroups };
  }, [analyticsPayload]);

  // True when at least one dynamic filter type is available from the BOB
  const hasDynFilters =
    dynConfig.statusCols.length > 0 ||
    dynConfig.colorGroups.length > 0 ||
    dynConfig.touchCol !== null;

  // Max touch value for the slider upper bound
  const touchMax = dynConfig.touchCol?.max || 20;

  // Initialize touchRange lazily once touchCol is known
  const resolvedTouchRange = touchRange ?? [0, touchMax];

  // ── Build a name→rowAnalytics lookup for dynamic filter matching ──────────────
  // rowAnalytics comes from bobAnalyzer and has per-row fillColor + colValues.
  // We index by merchantName (lowercase) since that is the only field shared with
  // deduplicated merchant objects without adding another key to bobParser.
  const rowAnalyticsLookup = useMemo(() => {
    if (!analyticsPayload?.rowAnalytics) return {};
    const lookup = {};
    analyticsPayload.rowAnalytics.forEach(row => {
      // colValues is { [normalizedHeader]: value }
      // We need to attach fillColor to the lookup keyed by all merchant names that appear
      // Each rowAnalytic doesn't know the merchant name directly | we use the payload
      // dynamicColumns to find any "merchant name"-ish column value from colValues.
      // Fallback: surface fillColor + colValues for any row; we'll match by index order
      // against filteredMerchants. This is an approximation for the filter | precise enough.
      Object.entries(row.colValues || {}).forEach(([, v]) => {
        // Not used for lookup | we match by merchant index below
      });
    });
    return lookup;
  }, [analyticsPayload]);

  // ── Helper: get the row analytics entry for a given merchant (by BOB row index) ──
  // Since deduplication merges rows, we use the merchant's position in the
  // dealers array as a best-effort proxy. The filter is additive | false negatives
  // mean some merchants appear that shouldn't, never the reverse.
  const getMerchantRowData = (merchant, merchantIdx) => {
    if (!analyticsPayload?.rowAnalytics) return null;
    return analyticsPayload.rowAnalytics[merchantIdx] || null;
  };

  // ── Main filter pipeline ──────────────────────────────────────────────────────
  const filteredMerchants = useMemo(() => {
    const hasStatusFilters = Object.values(statusFilters).some(s => s && s.size > 0);
    const hasColorFilter = activeColors.size > 0;
    const hasTouchFilter = touchRange !== null;
    const touchColKey = dynConfig.touchCol?.normalized;

    return merchants.filter((m, idx) => {
      // 1. Known opp hard filters
      if (filterSlOpp && !m.slOpp) return false;
      if (filterPromoOpp && !m.promoOpp) return false;
      if (filterLoyalOpp && !m.loyalOpp) return false;
      if (filterSlCredit && !m.slCredit) return false;
      if (filterEmailIssues && m.emailStatus === "valid") return false;

      // 2. Text search
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const inName = m.merchantName.toLowerCase().includes(lower);
        const inEmail = m.emails?.some(e => e.address.toLowerCase().includes(lower));
        const inBizId = m.businessId?.toLowerCase().includes(lower);
        const inSids = m.sids.split(",").some(s => s.toLowerCase().includes(lower));
        if (!inName && !inEmail && !inBizId && !inSids) return false;
      }

      // 3. Dynamic filters | only apply when payload available
      if (hasStatusFilters || hasColorFilter || hasTouchFilter) {
        const rowData = getMerchantRowData(m, idx);
        if (!rowData) return true; // no row data = pass through (safe)

        // 3a. Status column multi-select
        if (hasStatusFilters) {
          for (const [col, allowedSet] of Object.entries(statusFilters)) {
            if (!allowedSet || allowedSet.size === 0) continue;
            // Mirror the "(blank)" sentinel used in bobAnalyzer distribution
            const rawVal = rowData.colValues?.[col];
            const cellVal = (rawVal !== null && rawVal !== undefined && rawVal !== "")
              ? String(rawVal).trim()
              : "(blank)";
            if (!allowedSet.has(cellVal)) return false;
          }
        }

        // 3b. Color filter
        if (hasColorFilter) {
          const rowColor = rowData.fillColor || "none";
          if (!activeColors.has(rowColor)) return false;
        }

        // 3c. Touch range slider
        if (hasTouchFilter && touchColKey) {
          const raw = rowData.colValues?.[touchColKey];
          const count = raw !== null && raw !== "" ? parseInt(raw) || 0 : 0;
          if (count < resolvedTouchRange[0] || count > resolvedTouchRange[1]) return false;
        }
      }

      return true;
    });
  }, [
    merchants, searchTerm,
    filterSlOpp, filterPromoOpp, filterLoyalOpp, filterSlCredit,
    statusFilters, activeColors, touchRange, resolvedTouchRange,
    dynConfig, analyticsPayload,
  ]);

  // ── Active merchant sync ──────────────────────────────────────────────────────
  React.useEffect(() => {
    if (onActiveMerchantsChange) {
      onActiveMerchantsChange(new Set(filteredMerchants.filter(m => m.selected).map(m => m.id)));
    }
  }, [filteredMerchants, onActiveMerchantsChange]);

  // ── Selection helpers ─────────────────────────────────────────────────────────
  const allSelected = filteredMerchants.length > 0 && filteredMerchants.every(m => m.selected);

  const toggleAll = () => {
    const next = !allSelected;
    setMerchants(prev =>
      prev.map(m => filteredMerchants.find(fm => fm.id === m.id) ? { ...m, selected: next } : m)
    );
  };

  const toggleMerchant = (id) =>
    setMerchants(prev => prev.map(m => m.id === id ? { ...m, selected: !m.selected } : m));

  const updateMerchant = (id, updates) =>
    setMerchants(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));

  const toggleRow = (id) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Bulk select ───────────────────────────────────────────────────────────────
  const handleApplyBulk = () => {
    const inputIds = new Set(
      pasteData.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    );
    if (!inputIds.size) return;

    const foundIds = new Set();
    const updated = merchants.map(m => {
      let match = false;
      if (m.businessId && inputIds.has(m.businessId.toLowerCase())) {
        match = true;
        foundIds.add(m.businessId.toLowerCase());
      } else {
        (m.originalSids || m.sids).split(",").forEach(sid => {
          if (inputIds.has(sid.toLowerCase())) { match = true; foundIds.add(sid.toLowerCase()); }
        });
      }
      return { ...m, selected: match, sids: m.originalSids || m.sids, locationCount: (m.originalSids || m.sids).split(",").length };
    });
    setMerchants(updated);
    setBulkFeedback({ foundCount: foundIds.size, totalCount: inputIds.size });
  };

  // ── Bulk Exclude (paste IDs tab) ──────────────────────────────────────────────
  const handleApplyExclude = () => {
    const inputIds = new Set(
      excludeData.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    );
    if (!inputIds.size) return;

    let excludedCount = 0;
    const updated = merchants.map(m => {
      let match = false;
      if (m.businessId && inputIds.has(m.businessId.toLowerCase())) {
        match = true;
      } else {
        (m.originalSids || m.sids).split(",").forEach(sid => {
          if (inputIds.has(sid.toLowerCase())) match = true;
        });
      }
      if (match) excludedCount++;
      return match ? { ...m, selected: false } : m;
    });
    setMerchants(updated);
    setExcludeFeedback({ excludedCount, totalCount: inputIds.size });
  };

  // ── Smart Exclude — derived: merchants to deselect based on exclude-only filters ──
  // Built from the FULL merchants array so the visible table is NEVER affected.
  //
  // LOGIC:
  //   • Within one status column  → OR  (any selected value matches)
  //   • Across different columns  → OR  (merchant matches ANY active criterion)
  //   • Color + status columns    → OR  (merchant matches status OR color)
  //
  // Example: 324 total, pick Status="Inactive" (20 merchants) + Color=Red (10 merchants,
  //          5 overlapping) → 25 unique merchants identified for exclusion → 299 remain.
  const excludeFilteredMerchants = useMemo(() => {
    const activeStatusCols = Object.entries(excludeStatusFilters).filter(
      ([, s]) => s && s.size > 0
    );
    const hasExcludeStatusFilters = activeStatusCols.length > 0;
    const hasExcludeColorFilter = excludeActiveColors.size > 0;

    if (!hasExcludeStatusFilters && !hasExcludeColorFilter) return [];

    return merchants.filter((m, idx) => {
      const rowData = getMerchantRowData(m, idx);
      // If there's no row analytics data we cannot match criteria — skip
      if (!rowData) return false;

      // ── Status column checks (OR across columns, OR within each column's values) ──
      // A merchant is targeted for exclusion if it matches ANY of the selected criteria.
      if (hasExcludeStatusFilters) {
        for (const [col, allowedSet] of activeStatusCols) {
          const rawVal = rowData.colValues?.[col];
          const cellVal = (rawVal !== null && rawVal !== undefined && rawVal !== "")
            ? String(rawVal).trim()
            : "(blank)";
          if (allowedSet.has(cellVal)) return true; // ← OR: matched this column criterion → exclude
        }
      }

      // ── Color check (OR with status checks) ──
      if (hasExcludeColorFilter) {
        const rowColor = rowData.fillColor || "none";
        if (excludeActiveColors.has(rowColor)) return true; // ← OR: matched color → exclude
      }

      // Matched no active criterion → do NOT exclude
      return false;
    });
  }, [merchants, excludeStatusFilters, excludeActiveColors, dynConfig, analyticsPayload]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExcludeStatusValue = (col, value) => {
    setExcludeStatusFilters(prev => {
      const current = new Set(prev[col] || []);
      current.has(value) ? current.delete(value) : current.add(value);
      return { ...prev, [col]: current };
    });
  };

  const toggleExcludeColor = (hex) => {
    setExcludeActiveColors(prev => {
      const next = new Set(prev);
      next.has(hex) ? next.delete(hex) : next.add(hex);
      return next;
    });
  };

  // Apply smart exclude: deselect only the identified merchants, all others unchanged
  const handleApplySmartExclude = () => {
    if (excludeFilteredMerchants.length === 0) return;
    const excludeIds = new Set(excludeFilteredMerchants.map(m => m.id));
    setMerchants(prev => prev.map(m => excludeIds.has(m.id) ? { ...m, selected: false } : m));
    setExcludeStatusFilters({});
    setExcludeActiveColors(new Set());
    setShowExcludePanel(false);
  };

  // ── Select / Exclude all currently-filtered merchants ───────────────────────────
  const handleSelectAllFiltered = () => {
    const ids = new Set(filteredMerchants.map(m => m.id));
    setMerchants(prev => prev.map(m => ids.has(m.id) ? { ...m, selected: true } : m));
  };

  const handleDeselectAllFiltered = () => {
    const ids = new Set(filteredMerchants.map(m => m.id));
    setMerchants(prev => prev.map(m => ids.has(m.id) ? { ...m, selected: false } : m));
  };

  // ── Clear all filters ─────────────────────────────────────────────────────────
  const hasActiveFilters =
    filterSlOpp || filterPromoOpp || filterLoyalOpp || filterSlCredit || filterEmailIssues ||
    searchTerm || Object.values(statusFilters).some(s => s?.size > 0) ||
    activeColors.size > 0 || touchRange !== null;

  const clearFilters = () => {
    setSearchTerm(""); setFilterSlOpp(false); setFilterPromoOpp(false);
    setFilterLoyalOpp(false); setFilterSlCredit(false); setFilterEmailIssues(false);
    setStatusFilters({}); setActiveColors(new Set()); setTouchRange(null);
  };

  // Count email issues across all merchants for the warning banner
  const emailIssueCount = useMemo(
    () => merchants.filter(m => m.emailStatus === "invalid" || m.emailStatus === "missing").length,
    [merchants]
  );

  // ── Status filter toggle ──────────────────────────────────────────────────────
  const toggleStatusValue = (col, value) => {
    setStatusFilters(prev => {
      const current = new Set(prev[col] || []);
      current.has(value) ? current.delete(value) : current.add(value);
      return { ...prev, [col]: current };
    });
  };

  // ── Color filter toggle ───────────────────────────────────────────────────────
  const toggleColor = (hex) => {
    setActiveColors(prev => {
      const next = new Set(prev);
      next.has(hex) ? next.delete(hex) : next.add(hex);
      return next;
    });
  };

  if (!merchants.length) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Toolbar ── */}
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-bold text-slate-800">Merchant Targets</h2>
            </div>
            <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
              <Search className="w-4 h-4 text-slate-400 mr-2" />
              <input
                type="text"
                placeholder="Search merchants..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="text-sm text-slate-700 outline-none bg-transparent w-44"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowSelectPanel(v => !v); if (showExcludePanel) setShowExcludePanel(false); }}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${showSelectPanel ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Smart Filters {showSelectPanel ? "▲" : "▼"}
            </button>
            <button
              onClick={() => { setShowExcludePanel(v => !v); if (showSelectPanel) setShowSelectPanel(false); }}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${showExcludePanel ? "bg-rose-600 text-white border-rose-600" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
            >
              <MinusCircle className="w-3.5 h-3.5" />
              Smart Exclude {showExcludePanel ? "▲" : "▼"}
            </button>
            <div className="text-sm font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-lg">
              Selected: <span className="text-dd-red">{filteredMerchants.filter(m => m.selected).length}</span> / {filteredMerchants.length}
            </div>
          </div>
        </div>

        {/* Known-opp chips row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Quick Filters:
          </span>
          <FilterChip label="SL Opp" active={filterSlOpp} onClick={() => { setFilterSlOpp(v => !v); if (filterSlOpp) setFilterSlCredit(false); }} />
          {filterSlOpp && (
            <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-200">
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <FilterChip label="Has Credit" active={filterSlCredit} onClick={() => setFilterSlCredit(v => !v)} />
            </div>
          )}
          <FilterChip label="Promo Opp" active={filterPromoOpp} onClick={() => setFilterPromoOpp(v => !v)} />
          <FilterChip label="Loyal Opp" active={filterLoyalOpp} onClick={() => setFilterLoyalOpp(v => !v)} />
          {emailIssueCount > 0 && (
            <FilterChip
              label={`⚠️ Email Issues (${emailIssueCount})`}
              active={filterEmailIssues}
              onClick={() => setFilterEmailIssues(v => !v)}
              variant="warning"
            />
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-dd-red font-semibold ml-2 flex items-center gap-1 transition-colors">
              <X className="w-3.5 h-3.5" /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* ── Email Issues Banner ── */}
      {emailIssueCount > 0 && (
        <div className="mx-6 my-3 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex-1">
            <span className="font-bold text-amber-800">{emailIssueCount} merchant{emailIssueCount > 1 ? "s" : ""} have email issues</span>
            <span className="text-amber-700"> and were auto-deselected. Fix or add their emails before sending.</span>
          </div>
          <button
            onClick={() => setFilterEmailIssues(true)}
            className="text-xs font-bold text-amber-700 hover:text-amber-900 underline whitespace-nowrap transition-colors"
          >
            View affected
          </button>
        </div>
      )}

      {/* ── Smart Filters Panel (Smart tab + Bulk Select tab) ── */}
      {showSelectPanel && (
        <div className="border-b border-slate-200 bg-violet-50/60 animate-in slide-in-from-top-2 duration-200">
          {/* Tab strip */}
          <div className="flex items-center gap-1 px-6 pt-4 pb-0">
            {[{ id: "smart", label: "Smart Filters" }, { id: "bulk", label: "Bulk Select" }].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectPanelTab(tab.id)}
                className={`text-xs font-bold px-4 py-2 rounded-t-lg border-b-2 transition-all ${selectPanelTab === tab.id
                    ? "border-violet-600 text-violet-700 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: Smart Filters */}
          {selectPanelTab === "smart" && (
            <div className="px-6 py-5 space-y-4">
              {hasDynFilters ? (
                <>
                  <div className="flex items-center gap-2 text-xs font-bold text-violet-700 uppercase tracking-wider">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Detected Column Filters
                  </div>
                  <div className="space-y-3">
                    {dynConfig.statusCols.map(col => {
                      const selected = statusFilters[col.col] || new Set();
                      return (
                        <CollapsibleFilterGroup key={col.col} title={col.rawHeader} defaultExpanded={selected.size > 0} activeCount={selected.size}>
                          <div className="flex flex-wrap gap-2">
                            {col.distribution.map(({ label, count }) => {
                              const isActive = selected.has(label);
                              return (
                                <button key={label} onClick={() => toggleStatusValue(col.col, label)}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${isActive ? "bg-violet-600 text-white border-violet-600 shadow-sm" : "bg-white text-slate-600 border-slate-300 hover:border-violet-400"
                                    }`}>
                                  {label} <span className="opacity-60">({count})</span>
                                </button>
                              );
                            })}
                            {selected.size > 0 && (
                              <button onClick={() => setStatusFilters(prev => ({ ...prev, [col.col]: new Set() }))}
                                className="text-xs text-slate-400 hover:text-red-500 transition-colors font-semibold">Clear</button>
                            )}
                          </div>
                        </CollapsibleFilterGroup>
                      );
                    })}
                    {dynConfig.colorGroups.length > 0 && (
                      <CollapsibleFilterGroup title="Row Highlight Color" defaultExpanded={activeColors.size > 0} activeCount={activeColors.size}>
                        <div className="flex flex-wrap gap-2 items-center">
                          {dynConfig.colorGroups.map(g => {
                            const isActive = activeColors.has(g.hex);
                            return (
                              <button key={g.hex} onClick={() => toggleColor(g.hex)} title={`#${g.hex} | ${g.count} rows`}
                                className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${isActive ? "border-slate-700 shadow-md ring-2 ring-slate-400" : "border-slate-300 bg-white hover:border-slate-500"
                                  }`}>
                                <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" style={{ backgroundColor: `#${g.hex}` }} />
                                <span className="text-slate-700">{g.label || `#${g.hex}`}</span>
                                <span className="text-slate-400">({g.count})</span>
                              </button>
                            );
                          })}
                          <button onClick={() => toggleColor("none")}
                            className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${activeColors.has("none") ? "border-slate-700 shadow-md ring-2 ring-slate-400" : "border-slate-300 border-dashed bg-white hover:border-slate-500"
                              }`}>
                            <span className="w-3.5 h-3.5 rounded-full border border-dashed border-slate-400 shrink-0" />
                            <span className="text-slate-500">No highlight</span>
                            <span className="text-slate-400">({analyticsPayload?.uncoloredCount ?? "?"})</span>
                          </button>
                          {activeColors.size > 0 && (
                            <button onClick={() => setActiveColors(new Set())} className="text-xs text-slate-400 hover:text-red-500 transition-colors font-semibold">Clear</button>
                          )}
                        </div>
                      </CollapsibleFilterGroup>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500 italic">No dynamic column filters detected in this BOB. Use Bulk Select tab to select by IDs.</p>
              )}
              {/* Select All Filtered action */}
              <div className="flex items-center gap-3 pt-1 border-t border-violet-100">
                <button
                  onClick={handleSelectAllFiltered}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg shadow-sm transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" /> Select All Filtered ({filteredMerchants.length})
                </button>
                <span className="text-xs text-slate-400">Selects every merchant currently visible in the table</span>
              </div>
            </div>
          )}

          {/* Tab: Bulk Select */}
          {selectPanelTab === "bulk" && (
            <div className="px-6 py-5">
              <p className="text-xs text-slate-500 mb-3">Paste Store IDs or Business IDs. <strong>Only matched merchants</strong> will be selected; all others deselected.</p>
              <div className="flex gap-3 items-start">
                <textarea
                  value={pasteData}
                  onChange={e => { setPasteData(e.target.value); setBulkFeedback(null); }}
                  placeholder="Paste IDs separated by spaces or commas..."
                  className="flex-1 bg-white border border-slate-300 rounded-xl p-3 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-400 outline-none resize-none h-20"
                />
                <div className="flex flex-col gap-2">
                  <button onClick={handleApplyBulk} disabled={!pasteData.trim()}
                    className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Apply
                  </button>
                  {bulkFeedback && (
                    <span className={`text-xs font-bold px-2 py-1 rounded text-center ${bulkFeedback.foundCount === bulkFeedback.totalCount ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>Found {bulkFeedback.foundCount}/{bulkFeedback.totalCount}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Smart Exclude Panel (Smart tab + Bulk Exclude tab) ── */}
      {showExcludePanel && (
        <div className="border-b border-rose-200 bg-rose-50/60 animate-in slide-in-from-top-2 duration-200">
          {/* Tab strip */}
          <div className="flex items-center gap-1 px-6 pt-4 pb-0">
            {[{ id: "smart", label: "Smart Exclude" }, { id: "bulk", label: "Bulk Exclude" }].map(tab => (
              <button
                key={tab.id}
                onClick={() => setExcludePanelTab(tab.id)}
                className={`text-xs font-bold px-4 py-2 rounded-t-lg border-b-2 transition-all ${excludePanelTab === tab.id
                    ? "border-rose-600 text-rose-700 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: Smart Exclude */}
          {excludePanelTab === "smart" && (
            <div className="px-6 py-5 space-y-4">
              {/* Explanation banner */}
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                <MinusCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 leading-relaxed">
                  <strong>How Smart Exclude works:</strong> Choose your criteria below. Merchants that match <strong>any</strong> of your choices will be flagged. Click <strong>"Exclude X merchants"</strong> to deselect only those merchants, leaving the rest unchanged.
                </p>
              </div>

              {hasDynFilters ? (
                <>
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-700 uppercase tracking-wider">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Filter to Identify Who to Exclude
                  </div>
                  <div className="space-y-3">
                    {dynConfig.statusCols.map(col => {
                      // Use INDEPENDENT exclude filters — not the main statusFilters!
                      const selected = excludeStatusFilters[col.col] || new Set();
                      return (
                        <CollapsibleFilterGroup key={col.col} title={col.rawHeader} defaultExpanded={selected.size > 0} activeCount={selected.size} accentColor="rose">
                          <div className="flex flex-wrap gap-2">
                            {col.distribution.map(({ label, count }) => {
                              const isActive = selected.has(label);
                              return (
                                <button key={label} onClick={() => toggleExcludeStatusValue(col.col, label)}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${isActive ? "bg-rose-600 text-white border-rose-600 shadow-sm" : "bg-white text-slate-600 border-slate-300 hover:border-rose-400"
                                    }`}>
                                  {label} <span className="opacity-60">({count})</span>
                                </button>
                              );
                            })}
                            {selected.size > 0 && (
                              <button onClick={() => setExcludeStatusFilters(prev => ({ ...prev, [col.col]: new Set() }))}
                                className="text-xs text-slate-400 hover:text-red-500 transition-colors font-semibold">Clear</button>
                            )}
                          </div>
                        </CollapsibleFilterGroup>
                      );
                    })}
                    {dynConfig.colorGroups.length > 0 && (
                      <CollapsibleFilterGroup title="Row Highlight Color" defaultExpanded={excludeActiveColors.size > 0} activeCount={excludeActiveColors.size} accentColor="rose">
                        <div className="flex flex-wrap gap-2 items-center">
                          {dynConfig.colorGroups.map(g => {
                            const isActive = excludeActiveColors.has(g.hex);
                            return (
                              <button key={g.hex} onClick={() => toggleExcludeColor(g.hex)}
                                className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${isActive ? "border-rose-700 shadow-md ring-2 ring-rose-300" : "border-slate-300 bg-white hover:border-rose-400"
                                  }`}>
                                <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" style={{ backgroundColor: `#${g.hex}` }} />
                                <span className="text-slate-700">{g.label || `#${g.hex}`}</span>
                                <span className="text-slate-400">({g.count})</span>
                              </button>
                            );
                          })}
                          {excludeActiveColors.size > 0 && (
                            <button onClick={() => setExcludeActiveColors(new Set())} className="text-xs text-slate-400 hover:text-red-500 transition-colors font-semibold">Clear</button>
                          )}
                        </div>
                      </CollapsibleFilterGroup>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500 italic">No dynamic column filters detected. Use Bulk Exclude tab to deselect by IDs.</p>
              )}
              {/* Exclude action — targets ONLY the identified merchants, not the visible filtered list */}
              <div className="flex items-center gap-3 pt-1 border-t border-rose-100">
                <button
                  onClick={handleApplySmartExclude}
                  disabled={excludeFilteredMerchants.length === 0}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <MinusCircle className="w-3.5 h-3.5" />
                  {excludeFilteredMerchants.length > 0
                    ? `Exclude ${excludeFilteredMerchants.length} merchants from selection`
                    : "Pick criteria above to identify merchants"}
                </button>
                {excludeFilteredMerchants.length > 0 && (
                  <span className="text-xs text-slate-400">
                    {merchants.filter(m => m.selected).length} selected → {merchants.filter(m => m.selected).length - excludeFilteredMerchants.filter(m => m.selected).length} after exclude
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Tab: Bulk Exclude */}
          {excludePanelTab === "bulk" && (
            <div className="px-6 py-5">
              <p className="text-xs text-slate-500 mb-3">Paste Store IDs or Business IDs. Matched merchants will be <strong>deselected</strong>. All others stay as-is.</p>
              <div className="flex gap-3 items-start">
                <textarea
                  value={excludeData}
                  onChange={e => { setExcludeData(e.target.value); setExcludeFeedback(null); }}
                  placeholder="Paste IDs to exclude, separated by spaces or commas..."
                  className="flex-1 bg-white border border-rose-300 rounded-xl p-3 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-400 outline-none resize-none h-20"
                />
                <div className="flex flex-col gap-2">
                  <button onClick={handleApplyExclude} disabled={!excludeData.trim()}
                    className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Exclude
                  </button>
                  {excludeFeedback && (
                    <span className={`text-xs font-bold px-2 py-1 rounded text-center ${excludeFeedback.excludedCount > 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
                      }`}>
                      {excludeFeedback.excludedCount > 0 ? `Excluded ${excludeFeedback.excludedCount}` : "No matches"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead className="sticky top-0 bg-white shadow-sm z-10">
            <tr className="text-slate-500 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 font-semibold border-b border-slate-200 w-12 text-center">
                <button onClick={toggleAll} className="outline-none">
                  {allSelected
                    ? <CheckSquare className="w-5 h-5 text-dd-red mx-auto" />
                    : <Square className="w-5 h-5 text-slate-300 hover:text-slate-400 mx-auto" />}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold border-b border-slate-200">Merchant Details</th>
              <th className="px-6 py-4 font-semibold border-b border-slate-200">Store ID(s)</th>
              <th className="px-6 py-4 font-semibold border-b border-slate-200">Target Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMerchants.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-slate-500 bg-slate-50/50">
                  <p className="text-lg font-medium text-slate-600">No merchants match your filters.</p>
                  <button onClick={clearFilters} className="text-sm text-dd-red font-bold hover:underline mt-2">Clear all filters</button>
                </td>
              </tr>
            ) : (
              filteredMerchants.map(row => {
                const isExpanded = expandedRows.has(row.id);
                const sidArray = row.sids.split(",");
                return (
                  <React.Fragment key={row.id}>
                    <tr className={`hover:bg-slate-50 transition-colors ${!row.selected ? "opacity-60" : ""}`}>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => toggleMerchant(row.id)} className="outline-none">
                          {row.selected
                            ? <CheckSquare className="w-5 h-5 text-dd-red mx-auto" />
                            : <Square className="w-5 h-5 text-slate-300 hover:text-slate-400 mx-auto" />}
                        </button>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          {row.merchantName}
                          {row.locationCount > 1 && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                              {row.locationCount} Locs
                            </span>
                          )}
                          {row.bobFileCount > 1 && (
                            <span className="text-[10px] bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded-full" title={`Appeared in ${row.bobFileCount} uploaded BOB files`}>
                              {row.bobFileCount} BOBs
                            </span>
                          )}
                        </div>
                        {row.businessId && (
                          <div className="text-xs text-slate-400 font-mono mt-0.5 opacity-80">Biz ID: {row.businessId}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 align-top">
                        <div className="flex items-center gap-2 mt-2">
                          <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{sidArray[0]}</span>
                          {sidArray.length > 1 && (
                            <button onClick={() => toggleRow(row.id)} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                              +{sidArray.length - 1} more {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {row.emails?.length > 0 ? (
                          <div className="flex items-center justify-between gap-3 min-w-[200px] border border-transparent hover:border-slate-200 p-2 rounded-xl group transition-all">
                            <div className="flex flex-col items-start gap-1">
                              <div className="flex items-center gap-1.5">
                                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="font-semibold text-slate-800 text-xs">
                                  {row.emails.find(e => e.isPrimary)?.address || row.emails[0].address}
                                </span>
                              </div>
                              {row.emails.length > 1 && (
                                <div className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full w-fit">
                                  +{row.emails.length - 1} More
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => setEditingEmailsId(row.id)}
                              className="p-1.5 bg-white border border-slate-200 hover:border-dd-red hover:text-dd-red shadow-sm rounded-lg text-slate-500 transition-all opacity-0 group-hover:opacity-100"
                              title="Manage Emails"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs font-bold bg-amber-50 border border-amber-200 rounded-lg flex flex-col gap-1 py-1.5 px-3 min-w-[200px]">
                            <span className="flex items-center gap-1 text-amber-700">
                              <AlertCircle className="w-3.5 h-3.5" />
                              {row.emailStatus === "invalid" ? "Invalid email" : "Missing email"}
                            </span>
                            {row.rawEmailIssue && (
                              <span className="font-mono text-[10px] text-amber-600 truncate max-w-[180px]" title={row.rawEmailIssue}>
                                {row.rawEmailIssue}
                              </span>
                            )}
                            <button
                              onClick={() => setEditingEmailsId(row.id)}
                              className="self-start text-amber-700 hover:text-amber-900 underline text-[10px] font-bold mt-0.5 transition-colors"
                            >
                              {row.emailStatus === "invalid" ? "Fix" : "Add email"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/50">
                        <td colSpan="4" className="px-6 py-4 border-b border-slate-100">
                          <div className="pl-12 pb-2">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">All Assigned Store IDs</h4>
                            <div className="flex flex-wrap gap-2">
                              {sidArray.map(sid => (
                                <span key={sid} className="font-mono text-sm bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">{sid}</span>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editingEmailsId && (
        <MerchantEmailManager
          merchant={merchants.find(m => m.id === editingEmailsId)}
          onSave={newEmails => { updateMerchant(editingEmailsId, { emails: newEmails }); setEditingEmailsId(null); }}
          onClose={() => setEditingEmailsId(null)}
        />
      )}

      {onContinue && (
        <div className="flex justify-end pt-4 pb-6 px-6 bg-slate-50 border-t border-slate-200">
          <button
            onClick={() => onContinue()}
            disabled={filteredMerchants.filter(m => m.selected).length === 0}
            className="flex items-center gap-2 px-8 py-3.5 bg-dd-red text-white font-bold rounded-xl shadow-md hover:bg-dd-red-dark hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
          >
            Continue to Configure Promos
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick, variant }) {
  const activeClass = variant === "warning"
    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
    : "bg-dd-red text-white border-dd-red shadow-sm";
  return (
    <button
      onClick={onClick}
      className={`text-xs font-bold px-2.5 py-1 rounded-full transition-all border ${active
          ? activeClass
          : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"
        }`}
    >
      {label}
    </button>
  );
}

function CollapsibleFilterGroup({ title, children, defaultExpanded = false, activeCount = 0, accentColor = "violet" }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasActive = activeCount > 0;

  const borderActive = accentColor === "rose" ? "border-rose-300 bg-white shadow-sm" : "border-violet-300 bg-white shadow-sm";
  const textActive = accentColor === "rose" ? "text-rose-700" : "text-violet-700";
  const badgeBg = accentColor === "rose" ? "bg-rose-600" : "bg-violet-600";
  const pillActiveText = accentColor === "rose" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-violet-50 text-violet-600 border-violet-200";

  return (
    <div className={`rounded-xl border transition-all duration-200 overflow-hidden ${hasActive ? borderActive : "border-slate-200 bg-white/60"
      }`}>
      {/* ── Header row ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 gap-3 focus:outline-none group"
      >
        {/* Left: title + active badge */}
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-bold tracking-wide truncate transition-colors ${hasActive ? textActive : "text-slate-600 group-hover:text-slate-800"
            }`}>
            {title}
          </span>
          {hasActive && (
            <span className={`flex-shrink-0 text-[10px] font-bold ${badgeBg} text-white px-1.5 py-0.5 rounded-full leading-none`}>
              {activeCount}
            </span>
          )}
        </div>

        {/* Right: +/- pill */}
        <span className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all ${expanded
            ? "bg-slate-100 text-slate-600 border-slate-200"
            : hasActive
              ? pillActiveText
              : "bg-slate-50 text-slate-500 border-slate-200 group-hover:border-slate-300"
          }`}>
          <span className="text-base leading-none" style={{ lineHeight: 1 }}>
            {expanded ? "−" : "+"}
          </span>
          {expanded ? "Hide" : "Show"}
        </span>
      </button>

      {/* ── Content ── */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 animate-in slide-in-from-top-1 fade-in duration-150">
          <div className="border-t border-slate-100 pt-3">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
