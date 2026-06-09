import React, { useState, useRef } from "react";
import { UploadCloud, Loader2, FileSpreadsheet, AlertTriangle, RefreshCw, Plus, X, Files } from "lucide-react";
import * as XLSX from "xlsx";
import { processSheetData } from "../lib/bobParser";
import { analyzeBOB } from "../lib/bobAnalyzer";

export default function UploadZone({ onDataLoaded }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Multi-file pending queue: each entry = { fileName, wb, sheets[] }
  const [pendingFiles, setPendingFiles] = useState([]); // files waiting for sheet selection
  const [stagedFiles, setStagedFiles] = useState([]); // files fully resolved, waiting to merge

  const fileInputRef = useRef(null);

  // ── Read a raw File object into an XLSX workbook ──────────────────────────
  const readWorkbook = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellStyles: true });
          resolve(wb);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("File could not be read"));
      reader.readAsArrayBuffer(file);
    });

  // ── Handle file(s) dropped / selected ────────────────────────────────────
  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploadError("");
    setIsProcessing(true);

    const newPending = [];
    const newStaged = [];

    for (const file of Array.from(files)) {
      try {
        const wb = await readWorkbook(file);
        if (wb.SheetNames.length === 1) {
          // Auto-resolve single-sheet workbooks immediately
          newStaged.push({ fileName: file.name, wb, sheetName: wb.SheetNames[0] });
        } else {
          // Multi-sheet: ask user which sheet to use
          newPending.push({ fileName: file.name, wb, sheets: wb.SheetNames });
        }
      } catch (err) {
        setUploadError(`Could not read "${file.name}": ${err.message || "Unknown error"}.`);
      }
    }

    setIsProcessing(false);

    if (newPending.length > 0) {
      setPendingFiles(prev => [...prev, ...newPending]);
    }

    if (newStaged.length > 0) {
      setStagedFiles(prev => [...prev, ...newStaged]);
    }

    // If nothing needs sheet selection, merge immediately
    if (newPending.length === 0 && newStaged.length > 0) {
      mergeAndFinish([...stagedFiles, ...newStaged]);
    }
  };

  // ── User picks a sheet for a pending file ─────────────────────────────────
  const resolveSheet = (fileName, wb, sheetName) => {
    const resolved = { fileName, wb, sheetName };
    const remaining = pendingFiles.filter(p => p.fileName !== fileName);
    setPendingFiles(remaining);
    const updatedStaged = [...stagedFiles, resolved];
    setStagedFiles(updatedStaged);

    // If all pending files are resolved, merge
    if (remaining.length === 0) {
      mergeAndFinish(updatedStaged);
    }
  };

  // ── Merge all staged files into one merchant list ─────────────────────────
  const mergeAndFinish = (allStaged) => {
    setIsProcessing(true);
    setUploadError("");

    setTimeout(() => {
      try {
        // Map: storeId → merchant object (first-seen wins for data)
        // We also count how many files each merchant appeared in
        const merchantMap = new Map(); // storeId → { merchant, filesSeen: Set }
        const sheetsData = [];

        for (const { wb, sheetName } of allStaged) {
          const ws = wb.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
          sheetsData.push({ ws, json });

          const parsed = processSheetData(json);
          if (!parsed || parsed.length === 0) continue;

          for (const merchant of parsed) {
            const key = String(merchant.id || merchant.merchantId || merchant.storeId || merchant.merchantName);
            if (merchantMap.has(key)) {
              merchantMap.get(key).filesSeen.add(sheetName + wb.SheetNames[0]);
            } else {
              merchantMap.set(key, { merchant, filesSeen: new Set([sheetName + wb.SheetNames[0]]) });
            }
          }
        }

        if (merchantMap.size === 0) {
          setUploadError("No valid merchant rows found in any of the uploaded files.");
          setIsProcessing(false);
          return;
        }

        // Attach bobFileCount to each merchant
        const merged = Array.from(merchantMap.values()).map(({ merchant, filesSeen }) => ({
          ...merchant,
          bobFileCount: filesSeen.size,
        }));

        // Run analytics collectively on all uploaded files
        const analyticsPayload = sheetsData.length > 0
          ? analyzeBOB(sheetsData)
          : null;

        onDataLoaded(merged, analyticsPayload);

        // Reset all state
        setPendingFiles([]);
        setStagedFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        console.error("Error merging BOB files:", err);
        setUploadError(`Could not merge files: ${err.message || "Unknown error"}.`);
      } finally {
        setIsProcessing(false);
      }
    }, 50);
  };

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files); };

  const totalFilesLoading = pendingFiles.length + stagedFiles.length;

  return (
    <div className="flex flex-col items-center justify-center py-16 animate-in fade-in duration-500">

      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 text-dd-red animate-spin" />
              {stagedFiles.length > 1 ? "Merging Books of Business..." : "Processing Book of Business..."}
            </h3>
            <p className="text-sm text-slate-500">
              Reading data, running deduplication, mapping emails...
            </p>
          </div>
        </div>
      )}

      {/* Staged files list (ready to merge once all pending are resolved) */}
      {stagedFiles.length > 0 && pendingFiles.length > 0 && (
        <div className="w-full max-w-3xl mb-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Files Ready</div>
          <div className="space-y-1.5">
            {stagedFiles.map(f => (
              <div key={f.fileName} className="flex items-center gap-2 text-sm text-slate-700">
                <FileSpreadsheet className="w-4 h-4 text-green-500 shrink-0" />
                <span className="flex-1 truncate">{f.fileName}</span>
                <span className="text-xs text-green-600 font-bold">✓ {f.sheetName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sheet-selection cards for multi-sheet workbooks */}
      {pendingFiles.map((pending) => (
        <div key={pending.fileName} className="w-full max-w-3xl bg-white border border-slate-200 rounded-3xl shadow-sm p-8 mb-4 animate-in zoom-in-95 duration-300">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-slate-100 p-2.5 rounded-xl">
              <FileSpreadsheet className="w-6 h-6 text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-slate-800">Multiple Sheets Detected</h3>
              <p className="text-slate-500 truncate text-sm">{pending.fileName}</p>
            </div>
            <button
              onClick={() => setPendingFiles(prev => prev.filter(p => p.fileName !== pending.fileName))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-4">Select the sheet that contains your rep's data:</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-2 pb-2">
            {pending.sheets.map(sheet => (
              <button
                key={sheet}
                onClick={() => resolveSheet(pending.fileName, pending.wb, sheet)}
                className="bg-slate-50 border border-slate-200 hover:border-dd-red hover:bg-red-50 text-slate-700 font-medium py-3.5 px-4 rounded-xl text-sm transition-all focus:ring-2 focus:ring-dd-red focus:outline-none text-left break-all shadow-sm"
              >
                {sheet}
              </button>
            ))}
          </div>
        </div>
      ))}

      <input
        type="file"
        accept=".xlsx,.xls,.xlsm,.xlsb,.csv,.tsv,.ods,.xltx,.xltm"
        multiple
        className="hidden"
        ref={fileInputRef}
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      {/* Inline error card */}
      {uploadError && !isProcessing && (
        <div className="w-full max-w-3xl mb-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-6 py-4 animate-in fade-in duration-300">
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 mb-1">Upload failed</p>
            <p className="text-xs text-red-600 leading-relaxed">{uploadError}</p>
          </div>
          <button
            onClick={() => { setUploadError(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 transition-colors shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </button>
        </div>
      )}

      {/* Drop zone always visible when no pending sheet selections */}
      {pendingFiles.length === 0 && !isProcessing && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`w-full max-w-3xl border-2 border-dashed rounded-3xl p-16 text-center transition-all duration-200 bg-white shadow-sm ${isDragging
            ? "border-dd-red bg-red-50/50 scale-[1.02]"
            : "border-slate-300 hover:border-dd-red hover:shadow-md"
            }`}
        >
          <div className="mx-auto w-20 h-20 mb-6 rounded-full bg-red-50 flex items-center justify-center">
            {stagedFiles.length > 0
              ? <Files className="w-10 h-10 text-dd-red" />
              : <UploadCloud className="w-10 h-10 text-dd-red" />
            }
          </div>

          {stagedFiles.length > 0 ? (
            <>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">
                {stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""} ready
              </h3>
              <p className="text-slate-500 mb-2 text-sm">
                {stagedFiles.map(f => f.fileName).join(", ")}
              </p>
              <p className="text-slate-400 mb-8 text-sm">
                Drop more files to add them, or continue with what you have.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:border-dd-red hover:text-dd-red transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add More Files
                </button>
                <button
                  onClick={() => mergeAndFinish(stagedFiles)}
                  className="flex items-center gap-2 px-8 py-3.5 bg-dd-red text-white font-semibold rounded-xl shadow-sm hover:bg-dd-red-dark transition-colors"
                >
                  Merge & Continue →
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-2xl font-bold text-slate-800 mb-3">
                Drag and drop your Book{" "}
                <span className="text-dd-red">of Business</span>
              </h3>
              <p className="text-slate-500 mb-2 max-w-md mx-auto leading-relaxed">
                Upload <strong className="text-slate-700">one or multiple Excel (.xlsx)</strong> files.
                Merchants are automatically merged and deduplicated across files.
              </p>
              <p className="text-xs text-slate-400 mb-8">
                Each merchant will show how many BOBs they appeared in.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-8 py-3.5 bg-dd-red text-white font-semibold rounded-xl shadow-sm hover:bg-dd-red-dark transition-colors"
              >
                Browse Files
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
