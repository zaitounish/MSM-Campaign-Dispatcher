import React, { useState } from "react";
import {
  ChevronUp, ChevronDown, Pencil, Trash2, Lock,
  Check, X, Link,
} from "lucide-react";
import BlockTextEditor from "./BlockTextEditor";
import { BLOCK_TYPES } from "../lib/emailBlockEngine";

/**
 * BlockCard (v2 | Visual Email Editor)
 *
 * Renders each block as the ACTUAL email section it represents | not an
 * abstract card strip. The rep sees the email being composed in real time.
 *
 * Interaction model:
 *  - Hover     → floating control bar appears (top-right: move up / move down / edit / delete)
 *  - Click edit → an inline edit panel expands BELOW the visual preview
 *  - DIVIDER   → shown as a real <hr> with remove/add controls
 *  - SIGNATURE → shows the actual signature text; "locked" badge instead of edit
 */
export default function BlockCard({
  block,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onDelete,
}) {
  const [editing, setEditing] = useState(false);

  const isLocked = block.locked || block.type === BLOCK_TYPES.SIGNATURE;

  return (
    <div className="group relative">
      {/* ── Floating control bar (appears on hover) ── */}
      {!isLocked && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-white border border-slate-200 rounded-xl shadow-md p-1">
          <CtrlBtn onClick={onMoveUp} disabled={!canMoveUp} title="Move up">
            <ChevronUp className="w-3.5 h-3.5" />
          </CtrlBtn>
          <CtrlBtn onClick={onMoveDown} disabled={!canMoveDown} title="Move down">
            <ChevronDown className="w-3.5 h-3.5" />
          </CtrlBtn>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <CtrlBtn
            onClick={() => setEditing(v => !v)}
            title={editing ? "Done editing" : "Edit this block"}
            active={editing}
          >
            {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </CtrlBtn>
          <CtrlBtn onClick={onDelete} title="Remove block" danger>
            <Trash2 className="w-3.5 h-3.5" />
          </CtrlBtn>
        </div>
      )}

      {/* ── Locked signature badge ── */}
      {isLocked && block.type === BLOCK_TYPES.SIGNATURE && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-violet-50 border border-violet-200 text-violet-600 text-[10px] font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
          <Lock className="w-3 h-3" /> Auto from Settings
        </div>
      )}

      {/* ── Visual block preview ── */}
      <div
        className={`rounded-xl border-2 transition-all cursor-default overflow-hidden
          ${editing
            ? "border-violet-400 shadow-lg shadow-violet-50"
            : "border-transparent hover:border-slate-300 hover:shadow-sm"
          }
          ${block.type === BLOCK_TYPES.DIVIDER ? "py-1" : ""}
        `}
        onClick={() => !isLocked && !editing && setEditing(true)}
      >
        <BlockVisual block={block} />
      </div>

      {/* ── Inline edit panel ── */}
      {editing && !isLocked && (
        <div className="mt-1 rounded-xl border-2 border-violet-300 bg-violet-50 overflow-hidden animate-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between px-4 py-2 bg-violet-100 border-b border-violet-200">
            <span className="text-xs font-bold text-violet-700 uppercase tracking-wider">
              Editing: {blockLabel(block.type)}
            </span>
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 text-xs text-violet-600 font-bold hover:text-violet-800 transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Done
            </button>
          </div>

          <div className="p-4">
            <BlockEditPanel block={block} onUpdate={onUpdate} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Visual preview renderers ──────────────────────────────────────────────────

function BlockVisual({ block }) {
  switch (block.type) {

    case BLOCK_TYPES.TEXT:
    case BLOCK_TYPES.CTA:
      return (
        <div
          className="px-5 py-4 text-sm text-slate-700 leading-relaxed
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
            [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
            [&_li]:my-0.5 [&_a]:text-blue-600 [&_a]:underline
            [&_strong]:font-bold [&_em]:italic"
          style={{ fontFamily: "sans-serif" }}
          dangerouslySetInnerHTML={{ __html: block.data.html || "<p class='text-slate-400 italic'>Empty text block…</p>" }}
        />
      );

    case BLOCK_TYPES.PROMO:
      return (
        <div className="px-5 py-4" style={{ borderTop: "1px solid #eee", fontFamily: "sans-serif" }}>
          <h3 className="font-bold mb-3" style={{ color: "#eb1700", fontSize: 15 }}>
            ━━━ 🚀 {block.data.title} ━━━
          </h3>
          <div
            className="text-sm text-slate-600 leading-relaxed mb-4
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
              [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
              [&_li]:my-0.5 [&_a]:text-blue-600 [&_a]:underline
              [&_strong]:font-bold [&_em]:italic"
            dangerouslySetInnerHTML={{ __html: block.data.body || "" }}
          />
          <span
            className="inline-block text-sm font-bold text-white px-5 py-2.5 rounded-lg select-none"
            style={{ background: "#eb1700" }}
          >
            {block.data.buttonText}
          </span>
          {block.data.customUrl && (
            <p className="mt-2 text-[11px] text-slate-400 font-mono flex items-center gap-1">
              <Link className="w-3 h-3" /> Custom URL set
            </p>
          )}
        </div>
      );

    case BLOCK_TYPES.CREDIT:
      return (
        <div
          className="mx-4 my-3 px-4 py-3 rounded-lg text-sm"
          style={{ background: "#f0fdf4", borderLeft: "4px solid #22c55e" }}
        >
          <p className="font-bold text-green-800 mb-1">💳 Unlock Exclusive DoorDash Credits</p>
          <p className="text-green-700 text-xs leading-relaxed">{block.data.body}</p>
        </div>
      );

    case BLOCK_TYPES.DIVIDER:
      return (
        <div className="px-4 flex items-center gap-3 py-1">
          <hr className="flex-1 border-slate-300" />
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-widest select-none">divider</span>
          <hr className="flex-1 border-slate-300" />
        </div>
      );

    case BLOCK_TYPES.SIGNATURE: {
      const { firstName = "", lastName = "", title = "Merchant Success", phone = "" } = block.data.repSettings || {};
      return (
        <div className="px-5 py-4 text-sm text-slate-700" style={{ fontFamily: "sans-serif" }}>
          <p className="mb-1 text-slate-500">Best regards,</p>
          <p className="font-bold text-slate-800">{firstName} {lastName}</p>
          <p className="text-slate-600">{title}</p>
          {phone && <p className="text-slate-600">{phone}</p>}
          <p className="text-slate-600">DoorDash Merchant Success</p>
        </div>
      );
    }

    default:
      return null;
  }
}

// ─── Inline edit panels ────────────────────────────────────────────────────────

function BlockEditPanel({ block, onUpdate }) {
  switch (block.type) {

    case BLOCK_TYPES.TEXT:
    case BLOCK_TYPES.CTA:
      return (
        <BlockTextEditor
          html={block.data.html}
          onChange={html => onUpdate({ ...block.data, html })}
        />
      );

    case BLOCK_TYPES.PROMO:
      return (
        <div className="space-y-4">
          {/* Section title */}
          <div>
            <label className="block text-xs font-bold text-violet-700 uppercase tracking-wider mb-1.5">
              Section Title
            </label>
            <input
              value={block.data.title || ""}
              onChange={e => onUpdate({ ...block.data, title: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:border-violet-400 focus:ring-1 focus:ring-violet-300 outline-none transition-all"
            />
          </div>

          {/* Body text */}
          <div>
            <label className="block text-xs font-bold text-violet-700 uppercase tracking-wider mb-1.5">
              Body Text
            </label>
            <BlockTextEditor
              html={block.data.body}
              onChange={body => onUpdate({ ...block.data, body })}
              minHeight={80}
            />
          </div>

          {/* Button label */}
          <div>
            <label className="block text-xs font-bold text-violet-700 uppercase tracking-wider mb-1.5">
              Button Label
            </label>
            <input
              value={block.data.buttonText || ""}
              onChange={e => onUpdate({ ...block.data, buttonText: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:border-violet-400 focus:ring-1 focus:ring-violet-300 outline-none transition-all"
            />
          </div>

          {/* Custom URL */}
          <div>
            <label className="block text-xs font-bold text-violet-700 uppercase tracking-wider mb-1">
              Custom Button URL{" "}
              <span className="text-slate-400 font-normal normal-case tracking-normal">
                (leave blank to use auto deep link)
              </span>
            </label>
            <input
              value={block.data.customUrl || ""}
              onChange={e => onUpdate({ ...block.data, customUrl: e.target.value || null })}
              placeholder="https://… or leave blank"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 font-mono focus:border-violet-400 focus:ring-1 focus:ring-violet-300 outline-none transition-all"
            />
          </div>
        </div>
      );

    case BLOCK_TYPES.CREDIT:
      return (
        <div>
          <label className="block text-xs font-bold text-violet-700 uppercase tracking-wider mb-1.5">
            Banner Text
          </label>
          <textarea
            value={block.data.body || ""}
            onChange={e => onUpdate({ ...block.data, body: e.target.value })}
            rows={3}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:border-violet-400 focus:ring-1 focus:ring-violet-300 outline-none resize-none transition-all"
          />
        </div>
      );

    case BLOCK_TYPES.DIVIDER:
      return (
        <p className="text-xs text-slate-500 py-1">
          This is a horizontal divider line. Use the trash icon to remove it, or move it up/down between sections.
        </p>
      );

    default:
      return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const blockLabel = (type) => ({
  [BLOCK_TYPES.TEXT]: "Text Block",
  [BLOCK_TYPES.CTA]: "Call to Action",
  [BLOCK_TYPES.PROMO]: "Promo Section",
  [BLOCK_TYPES.CREDIT]: "Credit Banner",
  [BLOCK_TYPES.DIVIDER]: "Divider",
  [BLOCK_TYPES.SIGNATURE]: "Signature",
}[type] ?? type);

function CtrlBtn({ onClick, disabled, title, children, active, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none
        ${active ? "bg-violet-100 text-violet-700" : ""}
        ${danger ? "text-slate-400 hover:bg-red-50 hover:text-red-500" : ""}
        ${!active && !danger ? "text-slate-500 hover:bg-slate-100 hover:text-slate-800" : ""}
      `}
    >
      {children}
    </button>
  );
}
