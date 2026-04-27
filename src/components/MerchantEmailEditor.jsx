import React, { useState, useRef, useEffect } from "react";
import {
  X, Save, Users, User, Bold, Italic, Underline, AlignLeft,
  AlignCenter, List, Mail, Sparkles, Loader2, Wand2, RefreshCw,
  ChevronDown, ChevronUp,
} from "lucide-react";

/**
 * MerchantEmailEditor
 *
 * Adds an AI Writing Assistant panel that uses the rep's Gemini API key
 * to generate a personalised email body from a free-text instruction prompt.
 * Variables {Store Name} and {DM Name} are automatically injected into
 * the prompt context and preserved in the generated output.
 *
 * Props:
 *  geminiApiKey  - from repSettings (optional — AI panel degrades gracefully if absent)
 *  merchant      - current merchant object (used for persona context)
 *  initialHtml   - pre-filled email body HTML
 *  initialSubject- pre-filled subject line
 *  onSave        - (result) => void  — single merchant save
 *  onSaveAll     - (result) => void  — apply template to all merchants
 *  onCancel      - () => void
 */
export default function MerchantEmailEditor({
  merchant,
  initialHtml,
  initialSubject,
  onSave,
  onCancel,
  onSaveAll,
  geminiApiKey,
}) {
  const [applyToAll, setApplyToAll] = useState(false);
  const editorRef = useRef(null);

  // ── Subject state ─────────────────────────────────────────────────────────
  let separatorIdx = (initialSubject || "").indexOf(" | ");
  if (separatorIdx === -1) separatorIdx = (initialSubject || "").indexOf(" - ");
  if (separatorIdx === -1) separatorIdx = (initialSubject || "").indexOf(" \u2014 ");

  const namePart  = separatorIdx !== -1 ? initialSubject.slice(0, separatorIdx) : (merchant?.merchantName || "");
  const titlePart = separatorIdx !== -1 ? initialSubject.slice(separatorIdx) : (initialSubject ? ` | ${initialSubject}` : "");

  const [subjectMode,  setSubjectMode]  = useState("title");
  const [subjectTitle, setSubjectTitle] = useState(titlePart);
  const [subjectFull,  setSubjectFull]  = useState(initialSubject || "");

  // ── AI panel state ────────────────────────────────────────────────────────
  const [aiOpen,     setAiOpen]     = useState(false);
  const [aiPrompt,   setAiPrompt]   = useState("");
  const [aiStatus,   setAiStatus]   = useState("idle"); // idle | loading | done | error
  const [aiError,    setAiError]    = useState("");

  // Fill editor on mount
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml || "";
  }, []);

  const execFormat = (command, value = null) => {
    editorRef.current?.focus();
    if (command === "insertText") document.execCommand("insertText", false, value);
    else document.execCommand(command, false, value);
  };

  const buildSubjectFor = (merchantName, forTemplate = false) => {
    if (forTemplate) {
      return subjectMode === "full" ? subjectFull : `{Store Name}${subjectTitle}`;
    }
    return subjectMode === "full" ? subjectFull : `${merchantName}${subjectTitle}`;
  };

  const handleSave = () => {
    const html = editorRef.current?.innerHTML || "";
    if (applyToAll && onSaveAll) {
      onSaveAll({ html, templateSubject: buildSubjectFor("", true) });
    } else {
      onSave({ html, subject: buildSubjectFor(merchant?.merchantName || namePart, false) });
    }
  };

  // ── AI: Build prompt and call Gemini Flash ────────────────────────────────
  const runAI = async () => {
    if (!geminiApiKey || !aiPrompt.trim()) return;
    setAiStatus("loading");
    setAiError("");

    const storeName = merchant?.merchantName || "{Store Name}";
    const dmName    = merchant?.dmName || merchant?.emails?.[0]?.address?.split("@")[0] || "there";

    const systemPrompt = `You are a DoorDash Merchant Success sales representative writing a professional, warm, and persuasive outreach email to a restaurant partner.

Context:
- Restaurant name: ${storeName}
- Contact name: ${dmName}
- Platform: DoorDash
- Goal: Help the merchant grow their business using DoorDash marketing tools

The rep's instructions for the email:
"${aiPrompt.trim()}"

Rules:
1. Write ONLY the email body HTML — no subject line, no "Subject:", no preamble
2. Use the exact placeholder {Store Name} wherever the store name appears
3. Use the exact placeholder {DM Name} wherever you address the contact by name
4. Format as clean HTML using <p>, <strong>, <br> tags only — no CSS, no inline styles, no <html>/<body> tags
5. Keep it concise (3–5 paragraphs max), professional, and action-oriented
6. End with a clear call to action
7. Do NOT add "Best regards" or a sign-off — the system adds the rep's signature automatically
8. Do NOT wrap output in markdown code fences`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `API error ${res.status}`);
      }

      const body    = await res.json();
      const rawText = body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      // Strip markdown code fences if present
      const html = rawText
        .replace(/^```html?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();

      // Inject into the WYSIWYG editor
      if (editorRef.current) editorRef.current.innerHTML = html;
      setAiStatus("done");
      setAiOpen(false); // Collapse AI panel — let them review the result
    } catch (err) {
      console.error("[AI Email]", err);
      setAiError(err.message || "Unknown error");
      setAiStatus("error");
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

        {/* ── AI Writing Assistant Panel ── */}
        <div className={`border-b border-slate-200 transition-all ${aiOpen ? "bg-violet-50" : "bg-white"}`}>
          <button
            onClick={() => setAiOpen(v => !v)}
            className="w-full px-6 py-3 flex items-center justify-between text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="bg-violet-100 p-1.5 rounded-lg">
                <Sparkles className="w-4 h-4 text-violet-600" />
              </div>
              <span>AI Writing Assistant</span>
              <span className="text-[10px] bg-violet-100 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-full font-bold">
                Gemini Flash
              </span>
              {!geminiApiKey && (
                <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                  Needs API Key
                </span>
              )}
            </div>
            {aiOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {aiOpen && (
            <div className="px-6 pb-5 space-y-3 animate-in slide-in-from-top-1 duration-150">
              {!geminiApiKey ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  Add your free Gemini API key in <strong>Rep Configuration → Gemini API Key</strong> to enable AI email generation.
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Describe what you want the email to say. Variables{" "}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">{"{Store Name}"}</code> and{" "}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">{"{DM Name}"}</code>{" "}are automatically handled.
                  </p>
                  <div className="relative">
                    <textarea
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      placeholder={`e.g. "Write a warm, short email pitching Sponsored Listings to this restaurant. Mention they've been on DoorDash for a while but haven't tried ads yet. Focus on reaching new customers."`}
                      rows={3}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-violet-400 focus:ring-1 focus:ring-violet-300 outline-none resize-none transition-all"
                    />
                  </div>

                  {aiStatus === "error" && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      ⚠️ {aiError}
                    </p>
                  )}

                  {aiStatus === "done" && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-semibold">
                      ✓ Email generated — review the body below and save when ready.
                    </p>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={runAI}
                      disabled={aiStatus === "loading" || !aiPrompt.trim()}
                      className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl shadow-sm transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                    >
                      {aiStatus === "loading" ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                      ) : aiStatus === "done" ? (
                        <><RefreshCw className="w-4 h-4" /> Regenerate</>
                      ) : (
                        <><Wand2 className="w-4 h-4" /> Generate Email</>
                      )}
                    </button>
                    <span className="text-xs text-slate-400">
                      {aiStatus === "loading" ? "This takes ~3–5 seconds…" : "Output will replace the current email body."}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
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
            <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
              <span className="px-3 py-2.5 text-sm text-slate-400 bg-slate-50 border-r border-slate-200 whitespace-nowrap font-medium select-none">
                {applyToAll ? "{Store Name}" : namePart}
              </span>
              <input
                type="text"
                value={subjectTitle}
                onChange={e => setSubjectTitle(e.target.value)}
                placeholder=" | e.g. Let's grow your sales on DoorDash 🚀"
                className="flex-1 px-3 py-2.5 text-sm text-slate-800 outline-none bg-white"
              />
            </div>
          ) : (
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
              Each merchant will get their own store name prepended: <em>{`"{Store Name}${subjectTitle || "..."}"`}</em>
            </p>
          )}
          {subjectMode === "full" && applyToAll && (
            <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col gap-2.5 shadow-inner">
              <p className="text-amber-600 font-medium">⚠️ If no variables are used, all merchants will receive the exact identical subject line.</p>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Insert Variable:</span>
                <button onClick={() => setSubjectFull(p => p + "{Store Name}")} className="text-[10px] font-bold bg-white text-slate-600 hover:bg-slate-100 px-2 py-1.5 rounded-lg border border-slate-200 transition-colors shadow-sm">{`{Store Name}`}</button>
                <button onClick={() => setSubjectFull(p => p + "{DM Name}")} className="text-[10px] font-bold bg-white text-slate-600 hover:bg-slate-100 px-2 py-1.5 rounded-lg border border-slate-200 transition-colors shadow-sm">{`{DM Name}`}</button>
              </div>
            </div>
          )}
        </div>

        {/* Body Formatting Toolbar */}
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-1 flex-wrap bg-white">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Body:</span>
          {[
            { cmd: "bold",      icon: Bold,      label: "Bold" },
            { cmd: "italic",    icon: Italic,    label: "Italic" },
            { cmd: "underline", icon: Underline, label: "Underline" },
          ].map(({ cmd, icon: Icon, label }) => (
            <button
              key={cmd}
              onMouseDown={e => { e.preventDefault(); execFormat(cmd); }}
              title={label}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <div className="w-px h-5 bg-slate-200 mx-1" />
          {[
            { cmd: "justifyLeft",   icon: AlignLeft },
            { cmd: "justifyCenter", icon: AlignCenter },
          ].map(({ cmd, icon: Icon }) => (
            <button
              key={cmd}
              onMouseDown={e => { e.preventDefault(); execFormat(cmd); }}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <button
            onMouseDown={e => { e.preventDefault(); execFormat("insertUnorderedList"); }}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <List className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <select
            onChange={e => { execFormat("fontSize", e.target.value); e.target.value = ""; }}
            defaultValue=""
            className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none cursor-pointer"
          >
            <option value="" disabled>Font Size</option>
            <option value="1">Small</option>
            <option value="3">Normal</option>
            <option value="5">Large</option>
            <option value="7">X-Large</option>
          </select>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <div className="flex items-center gap-1 ml-auto">
            <button
              onMouseDown={e => { e.preventDefault(); execFormat("insertText", "{Store Name}"); }}
              className="text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 px-2 py-1.5 rounded-lg border border-slate-200 transition-colors"
              title="Insert Store Name variable"
            >
              {`{Store Name}`}
            </button>
            <button
              onMouseDown={e => { e.preventDefault(); execFormat("insertText", "{DM Name}"); }}
              className="text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 px-2 py-1.5 rounded-lg border border-slate-200 transition-colors"
              title="Insert Decision Maker Name variable"
            >
              {`{DM Name}`}
            </button>
          </div>
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
