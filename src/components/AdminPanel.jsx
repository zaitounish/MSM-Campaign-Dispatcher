import React, { useState, useEffect, useCallback } from "react";
import {
  X, UserPlus, ShieldCheck, Users, User, Trash2,
  RefreshCw, Check, AlertCircle, Search, ToggleLeft, ToggleRight, Edit2,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const ROLES = ["rep", "manager", "ultimate"];

const ROLE_CONFIG = {
  ultimate: { label: "Ultimate",  color: "bg-amber-100 text-amber-700 border-amber-200",  icon: ShieldCheck },
  manager:  { label: "Manager",   color: "bg-violet-100 text-violet-700 border-violet-200", icon: Users },
  rep:      { label: "Rep",       color: "bg-slate-100 text-slate-600 border-slate-200",   icon: User },
};

function RoleBadge({ role }) {
  const cfg    = ROLE_CONFIG[role] || ROLE_CONFIG.rep;
  const Icon   = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${cfg.color}`}>
      <Icon className="w-2.5 h-2.5" /> {cfg.label}
    </span>
  );
}

/**
 * AdminPanel — visible to "ultimate" role only.
 *
 * Capabilities:
 * - View all reps in the whitelist
 * - Add new rep (email, name, role, rep_id)
 * - Toggle is_active (suspend without deleting)
 * - Change role
 * - Delete entry (irreversible)
 */
export default function AdminPanel({ onClose }) {
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(null);  // id of row being saved
  const [error,    setError]    = useState("");
  const [search,   setSearch]   = useState("");
  const [showAdd,  setShowAdd]  = useState(false);

  // New user form state
  const [newEmail,   setNewEmail]   = useState("");
  const [newName,    setNewName]    = useState("");
  const [newRole,    setNewRole]    = useState("rep");
  const [newRepId,   setNewRepId]   = useState("");
  const [addError,   setAddError]   = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("reps_whitelist")
      .select("*")
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Toggle active status ────────────────────────────────────────────────
  const toggleActive = async (user) => {
    setSaving(user.id);
    const { error: err } = await supabase
      .from("reps_whitelist")
      .update({ is_active: !user.is_active })
      .eq("id", user.id);
    if (!err) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    }
    setSaving(null);
  };

  // ── Change role ────────────────────────────────────────────────────────
  const changeRole = async (user, newRole) => {
    setSaving(user.id);
    const { error: err } = await supabase
      .from("reps_whitelist")
      .update({ role: newRole })
      .eq("id", user.id);
    if (!err) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    }
    setSaving(null);
  };

  // ── Delete user ────────────────────────────────────────────────────────
  const deleteUser = async (user) => {
    if (!window.confirm(`Remove ${user.email} from the whitelist? They will immediately lose access.`)) return;
    setSaving(user.id);
    const { error: err } = await supabase
      .from("reps_whitelist")
      .delete()
      .eq("id", user.id);
    if (!err) {
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } else {
      setError(err.message);
    }
    setSaving(null);
  };

  // ── Add new user ───────────────────────────────────────────────────────
  const handleAddUser = async (e) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) { setAddError("Email is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAddError("Please enter a valid email."); return; }

    setAddLoading(true);
    setAddError("");

    const { data, error: err } = await supabase
      .from("reps_whitelist")
      .insert({
        email,
        full_name: newName.trim() || null,
        role:      newRole,
        rep_id:    newRepId.trim() || null,
        is_active: true,
      })
      .select()
      .single();

    setAddLoading(false);

    if (err) {
      if (err.code === "23505") {
        setAddError("This email is already in the whitelist.");
      } else {
        setAddError(err.message);
      }
      return;
    }

    setUsers(prev => [data, ...prev]);
    setNewEmail(""); setNewName(""); setNewRole("rep"); setNewRepId("");
    setShowAdd(false);
  };

  const filtered = users.filter(u =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.rep_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 pt-16 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl mb-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Access Management</h2>
              <p className="text-xs text-amber-100 mt-0.5">Manage who can use the Campaign Dispatcher</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchUsers}
              className="p-2 text-amber-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose}
              className="p-2 text-amber-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {ROLES.map(role => {
              const count = users.filter(u => u.role === role && u.is_active).length;
              const cfg = ROLE_CONFIG[role];
              const Icon = cfg.icon;
              return (
                <div key={role} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                  <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border mb-2 ${cfg.color}`}>
                    <Icon className="w-3 h-3" /> {cfg.label}
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{count}</p>
                  <p className="text-xs text-slate-400">active</p>
                </div>
              );
            })}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by email, name, or rep ID…"
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
              />
            </div>
            <button
              onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-amber-200"
            >
              <UserPlus className="w-4 h-4" />
              {showAdd ? "Cancel" : "Add User"}
            </button>
          </div>

          {/* Add user form */}
          {showAdd && (
            <form onSubmit={handleAddUser}
              className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <h3 className="font-bold text-amber-900 text-sm">New Whitelist Entry</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">Email *</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => { setNewEmail(e.target.value); setAddError(""); }}
                    placeholder="rep@doordash.com"
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">Full Name</label>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="First Last"
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white appearance-none cursor-pointer"
                  >
                    <option value="rep">Rep</option>
                    <option value="manager">Manager</option>
                    <option value="ultimate">Ultimate</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">Rep ID (optional)</label>
                  <input
                    value={newRepId}
                    onChange={e => setNewRepId(e.target.value)}
                    placeholder="Salesforce rep ID"
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white font-mono"
                  />
                </div>
              </div>
              {addError && (
                <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {addError}
                </div>
              )}
              <button
                type="submit"
                disabled={addLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50"
              >
                {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Add to Whitelist
              </button>
            </form>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* User table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-3" /> Loading users…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-slate-500 font-semibold">No users found</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["User", "Role", "Rep ID", "Status", "Added", "Actions"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user, i) => {
                    const isBusy = saving === user.id;
                    return (
                      <tr key={user.id}
                        className={`border-b border-slate-100 transition-colors ${isBusy ? "opacity-50" : "hover:bg-slate-50"} ${i % 2 === 0 ? "" : "bg-slate-50/30"}`}>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800 text-xs">{user.full_name || "—"}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{user.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={user.role || "rep"}
                            onChange={e => changeRole(user, e.target.value)}
                            disabled={isBusy}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white appearance-none cursor-pointer outline-none focus:border-amber-400"
                          >
                            {ROLES.map(r => <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-slate-500">{user.rep_id || "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleActive(user)}
                            disabled={isBusy}
                            className="flex items-center gap-1.5 text-xs font-bold transition-colors"
                          >
                            {user.is_active
                              ? <><ToggleRight className="w-5 h-5 text-green-500" /><span className="text-green-700">Active</span></>
                              : <><ToggleLeft  className="w-5 h-5 text-slate-400" /><span className="text-slate-500">Inactive</span></>
                            }
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                          {user.created_at
                            ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => deleteUser(user)}
                            disabled={isBusy}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                            title="Remove from whitelist"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
