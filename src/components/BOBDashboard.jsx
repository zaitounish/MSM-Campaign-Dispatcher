import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip,
  XAxis, YAxis, ResponsiveContainer, Legend,
} from "recharts";
import {
  ArrowRight, Sparkles, Target, TrendingUp, AlertCircle,
  Users, Loader2, CheckCircle2, ShieldAlert, Zap,
} from "lucide-react";
// import ColorLabelingModal from "./ColorLabelingModal";
import { sanitizeBOBForAI, buildGeminiPrompt } from "../lib/bobAnalyzer";

// ─── Palette for dynamic status bars + donut charts ──────────────────────────
const CHART_COLORS = [
  "#eb1700", "#f59e0b", "#10b981", "#6366f1",
  "#ec4899", "#14b8a6", "#8b5cf6", "#f97316",
];

// ─── Shared chart tooltip style ───────────────────────────────────────────────
const TooltipStyle = {
  contentStyle: { background: "#1e293b", border: "none", borderRadius: 10, color: "#f8fafc", fontSize: 12 },
  labelStyle: { color: "#94a3b8" },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "text-dd-red", icon: Icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
      </div>
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// ─── Known Opp Donut (SL Opp, etc.) ──────────────────────────────────────────
function OppDonut({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const data = [
    { name: label,   value: count },
    { name: "Other", value: total - count },
  ];
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col items-center gap-2">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">{label}</span>
      <ResponsiveContainer width="100%" height={110}>
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="50%"
            innerRadius={30} outerRadius={48}
            startAngle={90} endAngle={-270}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="#f1f5f9" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="text-center">
        <div className="text-2xl font-black" style={{ color }}>{count}</div>
        <div className="text-xs text-slate-500">{pct}% of {total} leads</div>
      </div>
    </div>
  );
}

// ─── Dynamic column widget dispatcher ─────────────────────────────────────────
function DynamicWidget({ widget }) {
  if (widget.widget === "donut") {
    return (
      <OppDonut
        label={widget.rawHeader}
        count={widget.trueCount}
        total={widget.trueCount + widget.falseCount}
        color={CHART_COLORS[2]}
      />
    );
  }

  if (widget.widget === "statusBar") {
    const data = widget.distribution.slice(0, 8); // cap at 8 statuses for readability
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">{widget.rawHeader}</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              dataKey="label" type="category" width={110}
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false} axisLine={false}
            />
            <Tooltip {...TooltipStyle} formatter={(v) => [`${v} leads`, ""]} />
            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (widget.widget === "histogram") {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{widget.rawHeader}</div>
          <div className="text-xs text-slate-500">Avg: <strong>{widget.avg}</strong></div>
        </div>
        <div className="flex gap-4 text-xs text-slate-500 mb-4">
          <span>Max touches: <strong>{widget.max}</strong></span>
          <span>Untouched: <strong className="text-dd-red">{widget.untouched}</strong></span>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={widget.histogram} margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
            <XAxis dataKey="touch" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} label={{ value: "Touches", position: "insideBottom", offset: -2, fill: "#94a3b8", fontSize: 10 }} />
            <YAxis hide />
            <Tooltip {...TooltipStyle} formatter={(v) => [`${v} leads`, ""]} labelFormatter={v => `${v} touches`} />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (widget.widget === "recency") {
    const { today, thisWeek, recent, stale, noDate } = widget.ageBuckets;
    const data = [
      { label: "Today",     count: today,    color: "#10b981" },
      { label: "< 7 days",  count: thisWeek, color: "#6366f1" },
      { label: "< 30 days", count: recent,   color: "#f59e0b" },
      { label: "30+ days",  count: stale,    color: "#eb1700" },
      { label: "No date",   count: noDate,   color: "#cbd5e1" },
    ].filter(d => d.count > 0);
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">{widget.rawHeader} | Recency</div>
        <div className="space-y-2">
          {data.map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(count / widget.totalWithDate || 0.01) * 100}%`, background: color }}
                />
              </div>
              <span className="text-xs font-bold text-slate-600 w-10 text-right">{count}</span>
            </div>
          ))}
        </div>
        {stale > 0 && (
          <div className="mt-4 text-xs text-dd-red font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {stale} leads not contacted in 30+ days
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─── AI Insights Panel ────────────────────────────────────────────────────────
function AIInsightsPanel({ payload, merchants, geminiApiKey }) {
  const [status, setStatus]   = useState("idle"); // idle | loading | done | error
  const [insights, setInsights] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const canRun = !!geminiApiKey && !!payload;

  const runAnalysis = async () => {
    if (!canRun) return;
    setStatus("loading");
    setInsights(null);
    setErrorMsg("");

    try {
      const { sanitizedPayload } = sanitizeBOBForAI(payload, merchants);
      const prompt               = buildGeminiPrompt(sanitizedPayload);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `API error ${res.status}`);
      }

      const body   = await res.json();
      const rawText = body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      // Strip markdown code fences if Gemini wraps with ```json
      const cleaned = rawText.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed  = JSON.parse(cleaned);
      setInsights(parsed);
      setStatus("done");
    } catch (err) {
      console.error("[AIInsightsPanel]", err);
      setErrorMsg(err.message || "Unknown error");
      setStatus("error");
    }
  };

  if (!geminiApiKey) return null;

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <span className="font-bold text-white">AI Pipeline Analysis</span>
          <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5 font-semibold">Gemini Flash</span>
        </div>
        {status !== "loading" && (
          <button
            onClick={runAnalysis}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-all hover:-translate-y-0.5 shadow-lg shadow-violet-500/20"
          >
            <Zap className="w-3.5 h-3.5" />
            {status === "done" ? "Re-analyse" : "Analyse Pipeline"}
          </button>
        )}
      </div>

      {status === "idle" && (
        <p className="text-sm text-slate-400">
          Click <strong>Analyse Pipeline</strong> to get AI-powered insights on your lead distribution, quick wins, and risk flags.
          <br /><span className="text-xs text-slate-600 mt-1 block">Note: Only statistical data is sent | all emails and PII are stripped before leaving your browser.</span>
        </p>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-3 text-slate-300 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
          Analysing your pipeline... (this takes ~5 seconds)
        </div>
      )}

      {status === "error" && (
        <div className="flex items-start gap-3 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Analysis failed</div>
            <div className="text-xs mt-0.5">{errorMsg}</div>
            <button onClick={runAnalysis} className="text-xs text-violet-400 hover:text-violet-300 mt-2 underline">Try again</button>
          </div>
        </div>
      )}

      {status === "done" && insights && (
        <div className="space-y-5">
          {/* Pipeline Score */}
          {insights.pipelineScore !== undefined && (
            <div className="flex items-center gap-4">
              <div
                className="text-5xl font-black"
                style={{ color: insights.pipelineScore >= 70 ? "#10b981" : insights.pipelineScore >= 40 ? "#f59e0b" : "#eb1700" }}
              >
                {insights.pipelineScore}
              </div>
              <div>
                <div className="font-bold text-white text-sm">Pipeline Health Score</div>
                <div className="text-xs text-slate-500">out of 100</div>
              </div>
            </div>
          )}

          {/* Insights list */}
          {[
            { key: "priorityInsights", label: "Priority Insights", icon: Target,       color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
            { key: "quickWins",        label: "Quick Wins",        icon: CheckCircle2,  color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
            { key: "riskFlags",        label: "Risk Flags",        icon: ShieldAlert,   color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
          ].map(({ key, label, icon: Icon, color, bg }) =>
            insights[key]?.length > 0 && (
              <div key={key}>
                <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 ${color}`}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </div>
                <ul className="space-y-2">
                  {insights[key].map((item, i) => (
                    <li key={i} className={`text-xs text-slate-200 border rounded-xl px-3 py-2 leading-relaxed ${bg}`}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}

          {insights.suggestedCampaignFocus && (
            <div className="border border-amber-500/30 bg-amber-500/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
                <TrendingUp className="w-3.5 h-3.5" />Campaign Focus
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{insights.suggestedCampaignFocus}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
/**
 * BOBDashboard | Step 1.5
 *
 * Renders the full analytics dashboard after BOB upload.
 * Shows known opportunity stats, dynamic column widgets, color group map,
 * and the AI Insights Panel if a Gemini API key is configured.
 *
 * @param {object} analyticsPayload  - from bobAnalyzer.analyzeBOB()
 * @param {object[]} merchants       - deduplicated merchant objects from bobParser
 * @param {object} repSettings       - global rep settings (for geminiApiKey)
 * @param {function} onContinue      - advance to Stage 2
 * @param {function} onPayloadUpdate - (updatedPayload) => void | used to save color labels
 */
export default function BOBDashboard({ analyticsPayload, merchants, repSettings, onContinue, onPayloadUpdate }) {
  const [payload, setPayload]     = useState(analyticsPayload);
  /*
  const [showColorModal, setShowColorModal] = useState(
    () => analyticsPayload?.hasColorData && analyticsPayload?.colorGroups?.some(g => !g.label)
  );

  const handleColorLabels = (labelledGroups) => {
    const updated = { ...payload, colorGroups: labelledGroups };
    setPayload(updated);
    onPayloadUpdate(updated);
    setShowColorModal(false);
  };
  */

  if (!payload) return null;

  const { totalRows, oppStats, widgets, colorGroups, uncoloredCount } = payload;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Color Labeling Modal (fires immediately if unlabelled colors found) */}
      {/* showColorModal && (
        <ColorLabelingModal
          colorGroups={colorGroups}
          uncoloredCount={uncoloredCount}
          totalRows={totalRows}
          onConfirm={handleColorLabels}
          onSkip={() => setShowColorModal(false)}
        />
      ) */}

      {/* Page header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Book of Business Analysis</h2>
            <p className="text-slate-500 text-sm mt-1">
              Reviewing <strong className="text-slate-700">{totalRows.toLocaleString()} leads</strong> across <strong className="text-slate-700">{merchants.length.toLocaleString()} unique merchants</strong>. Configure your focus before selecting email targets.
            </p>
          </div>
          <button
            onClick={onContinue}
            className="flex items-center gap-2 px-8 py-3.5 bg-dd-red text-white font-bold rounded-xl shadow-md hover:bg-dd-red-dark hover:-translate-y-0.5 transition-all"
          >
            Select Merchants
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Known Opportunity KPIs */}
      <div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Target className="w-3.5 h-3.5" />Known Opportunity Flags
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            label="Total Leads"  value={totalRows}  icon={Users}
            color="text-slate-800"
            sub={`${merchants.length} unique merchants`}
          />
          <OppDonut label="SL Opportunity"    count={oppStats.slOpp}    total={totalRows} color="#eb1700" />
          <OppDonut label="Promo Opportunity" count={oppStats.promoOpp} total={totalRows} color="#f59e0b" />
          <OppDonut label="Loyalty Opp"       count={oppStats.loyalOpp} total={totalRows} color="#10b981" />
          <OppDonut label="SL Credit"         count={oppStats.slCredit} total={totalRows} color="#6366f1" />
        </div>

        {oppStats.slCreditAndOpp > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 font-semibold w-fit">
            <CheckCircle2 className="w-4 h-4" />
            <strong>{oppStats.slCreditAndOpp}</strong> leads have BOTH SL Credit AND SL Opportunity | highest conversion priority.
          </div>
        )}
      </div>

      {/* Dynamic Column Widgets */}
      {widgets.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5" />Detected Column Insights
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {widgets.map((w, i) => (
              <DynamicWidget key={i} widget={w} />
            ))}
          </div>
        </div>
      )}

      {/* Color Group Summary (if labelled) */}
      {/* colorGroups.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span>Row Highlights</span>
            {colorGroups.some(g => !g.label) && (
              <button
                onClick={() => setShowColorModal(true)}
                className="text-xs text-violet-600 font-bold hover:underline"
              >
                Label colors →
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {colorGroups.map(g => (
              <div key={g.hex} className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
                <div className="w-4 h-4 rounded-md border border-slate-200" style={{ backgroundColor: `#${g.hex}` }} />
                <span className="text-sm font-semibold text-slate-700">{g.label || `#${g.hex}`}</span>
                <span className="text-xs text-slate-400">{g.count} rows</span>
              </div>
            ))}
            {uncoloredCount > 0 && (
              <div className="flex items-center gap-2.5 bg-slate-50 border border-dashed border-slate-200 rounded-xl px-4 py-2.5">
                <span className="text-xs text-slate-400">{uncoloredCount} uncolored rows</span>
              </div>
            )}
          </div>
        </div>
      ) */}

      {/* AI Insights Panel */}
      <AIInsightsPanel
        payload={payload}
        merchants={merchants}
        geminiApiKey={repSettings?.geminiApiKey}
      />

      {/* Continue CTA (bottom) */}
      <div className="flex justify-end pb-4">
        <button
          onClick={onContinue}
          className="flex items-center gap-2 px-8 py-3.5 bg-dd-red text-white font-bold rounded-xl shadow-md hover:bg-dd-red-dark hover:-translate-y-0.5 transition-all"
        >
          Select Merchants
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
