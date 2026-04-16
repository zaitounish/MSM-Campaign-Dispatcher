import React, { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, CheckSquare, Square, Store, Mail, DollarSign, Edit3, AlertCircle } from "lucide-react";
import MerchantEmailManager from "./MerchantEmailManager";

export default function MerchantTable({ merchants, setMerchants }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [editingEmailsId, setEditingEmailsId] = useState(null);

  const filteredMerchants = useMemo(() => {
    if (!searchTerm) return merchants;
    const lower = searchTerm.toLowerCase();
    return merchants.filter(
      (m) =>
        m.merchantName.toLowerCase().includes(lower) ||
        (m.emails && m.emails.some(e => e.address.toLowerCase().includes(lower))) ||
        (m.businessId && m.businessId.toLowerCase().includes(lower))
    );
  }, [merchants, searchTerm]);

  const allSelected = filteredMerchants.length > 0 && filteredMerchants.every((m) => m.selected);

  const toggleAll = () => {
    const nextState = !allSelected;
    setMerchants((prev) =>
      prev.map((m) => {
        if (filteredMerchants.find((fm) => fm.id === m.id)) {
          return { ...m, selected: nextState };
        }
        return m;
      })
    );
  };

  const toggleMerchant = (id) => {
    setMerchants((prev) =>
      prev.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m))
    );
  };

  const updateMerchant = (id, updates) => {
    setMerchants((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  };

  const toggleRow = (id) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (merchants.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-bold text-slate-800">
              Merchant Targets
            </h2>
          </div>

          <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
            <Search className="w-4 h-4 text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search merchants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm text-slate-700 outline-none bg-transparent w-48"
            />
          </div>
        </div>
        
        <div className="text-sm font-semibold text-slate-500">
          Selected: <span className="text-dd-red">{merchants.filter(m => m.selected).length}</span> / {merchants.length}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead className="sticky top-0 bg-white shadow-sm z-10">
            <tr className="bg-white text-slate-500 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 font-semibold border-b border-slate-200 w-12 text-center">
                 <button onClick={toggleAll} className="outline-none">
                    {allSelected ? <CheckSquare className="w-5 h-5 text-dd-red mx-auto" /> : <Square className="w-5 h-5 text-slate-300 hover:text-slate-400 mx-auto" />}
                 </button>
              </th>
              <th className="px-6 py-4 font-semibold border-b border-slate-200">Merchant Details</th>
              <th className="px-6 py-4 font-semibold border-b border-slate-200">Store ID(s)</th>
              <th className="px-6 py-4 font-semibold border-b border-slate-200">Target Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMerchants.length === 0 ? (
               <tr>
                 <td colSpan="5" className="px-6 py-12 text-center text-slate-500 bg-slate-50/50">
                    <p className="text-lg font-medium text-slate-600">No merchants match your search.</p>
                 </td>
               </tr>
            ) : (
               filteredMerchants.map((row) => {
                 const isExpanded = expandedRows.has(row.id);
                 const sidArray = row.sids.split(",");

                 return (
                   <React.Fragment key={row.id}>
                     <tr className={`hover:bg-slate-50 transition-colors ${!row.selected ? 'opacity-60' : ''}`}>
                       <td className="px-6 py-4 text-center">
                          <button onClick={() => toggleMerchant(row.id)} className="outline-none">
                            {row.selected ? <CheckSquare className="w-5 h-5 text-dd-red mx-auto" /> : <Square className="w-5 h-5 text-slate-300 hover:text-slate-400 mx-auto" />}
                          </button>
                       </td>
                       <td className="px-6 py-4 font-semibold text-slate-800">
                          <div className="flex items-center gap-2">
                             {row.merchantName}
                             {row.locationCount > 1 && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full inline-block mt-0.5">
                                  {row.locationCount} Locs
                                </span>
                             )}
                          </div>
                          {row.businessId && (
                             <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1 opacity-80">
                                Biz ID: {row.businessId}
                             </div>
                          )}
                       </td>
                       <td className="px-6 py-4 text-sm text-slate-600 align-top">
                          <div className="flex items-center gap-2 mt-2">
                            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{sidArray[0]}</span>
                            {sidArray.length > 1 && (
                              <button onClick={() => toggleRow(row.id)} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                                +{sidArray.length - 1} more {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                       </td>
                       <td className="px-6 py-4 text-sm text-slate-600">
                         {row.emails && row.emails.length > 0 ? (
                            <div className="flex items-center justify-between gap-3 min-w-[200px] border border-transparent hover:border-slate-200 p-2 rounded-xl group transition-all">
                               <div className="flex flex-col items-start gap-1">
                                  <div className="flex items-center gap-1.5">
                                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="font-semibold text-slate-800 text-xs">
                                       {row.emails.find(e => e.isPrimary)?.address || row.emails[0].address}
                                    </span>
                                  </div>
                                  {row.emails.length > 1 && (
                                     <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full w-fit">
                                        + {row.emails.length - 1} More Contact{row.emails.length > 2 ? 's' : ''}
                                     </div>
                                  )}
                               </div>
                               <button 
                                 onClick={() => setEditingEmailsId(row.id)}
                                 className="p-1.5 bg-white border border-slate-200 hover:border-dd-red hover:text-dd-red shadow-sm rounded-lg text-slate-500 transition-all opacity-0 group-hover:opacity-100"
                                 title="Manage Emails"
                               >
                                 <Edit3 className="w-4 h-4" />
                               </button>
                            </div>
                         ) : (
                            <div className="text-red-500 text-xs font-bold bg-red-50 py-1.5 px-3 border border-red-100 rounded-lg flex items-center justify-between min-w-[200px]">
                              <span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Missing Email</span>
                               <button onClick={() => setEditingEmailsId(row.id)} className="text-red-700 bg-red-100 px-2 py-1 rounded hover:bg-red-200 transition-colors">
                                 Add
                               </button>
                            </div>
                         )}
                       </td>
                     </tr>
                     {isExpanded && (
                       <tr className="bg-slate-50/50">
                         <td colSpan="4" className="px-6 py-4 border-b border-slate-100">
                            <div className="pl-12 pb-2">
                              {/* Store IDs list if multiple */}
                              {sidArray.length > 1 && (
                                <div className="mb-4">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">All Assigned Store IDs</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {sidArray.map(sid => (
                                      <span key={sid} className="font-mono text-sm bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                                        {sid}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                         </td>
                       </tr>
                     )}
                   </React.Fragment>
                 );
               })
            )}
          </tbody>
        </table>
      </div>
      
      {editingEmailsId && (
        <MerchantEmailManager 
          merchant={merchants.find(m => m.id === editingEmailsId)}
          onSave={(newEmails) => {
            updateMerchant(editingEmailsId, { emails: newEmails });
            setEditingEmailsId(null);
          }}
          onClose={() => setEditingEmailsId(null)}
        />
      )}
    </div>
  );
}
