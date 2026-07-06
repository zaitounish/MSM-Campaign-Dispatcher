/**
 * RepUtilizationTable.jsx | Per-rep metrics table for the Ultimate Dashboard
 *
 * Sortable, searchable table showing every rep's utilization metrics.
 * Columns: Rep, Last Login, Sessions Today, Emails Sent, Avg Session Duration.
 */

import React, { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, Search, Download } from "lucide-react";

function formatRelativeDate(dateStr) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
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

const COLUMNS = [
  { key: "fullName", label: "Rep", sortable: true },
  { key: "lastLogin", label: "Last Login", sortable: true },
  { key: "sessionsToday", label: "Logins Today", sortable: true, align: "center" },
  { key: "emailsSent", label: "Emails Sent", sortable: true, align: "center" },
  { key: "avgSessionDurationMinutes", label: "Avg Session", sortable: true, align: "center" },
];

export default function RepUtilizationTable({ repMetrics, rawSessions, onlineReps, userProfile, loading }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("emailsSent");
  const [sortDir, setSortDir] = useState("desc");

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const repsToDisplay = useMemo(() => {
    if (userProfile?.role === "ultimate") return repMetrics || [];
    return (repMetrics || []).filter(r => r.role === "rep");
  }, [repMetrics, userProfile]);

  const displayed = useMemo(() => {
    let rows = repsToDisplay;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.email?.toLowerCase().includes(q) ||
        r.fullName?.toLowerCase().includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (av == null) av = sortDir === "asc" ? Infinity : -Infinity;
      if (bv == null) bv = sortDir === "asc" ? Infinity : -Infinity;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [repsOnly, search, sortKey, sortDir]);

  const handleExportSummary = () => {
    const rows = displayed.map(r => ({
      "Name": r.fullName,
      "Email": r.email,
      "Logins Today": r.sessionsToday,
      "Total Sessions": r.sessionCount,
      "Avg Session (min)": r.avgSessionDurationMinutes,
      "Emails Sent": r.emailsSent,
      "Blank Emails": r.blankEmailsSent,
      "Last Login": r.lastLogin || "Never"
    }));
    exportToCsv("rep_summary.csv", rows);
  };

  const handleExportSessions = () => {
    const rows = (rawSessions || []).map(s => ({
      "Email": s.rep_email,
      "Session Start": s.session_start,
      "Session End": s.session_end || "Active",
      "Duration (min)": s.duration_minutes || ""
    }));
    exportToCsv("rep_login_history.csv", rows);
  };

  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-indigo-600" />
      : <ChevronDown className="w-3 h-3 text-indigo-600" />;
  };

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      {/* Toolbar */}
      <div className="p-4 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/50">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reps…"
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
          />
        </div>
        <span className="text-xs font-semibold text-slate-500 shrink-0">
          {displayed.length} rep{displayed.length !== 1 ? "s" : ""}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleExportSummary}
            disabled={displayed.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-800 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> Summary CSV
          </button>
          <button
            onClick={handleExportSessions}
            disabled={!rawSessions || rawSessions.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:text-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> All Logins CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 select-none ${col.sortable ? "cursor-pointer hover:text-slate-800 hover:bg-slate-100 transition-colors" : ""} ${col.align === "center" ? "text-center" : ""}`}
                >
                  <div className={`flex items-center gap-1.5 ${col.align === "center" ? "justify-center" : ""}`}>
                    {col.label}
                    {col.sortable && <SortIcon colKey={col.key} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  {COLUMNS.map(col => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-5 rounded bg-slate-100 animate-pulse" style={{ width: col.key === "fullName" ? "120px" : "60px" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-slate-500 text-sm">
                  {search ? "No reps match your search" : "No rep data available yet"}
                </td>
              </tr>
            ) : (
              displayed.map(rep => {
                const isOnline = onlineReps?.has(rep.email);
                return (
                  <tr
                    key={rep.email}
                    className="hover:bg-slate-50 transition-colors group"
                  >
                    {/* Rep name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* Online indicator */}
                        <div
                          className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-slate-300"}`}
                          title={isOnline ? "Online now" : "Offline"}
                        />
                        <div>
                          <p className="font-bold text-slate-800 truncate max-w-[200px]">{rep.fullName}</p>
                          <p className="text-xs text-slate-500 truncate max-w-[200px]">{rep.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Last login */}
                    <td className="px-4 py-3 text-sm">
                      <span className={rep.needsCheckIn ? "text-red-600 font-bold" : "text-slate-600 font-medium"}>
                        {formatRelativeDate(rep.lastLogin)}
                      </span>
                    </td>

                    {/* Logins today */}
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-slate-700">{rep.sessionsToday}</span>
                    </td>

                    {/* Emails sent */}
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-slate-700">{rep.emailsSent}</span>
                      {rep.blankEmailsSent > 0 && (
                        <span className="text-xs text-slate-400 font-medium ml-1 bg-slate-100 px-1.5 py-0.5 rounded">+{rep.blankEmailsSent}b</span>
                      )}
                    </td>

                    {/* Avg session duration */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-slate-600 font-medium">
                        {rep.avgSessionDurationMinutes > 0 ? `${rep.avgSessionDurationMinutes}m` : " "}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
