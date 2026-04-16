import React from "react";
import { Mail, Settings } from "lucide-react";

export default function Header({ onOpenSettings }) {
  return (
    <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-dd-red p-2.5 rounded-xl shadow-sm">
          <Mail className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-tight">
            MSM Campaign Dispatcher
          </h1>
          <p className="text-xs text-slate-500 font-medium tracking-wide placeholder-text">
            Automated Promo Pitch & Deep Link Generator
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors border border-slate-200"
          title="Rep Settings"
        >
          <Settings className="w-4 h-4" /> Settings
        </button>
      </div>
    </header>
  );
}
