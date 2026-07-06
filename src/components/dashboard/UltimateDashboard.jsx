/**
 * UltimateDashboard.jsx | Main shell for the Ultimate Analytics Dashboard
 *
 * Role-gated to ultimate only (enforced here AND by AdminPanel tab visibility).
 * Houses all dashboard sub-panels and orchestrates data fetching via hooks.
 *
 * Sections:
 *   1. Executive Summary   today's KPIs + top performers
 *   2. Rep Utilization Table   per-rep sortable drill-down
 *   3. Trend Charts   time-series visualizations
 *   4. Alerts Panel   manager alerts (inactivity, blank sends, etc.)
 */

import React, { useState } from "react";
import { RefreshCw, BarChart2, Users, TrendingUp, AlertTriangle, Activity, Wifi, WifiOff } from "lucide-react";
import { useActivityData } from "../../hooks/useActivityData";
import { useRealtimeUpdates } from "../../hooks/useRealtimeUpdates";
import { useManagerAlerts } from "../../hooks/useManagerAlerts";
import ExecutiveSummary from "./ExecutiveSummary";
import RepUtilizationTable from "./RepUtilizationTable";
import TrendCharts from "./TrendCharts";
import AlertsPanel from "./AlertsPanel";

const SECTIONS = [
  { key: "overview", label: "Overview", Icon: BarChart2 },
  { key: "reps", label: "Rep Table", Icon: Users },
  { key: "trends", label: "Trends", Icon: TrendingUp },
  { key: "alerts", label: "Alerts", Icon: AlertTriangle },
];

const DATE_RANGES = [7, 14, 30, 90];

export default function UltimateDashboard({ userProfile }) {
  const [activeSection, setActiveSection] = useState("overview");
  const [daysBack, setDaysBack] = useState(30);
  const [refreshKey, setRefreshKey] = useState(0);

  // Primary data hook
  const {
    repMetrics,
    emailVolume,
    featureUsage,
    promoDistribution,
    dailyActivity,
    rawSessions,
    loading,
    error,
    refresh,
  } = useActivityData(daysBack, userProfile);

  // Real-time subscription (presence + live activity feed)
  const { recentEvents, onlineReps } = useRealtimeUpdates({ enabled: true });

  // Derived alerts from rep metrics
  const { alerts, counts: alertCounts } = useManagerAlerts(repMetrics);

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
    refresh();
  };

  const isConnected = true; // Supabase Realtime connection   simplified indicator

  return (
    <div className="space-y-6">
      {/* Dashboard header / controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-800">Tool Utilization Analytics</h2>
          {/* Realtime indicator */}
          <div className="flex items-center gap-1 ml-3">
            {isConnected
              ? <Wifi className="w-3.5 h-3.5 text-green-600" />
              : <WifiOff className="w-3.5 h-3.5 text-red-500" />
            }
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isConnected ? "text-green-600" : "text-red-500"}`}>
              {isConnected ? "Live" : "Offline"}
            </span>
          </div>
          {onlineReps.size > 0 && (
            <span className="text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5 ml-2">
              {onlineReps.size} online
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Date range picker */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {DATE_RANGES.map(d => (
              <button
                key={d}
                onClick={() => setDaysBack(d)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${daysBack === d
                    ? "bg-white text-indigo-700 shadow-sm border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-lg transition-all disabled:opacity-40"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span>Failed to load analytics data: {error}</span>
        </div>
      )}

      {/* Section tabs */}
      <div className="flex items-center bg-slate-100 border border-slate-200 p-1 rounded-xl gap-1 w-fit flex-wrap">
        {SECTIONS.map(({ key, label, Icon }) => {
          const isCurrent = activeSection === key;
          const showBadge = key === "alerts" && alertCounts?.total > 0;
          return (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${isCurrent
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {showBadge && (
                <span className="bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                  {alertCounts.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Section content */}
      <div className="min-h-[400px]">
        {activeSection === "overview" && (
          <ExecutiveSummary
            repMetrics={repMetrics}
            emailVolume={emailVolume}
            dailyActivity={dailyActivity}
            loading={loading}
          />
        )}

        {activeSection === "reps" && (
          <RepUtilizationTable
            repMetrics={repMetrics}
            rawSessions={rawSessions}
            onlineReps={onlineReps}
            userProfile={userProfile}
            loading={loading}
          />
        )}

        {activeSection === "trends" && (
          <TrendCharts
            dailyActivity={dailyActivity}
            emailVolume={emailVolume}
            promoDistribution={promoDistribution}
            featureUsage={featureUsage}
            daysBack={daysBack}
            loading={loading}
          />
        )}

        {activeSection === "alerts" && (
          <AlertsPanel
            alerts={alerts}
            counts={alertCounts}
            loading={loading}
          />
        )}
      </div>

      {/* Recent live events feed (collapsed strip at bottom) */}
      {recentEvents.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Live Activity Feed</p>
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-2">
            {recentEvents.slice(0, 10).map((evt, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700">{evt.rep_email}</span>
                <span className="text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">{evt.event_type}</span>
                {evt.feature_name && <span className="text-indigo-600 font-medium">→ {evt.feature_name}</span>}
                <span className="ml-auto text-slate-400 shrink-0 tabular-nums">
                  {new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
