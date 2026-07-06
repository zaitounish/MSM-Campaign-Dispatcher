/**
 * AlertsPanel.jsx | Actionable manager alerts for the Ultimate Dashboard
 *
 * Renders categorized alerts from useManagerAlerts hook:
 *   - critical: never logged in, inactive >7 days
 *   - warning:  inactive 3–7 days, blank-only sends
 *   - info:     low engagement, below-average metrics
 */

import React, { useState } from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react";

const ALERT_STYLES = {
  warn: {
    bg: "bg-red-50",
    border: "border-red-200",
    iconColor: "text-red-500",
    badgeBg: "bg-red-100",
    badgeText: "text-red-700",
    badgeBorder: "border-red-200",
    Icon: AlertTriangle,
    label: "Warn",
  },
  info: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconColor: "text-amber-500",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
    badgeBorder: "border-amber-200",
    Icon: AlertCircle,
    label: "Info",
  },
};

function AlertRow({ alert }) {
  const style = ALERT_STYLES[alert.type] || ALERT_STYLES.info;
  const { Icon } = style;
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl transition-all border ${style.bg} ${style.border}`}
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 leading-snug font-medium">{alert.message}</p>
        {alert.repEmail && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{alert.repEmail}</p>
        )}
      </div>
      <span
        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 border ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}
      >
        {alert.action}
      </span>
    </div>
  );
}

export default function AlertsPanel({ alerts, counts, loading }) {
  const [filter, setFilter] = useState("all"); // 'all' | 'warn' | 'info'

  const filtered = filter === "all" ? alerts : alerts.filter(a => a.type === filter);

  const filterButtons = [
    { key: "all", label: "All", count: counts?.total ?? 0 },
    { key: "warn", label: "Warn", count: counts?.warn ?? 0 },
    { key: "info", label: "Info", count: counts?.info ?? 0 },
  ];

  return (
    <div className="rounded-2xl p-5 border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-800">Alerts & Exceptions</h3>
        </div>
        {counts?.total > 0 && (
          <span className="text-xs font-bold bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5">
            {counts.total} alert{counts.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {filterButtons.map(btn => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === btn.key
                ? "bg-slate-100 text-slate-800 border border-slate-200"
                : "text-slate-500 border border-transparent hover:text-slate-700 hover:bg-slate-50"
              }`}
          >
            {btn.label}
            {btn.count > 0 && (
               <span className={`rounded-full text-[10px] px-1.5 py-px font-black ${btn.key === "warn" ? "bg-red-100 text-red-600" :
                  btn.key === "info" ? "bg-amber-100 text-amber-600" :
                    "bg-slate-200 text-slate-600"
                }`}>
                {btn.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 rounded-xl bg-slate-50 border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <CheckCircle className="w-8 h-8 mb-2 opacity-40 text-green-500" />
          <p className="text-sm font-medium">
            {filter === "all" ? "No alerts   all reps look good!" : `No ${filter} alerts`}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {filtered.map(alert => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}
