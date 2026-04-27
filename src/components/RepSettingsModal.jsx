import React, { useState } from "react";
import { User, Mail, Database, Phone, Settings, Save, AlertCircle, Sparkles } from "lucide-react";

export default function RepSettingsModal({ isOpen, onClose, repSettings, setRepSettings }) {
  const [formData, setFormData] = useState({
    firstName:     repSettings.firstName     || "",
    lastName:      repSettings.lastName      || "",
    title:         repSettings.title         || "Merchant Success",
    phone:         repSettings.phone         || "",
    repId:         repSettings.repId         || "",
    gasUrl:        repSettings.gasUrl        || "",
    geminiApiKey:  repSettings.geminiApiKey  || "",
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    setRepSettings(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
          <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-200">
            <Settings className="w-6 h-6 text-slate-700" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Rep Configuration</h2>
            <p className="text-sm text-slate-500 font-medium">Saved locally in your browser. Used for emails and deep links.</p>
          </div>
        </div>

        <div className="p-8 space-y-6">
          
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Email Signature</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-slate-400" /> First Name
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="e.g. Jane"
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-slate-400" /> Last Name
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="e.g. Doe"
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-slate-400" /> Title
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-slate-400" /> Phone Number
                </label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-slate-100 my-4"></div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
               System Integration
            </h3>
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-slate-400" /> Assisted Rep ID (Salesforce)
              </label>
              <input
                type="text"
                name="repId"
                value={formData.repId}
                onChange={handleChange}
                placeholder="e.g. 0053h00000A1b2c"
                className="w-full bg-slate-50 border border-slate-300 font-mono text-sm rounded-xl px-4 py-2.5 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all"
              />
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Crucial for attribution. This ID is injected into every deep link generated by the system.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-dd-red" /> Google Apps Script Web App URL
              </label>
              <input
                type="url"
                name="gasUrl"
                value={formData.gasUrl}
                onChange={handleChange}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full bg-slate-50 border border-slate-300 font-mono text-xs rounded-xl px-4 py-2.5 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all"
              />
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Used exclusively by the "Bulk Send" feature to bypass local mail clients via Google's infrastructure.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-violet-500" /> Gemini API Key (AI Insights)
              </label>
              <input
                type="password"
                name="geminiApiKey"
                value={formData.geminiApiKey}
                onChange={handleChange}
                placeholder="AIza..."
                className="w-full bg-slate-50 border border-slate-300 font-mono text-xs rounded-xl px-4 py-2.5 focus:border-violet-500 focus:ring-1 focus:ring-violet-400 outline-none transition-all"
              />
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Free key from <strong>ai.google.dev</strong>. Used locally to generate AI pipeline insights. Never sent to our servers.
              </p>
            </div>
          </div>

        </div>

        <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          {formData.repId && (
            <button 
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition-colors shadow-sm"
            >
              Cancel
            </button>
          )}
          <button 
            onClick={handleSave}
            disabled={!formData.repId}
            className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-dd-red hover:bg-dd-red-dark shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" /> Save Configuration
          </button>
        </div>

      </div>
    </div>
  );
}
