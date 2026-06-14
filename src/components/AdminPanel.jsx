import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  X, UserPlus, ShieldCheck, Users, User, Trash2,
  RefreshCw, Check, AlertCircle, Search, ToggleLeft,
  ToggleRight, Lock, Mail, Send,
} from "lucide-react";
import { supabase } from "../lib/supabase";

// ── Role configuration ──────────────────────────────────────────────────────
const ROLE_CONFIG = {
  ultimate: { label: "Ultimate", color: "bg-amber-100 text-amber-700 border-amber-200", icon: ShieldCheck },
  manager: { label: "Manager", color: "bg-violet-100 text-violet-700 border-violet-200", icon: Users },
  rep: { label: "Rep", color: "bg-slate-100 text-slate-600 border-slate-200", icon: User },
};

// ── Permission helpers ──────────────────────────────────────────────────────
// Which roles can "actor" add to the whitelist?
// TODO: Re-enable when add-user feature is brought back
// const addableRoles = (actorRole) => {
//   if (actorRole === "ultimate") return ["rep", "manager"];
//   if (actorRole === "manager") return ["rep"];
//   return [];
// };
const addableRoles = (_actorRole) => []; // temporarily disabled — no role can add users

// Can actor delete/suspend target?
const canDelete = (actorRole, targetRole) => {
  if (actorRole === "ultimate") return targetRole !== "ultimate"; // ultimate cannot delete ultimate
  return false; // managers can only ADD reps | no delete or suspend
};

// Can actor change the role of target?
const canChangeRole = (actorRole, targetRole) => {
  if (actorRole === "ultimate") return targetRole !== "ultimate"; // ultimate can change rep/manager, not ultimate
  return false; // managers cannot change roles
};

// Which roles can actor assign when changing someone's role?
const assignableRoles = (actorRole) => {
  if (actorRole === "ultimate") return ["rep", "manager"]; // cannot assign ultimate
  return [];
};

function RoleBadge({ role }) {
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.rep;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${cfg.color}`}>
      <Icon className="w-2.5 h-2.5" /> {cfg.label}
    </span>
  );
}

// ── Invitation email via GAS bridge ────────────────────────────────────────
async function sendInviteEmail({ toEmail, toName, senderName, gasUrl, toolUrl }) {
  if (!gasUrl) return { ok: false, reason: "no_gas_url" };

  const htmlBody = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#ef4444;padding:4px 16px;border-radius:8px;display:inline-block;margin-bottom:24px">
    <span style="color:white;font-weight:bold;font-size:12px;letter-spacing:1px">DOORDASH INTERNAL</span>
  </div>
  <h1 style="font-size:22px;font-weight:bold;color:#111;margin-bottom:8px">
    You've been granted access 🎉
  </h1>
  <p style="color:#444;font-size:15px;line-height:1.6;margin-bottom:20px">
    Hi ${toName || "there"},<br/><br/>
    <strong>${senderName}</strong> has added you to the <strong>MSM Campaign Dispatcher</strong> | 
    the internal tool for generating personalized merchant promo emails.
  </p>
  <a href="${toolUrl}"
     style="display:inline-block;background:#ef4444;color:white;font-weight:bold;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;margin-bottom:20px">
    Access the Tool →
  </a>
  <p style="color:#666;font-size:13px;line-height:1.6">
    <strong>How to log in:</strong><br/>
    1. Click the button above (or paste the URL into your browser)<br/>
    2. Enter <strong>${toEmail}</strong> as your email<br/>
    3. Enter the one-time code from the email we send you<br/>
    4. You're in!
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:11px">DoorDash · Merchant Success · Internal Tool</p>
</div>`;

  const plainTextBody = `You've been granted access to the MSM Campaign Dispatcher.\n\n${senderName} has added you to the tool.\n\nAccess it here: ${toolUrl}\n\nHow to log in:\n1. Visit the URL above\n2. Enter ${toEmail} as your email\n3. Enter the one-time code sent to you\n4. You're in!\n\n|DoorDash Merchant Success`;

  try {
    await fetch(gasUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "draft",
        emails: [{
          to: toEmail,
          subject: "You've been granted access to MSM Campaign Dispatcher",
          htmlBody,
          plainTextBody,
          name: senderName,
        }],
      }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ── Main component ──────────────────────────────────────────────────────────
export default function AdminPanel({ onClose, userProfile, repSettings }) {
  const actorRole = userProfile?.role || "rep";
  const senderName = `${repSettings?.firstName || ""} ${repSettings?.lastName || ""}`.trim()
    || userProfile?.full_name || "MSM Admin";
  const gasUrl = repSettings?.gasUrl || "";
  const toolUrl = window.location.origin + window.location.pathname;

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // TODO: Re-enable showAdd and add-user form state when feature is brought back
  // const [showAdd, setShowAdd] = useState(false);
  // const [newEmail, setNewEmail] = useState("");
  // const [newName, setNewName] = useState("");
  // const [newRole, setNewRole] = useState(addableRoles(actorRole)[0] || "rep");
  // const [newRepId, setNewRepId] = useState("");
  // // manager_id: for ultimate assigning a rep to a manager; for manager it auto-fills to their own ID
  // const [newManagerId, setNewManagerId] = useState("");
  // const [sendInvite, setSendInvite] = useState(true);
  // const [addError, setAddError] = useState("");
  // const [addLoading, setAddLoading] = useState(false);
  // const [addSuccess, setAddSuccess] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    // Fetch all users include manager_id for team grouping
    const { data, error: err } = await supabase
      .from("reps_whitelist")
      .select("*")
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Toggle active ─────────────────────────────────────────────────────────
  const toggleActive = async (user) => {
    if (!canDelete(actorRole, user.role)) return; // reuse canDelete for suspend too
    setSaving(user.id);
    const { error: err } = await supabase
      .from("reps_whitelist")
      .update({ is_active: !user.is_active })
      .eq("id", user.id);
    if (!err) setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    setSaving(null);
  };

  // ── Change role ───────────────────────────────────────────────────────────
  const changeRole = async (user, role) => {
    if (!canChangeRole(actorRole, user.role)) return;
    setSaving(user.id);
    const { error: err } = await supabase
      .from("reps_whitelist")
      .update({ role })
      .eq("id", user.id);
    if (!err) setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role } : u));
    setSaving(null);
  };

  // ── Delete user ───────────────────────────────────────────────────────────
  const deleteUser = async (user) => {
    if (!canDelete(actorRole, user.role)) return;
    if (!window.confirm(`Remove ${user.email} from the whitelist? They will immediately lose access.`)) return;
    setSaving(user.id);
    const { error: err } = await supabase
      .from("reps_whitelist")
      .delete()
      .eq("id", user.id);
    if (!err) setUsers(prev => prev.filter(u => u.id !== user.id));
    else setError(err.message);
    setSaving(null);
  };

  // ── Assign / reassign manager (Ultimate only) ─────────────────────────────────
  const changeManager = async (user, managerId) => {
    if (actorRole !== "ultimate") return; // only Ultimate can do this
    setSaving(user.id);
    const { error: err } = await supabase
      .from("reps_whitelist")
      .update({ manager_id: managerId || null })
      .eq("id", user.id);
    if (!err) setUsers(prev => prev.map(u => u.id === user.id ? { ...u, manager_id: managerId || null } : u));
    setSaving(null);
  };

  // TODO: Re-enable handleAddUser when add-user feature is brought back
  // ── Add user ──────────────────────────────────────────────────────────────
  // const handleAddUser = async (e) => {
  //   e.preventDefault();
  //   const email = newEmail.trim().toLowerCase();
  //   if (!email) { setAddError("Email is required."); return; }
  //   if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAddError("Enter a valid email address."); return; }
  //   if (!addableRoles(actorRole).includes(newRole)) { setAddError("You cannot assign this role."); return; }
  //
  //   setAddLoading(true);
  //   setAddError("");
  //   setAddSuccess("");
  //
  //   const { data, error: err } = await supabase
  //     .from("reps_whitelist")
  //     .insert({
  //       email,
  //       full_name: newName.trim() || null,
  //       role: newRole,
  //       rep_id: newRepId.trim() || null,
  //       is_active: true,
  //       // Only Ultimate can assign a rep to a manager.
  //       // Managers adding reps do NOT auto-assign themselves that is
  //       // exclusively an Ultimate admin action.
  //       manager_id: actorRole === "ultimate" ? (newManagerId || null) : null,
  //     })
  //     .select()
  //     .single();
  //
  //   if (err) {
  //     setAddLoading(false);
  //     setAddError(err.code === "23505"
  //       ? "This email is already in the whitelist."
  //       : err.message);
  //     return;
  //   }
  //
  //   setUsers(prev => [data, ...prev]);
  //
  //   // Send invitation email via GAS bridge
  //   let inviteNote = "";
  //   if (sendInvite) {
  //     if (!gasUrl) {
  //       inviteNote = " (invitation not sent | no GAS URL configured in Settings)";
  //     } else {
  //       const result = await sendInviteEmail({
  //         toEmail: email,
  //         toName: newName.trim() || "",
  //         senderName,
  //         gasUrl,
  //         toolUrl,
  //       });
  //       inviteNote = result.ok
  //         ? " · Invitation pushed to your Gmail Drafts ✓"
  //         : " · Invitation email failed | check your GAS URL in Settings";
  //     }
  //   }
  //
  //   setAddSuccess(`${email} added as ${ROLE_CONFIG[newRole].label}${inviteNote}`);
  //   setAddLoading(false);
  //   setNewEmail(""); setNewName(""); setNewRole(addableRoles(actorRole)[0] || "rep"); setNewRepId(""); setNewManagerId("");
  //   setTimeout(() => { setShowAdd(false); setAddSuccess(""); }, 4000);
  // };

  // Build a manager lookup for the table display
  const managerLookup = useMemo(() => {
    const map = {};
    users.forEach(u => { if (u.role === "manager" || u.role === "ultimate") map[u.id] = u.full_name || u.email; });
    return map;
  }, [users]);

  // Managers listed for the "assign to manager" dropdown (ultimate only)
  const managerUsers = useMemo(() => users.filter(u => u.role === "manager"), [users]);

  const filtered = users.filter(u =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.rep_id?.toLowerCase().includes(search.toLowerCase())
  );

  // Manager view: only show their reps + themselves
  const visibleUsers = actorRole === "manager"
    ? filtered.filter(u => u.id === userProfile?.id || u.manager_id === userProfile?.id)
    : filtered;

  const stats = { ultimate: 0, manager: 0, rep: 0 };
  users.filter(u => u.is_active).forEach(u => { if (stats[u.role] !== undefined) stats[u.role]++; });

  const canAddUsers = addableRoles(actorRole).length > 0;

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 pt-16 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl mb-8 overflow-hidden">

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
            <button onClick={fetchUsers} className="p-2 text-amber-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 text-amber-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6">

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {["rep", "manager", "ultimate"].map(role => {
              const cfg = ROLE_CONFIG[role];
              const Icon = cfg.icon;
              return (
                <div key={role} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                  <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border mb-2 ${cfg.color}`}>
                    <Icon className="w-3 h-3" /> {cfg.label}
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{stats[role]}</p>
                  <p className="text-xs text-slate-400">active</p>
                </div>
              );
            })}
          </div>

          {/* Your role notice */}
          {/* TODO: Re-enable manager notice when add-user feature is brought back */}
          {/* {actorRole === "manager" && (
            <div className="flex items-center gap-2 text-xs bg-violet-50 border border-violet-200 text-violet-700 rounded-xl px-4 py-3">
              <Users className="w-3.5 h-3.5 shrink-0" />
              As a Manager, you can <strong>add Reps</strong> only. Suspending, deleting, or changing roles requires an Ultimate admin.
            </div>
          )} */}

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
            {/* TODO: Re-enable Add User button when feature is brought back */}
            {/* {canAddUsers && (
              <button
                onClick={() => setShowAdd(v => !v)}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-amber-200"
              >
                <UserPlus className="w-4 h-4" />
                {showAdd ? "Cancel" : "Add User"}
              </button>
            )} */}
          </div>

          {/* TODO: Re-enable success banner and add-user form when feature is brought back */}
          {/* Success banner */}
          {/* {addSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <Check className="w-4 h-4 shrink-0" /> {addSuccess}
            </div>
          )} */}

          {/* Add user form */}
          {/* {showAdd && canAddUsers && (
            <form onSubmit={handleAddUser}
              className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-bold text-amber-900 text-sm">New Whitelist Entry</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">Email *</label>
                  <input
                    type="email" value={newEmail}
                    onChange={e => { setNewEmail(e.target.value); setAddError(""); }}
                    placeholder="rep@doordash.com"
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">Full Name</label>
                  <input
                    value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="First Last"
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">
                    Role
                    {actorRole === "manager" && <span className="ml-1 text-amber-600 font-normal">(managers can only add Reps)</span>}
                  </label>
                  <select
                    value={newRole} onChange={e => setNewRole(e.target.value)}
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white appearance-none cursor-pointer"
                  >
                    {addableRoles(actorRole).map(r => (
                      <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">Rep ID (optional)</label>
                  <input
                    value={newRepId} onChange={e => setNewRepId(e.target.value)}
                    placeholder="Salesforce rep ID"
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white font-mono"
                  />
                </div>
                {actorRole === "ultimate" && newRole === "rep" && managerUsers.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-amber-800 mb-1">Assign to Manager (optional)</label>
                    <select
                      value={newManagerId}
                      onChange={e => setNewManagerId(e.target.value)}
                      className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white appearance-none cursor-pointer"
                    >
                      <option value="">No manager assigned</option>
                      {managerUsers.map(m => (
                        <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setSendInvite(v => !v)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${sendInvite ? "bg-amber-500" : "bg-slate-300"}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${sendInvite ? "translate-x-5" : "translate-x-1"}`} />
                </div>
                <div>
                  <p className="text-xs font-bold text-amber-900">
                    Send invitation email <Mail className="inline w-3 h-3 ml-0.5" />
                  </p>
                  <p className="text-[10px] text-amber-700">
                    {gasUrl
                      ? "Pushes a welcome email to your Gmail Drafts via GAS bridge"
                      : "⚠ Requires GAS URL in Settings to work"}
                  </p>
                </div>
              </label>

              {addError && (
                <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {addError}
                </div>
              )}
              <button
                type="submit" disabled={addLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50"
              >
                {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Add to Whitelist{sendInvite ? " & Send Invite" : ""}
              </button>
            </form>
          )} */}

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
                    {["User", "Role", "Rep ID", actorRole !== "rep" && "Manager", "Status", "Added", "Actions"].filter(Boolean).map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user, i) => {
                    const isUltimate = user.role === "ultimate";
                    const isBusy = saving === user.id;
                    const deletable = canDelete(actorRole, user.role);
                    const roleChange = canChangeRole(actorRole, user.role);

                    return (
                      <tr key={user.id}
                        className={`border-b border-slate-100 transition-colors ${isBusy ? "opacity-50" : "hover:bg-slate-50"} ${i % 2 === 0 ? "" : "bg-slate-50/30"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isUltimate && <Lock className="w-3 h-3 text-amber-500 shrink-0" title="Ultimate | protected" />}
                            <div>
                              <p className="font-bold text-slate-800 text-xs">{user.full_name || "|"}</p>
                              <p className="text-[10px] text-slate-500 font-mono">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {roleChange ? (
                            <select
                              value={user.role || "rep"}
                              onChange={e => changeRole(user, e.target.value)}
                              disabled={isBusy}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white appearance-none cursor-pointer outline-none focus:border-amber-400"
                            >
                              {assignableRoles(actorRole).map(r => (
                                <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                              ))}
                            </select>
                          ) : (
                            <RoleBadge role={user.role} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-slate-500">{user.rep_id || "."}</span>
                        </td>
                        {/* Manager column Ultimate: editable dropdown for reassignment; Manager: read-only badge */}
                        {actorRole !== "rep" && (
                          <td className="px-4 py-3">
                            {actorRole === "ultimate" && user.role === "rep" ? (
                              // Ultimate sees a dropdown to assign/reassign this rep to any manager
                              <select
                                value={user.manager_id || ""}
                                onChange={e => changeManager(user, e.target.value)}
                                disabled={isBusy}
                                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white appearance-none cursor-pointer outline-none focus:border-amber-400 max-w-[140px] truncate"
                                title="Assign to manager"
                              >
                                <option value="">. Unassigned .</option>
                                {managerUsers.map(m => (
                                  <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                ))}
                              </select>
                            ) : (
                              // Manager sees a read-only badge (or dash if unassigned)
                              user.manager_id && managerLookup[user.manager_id]
                                ? <span className="text-xs text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full font-semibold">{managerLookup[user.manager_id]}</span>
                                : <span className="text-[10px] text-slate-300">.</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          {deletable ? (
                            <button
                              onClick={() => toggleActive(user)}
                              disabled={isBusy}
                              className="flex items-center gap-1.5 text-xs font-bold transition-colors"
                            >
                              {user.is_active
                                ? <><ToggleRight className="w-5 h-5 text-green-500" /><span className="text-green-700">Active</span></>
                                : <><ToggleLeft className="w-5 h-5 text-slate-400" /><span className="text-slate-500">Inactive</span></>
                              }
                            </button>
                          ) : (
                            <span className={`text-xs font-bold ${user.is_active ? "text-green-700" : "text-slate-400"}`}>
                              {user.is_active ? "Active" : "Inactive"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                          {user.created_at
                            ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "|"}
                        </td>
                        <td className="px-4 py-3">
                          {isUltimate ? (
                            <span className="text-[10px] text-amber-600 flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Protected
                            </span>
                          ) : deletable ? (
                            <button
                              onClick={() => deleteUser(user)}
                              disabled={isBusy}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                              title="Remove from whitelist"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">|</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Ultimate protection notice */}
          {/* <p className="text-xs text-slate-400 text-center">
            🔒 Ultimate accounts are protected | they can only be added or removed directly in Supabase.
          </p> */}
        </div>
      </div>
    </div>
  );
}
