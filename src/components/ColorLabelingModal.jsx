import React, { useState } from "react";
import { Palette, Tag, Check, ChevronRight, X } from "lucide-react";

/**
 * ColorLabelingModal
 *
 * Triggered after BOB upload when the analyzer detects row fill colors.
 * Displays a color swatch for each unique hex found with a text input
 * so the rep can assign meaning (e.g. "Yellow = Follow Up Needed").
 * Labels are written back into the analyticsPayload.colorGroups array.
 *
 * @param {object[]} colorGroups     - analyticsPayload.colorGroups
 * @param {number}   uncoloredCount  - rows with no fill color
 * @param {number}   totalRows       - total row count for context
 * @param {function} onConfirm       - (labelledGroups) => void
 * @param {function} onSkip          - () => void  (proceeds without labels)
 */
export default function ColorLabelingModal({
  colorGroups,
  uncoloredCount,
  totalRows,
  onConfirm,
  onSkip,
}) {
  const [labels, setLabels] = useState(() =>
    Object.fromEntries(colorGroups.map(g => [g.hex, g.label || ""]))
  );

  const handleChange = (hex, value) => {
    setLabels(prev => ({ ...prev, [hex]: value }));
  };

  const handleConfirm = () => {
    const labelled = colorGroups.map(g => ({
      ...g,
      label: labels[g.hex]?.trim() || null,
    }));
    onConfirm(labelled);
  };

  const labelledCount = Object.values(labels).filter(v => v.trim()).length;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">

        {/* Header */}
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 flex items-start gap-4">
          <div className="bg-violet-50 p-2.5 rounded-xl border border-violet-100 shrink-0">
            <Palette className="w-6 h-6 text-violet-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Color-Coded Rows Detected</h2>
            <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
              We found <strong className="text-slate-700">{colorGroups.length} highlight color{colorGroups.length !== 1 ? "s" : ""}</strong> across your sheet.
              Label what each color means so your dashboards and filters are meaningful.
            </p>
          </div>
        </div>

        {/* Color swatches */}
        <div className="p-6 space-y-3 max-h-80 overflow-y-auto">
          {colorGroups.map(group => (
            <div key={group.hex} className="flex items-center gap-4">
              {/* Color swatch */}
              <div
                className="w-10 h-10 rounded-xl border border-slate-200 shadow-sm shrink-0"
                style={{ backgroundColor: `#${group.hex}` }}
                title={`#${group.hex}`}
              />
              {/* Count badge */}
              <div className="text-xs font-bold text-slate-500 w-14 shrink-0 text-right">
                {group.count} row{group.count !== 1 ? "s" : ""}
              </div>
              {/* Label input */}
              <div className="flex-1 relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="e.g. Follow Up, Hot Lead, Closed…"
                  value={labels[group.hex] || ""}
                  onChange={e => handleChange(group.hex, e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:border-violet-400 focus:ring-1 focus:ring-violet-300 outline-none transition-all"
                />
              </div>
            </div>
          ))}

          {/* Unlabelled rows note */}
          {uncoloredCount > 0 && (
            <div className="flex items-center gap-4 opacity-50">
              <div className="w-10 h-10 rounded-xl border-2 border-dashed border-slate-300 shrink-0" />
              <div className="text-xs font-bold text-slate-500 w-14 shrink-0 text-right">
                {uncoloredCount} rows
              </div>
              <span className="text-xs text-slate-400 italic">No highlight (default / unclassified)</span>
            </div>
          )}
        </div>

        {/* Progress indicator */}
        <div className="px-6 pb-2">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{labelledCount} of {colorGroups.length} colors labeled</span>
            <span>{Math.round((labelledCount / colorGroups.length) * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${(labelledCount / colorGroups.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-between items-center gap-3">
          <button
            onClick={onSkip}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
            Skip Labeling
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl shadow-md transition-all hover:-translate-y-0.5"
          >
            <Check className="w-4 h-4" />
            Apply Labels
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
