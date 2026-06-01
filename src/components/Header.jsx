import React, { useState } from "react";
import { Mail, Settings, LogOut, BarChart2, ShieldCheck, Users, User, ChevronDown } from "lucide-react";

const ROLE_CONFIG = {
  ultimate: { label: "Ultimate",  color: "bg-amber-100 text-amber-700 border-amber-200",  icon: ShieldCheck },
  manager:  { label: "Manager",   color: "bg-violet-100 text-violet-700 border-violet-200", icon: Users },
  rep:      { label: "Rep",       color: "bg-slate-100 text-slate-600 border-slate-200",   icon: User },
};

export default function Header({ onOpenSettings, onOpenDashboard, onOpenAdmin, userProfile, onSignOut }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const role   = userProfile?.role || "rep";
  const cfg    = ROLE_CONFIG[role] || ROLE_CONFIG.rep;
  const RoleIcon = cfg.icon;
  const initials = userProfile?.full_name
    ? userProfile.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : (userProfile?.email?.[0] || "?").toUpperCase();

  return (
    <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <div className="bg-dd-red p-2.5 rounded-xl shadow-sm">
          <Mail className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-tight">
            MSM Campaign Dispatcher
          </h1>
          <p className="text-xs text-slate-500 font-medium tracking-wide">
            Automated Promo Pitch &amp; Deep Link Generator
          </p>
        </div>
      </div>

      {/* Right: actions + user menu */}
      <div className="flex items-center gap-2">
        {/* Admin button (ultimate = gold, manager = violet) */}
        {(role === "ultimate" || role === "manager") && onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors border ${
              role === "ultimate"
                ? "text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                : "text-violet-700 bg-violet-50 hover:bg-violet-100 border-violet-200"
            }`}
            title="Manage Access"
          >
            <ShieldCheck className="w-4 h-4" /> {role === "ultimate" ? "Admin" : "Manage Reps"}
          </button>
        )}

        {/* Dashboard button (manager + ultimate only) */}
        {(role === "manager" || role === "ultimate") && onOpenDashboard && (
          <button
            onClick={onOpenDashboard}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors border border-slate-200"
            title="Send Log Dashboard"
          >
            <BarChart2 className="w-4 h-4" /> Dashboard
          </button>
        )}

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors border border-slate-200"
          title="Rep Settings"
        >
          <Settings className="w-4 h-4" /> Settings
        </button>

        {/* User avatar dropdown */}
        {userProfile && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
            >
              {/* Avatar circle */}
              <div className="w-8 h-8 rounded-full bg-dd-red flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-bold text-slate-800 leading-tight">
                  {userProfile.full_name || userProfile.email}
                </p>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.color}`}>
                  <RoleIcon className="w-2.5 h-2.5" /> {cfg.label}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen && (
              <>
                {/* Click-away backdrop */}
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                {/* Dropdown */}
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-xs text-slate-500">Signed in as</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{userProfile.email}</p>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border mt-1 ${cfg.color}`}>
                      <RoleIcon className="w-2.5 h-2.5" /> {cfg.label} Access
                    </span>
                  </div>
                  {onSignOut && (
                    <button
                      onClick={() => { setMenuOpen(false); onSignOut(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors font-semibold"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
