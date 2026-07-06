/**
 * ExecutiveSummary.jsx | KPI cards for the Ultimate Dashboard
 *
 * Shows today's high-level numbers at a glance:
 *   - Logins today
 *   - Active reps (7 days)
 *   - Emails sent today
 *   - Top performers (by engagement score)
 */

import React, { useMemo } from "react";
import { Users, Mail, TrendingUp, Activity, Star, Zap } from "lucide-react";

function KpiCard({ icon: Icon, label, value, subLabel, color, loading }) {
  return (
    <div className="relative rounded-2xl p-5 overflow-hidden border border-slate-200 bg-white shadow-sm">
      {/* Glow accent */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10 blur-2xl pointer-events-none"
        style={{ background: color }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
          {loading ? (
            <div className="h-8 w-16 rounded-lg bg-slate-100 animate-pulse" />
          ) : (
            <p className="text-3xl font-black text-slate-800 tabular-nums">{value ?? " "}</p>
          )}
          {subLabel && (
            <p className="text-xs text-slate-500 mt-1">{subLabel}</p>
          )}
        </div>
        <div
          className="p-2.5 rounded-xl border"
          style={{ background: `${color}10`, borderColor: `${color}30` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </div>
  );
}

export default function ExecutiveSummary({ repMetrics, emailVolume, dailyActivity, loading }) {
  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const loginsToday = (repMetrics || []).filter(r => r.sessionsToday > 0).length;
    const activeThisWeek = (repMetrics || []).filter(r => r.daysSinceLastLogin !== null && r.daysSinceLastLogin <= 7).length;
    const emailsToday = (emailVolume || []).find(e => e.date === today)?.emails ?? 0;
    return { loginsToday, activeThisWeek, emailsToday };
  }, [repMetrics, emailVolume, today]);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          icon={Activity}
          label="Unique Logins Today"
          value={stats.loginsToday}
          subLabel="reps online today"
          color="#4f46e5"
          loading={loading}
        />
        <KpiCard
          icon={Users}
          label="Active (7 days)"
          value={stats.activeThisWeek}
          subLabel={`of ${(repMetrics || []).filter(r => r.role === "rep").length} total reps`}
          color="#16a34a"
          loading={loading}
        />
        <KpiCard
          icon={Mail}
          label="Emails Sent Today"
          value={stats.emailsToday}
          subLabel="total successful sends"
          color="#d97706"
          loading={loading}
        />
      </div>
    </div>
  );
}

