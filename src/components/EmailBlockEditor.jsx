import React from "react";
import { Sparkles, Loader2, Wand2, RefreshCw, Plus, Type, Minus } from "lucide-react";
import BlockCard from "./BlockCard";
import { moveBlock, BLOCK_TYPES, createTextBlock, createDividerBlock } from "../lib/emailBlockEngine";

/**
 * EmailBlockEditor
 *
 * The main editing surface. Renders an ordered list of BlockCards with:
 *  - Up/down reordering (the signature block is always locked last)
 *  - Theme picker (3 options: Momentum, Executive, Spotlight)
 *  - AI Writing Assistant panel (populates the intro TEXT block via Gemini Flash)
 *
 * Props:
 *  blocks        - Block[]
 *  setBlocks     - (Block[] | (prev) => Block[]) => void
 *  selectedTheme - "momentum" | "executive" | "spotlight"
 *  setTheme      - (themeId: string) => void
 *  geminiApiKey  - optional; AI panel degrades gracefully when absent
 *  merchant      - current merchant (for AI persona context)
 */
export default function EmailBlockEditor({
  blocks,
  setBlocks,
  selectedTheme,
  setTheme,
  geminiApiKey,
  merchant,
}) {
  // ── AI state ─────────────────────────────────────────────────────────────────
  const [aiPrompt,  setAiPrompt]  = React.useState("");
  const [aiStatus,  setAiStatus]  = React.useState("idle"); // idle | loading | done | error
  const [aiError,   setAiError]   = React.useState("");
  const [aiOpen,    setAiOpen]    = React.useState(false);

  // ── Block operations ──────────────────────────────────────────────────────────
  const handleMove = (id, dir) => setBlocks(prev => moveBlock(prev, id, dir));

  const handleUpdate = (id, newData) =>
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, data: newData } : b));

  const handleDelete = (id) =>
    setBlocks(prev => prev.filter(b => b.id !== id || b.locked));

  // ── AI: Generate intro text via Gemini Flash ──────────────────────────────────
  const runAI = async () => {
    if (!geminiApiKey || !aiPrompt.trim()) return;
    setAiStatus("loading");
    setAiError("");

    const storeName = merchant?.merchantName || "{Store Name}";
    const dmName    = merchant?.dmName || "there";

    const prompt = `You are a DoorDash Merchant Success rep writing a short, warm outreach email to a restaurant partner.

Restaurant: ${storeName}
Contact name: ${dmName}
Instructions from the rep: "${aiPrompt.trim()}"

Rules:
1. Write ONLY the intro/greeting portion of the email body (NOT the promo sections — those are handled separately)
2. Use the placeholder {Store Name} wherever the restaurant name appears
3. Use the placeholder {DM Name} wherever the contact is addressed
4. Format as clean HTML using <p>, <strong>, <br>, <ul>, <li> only — no inline styles, no wrapping tags
5. Keep it to 2-3 sentences max — warm, direct, professional
6. Do NOT include a sign-off, subject line, or promo details
7. Return ONLY the HTML — no markdown, no code fences`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents:         [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.65, maxOutputTokens: 512 },
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `API error ${res.status}`);
      }
      const body    = await res.json();
      const rawHtml = body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const html    = rawHtml.replace(/^```html?\s*/i, "").replace(/```\s*$/, "").trim();

      // Inject into the first TEXT block (the intro)
      setBlocks(prev => {
        const firstTextIdx = prev.findIndex(b => b.type === BLOCK_TYPES.TEXT);
        if (firstTextIdx === -1) return prev;
        const next = [...prev];
        next[firstTextIdx] = { ...next[firstTextIdx], data: { ...next[firstTextIdx].data, html } };
        return next;
      });

      setAiStatus("done");
      setAiOpen(false);
    } catch (err) {
      console.error("[AI Email Block]", err);
      setAiError(err.message || "Unknown error");
      setAiStatus("error");
    }
  };

  if (!blocks || blocks.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        No blocks loaded yet.
      </div>
    );
  }

  // A block can move up if the block above it is not index 0 of a locked type
  // and it isn't the first block itself.
  const canMoveUp   = (idx) => idx > 0 && !blocks[idx - 1]?.locked && !blocks[idx]?.locked;
  const canMoveDown = (idx) => idx < blocks.length - 2 && !blocks[idx]?.locked; // -2: always keep signature last

  return (
    <div className="space-y-3">

      {/* ── Theme Picker ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Theme:</span>
        {[
          { id: "momentum",  icon: "🚀", label: "Momentum"  },
          { id: "executive", icon: "💼", label: "Executive" },
          { id: "spotlight", icon: "✨", label: "Spotlight"  },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              selectedTheme === t.id
                ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                : "bg-white text-slate-600 border-slate-300 hover:border-slate-500"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── AI Writing Assistant ── */}
      {geminiApiKey && (
        <div className={`border rounded-xl overflow-hidden transition-all ${aiOpen ? "border-violet-300" : "border-slate-200"}`}>
          <button
            onClick={() => setAiOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-violet-50 transition-colors text-sm font-bold text-slate-700"
          >
            <span className="flex items-center gap-2">
              <span className="bg-violet-100 p-1.5 rounded-lg">
                <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              </span>
              AI Writing Assistant
              <span className="text-[10px] bg-violet-100 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-full font-bold">
                Gemini Flash
              </span>
            </span>
            <span className="text-slate-400 text-xs">{aiOpen ? "▲" : "▼"}</span>
          </button>

          {aiOpen && (
            <div className="border-t border-slate-200 bg-violet-50 px-4 py-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
              <p className="text-xs text-slate-500 leading-relaxed">
                Describe the intro paragraph you want. Variables{" "}
                <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs">{"{Store Name}"}</code>
                {" "}and{" "}
                <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs">{"{DM Name}"}</code>
                {" "}are automatically preserved.
              </p>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                rows={2}
                placeholder={`e.g. "Warm, casual opener — the restaurant has been on DoorDash a while but hasn't tried marketing tools yet."`}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-violet-400 focus:ring-1 focus:ring-violet-300 outline-none resize-none transition-all"
              />
              {aiStatus === "error" && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">⚠️ {aiError}</p>
              )}
              {aiStatus === "done" && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-semibold">
                  ✓ Intro updated — review the block below.
                </p>
              )}
              <button
                onClick={runAI}
                disabled={aiStatus === "loading" || !aiPrompt.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl shadow-sm transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
              >
                {aiStatus === "loading" ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> :
                 aiStatus === "done"    ? <><RefreshCw className="w-4 h-4" /> Regenerate</>              :
                                          <><Wand2 className="w-4 h-4" /> Generate Intro</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Block list with between-block insert buttons ── */}
      <div className="space-y-1">
        {blocks.map((block, idx) => (
          <React.Fragment key={block.id}>
            <BlockCard
              block={block}
              canMoveUp={canMoveUp(idx)}
              canMoveDown={canMoveDown(idx)}
              onMoveUp={() => handleMove(block.id, "up")}
              onMoveDown={() => handleMove(block.id, "down")}
              onUpdate={newData => handleUpdate(block.id, newData)}
              onDelete={() => handleDelete(block.id)}
            />
            {/* Show insert button between every block except after the signature */}
            {idx < blocks.length - 1 && (
              <AddBlockButton
                onAddText={() => {
                  setBlocks(prev => {
                    const next = [...prev];
                    next.splice(idx + 1, 0, createTextBlock());
                    return next;
                  });
                }}
                onAddDivider={() => {
                  setBlocks(prev => {
                    const next = [...prev];
                    next.splice(idx + 1, 0, createDividerBlock());
                    return next;
                  });
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── Between-block insert button ─────────────────────────────────────────────────────
function AddBlockButton({ onAddText, onAddDivider }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative flex items-center justify-center h-6 group/add">
      {/* Thin line with + button */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-slate-200 opacity-0 group-hover/add:opacity-100 transition-opacity" />
      <button
        onClick={() => setOpen(v => !v)}
        className={`relative z-10 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all
          ${ open
            ? "bg-violet-600 text-white border-violet-600 shadow-sm"
            : "bg-white text-slate-400 border-slate-200 opacity-0 group-hover/add:opacity-100 hover:border-violet-400 hover:text-violet-600"
          }`}
      >
        <Plus className="w-3 h-3" /> Add
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 flex items-center gap-1 animate-in zoom-in-95 duration-100">
          <button
            onClick={() => { onAddText(); setOpen(false); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <Type className="w-3.5 h-3.5 text-slate-500" /> Text Block
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <button
            onClick={() => { onAddDivider(); setOpen(false); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <Minus className="w-3.5 h-3.5 text-slate-500" /> Divider Line
          </button>
        </div>
      )}
    </div>
  );
}
