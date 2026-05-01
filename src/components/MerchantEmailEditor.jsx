import React, { useState, useRef, useEffect } from "react";
import {
  X, Save, Users, User, Mail, Bold, Italic, Underline,
  List, Link, Check, Sparkles, Loader2, Wand2, RefreshCw,
  ChevronDown, Minus,
} from "lucide-react";

/**
 * MerchantEmailEditor (v3 — Single Full-Document WYSIWYG)
 *
 * The rep edits the ENTIRE email — intro, promo sections, signature, everything —
 * in one unified contentEditable surface. No blocks, no panel toggles.
 *
 * Props:
 *  merchant        - current merchant object
 *  initialHtml     - fully compiled email HTML (passed from draft.htmlBody)
 *  initialSubject  - pre-filled subject string
 *  onSave          - ({ html, subject, applyToAll }) => void
 *  onCancel        - () => void
 *  geminiApiKey    - optional; AI panel degrades gracefully if absent
 */
export default function MerchantEmailEditor({
  merchant,
  initialHtml,
  initialSubject,
  onSave,
  onCancel,
  geminiApiKey,
}) {
  const editorRef  = useRef(null);
  const linkRef    = useRef(null);
  const savedRange = useRef(null);

  const [applyToAll, setApplyToAll] = useState(false);
  const [linkOpen,   setLinkOpen]   = useState(false);
  const [linkUrl,    setLinkUrl]    = useState("https://");

  // AI
  const [aiOpen,   setAiOpen]   = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiStatus, setAiStatus] = useState("idle");
  const [aiError,  setAiError]  = useState("");

  // Subject
  const sepIdx    = (initialSubject || "").indexOf(" | ") !== -1
    ? (initialSubject || "").indexOf(" | ")
    : (initialSubject || "").indexOf(" - ");
  const namePart  = sepIdx !== -1 ? initialSubject.slice(0, sepIdx) : (merchant?.merchantName || "");
  const titlePart = sepIdx !== -1 ? initialSubject.slice(sepIdx)    : (initialSubject ? ` | ${initialSubject}` : "");

  const [subjectMode,  setSubjectMode]  = useState("title");
  const [subjectTitle, setSubjectTitle] = useState(titlePart);
  const [subjectFull,  setSubjectFull]  = useState(initialSubject || "");

  // Seed editor once on mount
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml || "";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus link input when bar opens
  useEffect(() => {
    if (linkOpen) setTimeout(() => linkRef.current?.querySelector("input")?.focus(), 30);
  }, [linkOpen]);

  // ── execCommand ───────────────────────────────────────────────────────────────
  const exec = (cmd, val = null) => { editorRef.current?.focus(); document.execCommand(cmd, false, val); };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    switch (e.key.toLowerCase()) {
      case "b": e.preventDefault(); exec("bold");      break;
      case "i": e.preventDefault(); exec("italic");    break;
      case "u": e.preventDefault(); exec("underline"); break;
      default:  break;
    }
  };

  // ── Variable insert ────────────────────────────────────────────────────────────
  const insertVar = (text) => {
    editorRef.current?.focus();
    document.execCommand("insertText", false, text);
  };

  // ── Link bar ──────────────────────────────────────────────────────────────────
  const openLinkBar = () => {
    const sel = window.getSelection();
    if (sel?.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange();
    setLinkUrl("https://");
    setLinkOpen(true);
  };

  const applyLink = () => {
    if (savedRange.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    editorRef.current?.focus();
    const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
    document.execCommand("createLink", false, url);
    savedRange.current = null;
    setLinkOpen(false);
  };

  // ── Subject builder ────────────────────────────────────────────────────────────
  const buildSubject = () => {
    if (subjectMode === "full") return subjectFull;
    const prefix = applyToAll ? "{Store Name}" : (merchant?.merchantName || namePart);
    return `${prefix}${subjectTitle}`;
  };

  // ── Save ───────────────────────────────────────────────────────────────────────
  const handleSave = () => {
    const html = editorRef.current?.innerHTML || "";
    onSave({ html, subject: buildSubject(), applyToAll });
  };

  // ── AI: full email generation ─────────────────────────────────────────────────
  const runAI = async () => {
    if (!geminiApiKey || !aiPrompt.trim()) return;
    setAiStatus("loading");
    setAiError("");

    const prompt = `You are a DoorDash Merchant Success rep writing a professional outreach email to a restaurant partner.

Restaurant: ${merchant?.merchantName || "{Store Name}"}
Instructions: "${aiPrompt.trim()}"

Rules:
1. Write a complete, warm email body (no subject line, no "From/To" headers).
2. Use {Store Name} wherever the restaurant name appears and {DM Name} for the contact.
3. Format as clean HTML using <p>, <strong>, <br>, <ul>, <li>, <h3> only — no inline styles.
4. Include a professional sign-off at the end.
5. Keep it concise and focused on value — 3-4 paragraphs max.
6. Return ONLY the HTML — no markdown, no code fences.`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.65, maxOutputTokens: 1024 },
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `API error ${res.status}`);
      }
      const data    = await res.json();
      const rawHtml = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const html    = rawHtml.replace(/^```html?\s*/i, "").replace(/```\s*$/, "").trim();
      if (editorRef.current) editorRef.current.innerHTML = html;
      setAiStatus("done");
      setAiOpen(false);
    } catch (err) {
      console.error("[AI Full Email]", err);
      setAiError(err.message || "Unknown error");
      setAiStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Edit Email</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {applyToAll
                ? <span className="text-amber-600 font-semibold">⚠️ Changes will apply to ALL merchants</span>
                : <>Editing: <span className="font-semibold text-slate-700">{merchant?.merchantName}</span></>
              }
            </p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Apply toggle ── */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3 shrink-0">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Apply to:</span>
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-sm">
            <ToggleBtn active={!applyToAll} onClick={() => setApplyToAll(false)} icon={<User className="w-3.5 h-3.5" />} color="red">
              This Merchant
            </ToggleBtn>
            <ToggleBtn active={applyToAll}  onClick={() => setApplyToAll(true)}  icon={<Users className="w-3.5 h-3.5" />} color="amber">
              All Merchants
            </ToggleBtn>
          </div>
          {applyToAll && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
              Use <code className="font-mono">{"{Store Name}"}</code> &amp; <code className="font-mono">{"{DM Name}"}</code> as variables
            </span>
          )}
        </div>

        {/* ── AI Writing Assistant ── */}
        {geminiApiKey && (
          <div className={`border-b ${aiOpen ? "border-violet-200 bg-violet-50" : "border-slate-100 bg-white"} shrink-0`}>
            <button
              onClick={() => setAiOpen(v => !v)}
              className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-violet-50 transition-colors text-sm font-bold text-slate-700"
            >
              <span className="flex items-center gap-2">
                <span className="bg-violet-100 p-1 rounded-lg"><Sparkles className="w-3.5 h-3.5 text-violet-600" /></span>
                AI Writing Assistant
                <span className="text-[10px] bg-violet-100 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-full">Gemini Flash</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${aiOpen ? "rotate-180" : ""}`} />
            </button>
            {aiOpen && (
              <div className="px-6 pb-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
                <p className="text-xs text-slate-500">Describe what you want — AI will replace the entire email body.</p>
                <textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  rows={2}
                  placeholder={`e.g. "Short pitch for a restaurant that's been on DoorDash 6 months but never ran marketing. Focus on Ads campaign ROI."`}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 resize-none transition-all"
                />
                {aiStatus === "error" && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">⚠️ {aiError}</p>}
                {aiStatus === "done"  && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-semibold">✓ Email replaced — review below.</p>}
                <button
                  onClick={runAI}
                  disabled={aiStatus === "loading" || !aiPrompt.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 disabled:hover:translate-y-0"
                >
                  {aiStatus === "loading" ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                 : aiStatus === "done"    ? <><RefreshCw className="w-4 h-4" /> Regenerate</>
                 :                          <><Wand2 className="w-4 h-4" /> Generate Full Email</>}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Subject line ── */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <Mail className="w-3.5 h-3.5" /> Subject Line
            </label>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {["title", "full"].map(m => (
                <button key={m} onClick={() => setSubjectMode(m)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${subjectMode === m ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}>
                  {m === "title" ? "Edit Title" : "Full Subject"}
                </button>
              ))}
            </div>
          </div>
          {subjectMode === "title" ? (
            <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
              <span className="px-3 py-2.5 text-sm text-slate-400 bg-slate-50 border-r border-slate-200 whitespace-nowrap font-medium select-none">
                {applyToAll ? "{Store Name}" : namePart}
              </span>
              <input value={subjectTitle} onChange={e => setSubjectTitle(e.target.value)}
                placeholder=" | Boost Sales on DoorDash 🚀"
                className="flex-1 px-3 py-2.5 text-sm text-slate-800 outline-none bg-white" />
            </div>
          ) : (
            <input value={subjectFull} onChange={e => setSubjectFull(e.target.value)}
              placeholder="Full subject line…"
              className="w-full px-3 py-2.5 text-sm text-slate-800 border border-slate-300 rounded-xl outline-none focus:border-dd-red focus:ring-1 focus:ring-dd-red transition-all" />
          )}
        </div>

        {/* ── Formatting toolbar ── */}
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-0.5 flex-wrap shrink-0">
          <TBtn onCmd={() => exec("bold")}           title="Bold (Ctrl+B)"><Bold      className="w-3.5 h-3.5" /></TBtn>
          <TBtn onCmd={() => exec("italic")}         title="Italic (Ctrl+I)"><Italic    className="w-3.5 h-3.5" /></TBtn>
          <TBtn onCmd={() => exec("underline")}      title="Underline (Ctrl+U)"><Underline className="w-3.5 h-3.5" /></TBtn>
          <div className="w-px h-4 bg-slate-300 mx-1" />
          <TBtn onCmd={() => exec("insertUnorderedList")} title="Bullet list"><List    className="w-3.5 h-3.5" /></TBtn>
          <TBtn onCmd={() => exec("insertOrderedList")}   title="Numbered list" className="font-mono text-xs font-bold px-1.5">1.</TBtn>
          <TBtn onCmd={() => exec("removeFormat")}        title="Clear formatting"><X className="w-3.5 h-3.5" /></TBtn>
          <div className="w-px h-4 bg-slate-300 mx-1" />
          <TBtn onCmd={openLinkBar} title="Insert link" active={linkOpen}><Link className="w-3.5 h-3.5" /></TBtn>
          <TBtn onCmd={() => exec("insertHorizontalRule")} title="Insert divider line"><Minus className="w-3.5 h-3.5" /></TBtn>
          <div className="flex-1" />
          {/* Variable insert buttons */}
          <span className="text-[10px] text-slate-400 mr-1 hidden sm:block">Insert:</span>
          {["{Store Name}", "{DM Name}"].map(v => (
            <button key={v} onMouseDown={e => { e.preventDefault(); insertVar(v); }}
              className="text-[10px] font-bold bg-white border border-slate-300 text-slate-600 hover:border-violet-400 hover:text-violet-600 px-2 py-1.5 rounded-lg transition-colors shadow-sm">
              {v}
            </button>
          ))}
        </div>

        {/* ── Inline link bar ── */}
        {linkOpen && (
          <div ref={linkRef} className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200 shrink-0 animate-in slide-in-from-top-1 duration-100">
            <Link className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setLinkOpen(false); }}
              placeholder="https://…"
              className="flex-1 text-sm bg-white border border-blue-300 rounded-lg px-2.5 py-1 outline-none focus:border-blue-500 font-mono" />
            <button onClick={applyLink}
              className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors">
              <Check className="w-3.5 h-3.5" /> Apply
            </button>
            <button onClick={() => setLinkOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Full email body editor ── */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleKeyDown}
            className={`
              min-h-full px-8 py-6 outline-none text-sm text-slate-800 leading-relaxed
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
              [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
              [&_li]:my-0.5
              [&_a]:text-blue-600 [&_a]:underline
              [&_strong]:font-bold [&_em]:italic
              [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2
              [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-slate-300 [&_hr]:my-4
            `}
            style={{ fontFamily: "sans-serif", whiteSpace: "normal" }}
          />
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate-400 max-w-xs">
            {applyToAll
              ? "Deep links & rep details remain personalized per merchant."
              : "Override applies to this merchant only."
            }
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="px-5 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white shadow-md transition-colors ${
                applyToAll ? "bg-amber-500 hover:bg-amber-600" : "bg-dd-red hover:bg-dd-red-dark"
              }`}>
              <Save className="w-4 h-4" />
              {applyToAll ? "Apply to All Merchants" : "Save for This Merchant"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function ToggleBtn({ active, onClick, icon, color, children }) {
  const colors = {
    red:   active ? "bg-dd-red text-white shadow-sm"   : "text-slate-500 hover:text-slate-700",
    amber: active ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700",
  };
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${colors[color]}`}>
      {icon} {children}
    </button>
  );
}

function TBtn({ onCmd, title, children, className = "", active = false }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onCmd(); }}
      className={`p-1.5 rounded text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors ${active ? "bg-slate-200 text-slate-900" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
