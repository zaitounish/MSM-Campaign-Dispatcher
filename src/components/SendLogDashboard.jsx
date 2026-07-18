import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  X, RefreshCw, BarChart2, Mail, Users, Calendar, TrendingUp,
  Download, Search, ChevronDown, Filter, Inbox, User, ChevronRight,
} from "lucide-react";
import { supabase, getActiveSenders } from "../lib/supabase";

const PROMO_LABELS = {
  ads: "Ads",
  smart_campaign: "Smart Campaign",
  bogo: "BOGO",
  delivery_fee: "Free Delivery",
  discount: "Discount",
  happy_hour: "Happy Hour",
  lunch_specials: "Lunch Specials",
  loyalty: "Loyalty",
  blank: "Blank Email",
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
    blue: "bg-blue-50 text-blue-500 border-blue-100",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        <div className={`p-2 rounded-xl border ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-800">{value ?? "."}</p>
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
 * RepBreakdownPanel for manager/ultimate view
 * Shows a collapsible per-rep summary table
 */
function RepBreakdownPanel({ logs, repNames }) {
  const [expanded, setExpanded] = useState(false);

  const repStats = useMemo(() => {
    const map = {};
    logs.forEach(l => {
      const email = l.rep_email || "unknown";
      if (!map[email]) {
        map[email] = {
          email,
          name: repNames[email] || l.rep_name || email,
          total: 0,
          today: 0,
          merchants: new Set(),
        };
      }
      map[email].total++;
      const todayStr = new Date().toISOString().slice(0, 10);
      if (l.sent_at?.startsWith(todayStr)) map[email].today++;
      if (l.merchant_id) map[email].merchants.add(l.merchant_id);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [logs, repNames]);

  if (repStats.length === 0) return null;

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          <span className="font-bold text-slate-700 text-sm">Rep Activity Breakdown</span>
          <span className="text-xs bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full">{repStats.length} reps</span>
        </div>
        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-100">
              <tr>
                {["Rep", "Total Sent", "Today", "Unique Merchants"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repStats.map((rep, i) => (
                <tr key={rep.email} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {(rep.name || rep.email)[0]?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-xs">{rep.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{rep.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-lg font-bold text-slate-800">{rep.total}</span>
                    <span className="text-xs text-slate-400 ml-1">emails</span>
                  </td>
                  <td className="px-4 py-3">
                    {rep.today > 0
                      ? <span className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">{rep.today} today</span>
                      : <span className="text-xs text-slate-300">.</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-700">{rep.merchants.size}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * SendLogDashboard
 *
 * Role-based views:
 *   rep      → only their own rows (enforced by both RLS and UI filter)
 *   manager  → their team's rows (reps under their manager_id)
 *   ultimate → entire floor, all reps
 *
 * Props:
 *   userProfile | { email, role, full_name, id }
 *   onClose     | () => void
 */
export default function SendLogDashboard({ userProfile, onClose }) {
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(null);              // backend: all-time total
  const [countToday, setCountToday] = useState(null);              // backend: sent today
  const [countWeek, setCountWeek] = useState(null);                // backend: sent this week
  const [countUniqueMerchants, setCountUniqueMerchants] = useState(null); // backend: distinct merchants
  const [countActiveReps, setCountActiveReps] = useState(null);    // backend: distinct active reps
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [repFilter, setRepFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [whitelist, setWhitelist] = useState([]);
  const [whitelistLoaded, setWhitelistLoaded] = useState(false);
  const [repNames, setRepNames] = useState({});
  // Backend-sourced set of all emails that have ever sent   used for filter dropdowns
  const [activeSenders, setActiveSenders] = useState(new Set());

  const role = userProfile?.role || "rep";
  const isManager = role === "manager" || role === "ultimate";
  const isRep = role === "rep";

  useEffect(() => {
    const init = async () => {
      if (isManager) {
        const { data } = await supabase
          .from("reps_whitelist")
          .select("id, email, full_name, role, manager_id")
          .eq("is_active", true);
        if (data) {
          setWhitelist(data);
          const map = {};
          data.forEach(r => { if (r.email) map[r.email] = r.full_name || r.email; });
          setRepNames(map);
        }
      }
      // Always fetch the backend-authoritative set of active senders for filter dropdowns
      const senders = await getActiveSenders();
      setActiveSenders(senders);
      setWhitelistLoaded(true);
    };
    init();
  }, [isManager]);

  const fetchLogs = useCallback(async () => {
    if (isManager && !whitelistLoaded) return;
    setLoading(true);

    let query = supabase
      .from("email_send_log")
      .select("*")
      .order("sent_at", { ascending: false });

    if (dateFrom) query = query.gte("sent_at", dateFrom);
    if (dateTo) query = query.lte("sent_at", `${dateTo}T23:59:59.999Z`);

    if (role === "rep") {
      query = query.eq("rep_email", userProfile?.email);
    } else if (role === "manager") {
      const myTeamEmails = whitelist
        .filter(u => u.manager_id === userProfile?.id || u.email === userProfile?.email)
        .map(u => u.email);

      if (repFilter !== "all") {
        if (myTeamEmails.includes(repFilter)) {
          query = query.eq("rep_email", repFilter);
        } else {
          query = query.in("rep_email", myTeamEmails.length ? myTeamEmails : ["no-one"]);
        }
      } else {
        query = query.in("rep_email", myTeamEmails.length ? myTeamEmails : ["no-one"]);
      }
    } else if (role === "ultimate") {
      if (repFilter !== "all") {
        query = query.eq("rep_email", repFilter);
      } else if (teamFilter !== "all") {
        const teamEmails = whitelist
          .filter(u => u.manager_id === teamFilter || u.id === teamFilter)
          .map(u => u.email);
        query = query.in("rep_email", teamEmails.length ? teamEmails : ["no-one"]);
      }
    }

    const { data, error } = await query;
    if (!error && data) {
      setLogs(data);
    }
    setLoading(false);
  }, [role, repFilter, teamFilter, dateFrom, dateTo, userProfile?.email, userProfile?.id, whitelist, isManager, whitelistLoaded]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Shared scope helper ───────────────────────────────────────────────────
  // Applies the role / team / rep filter to any Supabase query so every
  // backend count stays scoped correctly to what the current user can see.
  const applyScopeFilters = useCallback((q) => {
    if (role === "rep") return q.eq("rep_email", userProfile?.email);
    if (role === "manager") {
      const emails = whitelist
        .filter(u => u.manager_id === userProfile?.id || u.email === userProfile?.email)
        .map(u => u.email);
      return q.in("rep_email", emails.length ? emails : ["no-one"]);
    }
    if (role === "ultimate") {
      if (repFilter !== "all") return q.eq("rep_email", repFilter);
      if (teamFilter !== "all") {
        const emails = whitelist
          .filter(u => u.manager_id === teamFilter || u.id === teamFilter)
          .map(u => u.email);
        return q.in("rep_email", emails.length ? emails : ["no-one"]);
      }
    }
    return q;
  }, [role, repFilter, teamFilter, userProfile?.email, userProfile?.id, whitelist]);

  // ── Backend stat counts ───────────────────────────────────────────────────
  // All counts use count:'exact', head:true — Supabase evaluates the full
  // result set server-side and returns only the integer in the response header.
  // No row data is transferred and the 1000-row page cap is completely bypassed.
  // Distinct merchant/rep counts need a lightweight column-only fetch so we can
  // deduplicate client-side (Supabase JS v2 has no SELECT DISTINCT COUNT).
  const fetchStatCounts = useCallback(async () => {
    if (isManager && !whitelistLoaded) return;

    const now = new Date();
    const todayStart = now.toISOString().slice(0, 10); // "YYYY-MM-DD" — gte matches ISO timestamps
    const weekStart  = new Date(now - 7 * 86400000).toISOString();

    // ── Five queries fired in parallel ─────────────────────────────────────
    const [allTime, today, week, merchantRows, repRows] = await Promise.all([

      // 1. All-time total (no date filter)
      applyScopeFilters(
        supabase.from("email_send_log").select("*", { count: "exact", head: true })
      ),

      // 2. Sent today
      applyScopeFilters(
        supabase.from("email_send_log").select("*", { count: "exact", head: true })
          .gte("sent_at", todayStart)
      ),

      // 3. Sent this week (last 7 days)
      applyScopeFilters(
        supabase.from("email_send_log").select("*", { count: "exact", head: true })
          .gte("sent_at", weekStart)
      ),

      // 4. Distinct merchants — fetch only merchant_id column, deduplicate below
      applyScopeFilters(
        supabase.from("email_send_log").select("merchant_id")
          .not("merchant_id", "is", null)
      ),

      // 5. Distinct active reps — fetch only rep_email column, deduplicate below
      applyScopeFilters(
        supabase.from("email_send_log").select("rep_email")
          .not("rep_email", "is", null)
      ),
    ]);

    if (!allTime.error && allTime.count !== null) setTotalCount(allTime.count);
    if (!today.error   && today.count   !== null) setCountToday(today.count);
    if (!week.error    && week.count    !== null) setCountWeek(week.count);

    if (!merchantRows.error && merchantRows.data) {
      setCountUniqueMerchants(new Set(merchantRows.data.map(r => r.merchant_id)).size);
    }
    if (!repRows.error && repRows.data) {
      setCountActiveReps(new Set(repRows.data.map(r => r.rep_email)).size);
    }
  }, [applyScopeFilters, isManager, whitelistLoaded]);

  useEffect(() => { fetchStatCounts(); }, [fetchStatCounts]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * 86400000).toISOString();

  // In-memory fallback values — used while backend counts are loading on first render
  const logsToday           = logs.filter(l => l.sent_at?.startsWith(todayStr));
  const logsWeek            = logs.filter(l => l.sent_at >= weekAgo);
  const localUniqueMerchants = new Set(logs.map(l => l.merchant_id).filter(Boolean)).size;
  const localUniqueReps      = new Set(logs.map(l => l.rep_email).filter(Boolean)).size;

  // ── Filtered display rows ──────────────────────────────────────────────────
  const filtered = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.merchant_name?.toLowerCase().includes(q) ||
      l.merchant_id?.toLowerCase().includes(q) ||
      l.to_email?.toLowerCase().includes(q) ||
      l.subject?.toLowerCase().includes(q) ||
      l.rep_name?.toLowerCase().includes(q) ||
      l.rep_email?.toLowerCase().includes(q)
    );
  });

  // ── CSV export ─────────────────────────────────────────────────────────────
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

  // Build the set of rep emails that have actually sent at least one email
  // Source of truth: activeSenders (fetched from backend, all-time, unfiltered)
  // NOTE: we keep a derived useMemo only for the fallback when activeSenders is empty
  const activeRepEmails = activeSenders;

  const repOptions = useMemo(() => {
    if (role === "rep") return [];
    let candidates;
    if (role === "manager") candidates = whitelist.filter(u => u.manager_id === userProfile?.id || u.email === userProfile?.email);
    else if (role === "ultimate") {
      if (teamFilter === "all") candidates = whitelist;
      else candidates = whitelist.filter(u => u.manager_id === teamFilter || u.id === teamFilter);
    } else {
      candidates = [];
    }
    // Only show reps/managers who have actually sent at least one email (backend source of truth)
    return candidates.filter(r => activeRepEmails.has(r.email));
  }, [whitelist, role, teamFilter, userProfile, activeRepEmails]);

  // Teams dropdown: only show a manager's team entry if at least one of their REPS
  // (not the manager themselves) has sent an email. This means a manager with
  // no assigned reps who have sent emails will NOT appear.
  const managerOptions = useMemo(() => {
    if (role !== "ultimate") return [];
    // Build a set of manager IDs that have at least one REP with a send log
    const activeManagerIds = new Set();
    whitelist.forEach(u => {
      // Only count reps (not managers)   a manager sending emails doesn't create a "team" entry
      if (u.role === "rep" && u.manager_id && activeRepEmails.has(u.email)) {
        activeManagerIds.add(u.manager_id);
      }
    });
    return whitelist.filter(u =>
      (u.role === "manager" || u.role === "ultimate") && activeManagerIds.has(u.id)
    );
  }, [whitelist, role, activeRepEmails]);

  // ── Role label for dashboard header ───────────────────────────────────────
  const dashboardSubtitle = isRep
    ? "Your personal send history"
    : role === "ultimate"
      ? "Full floor visibility all reps"
      : "Your team's activity";

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 pt-16 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl mb-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-600/20 p-2.5 rounded-xl">
              <BarChart2 className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isRep ? "My Send History" : "Send Log Dashboard"}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{dashboardSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { fetchLogs(); fetchStatCounts(); }}
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
          <div className={`grid gap-4 ${isManager ? "grid-cols-2 lg:grid-cols-5" : "grid-cols-2 lg:grid-cols-4"}`}>
            <StatCard icon={Mail}       label="Emails Today"     value={countToday            ?? logsToday.length}          color="red"    />
            <StatCard icon={TrendingUp} label="This Week"         value={countWeek             ?? logsWeek.length}           color="violet" />
            <StatCard icon={Calendar}   label="All Time"          value={totalCount            ?? logs.length}               color="green"  />
            <StatCard icon={User}       label="Unique Merchants"  value={countUniqueMerchants  ?? localUniqueMerchants}      color="amber"  />
            {isManager && (
              <StatCard icon={Users}    label="Active Reps"       value={countActiveReps       ?? localUniqueReps}           color="blue"   />
            )}
          </div>

          {/* ── Rep Breakdown (manager/ultimate only) ── */}
          {isManager && logs.length > 0 && (
            <RepBreakdownPanel logs={logs} repNames={repNames} />
          )}

          {/* ── Filters row ── */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={isRep ? "Search merchant, ID, email, subject…" : "Search rep, merchant, ID, email, subject…"}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-dd-red focus:ring-1 focus:ring-dd-red transition-all"
              />
            </div>

            {/* Date Filters */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="pl-3 pr-2 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-dd-red text-slate-600 bg-white"
                title="From Date"
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="pl-3 pr-2 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-dd-red text-slate-600 bg-white"
                title="To Date"
              />
            </div>

            {/* Team filter (ultimate only) */}
            {role === "ultimate" && managerOptions.length > 0 && (
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  value={teamFilter}
                  onChange={e => { setTeamFilter(e.target.value); setRepFilter("all"); }}
                  className="pl-9 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-dd-red appearance-none cursor-pointer bg-white"
                >
                  <option value="all">All Teams</option>
                  {managerOptions.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name || m.email}'s Team</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            )}

            {/* Rep filter (manager/ultimate only) */}
            {isManager && repOptions.length > 0 && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  value={repFilter}
                  onChange={e => setRepFilter(e.target.value)}
                  className="pl-9 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-dd-red appearance-none cursor-pointer bg-white"
                >
                  <option value="all">All Reps</option>
                  {repOptions.map(r => (
                    <option key={r.email} value={r.email}>{r.full_name || r.email}</option>
                  ))}
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

          {/* ── Detailed log table ── */}
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
                  {search ? "Try a different search term" : "Emails you send will appear here automatically"}
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
                            {log.sent_at ? new Date(log.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "."}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {log.sent_at ? new Date(log.sent_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""}
                          </p>
                        </td>
                        {isManager && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                {(repNames[log.rep_email] || log.rep_name || "?")?.[0]?.toUpperCase() || "?"}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-700 text-xs">{repNames[log.rep_email] || log.rep_name || "."}</p>
                                <p className="text-[10px] text-slate-400 truncate max-w-28">{log.rep_email}</p>
                              </div>
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 text-xs">{log.merchant_name || "."}</p>
                          {log.merchant_id && <p className="text-[10px] text-slate-400 font-mono">{log.merchant_id}</p>}
                        </td>
                        <td className="px-4 py-3 max-w-44">
                          <p className="text-xs text-slate-700 truncate font-mono">{log.to_email || "."}</p>
                          {log.cc_emails && <p className="text-[10px] text-slate-400 truncate">CC: {log.cc_emails}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(log.promo_types) && log.promo_types.length > 0
                              ? log.promo_types.map(p => <PromoTag key={p} promoId={p} />)
                              : <span className="text-[10px] text-slate-400">.</span>
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                            {METHOD_LABELS[log.delivery_method] || log.delivery_method || "."}
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
