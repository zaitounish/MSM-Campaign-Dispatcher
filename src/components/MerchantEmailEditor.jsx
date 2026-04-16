import React, { useState, useRef, useEffect } from "react";
import { X, Save, Users, User, Bold, Italic, Underline, AlignLeft, AlignCenter, List, Mail } from "lucide-react";

export default function MerchantEmailEditor({ merchant, initialHtml, initialSubject, onSave, onCancel, onSaveAll }) {
  const [applyToAll, setApplyToAll] = useState(false);
  const editorRef = useRef(null);

  // Parse the subject into two parts: "Store Name" and "| title part"
  // Format is always: "{merchantName} | {title}"
  let separatorIdx = (initialSubject || "").indexOf(" | ");
  if (separatorIdx === -1) separatorIdx = (initialSubject || "").indexOf(" - ");
  if (separatorIdx === -1) separatorIdx = (initialSubject || "").indexOf(" \u2014 ");
  
  const namePart = separatorIdx !== -1 ? initialSubject.slice(0, separatorIdx) : (merchant?.merchantName || "");
  const titlePart = separatorIdx !== -1 ? initialSubject.slice(separatorIdx + 3) : (initialSubject || "");

  // Subject edit modes
  const [subjectMode, setSubjectMode] = useState("title"); // "title" | "full"
  const [subjectTitle, setSubjectTitle] = useState(titlePart);    // only the part after " - "
  const [subjectFull, setSubjectFull] = useState(initialSubject || ""); // full subject override

  // Populate the WYSIWYG editor once
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml || "";
    }
  }, []);

  const execFormat = (command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const buildSubjectFor = (merchantName) => {
    if (subjectMode === "full") return subjectFull;
    return `${merchantName} | ${subjectTitle}`;
  };

  const handleSave = () => {
    const html = editorRef.current?.innerHTML || "";
    const subject = buildSubjectFor(merchant?.merchantName || namePart);
    if (applyToAll && onSaveAll) {
      onSaveAll({ html, subjectMode, subjectTitle, subjectFull });
    } else {
      onSave({ html, subject });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Edit Email</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {applyToAll
                ? <span className="text-amber-600 font-semibold">⚠️ Applying changes to ALL selected merchants</span>
                : <>Editing: <span className="font-semibold text-slate-700">{merchant?.merchantName}</span></>
              }
            </p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Apply Mode Toggle */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Apply to:</span>
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-sm">
            <button
              onClick={() => setApplyToAll(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                !applyToAll ? "bg-dd-red text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <User className="w-3.5 h-3.5" /> This Merchant
            </button>
            <button
              onClick={() => setApplyToAll(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                applyToAll ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Users className="w-3.5 h-3.5" /> All Merchants
            </button>
          </div>
        </div>

        {/* Subject Line Editor */}
        <div className="px-6 py-4 border-b border-slate-100 bg-white space-y-2">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <Mail className="w-3.5 h-3.5" /> Subject Line
            </label>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setSubjectMode("title")}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  subjectMode === "title" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"
                }`}
              >
                Edit Title Only
              </button>
              <button
                onClick={() => setSubjectMode("full")}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  subjectMode === "full" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"
                }`}
              >
                Edit Full Subject
              </button>
            </div>
          </div>

          {subjectMode === "title" ? (
            // Smart split-input: locked store name + editable title
            <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
              <span
                className="px-3 py-2.5 text-sm text-slate-400 bg-slate-50 border-r border-slate-200 whitespace-nowrap font-medium select-none"
                title="Store name is always personalized per merchant"
              >
                {applyToAll ? "{Store Name}" : namePart} |
              </span>
              <input
                type="text"
                value={subjectTitle}
                onChange={e => setSubjectTitle(e.target.value)}
                placeholder="e.g. Let's grow your sales on DoorDash 🚀"
                className="flex-1 px-3 py-2.5 text-sm text-slate-800 outline-none bg-white"
              />
            </div>
          ) : (
            // Full subject override
            <input
              type="text"
              value={subjectFull}
              onChange={e => setSubjectFull(e.target.value)}
              placeholder="Enter the full subject line..."
              className="w-full px-3 py-2.5 text-sm text-slate-800 border border-slate-300 rounded-xl outline-none focus:border-dd-red focus:ring-1 focus:ring-dd-red transition-all"
            />
          )}

          {subjectMode === "title" && applyToAll && (
            <p className="text-xs text-slate-400">
              Each merchant will get their own store name prepended: <em>"{`{Store Name} | ${subjectTitle || "..."}`}"</em>
            </p>
          )}
          {subjectMode === "full" && applyToAll && (
            <p className="text-xs text-amber-600">
              ⚠️ All merchants will receive the exact same subject line as entered above.
            </p>
          )}
        </div>

        {/* Body Formatting Toolbar */}
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-1 flex-wrap bg-white">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Body:</span>
          {[
            { cmd: "bold", icon: Bold, label: "Bold" },
            { cmd: "italic", icon: Italic, label: "Italic" },
            { cmd: "underline", icon: Underline, label: "Underline" },
          ].map(({ cmd, icon: Icon, label }) => (
            <button
              key={cmd}
              onMouseDown={(e) => { e.preventDefault(); execFormat(cmd); }}
              title={label}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <div className="w-px h-5 bg-slate-200 mx-1" />
          {[
            { cmd: "justifyLeft", icon: AlignLeft },
            { cmd: "justifyCenter", icon: AlignCenter },
          ].map(({ cmd, icon: Icon }) => (
            <button
              key={cmd}
              onMouseDown={(e) => { e.preventDefault(); execFormat(cmd); }}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat("insertUnorderedList"); }}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <List className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <select
            onChange={(e) => { execFormat("fontSize", e.target.value); e.target.value = ""; }}
            defaultValue=""
            className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none cursor-pointer"
          >
            <option value="" disabled>Font Size</option>
            <option value="1">Small</option>
            <option value="3">Normal</option>
            <option value="5">Large</option>
            <option value="7">X-Large</option>
          </select>
        </div>

        {/* WYSIWYG Body Editor */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
          <div
            className="bg-white min-h-[280px] rounded-xl border border-slate-200 shadow-sm p-5 focus-within:ring-2 focus-within:ring-dd-red/30 focus-within:border-dd-red transition-all"
            style={{ fontFamily: "sans-serif", fontSize: "14px", color: "#333", lineHeight: "1.6" }}
          >
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="outline-none min-h-[240px]"
              style={{ fontFamily: "inherit", fontSize: "inherit", color: "inherit" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400 max-w-xs">
            {applyToAll
              ? "Deep links & signatures remain personalized per merchant."
              : "This override applies only to this merchant."
            }
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white shadow-md transition-colors ${
                applyToAll ? "bg-amber-500 hover:bg-amber-600" : "bg-dd-red hover:bg-dd-red-dark"
              }`}
            >
              <Save className="w-4 h-4" />
              {applyToAll ? "Apply to All Merchants" : "Save for This Merchant"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
