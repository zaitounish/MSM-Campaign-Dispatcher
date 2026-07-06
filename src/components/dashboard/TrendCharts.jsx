/**
 * TrendCharts.jsx | Trend visualizations for the Ultimate Dashboard
 *
 * Charts:
 *   1. Daily Active Reps   line chart
 *   2. Email Volume   bar chart
 *   3. Promo Type Distribution   pie chart
 *   4. Feature Adoption   horizontal bar chart
 */

import React from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { TrendingUp, BarChart2, PieChart as PieIcon, Layers } from "lucide-react";

const PROMO_COLORS = {
  discount: "#4f46e5", // indigo-600
  free_delivery: "#16a34a", // green-600
  bogo: "#d97706", // amber-600
  blank: "#94a3b8", // slate-400
  loyalty: "#db2777", // pink-600
};
const DEFAULT_PROMO_COLOR = "#7c3aed"; // violet-600

const FEATURE_COLORS = [
  "#4f46e5", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0d9488",
];

const AXIS_COLOR = "#64748b"; // slate-500
const GRID_COLOR = "#f1f5f9"; // slate-100
const TEXT_COLOR = "#64748b"; // slate-500

function ChartCard({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl p-5 border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <Icon className="w-4 h-4 text-indigo-600" />
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
      {label && <p className="text-slate-500 mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="font-bold" style={{ color: entry.color || entry.fill }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function EmptyChart({ message = "No data available yet" }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-2">
      <BarChart2 className="w-8 h-8 opacity-20" />
      <span>{message}</span>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Chart 1: Daily Active Reps ────────────────────────────────────────────────
function DailyActiveRepsChart({ data }) {
  if (!data || data.length === 0) return <EmptyChart />;
  const chartData = data.map(d => ({ ...d, dateLabel: formatDate(d.date) }));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey="dateLabel" tick={{ fill: TEXT_COLOR, fontSize: 10 }} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
        <YAxis tick={{ fill: TEXT_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="activeReps"
          name="Active Reps"
          stroke="#4f46e5"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#4f46e5", stroke: "#fff", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Chart 2: Email Volume ─────────────────────────────────────────────────────
function EmailVolumeChart({ data }) {
  if (!data || data.length === 0) return <EmptyChart />;
  const chartData = data.map(d => ({ ...d, dateLabel: formatDate(d.date) }));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey="dateLabel" tick={{ fill: TEXT_COLOR, fontSize: 10 }} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
        <YAxis tick={{ fill: TEXT_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="emails" name="Emails Sent" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart 3: Promo Type Distribution ─────────────────────────────────────────
function PromoDistributionChart({ data }) {
  if (!data || data.length === 0) return <EmptyChart />;

  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700}>{`${(percent * 100).toFixed(0)}%`}</text>;
  };

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={60}
            dataKey="value" labelLine={false} label={renderLabel}>
            {data.map((entry, i) => (
              <Cell key={i} fill={PROMO_COLORS[entry.name] || DEFAULT_PROMO_COLOR} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {data.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PROMO_COLORS[entry.name] || DEFAULT_PROMO_COLOR }} />
            <span className="text-xs text-slate-600 truncate capitalize">{entry.name.replace(/_/g, " ")}</span>
            <span className="text-xs font-bold text-slate-800 ml-auto">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chart 4: Feature Usage ────────────────────────────────────────────────────
function FeatureUsageChart({ data }) {
  if (!data || data.length === 0) return <EmptyChart />;
  const top = data.slice(0, 7);
  const max = Math.max(1, ...top.map(d => d.count));
  return (
    <div className="space-y-2">
      {top.map((entry, i) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600 w-32 truncate capitalize shrink-0">{entry.name.replace(/_/g, " ")}</span>
          <div className="flex-1 h-3.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(entry.count / max) * 100}%`, background: FEATURE_COLORS[i % FEATURE_COLORS.length] }}
            />
          </div>
          <span className="text-xs font-bold text-slate-800 w-8 text-right shrink-0">{entry.count}</span>
        </div>
      ))}
    </div>
  );
}

function exportToCsv(filename, rows) {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]);
  const csvContent = [
    keys.join(","),
    ...rows.map(row =>
      keys.map(k => {
        let cell = row[k] === null || row[k] === undefined ? "" : String(row[k]);
        cell = cell.replace(/"/g, '""');
        if (cell.search(/("|,|\n)/g) >= 0) cell = `"${cell}"`;
        return cell;
      }).join(",")
    )
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function TrendCharts({ dailyActivity, emailVolume, promoDistribution, featureUsage, daysBack, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl p-5 border border-slate-200 h-52 bg-slate-50 animate-pulse shadow-sm" />
        ))}
      </div>
    );
  }

  const handleExport = () => {
    // Combine DAU and Email Volume by date
    const dateMap = {};
    (dailyActivity || []).forEach(d => {
      dateMap[d.date] = { date: d.date, activeReps: d.activeReps, emailsSent: 0 };
    });
    (emailVolume || []).forEach(d => {
      if (!dateMap[d.date]) dateMap[d.date] = { date: d.date, activeReps: 0, emailsSent: 0 };
      dateMap[d.date].emailsSent = d.emails;
    });

    const rows = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    exportToCsv("trend_activity.csv", rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-800 rounded-lg transition-colors shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Export Trends CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard icon={TrendingUp} title={`Daily Active Reps (last ${daysBack || 30} days)`}>
          <DailyActiveRepsChart data={dailyActivity} />
        </ChartCard>

        <ChartCard icon={BarChart2} title={`Email Volume (last ${daysBack || 30} days)`}>
          <EmailVolumeChart data={emailVolume} />
        </ChartCard>

        <ChartCard icon={PieIcon} title="Promo Type Distribution">
          <PromoDistributionChart data={promoDistribution} />
        </ChartCard>

        <ChartCard icon={Layers} title="Feature Usage">
          <FeatureUsageChart data={featureUsage} />
        </ChartCard>
      </div>
    </div>
  );
}
