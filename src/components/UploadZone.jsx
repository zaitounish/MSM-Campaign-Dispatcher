import React, { useState, useRef } from "react";
import { UploadCloud, Loader2, FileSpreadsheet } from "lucide-react";
import { processSheetData } from "../lib/bobParser";
import { analyzeBOB } from "../lib/bobAnalyzer";

export default function UploadZone({ onDataLoaded }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingWorkbook, setPendingWorkbook] = useState(null);
  const [availableSheets, setAvailableSheets] = useState([]);
  const fileInputRef = useRef(null);

  const processSheet = (wb, sheetName) => {
    setIsProcessing(true);
    setTimeout(() => {
      try {
        const ws = wb.Sheets[sheetName];
        const json = window.XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: null,
          raw: false,
        });

        // Run the analytics engine on the raw worksheet + json
        // Must happen before processSheetData (which deduplicates rows)
        const analyticsPayload = analyzeBOB(ws, json);

        const processed = processSheetData(json);
        // Pass both the merchant list AND the analytics payload up to App
        onDataLoaded(processed, analyticsPayload);
      } catch (err) {
        console.error("Error processing sheet:", err);
        alert("Failed to parse the selected sheet.");
      } finally {
        setIsProcessing(false);
        setPendingWorkbook(null);
        setAvailableSheets([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }, 50);
  };

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    if (!window.XLSX) {
      alert("Excel engine is still loading. Please wait a moment.");
      return;
    }

    setIsProcessing(true);
    const file = files[0]; // Assuming one BOB file processed at a time

    try {
      const data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(new Uint8Array(e.target.result));
        reader.readAsArrayBuffer(file);
      });

      // Briefly yield to the UI thread so the loading overlay appears
      await new Promise(r => setTimeout(r, 50));

      // cellStyles: true is required for cell fill color extraction in bobAnalyzer
      const wb = window.XLSX.read(data, { type: "array", cellStyles: true });
      
      if (wb.SheetNames.length === 1) {
        processSheet(wb, wb.SheetNames[0]);
      } else {
        setPendingWorkbook(wb);
        setAvailableSheets(wb.SheetNames);
        setIsProcessing(false);
      }
      
    } catch (err) {
      console.error("Error reading Excel file:", err);
      alert("Failed to read file. Make sure it's a valid Excel file.");
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 animate-in fade-in duration-500">
      
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 text-dd-red animate-spin" /> 
              Processing Book of Business...
            </h3>
            <p className="text-sm text-slate-500">
              Reading data, running deduplication, mapping emails...
            </p>
          </div>
        </div>
      )}

      {availableSheets.length > 0 && !isProcessing && (
        <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-3xl shadow-sm p-8 animate-in zoom-in-95 duration-300">
           <div className="flex items-center gap-3 mb-2">
             <div className="bg-slate-100 p-2.5 rounded-xl">
               <FileSpreadsheet className="w-6 h-6 text-slate-600" />
             </div>
             <div>
               <h3 className="text-xl font-bold text-slate-800">Multiple Sheets Detected</h3>
               <p className="text-slate-500">Please select your specific rep sheet from the workbook below:</p>
             </div>
           </div>
           
           <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-2 pb-2">
             {availableSheets.map(sheet => (
                <button
                  key={sheet}
                  onClick={() => processSheet(pendingWorkbook, sheet)}
                  className="bg-slate-50 border border-slate-200 hover:border-dd-red hover:bg-red-50 text-slate-700 font-medium py-3.5 px-4 rounded-xl text-sm transition-all focus:ring-2 focus:ring-dd-red focus:outline-none text-left break-all shadow-sm"
                >
                  {sheet}
                </button>
             ))}
           </div>
           
           <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end">
             <button
               onClick={() => {
                 setAvailableSheets([]);
                 setPendingWorkbook(null);
               }}
               className="text-slate-500 font-bold hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
             >
               Cancel & Upload Different File
             </button>
           </div>
        </div>
      )}

      <input
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        ref={fileInputRef}
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      {availableSheets.length === 0 && !isProcessing && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`w-full max-w-3xl border-2 border-dashed rounded-3xl p-16 text-center transition-all duration-200 bg-white shadow-sm ${
            isDragging 
              ? "border-dd-red bg-red-50/50 scale-[1.02]" 
              : "border-slate-300 hover:border-dd-red hover:shadow-md"
          }`}
        >
          <div className="mx-auto w-20 h-20 mb-6 rounded-full bg-red-50 flex items-center justify-center">
            <UploadCloud className="w-10 h-10 text-dd-red" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-3">
            Drag and drop your Book of Business (BOB)
          </h3>
          <p className="text-slate-500 mb-8 max-w-md mx-auto leading-relaxed">
            Upload <strong className="text-slate-700">Excel (.xlsx)</strong> files. We will automatically extract Merchant Names, Store IDs, and Target Emails.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-8 py-3.5 bg-dd-red text-white font-semibold rounded-xl shadow-sm hover:bg-dd-red-dark transition-colors"
          >
            Browse Files
          </button>
        </div>
      )}
    </div>
  );
}
