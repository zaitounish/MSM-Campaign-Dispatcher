import React, { useState, useEffect, useCallback } from "react";
import {
  X, RefreshCw, BarChart2, Mail, Users, Calendar, TrendingUp,
  Download, Search, ChevronDown, Filter, Inbox,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const PROMO_LABELS = {
  ads: "Ads",
  smart_campaign: "Smart Campaign",
  bogo: "BOGO",
  delivery_fee: "Free Delivery",
  discount: "Discount",
  happy_hour: "Happy Hour",
  lunch_specials: "Lunch Specials",
  loyalty: "Loyalty",
};

const METHOD_LABELS = {
  gmail_tab: "Gmail Tab",
  gas_draft: "GAS Draft",
  gas_send: "GAS Send",
};

function StatCard({ icon: Icon, label, value, sub, color = "red" }) {
  const colors = {
    red: "bg-red-50 text-red-500 border-red-100",
    violet: "bg-violet-50 text-violet-500 border-violet-100",
    green: "bg-green-50 text-green-500 border-green-100",
    amber: "bg-amber-50 text-amber-500 border-amber-100",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        <div className={`p-2 rounded-xl border ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-800">{value ?? "|"}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function PromoTag({ promoId }) {
  const label = PROMO_LABELS[promoId] || promoId;
  const colors = {
    ads: "bg-blue-50 text-blue-700 border-blue-200",
    smart_campaign: "bg-violet-50 text-violet-700 border-violet-200",
    bogo: "bg-green-50 text-green-700 border-green-200",
    delivery_fee: "bg-teal-50 text-teal-700 border-teal-200",
    discount: "bg-orange-50 text-orange-700 border-orange-200",
    happy_hour: "bg-yellow-50 text-yellow-700 border-yellow-200",
    lunch_specials: "bg-lime-50 text-lime-700 border-lime-200",
    loyalty: "bg-pink-50 text-pink-700 border-pink-200",
  };
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${colors[promoId] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {label}
    </span>
  );
}

/**
 * SendLogDashboard
 *
 * Shown to manager + ultimate users from the Header "Dashboard" button.
 * Rep view: only their own rows (enforced by Supabase RLS).
 * Manager/Ultimate: all rows.
 *
 * Props:
 *   userProfile | { email, role, full_name }
 *   onClose     | () => void
 */
export default function SendLogDashboard({ userProfile, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [repFilter, setRepFilter] = useState("all");
  const [reps, setReps] = useState([]);    // distinct rep emails for filter

  const isManager = userProfile?.role === "manager" || userProfile?.role === "ultimate";

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("email_send_log")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(500);

    // RLS enforces this on the server too | this is just for the UI filter
    if (!isManager) {
      query = query.eq("rep_email", userProfile?.email);
    } else if (repFilter !== "all") {
      query = query.eq("rep_email", repFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLogs(data);
      // Collect unique reps for the filter dropdown
      const uniqueReps = [...new Set(data.map(r => r.rep_email).filter(Boolean))];
      setReps(uniqueReps);
    }
    setLoading(false);
  }, [isManager, repFilter, userProfile?.email]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * 86400000).toISOString();

  const logsToday = logs.filter(l => l.sent_at?.startsWith(todayStr));
  const logsWeek = logs.filter(l => l.sent_at >= weekAgo);
  const uniqueMerchants = new Set(logs.map(l => l.merchant_id).filter(Boolean)).size;

  // ── Filtered display rows ─────────────────────────────────────────────────
  const filtered = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.merchant_name?.toLowerCase().includes(q) ||
      l.to_email?.toLowerCase().includes(q) ||
      l.subject?.toLowerCase().includes(q) ||
      l.rep_name?.toLowerCase().includes(q) ||
      l.rep_email?.toLowerCase().includes(q)
    );
  });

  // ── CSV export ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const cols = ["sent_at", "rep_name", "rep_email", "merchant_name", "merchant_id",
      "to_email", "cc_emails", "subject", "promo_types", "delivery_method", "email_format"];
    const header = cols.join(",");
    const rows = filtered.map(r =>
      cols.map(c => {
        const v = Array.isArray(r[c]) ? r[c].join(";") : (r[c] ?? "");
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `send-log-${todayStr}.csv` });
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 pt-16 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl mb-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-600/20 p-2.5 rounded-xl">
              <BarChart2 className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Send Log Dashboard</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isManager ? "Team-wide activity" : "Your personal send history"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchLogs}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-8">

          {/* ── Stats grid ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Mail} label="Emails Today" value={logsToday.length} color="red" />
            <StatCard icon={TrendingUp} label="This Week" value={logsWeek.length} color="violet" />
            <StatCard icon={Calendar} label="All Time" value={logs.length} color="green" />
            <StatCard icon={Users} label="Unique Merchants" value={uniqueMerchants} color="amber" />
          </div>

          {/* ── Filters ── */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search merchant, email, subject…"
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-dd-red focus:ring-1 focus:ring-dd-red transition-all"
              />
            </div>

            {/* Rep filter (manager/ultimate only) */}
            {isManager && reps.length > 1 && (
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  value={repFilter}
                  onChange={e => setRepFilter(e.target.value)}
                  className="pl-9 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-dd-red appearance-none cursor-pointer bg-white"
                >
                  <option value="all">All Reps</option>
                  {reps.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            )}

            {/* Export */}
            <button
              onClick={exportCSV}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-sm font-semibold text-slate-700 rounded-xl transition-colors disabled:opacity-40"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>

          {/* ── Table ── */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-3" /> Loading logs…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Inbox className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-slate-500 font-semibold">No send events found</p>
                <p className="text-xs text-slate-400 mt-1">
                  {search ? "Try a different search term" : "Emails you send will appear here"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {["Time", isManager && "Rep", "Merchant", "To", "Promos", "Method"].filter(Boolean).map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log, i) => (
                      <tr key={log.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/30"}`}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-semibold text-slate-800 text-xs">
                            {log.sent_at ? new Date(log.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "|"}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {log.sent_at ? new Date(log.sent_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""}
                          </p>
                        </td>
                        {isManager && (
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-700 text-xs">{log.rep_name || "|"}</p>
                            <p className="text-[10px] text-slate-400 truncate max-w-28">{log.rep_email}</p>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 text-xs">{log.merchant_name || "|"}</p>
                          {log.merchant_id && <p className="text-[10px] text-slate-400 font-mono">{log.merchant_id}</p>}
                        </td>
                        <td className="px-4 py-3 max-w-44">
                          <p className="text-xs text-slate-700 truncate font-mono">{log.to_email || "|"}</p>
                          {log.cc_emails && <p className="text-[10px] text-slate-400 truncate">CC: {log.cc_emails}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(log.promo_types) && log.promo_types.length > 0
                              ? log.promo_types.map(p => <PromoTag key={p} promoId={p} />)
                              : <span className="text-[10px] text-slate-400">|</span>
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                            {METHOD_LABELS[log.delivery_method] || log.delivery_method || "|"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
                  Showing {filtered.length} of {logs.length} events
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
