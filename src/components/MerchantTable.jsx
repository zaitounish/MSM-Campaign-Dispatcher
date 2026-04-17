import React, { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, CheckSquare, Square, Store, Mail, Edit3, AlertCircle, Filter, X, Zap, ArrowRight } from "lucide-react";
import MerchantEmailManager from "./MerchantEmailManager";

export default function MerchantTable({ merchants, setMerchants, onContinue, onActiveMerchantsChange }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [editingEmailsId, setEditingEmailsId] = useState(null);

  // Filters
  const [filterSlOpp, setFilterSlOpp] = useState(false);
  const [filterPromoOpp, setFilterPromoOpp] = useState(false);
  const [filterLoyalOpp, setFilterLoyalOpp] = useState(false);
  const [filterSlCredit, setFilterSlCredit] = useState(false);
  
  // Bulk Selection State
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [pasteData, setPasteData] = useState("");
  const [bulkFeedback, setBulkFeedback] = useState(null);

  const filteredMerchants = useMemo(() => {
    return merchants.filter(m => {
      // Toggle Chips Intersection
      if (filterSlOpp && !m.slOpp) return false;
      if (filterPromoOpp && !m.promoOpp) return false;
      if (filterLoyalOpp && !m.loyalOpp) return false;
      if (filterSlCredit && !m.slCredit) return false;

      // Text Search
      if (!searchTerm) return true;
      const lower = searchTerm.toLowerCase();
      return (
        m.merchantName.toLowerCase().includes(lower) ||
        (m.emails && m.emails.some(e => e.address.toLowerCase().includes(lower))) ||
        (m.businessId && m.businessId.toLowerCase().includes(lower)) ||
        m.sids.split(',').some(sid => sid.toLowerCase().includes(lower))
      );
    });
  }, [merchants, searchTerm, filterSlOpp, filterPromoOpp, filterLoyalOpp, filterSlCredit]);

  React.useEffect(() => {
    if (onActiveMerchantsChange) {
      const payloadIds = new Set(filteredMerchants.filter(m => m.selected).map(m => m.id));
      onActiveMerchantsChange(payloadIds);
    }
  }, [filteredMerchants, onActiveMerchantsChange]);

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

  const handleApplyBulk = () => {
    const inputIds = new Set(pasteData.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean));
    if (inputIds.size === 0) return;

    const foundIds = new Set();

    const updatedMerchants = merchants.map(m => {
      let isMatch = false;

      const bId = m.businessId?.toLowerCase();
      if (bId && inputIds.has(bId)) {
        isMatch = true;
        foundIds.add(bId);
      } else {
        const allSids = (m.originalSids || m.sids).split(",");
        for (const sid of allSids) {
          const lSid = sid.toLowerCase();
          if (inputIds.has(lSid)) {
            isMatch = true;
            foundIds.add(lSid);
          }
        }
      }

      return { 
        ...m, 
        selected: isMatch,
        sids: m.originalSids || m.sids,
        locationCount: (m.originalSids || m.sids).split(",").length
      };
    });

    setMerchants(updatedMerchants);
    setBulkFeedback({
      foundCount: foundIds.size,
      totalCount: inputIds.size
    });
  };

  const hasActiveFilters = filterSlOpp || filterPromoOpp || filterLoyalOpp || filterSlCredit || searchTerm;
  const clearFilters = () => {
    setSearchTerm("");
    setFilterSlOpp(false);
    setFilterPromoOpp(false);
    setFilterLoyalOpp(false);
    setFilterSlCredit(false);
  };

  const handleContinueClick = () => {
    if (onContinue) {
      onContinue();
    }
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
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full mt-4 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Filters:
            </span>
            <FilterChip 
              label="SL Opp" 
              active={filterSlOpp} 
              onClick={() => {
                const nextState = !filterSlOpp;
                setFilterSlOpp(nextState);
                if (!nextState) setFilterSlCredit(false);
              }} 
            />
            {filterSlOpp && (
              <div className="flex items-center gap-1.5 ml-1 mr-1 animate-in fade-in slide-in-from-left-2 duration-200">
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <FilterChip label="Has Credit" active={filterSlCredit} onClick={() => setFilterSlCredit(!filterSlCredit)} />
              </div>
            )}
            <FilterChip label="Promo Opp" active={filterPromoOpp} onClick={() => setFilterPromoOpp(!filterPromoOpp)} />
            <FilterChip label="Loyal Opp" active={filterLoyalOpp} onClick={() => setFilterLoyalOpp(!filterLoyalOpp)} />
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-dd-red font-semibold ml-2 flex items-center gap-1 transition-colors">
                 <X className="w-3.5 h-3.5" /> Clear All
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
             <button
               onClick={() => { setIsBulkOpen(!isBulkOpen); setBulkFeedback(null); }}
               className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                 isBulkOpen ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
               }`}
             >
                <Zap className="w-3.5 h-3.5" /> Bulk Select
             </button>
             <div className="text-sm font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-lg">
               Selected: <span className="text-dd-red">{filteredMerchants.filter(m => m.selected).length}</span> / {filteredMerchants.length}
             </div>
          </div>
        </div>
      </div>

      {isBulkOpen && (
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 animate-in slide-in-from-top-2">
           <h4 className="font-bold text-slate-800 text-sm mb-2">Bulk Select by Store/Business IDs</h4>
           <div className="flex gap-3 items-start">
              <textarea 
                value={pasteData}
                onChange={e => { setPasteData(e.target.value); setBulkFeedback(null); }}
                placeholder="Paste IDs separated by spaces or commas..."
                className="flex-1 bg-white border border-slate-300 rounded-xl p-3 text-sm focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none resize-none h-20"
              />
              <div className="flex flex-col gap-2">
                 <button 
                   onClick={handleApplyBulk}
                   disabled={!pasteData.trim()}
                   className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                 >
                   Apply Filter
                 </button>
                 {bulkFeedback && (
                   <span className={`text-xs font-bold px-2 py-1 rounded w-full text-center ${bulkFeedback.foundCount === bulkFeedback.totalCount ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                     Found {bulkFeedback.foundCount} of {bulkFeedback.totalCount}
                   </span>
                 )}
              </div>
           </div>
           <p className="text-xs text-slate-500 mt-2">
             Pasting any Store ID or Business ID will select the entire associated merchant and all of its locations. Unmatched merchants will be deselected.
           </p>
        </div>
      )}

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

      {onContinue && (
        <div className="flex justify-end pt-4 pb-6 px-6 bg-slate-50 border-t border-slate-200">
          <button
            onClick={handleContinueClick}
            disabled={filteredMerchants.filter(m => m.selected).length === 0}
            className="flex items-center gap-2 px-8 py-3.5 bg-dd-red text-white font-bold rounded-xl shadow-md hover:bg-dd-red-dark hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
          >
            Continue to Configure Promos
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-bold px-2.5 py-1 rounded-full transition-all border ${
        active 
          ? "bg-dd-red text-white border-dd-red shadow-sm"
          : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"
      }`}
    >
      {label}
    </button>
  );
}
