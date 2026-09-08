import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Database, Settings, Save, AlertCircle, FileText,
  Bold, Italic, X, AlignLeft, AlignCenter, AlignRight, Trash2,
  ChevronDown, ChevronUp, ExternalLink, Copy, Check,
} from "lucide-react";
import { sanitizeHtml } from "../lib/sanitize";
import { GAS_SCRIPT } from "../lib/gasScript";

// ── Draggable resize handle positions ─────────────────────────────────────────
// 8 handles: corners + edge midpoints
const HANDLE_DEFS = [
  { id: "nw", cursor: "nw-resize", top: -5, left: -5 },
  { id: "n", cursor: "n-resize", top: -5, left: "50%", transform: "translateX(-50%)" },
  { id: "ne", cursor: "ne-resize", top: -5, right: -5 },
  { id: "e", cursor: "e-resize", top: "50%", right: -5, transform: "translateY(-50%)" },
  { id: "se", cursor: "se-resize", bottom: -5, right: -5 },
  { id: "s", cursor: "s-resize", bottom: -5, left: "50%", transform: "translateX(-50%)" },
  { id: "sw", cursor: "sw-resize", bottom: -5, left: -5 },
  { id: "w", cursor: "w-resize", top: "50%", left: -5, transform: "translateY(-50%)" },
];

// ── Image resize overlay ───────────────────────────────────────────────────────
function ImgResizeOverlay({ imgEl, containerRef, onDeselect }) {
  const [rect, setRect] = useState(null);
  const dragRef = useRef(null); // { handleId, startX, startY, startW, startH, imgLeft, imgTop }

  const updateRect = useCallback(() => {
    if (!imgEl || !containerRef.current) return;
    const ir = imgEl.getBoundingClientRect();
    const cr = containerRef.current.getBoundingClientRect();
    setRect({
      top: ir.top - cr.top + containerRef.current.scrollTop,
      left: ir.left - cr.left,
      width: ir.width,
      height: ir.height,
    });
  }, [imgEl, containerRef]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    containerRef.current?.addEventListener("scroll", updateRect);
    return () => {
      window.removeEventListener("resize", updateRect);
      containerRef.current?.removeEventListener("scroll", updateRect);
    };
  }, [updateRect]);

  const onMouseDown = useCallback((e, handleId) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      handleId,
      startX: e.clientX,
      startY: e.clientY,
      startW: imgEl.offsetWidth || imgEl.naturalWidth || 200,
      startH: imgEl.offsetHeight || imgEl.naturalHeight || 200,
    };

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const { handleId: hid, startX, startY, startW, startH } = dragRef.current;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let newW = startW, newH = startH;

      // Calculate base changes based on direction
      if (hid.includes("e")) newW = Math.max(40, startW + dx);
      if (hid.includes("w")) newW = Math.max(40, startW - dx);
      if (hid.includes("s")) newH = Math.max(20, startH + dy);
      if (hid.includes("n")) newH = Math.max(20, startH - dy);

      const ratio = startH / startW;

      // Corners: maintain aspect ratio based on which axis moved more
      if (hid.length === 2) {
        if (Math.abs(dx) > Math.abs(dy)) {
          newH = newW * ratio;
        } else {
          newW = newH / ratio;
        }
        imgEl.style.width = `${Math.round(newW)}px`;
        imgEl.style.height = `${Math.round(newH)}px`;
      }
      // Horizontal edges (e, w): force height to auto to preserve aspect ratio
      else if (hid === "e" || hid === "w") {
        imgEl.style.width = `${Math.round(newW)}px`;
        imgEl.style.height = "auto";
      }
      // Vertical edges (n, s): force width to auto to preserve aspect ratio
      else if (hid === "n" || hid === "s") {
        imgEl.style.width = "auto";
        imgEl.style.height = `${Math.round(newH)}px`;
      }

      imgEl.style.maxWidth = "100%";
      updateRect();
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [imgEl, updateRect]);

  if (!rect) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        outline: "2px solid #eb1700",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {HANDLE_DEFS.map(h => (
        <div
          key={h.id}
          onMouseDown={e => onMouseDown(e, h.id)}
          style={{
            position: "absolute",
            width: 10,
            height: 10,
            background: "#eb1700",
            borderRadius: "50%",
            border: "2px solid #fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
            cursor: h.cursor,
            pointerEvents: "all",
            top: h.top,
            left: h.left,
            right: h.right,
            bottom: h.bottom,
            transform: h.transform,
            zIndex: 11,
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function RepSettingsModal({ isOpen, onClose, repSettings, setRepSettings, syncState }) {
  const [formData, setFormData] = useState({
    repId: repSettings.repId || "",
    gasUrl: repSettings.gasUrl || "",
    geminiApiKey: repSettings.geminiApiKey || "",
    firstName: repSettings.firstName || "",
    lastName: repSettings.lastName || "",
    title: repSettings.title || "Merchant Success Manager",
    phone: repSettings.phone || "",
  });

  const signatureRef = useRef(null);
  const sigContainerRef = useRef(null); // the scrollable container
  const [sigEmpty, setSigEmpty] = useState(!repSettings.signature);
  const [selImg, setSelImg] = useState(null);
  const [gasExpanded, setGasExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [authMsg, setAuthMsg] = useState(null);

  // Re-sync every time the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setGasExpanded(false);
    setCopied(false);
    setAuthMsg(null);
    setFormData({
      repId: repSettings.repId || "",
      gasUrl: repSettings.gasUrl || "",
      geminiApiKey: repSettings.geminiApiKey || "",
      firstName: repSettings.firstName || "",
      lastName: repSettings.lastName || "",
      title: repSettings.title || "Merchant Success Manager",
      phone: repSettings.phone || "",
    });
    const t = setTimeout(() => {
      if (signatureRef.current) {
        signatureRef.current.innerHTML = repSettings.signature || "";
        setSigEmpty(!repSettings.signature);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paste handler
  const handlePaste = (e) => {
    e.preventDefault();
    const clipHtml = e.clipboardData.getData("text/html");
    const clipText = e.clipboardData.getData("text/plain");
    let toInsert = clipHtml ? sanitizeHtml(clipHtml)
      : clipText ? clipText.split("\n").map(l => `<p>${l || "<br>"}</p>`).join("") : "";
    if (toInsert) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const frag = document.createRange().createContextualFragment(toInsert);
        range.insertNode(frag);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else if (signatureRef.current) {
        signatureRef.current.innerHTML += toInsert;
      }
      setSigEmpty(false);
    }
  };

  // ── ALL hooks before early return ─────────────────────────────────────────────
  if (!isOpen) return null;

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  // Open the GAS URL in a new tab so Google records the Gmail grant (one-time).
  // Uses the live form value so reps can authorize before hitting Save.
  const handleAuthorizeGas = () => {
    const url = (formData.gasUrl || "").trim();
    if (!url) {
      setAuthMsg({ type: "error", msg: "Paste your Web App URL into the field above first, then authorize." });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setAuthMsg({ type: "success", msg: "GAS opened in a new tab. If you see a Google permissions screen, click Allow. After that, Gmail Drafts will work silently." });
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(GAS_SCRIPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sigExec = (cmd, val = null) => {
    signatureRef.current?.focus();
    document.execCommand(cmd, false, val);
    setSigEmpty(!signatureRef.current?.textContent?.trim());
  };

  const handleSigClick = (e) => {
    if (e.target.tagName === "IMG") {
      setSelImg(e.target);
    } else {
      setSelImg(null);
    }
  };

  const handleAlign = (mode) => {
    if (selImg) {
      selImg.style.float = "";
      selImg.style.margin = "4px 0";
      selImg.style.display = "block";
      if (mode === "left") { selImg.style.float = "left"; selImg.style.margin = "4px 12px 4px 0"; }
      else if (mode === "right") { selImg.style.float = "right"; selImg.style.margin = "4px 0 4px 12px"; }
      else { selImg.style.marginLeft = "auto"; selImg.style.marginRight = "auto"; }
    } else {
      const execCmd = mode === "left" ? "justifyLeft" : mode === "right" ? "justifyRight" : "justifyCenter";
      sigExec(execCmd);
    }
  };

  const handleDeleteImg = () => {
    if (selImg) { selImg.remove(); setSelImg(null); setSigEmpty(!signatureRef.current?.textContent?.trim()); }
  };

  const handleSave = () => {
    let rawSig = signatureRef.current?.innerHTML || "";
    // Strip selection outline before saving
    const tmp = document.createElement("div");
    tmp.innerHTML = rawSig;
    tmp.querySelectorAll("img").forEach(img => { img.style.outline = ""; img.style.cursor = "pointer"; });
    rawSig = tmp.innerHTML.trim()
      .replace(/^(<br\s*\/?>|\s|<div><br\s*\/?><\/div>|<p><br\s*\/?><\/p>)+/gi, "")
      .replace(/(<br\s*\/?>|\s|<div><br\s*\/?><\/div>|<p><br\s*\/?><\/p>)+$/gi, "");
    const sig = rawSig === "<br>" || rawSig.trim() === "" ? "" : rawSig;
    setRepSettings({ ...formData, signature: sig });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && formData.repId) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">

        {/* Header */}
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 flex items-center gap-3 shrink-0">
          <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-200">
            <Settings className="w-6 h-6 text-slate-700" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Rep Configuration</h2>
            <p className="text-sm text-slate-500 font-medium">Saved to your rep profile · syncs across devices.</p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">

          {/* ── Email Signature ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" /> Email Signature
            </h3>

            {/* Mini-toolbar */}
            <div className="flex items-center gap-1 bg-slate-50 border border-b-0 border-slate-200 rounded-t-xl px-3 py-2 flex-wrap">
              <SigBtn onCmd={() => sigExec("bold")} title="Bold"><Bold className="w-3.5 h-3.5" /></SigBtn>
              <SigBtn onCmd={() => sigExec("italic")} title="Italic"><Italic className="w-3.5 h-3.5" /></SigBtn>
              <SigBtn onCmd={() => sigExec("underline")} title="Underline">
                <span className="text-xs font-bold underline leading-none">U</span>
              </SigBtn>
              <SigBtn onCmd={() => sigExec("removeFormat")} title="Clear formatting">
                <X className="w-3.5 h-3.5" />
              </SigBtn>

              <div className="w-px h-4 bg-slate-300 mx-1" />
              <SigBtn onCmd={() => handleAlign("left")} title="Align Left">
                <AlignLeft className="w-3.5 h-3.5" />
              </SigBtn>
              <SigBtn onCmd={() => handleAlign("center")} title="Align Center">
                <AlignCenter className="w-3.5 h-3.5" />
              </SigBtn>
              <SigBtn onCmd={() => handleAlign("right")} title="Align Right">
                <AlignRight className="w-3.5 h-3.5" />
              </SigBtn>

              {selImg && (
                <>
                  <div className="w-px h-4 bg-slate-300 mx-1" />
                  <span className="text-[10px] font-bold text-slate-500">Image:</span>
                  <SigBtn onCmd={handleDeleteImg} title="Remove image">
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </SigBtn>
                  <span className="text-[10px] text-slate-400 ml-1">Drag the red dots to resize</span>
                </>
              )}

              {!selImg && (
                <span className="ml-auto text-[10px] text-slate-400 hidden sm:block">
                  Paste · click an image to select &amp; resize
                </span>
              )}
            </div>

            {/* Signature area   relative container for the resize overlay */}
            <div ref={sigContainerRef} className="relative">
              <div
                ref={signatureRef}
                contentEditable
                suppressContentEditableWarning
                onPaste={handlePaste}
                onClick={handleSigClick}
                onInput={() => {
                  setSigEmpty(!signatureRef.current?.textContent?.trim());
                  // Deselect image if it was deleted
                  if (selImg && !signatureRef.current?.contains(selImg)) setSelImg(null);
                }}
                style={{
                  minHeight: 120,
                  maxHeight: 280,
                  overflowY: "auto",
                  overflowX: "hidden",
                  fontFamily: "Arial, Helvetica, sans-serif",
                  fontSize: "14px",
                  lineHeight: "1.6",
                  position: "relative",
                }}
                className={`w-full bg-white border rounded-b-xl rounded-t-none px-4 py-3 outline-none
                  text-sm text-slate-800 transition-all
                  focus:border-dd-red focus:ring-1 focus:ring-dd-red
                  [&_img]:block [&_img]:max-w-full [&_table]:w-full
                  ${sigEmpty ? "border-slate-300" : "border-slate-400"}`}
              />
              {sigEmpty && (
                <p className="absolute top-3 left-4 text-sm text-slate-400 pointer-events-none select-none">
                  Paste your Gmail / Outreach signature here (Ctrl+V)…
                </p>
              )}

              {/* Draggable resize overlay   appears over the selected image */}
              {selImg && sigContainerRef.current && (
                <ImgResizeOverlay
                  imgEl={selImg}
                  containerRef={sigContainerRef}
                  onDeselect={() => setSelImg(null)}
                />
              )}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Paste from Gmail or Outreach. <strong>Click any image</strong> to show 8 drag handles   pull any dot to resize. Use the alignment buttons above for Left / Center / Right positioning.
            </p>
          </div>

          <div className="h-px w-full bg-slate-100" />

          {/* System Integration */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">System Integration</h3>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-slate-400" /> Assisted Rep ID (Salesforce)
              </label>
              <input type="text" name="repId" value={formData.repId} onChange={handleChange}
                placeholder="e.g. 563543"
                className="w-full bg-slate-50 border border-slate-300 font-mono text-sm rounded-xl px-4 py-2.5 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all" />
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">Crucial for attribution. Injected into every deep link.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-dd-red" /> Google Apps Script Web App URL
              </label>
              <input type="url" name="gasUrl" value={formData.gasUrl} onChange={handleChange}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full bg-slate-50 border border-slate-300 font-mono text-xs rounded-xl px-4 py-2.5 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all" />
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <button type="button" onClick={() => setGasExpanded(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-bold text-slate-700">
                <span className="flex items-center gap-2">
                  One-time Google Apps Script Setup
                  {formData.gasUrl?.trim()
                    ? <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-bold">✓ Configured</span>
                    : <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">Not set up</span>
                  }
                </span>
                {gasExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {gasExpanded && (
                <div className="px-5 py-5 bg-white space-y-4 border-t border-slate-200 text-sm text-slate-700">
                  <ol className="list-decimal list-inside space-y-2 text-slate-600">
                    <li>Go to <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">script.google.com</a> and create a <strong>New Project</strong>.</li>
                    <li>Delete any existing code and paste the script below.</li>
                    <li>Click <strong>Deploy → New Deployment → Web App</strong>. <span className="text-xs text-amber-600 font-bold">(Always choose &quot;New Deployment&quot; if updating!)</span></li>
                    <li>Set <em>Execute as</em> = <strong>Me</strong>, <em>Who has access</em> = <strong>Anyone within DoorDash</strong>.</li>
                    <li>Click Deploy, authorize Gmail permissions, and <strong>copy the Web App URL</strong>.</li>
                    <li>Paste that URL into the <strong>Google Apps Script Web App URL</strong> field above, then hit <strong>Save Configuration</strong>.</li>
                    <li className="font-semibold text-slate-800">Click the <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md text-xs">Authorize GAS</span> button below — this opens your script once so Google records your approval. Only needed the first time.</li>
                  </ol>

                  <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-800">⚡ First-time authorization required</p>
                      <p className="text-xs text-amber-700 mt-0.5">Opens your GAS script in a new tab. If Google shows a permissions screen, click <strong>Allow</strong>. Only needed once per browser.</p>
                    </div>
                    <button type="button" onClick={handleAuthorizeGas}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap shadow-sm">
                      <ExternalLink className="w-3 h-3" /> Authorize GAS
                    </button>
                  </div>
                  {authMsg && (
                    <p className={`text-xs font-semibold ${authMsg.type === "error" ? "text-red-600" : "text-green-700"}`}>{authMsg.msg}</p>
                  )}

                  <div className="relative">
                    <pre className="bg-slate-900 text-green-300 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed font-mono whitespace-pre">
                      {GAS_SCRIPT}
                    </pre>
                    <button type="button" onClick={handleCopyScript}
                      className="absolute top-3 right-3 flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                      {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <strong>How it works:</strong> Instead of a network API call, the app submits a hidden browser form to your GAS URL. This automatically includes your DoorDash Google session cookies, so GAS authenticates you silently — no CORS issues, no IT approvals needed.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          {/* Sync status badge */}
          <div className="min-w-0">
            {syncState === "saving" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin inline-block" />
                Saving to cloud…
              </span>
            )}
            {syncState === "saved" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <span className="w-4 h-4 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-[10px]">✓</span>
                Saved to cloud
              </span>
            )}
            {syncState === "failed" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
                <span className="w-4 h-4 rounded-full bg-red-100 border border-red-300 flex items-center justify-center text-[10px]">✗</span>
                Sync failed — check console
              </span>
            )}
          </div>
          <div className="flex gap-3 shrink-0">
            {formData.repId && (
              <button onClick={onClose}
                className="px-6 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition-colors shadow-sm">
                Cancel
              </button>
            )}
            <button onClick={handleSave} disabled={!formData.repId}
              className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-dd-red hover:bg-dd-red-dark shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Save className="w-4 h-4" /> Save Configuration
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function SigBtn({ onCmd, title, children }) {
  return (
    <button type="button" title={title}
      onMouseDown={e => { e.preventDefault(); onCmd(); }}
      className="p-1.5 rounded text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors">
      {children}
    </button>
  );
}
