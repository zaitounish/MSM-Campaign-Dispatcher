import React, { useRef, useEffect, useState } from "react";
import { Bold, Italic, Underline, List, Link, X, Check } from "lucide-react";

/**
 * BlockTextEditor
 *
 * Isolated rich-text editor for a single TEXT or CTA block.
 *
 * Fixes vs v1:
 *  - List styles (disc / decimal) are now explicitly applied via CSS so
 *    bullets actually render inside the contentEditable container.
 *  - Link insertion uses an inline URL bar (not window.prompt) so it works
 *    reliably in all browsers without popup-blocker interference.
 *  - Selection is saved before the link bar opens and restored when applying,
 *    so the <a> wraps the correct text.
 *
 * Keyboard shortcuts (still work when focus is in the editor):
 *   Ctrl/Cmd + B → Bold
 *   Ctrl/Cmd + I → Italic
 *   Ctrl/Cmd + U → Underline
 */
export default function BlockTextEditor({ html, onChange, minHeight = 100 }) {
  const editorRef = useRef(null);
  const linkRef = useRef(null);
  const savedRange = useRef(null); // saved Selection before link bar opens

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");

  // Set initial HTML once | never sync from props after mount
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = html || "";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus link input when the bar opens
  useEffect(() => {
    if (linkOpen) setTimeout(() => linkRef.current?.focus(), 30);
  }, [linkOpen]);

  // ── execCommand wrapper ───────────────────────────────────────────────────────
  const exec = (cmd, value = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    switch (e.key.toLowerCase()) {
      case "b": e.preventDefault(); exec("bold"); break;
      case "i": e.preventDefault(); exec("italic"); break;
      case "u": e.preventDefault(); exec("underline"); break;
      default: break;
    }
  };

  // ── Link bar helpers ──────────────────────────────────────────────────────────
  const openLinkBar = () => {
    // Save current selection BEFORE the editor loses focus when the button is clicked
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
    setLinkUrl("https://");
    setLinkOpen(true);
  };

  const applyLink = () => {
    if (!linkUrl.trim() || linkUrl === "https://") {
      setLinkOpen(false);
      return;
    }
    const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;

    // Restore saved selection, then insert link
    if (savedRange.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    editorRef.current?.focus();
    document.execCommand("createLink", false, url);

    savedRange.current = null;
    setLinkOpen(false);
    onChange(editorRef.current?.innerHTML || "");
  };

  const cancelLink = () => {
    savedRange.current = null;
    setLinkOpen(false);
  };

  // ── Serialise on blur ─────────────────────────────────────────────────────────
  const handleBlur = (e) => {
    // Don't serialise if focus moved into the link bar
    if (linkRef.current?.contains(e.relatedTarget)) return;
    onChange(editorRef.current?.innerHTML || "");
  };

  return (
    <div className="border border-slate-300 rounded-xl overflow-hidden focus-within:border-violet-400 focus-within:ring-1 focus-within:ring-violet-300 transition-all">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex-wrap">

        <Btn onCmd={() => exec("bold")} title="Bold (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" />
        </Btn>
        <Btn onCmd={() => exec("italic")} title="Italic (Ctrl+I)">
          <Italic className="w-3.5 h-3.5" />
        </Btn>
        <Btn onCmd={() => exec("underline")} title="Underline (Ctrl+U)">
          <Underline className="w-3.5 h-3.5" />
        </Btn>

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* Bullet list */}
        <Btn
          onCmd={() => exec("insertUnorderedList")}
          title="Bullet list"
          active={false}
        >
          <List className="w-3.5 h-3.5" />
        </Btn>

        {/* Numbered list */}
        <Btn
          onCmd={() => exec("insertOrderedList")}
          title="Numbered list"
          className="font-mono text-xs font-bold px-1.5 min-w-[28px]"
        >
          1.
        </Btn>

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* Link button | opens inline URL bar */}
        <Btn
          onCmd={openLinkBar}
          title="Insert link"
          active={linkOpen}
        >
          <Link className="w-3.5 h-3.5" />
        </Btn>

        <Btn onCmd={() => exec("removeFormat")} title="Clear formatting">
          <X className="w-3.5 h-3.5" />
        </Btn>
      </div>

      {/* ── Inline link URL bar ── */}
      {linkOpen && (
        <div
          ref={linkRef}
          className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200 animate-in slide-in-from-top-1 duration-100"
        >
          <Link className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <input
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); applyLink(); }
              if (e.key === "Escape") cancelLink();
            }}
            placeholder="https://..."
            className="flex-1 text-sm bg-white border border-blue-300 rounded-lg px-2.5 py-1 outline-none focus:border-blue-500 font-mono"
          />
          <button
            onClick={applyLink}
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Apply
          </button>
          <button
            onClick={cancelLink}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Editing surface ── */}
      {/*
        Critical CSS for list rendering inside contentEditable:
        - [&_ul] and [&_ol] selectors apply Tailwind arbitrary variants to force
          browser-default list styles which contentEditable strips by default.
        - without list-style-type:disc the bullets simply don't appear.
      */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`
          px-4 py-3 outline-none text-sm text-slate-800 leading-relaxed
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
          [&_li]:my-0.5
          [&_a]:text-blue-600 [&_a]:underline
          [&_strong]:font-bold [&_em]:italic
        `}
        style={{ minHeight, fontFamily: "sans-serif", whiteSpace: "normal" }}
      />
    </div>
  );
}

function Btn({ onCmd, title, children, className = "", active = false }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onCmd(); }}
      className={`p-1.5 rounded text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors ${active ? "bg-slate-200 text-slate-900" : ""
        } ${className}`}
    >
      {children}
    </button>
  );
}
