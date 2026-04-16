import React from "react";
import { Settings2, DollarSign, Clock, Users, ArrowRight } from "lucide-react";
import { PROMO_CATALOG } from "./PromoSelector";

export default function PromoCustomizer({ selectedPromos, promoConfigs, setPromoConfigs }) {
  if (selectedPromos.length === 0) return null;

  const updateConfig = (promoId, field, value) => {
    setPromoConfigs(prev => ({
      ...prev,
      [promoId]: {
        ...(prev[promoId] || {}),
        [field]: value
      }
    }));
  };

  // Return proper defaults: false for booleans, empty string for text/number
  const getConfig = (promoId, field) => {
    const val = promoConfigs[promoId]?.[field];
    if (val === undefined || val === null) {
      // hasCredit is the only boolean field
      return field === "hasCredit" ? false : "";
    }
    return val;
  };

  const selectedItems = PROMO_CATALOG.flatMap(c => c.items).filter(i => selectedPromos.includes(i.id));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500 mt-8">
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-2">
        <Settings2 className="w-5 h-5 text-slate-500" />
        <h3 className="font-bold text-slate-800">Customize Selected Promos</h3>
      </div>
      
      <div className="p-6 space-y-6">
        {selectedItems.map((promo, index) => {
          const config = promoConfigs[promo.id] || {};
          
          return (
            <div key={promo.id} className={`${index > 0 ? "pt-6 border-t border-slate-100" : ""}`}>
              <div className="flex items-center gap-2 mb-4">
                <promo.icon className="w-4 h-4 text-dd-red" />
                <h4 className="font-bold text-slate-800">{promo.name}</h4>
              </div>

              {promo.id === "smart_campaign" || promo.id === "delivery_fee" ? (
                <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                  No configuration needed. DoorDash handles this automatically.
                </div>
              ) : null}

              {(promo.id === "ads_all" || promo.id === "ads_new") && (
                <div className="max-w-md">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Weekly Budget Recommendation</label>
                  <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                    <DollarSign className="w-4 h-4 text-slate-400 mr-1" />
                    <input 
                      type="number" 
                      placeholder="e.g. 10" 
                      value={getConfig(promo.id, "budget")}
                      onChange={e => updateConfig(promo.id, "budget", e.target.value)}
                      className="outline-none bg-transparent w-full text-slate-700 sm:text-sm"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">This will map to the `abv` URL parameter (e.g. 1000 for $10).</p>
                </div>
              )}

              {promo.id === "discount" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Discount Amount</label>
                    <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                      <span className="text-slate-400 mr-1">$</span>
                      <input 
                        type="number" 
                        placeholder="e.g. 5" 
                        value={getConfig(promo.id, "discountAmount")}
                        onChange={e => updateConfig(promo.id, "discountAmount", e.target.value)}
                        className="outline-none bg-transparent w-full text-slate-700 sm:text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Minimum Order (Optional)</label>
                    <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                      <span className="text-slate-400 mr-1">$</span>
                      <input 
                        type="number" 
                        placeholder="e.g. 20" 
                        value={getConfig(promo.id, "minOrder")}
                        onChange={e => updateConfig(promo.id, "minOrder", e.target.value)}
                        className="outline-none bg-transparent w-full text-slate-700 sm:text-sm"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Target Audience</label>
                    <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                      <Users className="w-4 h-4 text-slate-400 mr-2" />
                      <select 
                        value={getConfig(promo.id, "audience")}
                        onChange={e => updateConfig(promo.id, "audience", e.target.value)}
                        className="outline-none bg-transparent w-full text-slate-700 sm:text-sm cursor-pointer"
                      >
                        <option value="">Select Audience...</option>
                        <option value="all">All Customers</option>
                        <option value="new_to_merchant">New Customers</option>
                        <option value="existing_consumers_to_merchant">Existing / Lapsed Customers</option>
                        <option value="churned_users">Churned Customers</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {promo.id === "bogo" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl text-sm">
                   <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">Free Item</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Free Pad Thai"
                        value={getConfig(promo.id, "freeItem")}
                        onChange={e => updateConfig(promo.id, "freeItem", e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all"
                      />
                   </div>
                   <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">With Purchase Of</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Any Entree"
                        value={getConfig(promo.id, "conditionItem")}
                        onChange={e => updateConfig(promo.id, "conditionItem", e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 focus:border-dd-red focus:ring-1 focus:ring-dd-red outline-none transition-all"
                      />
                   </div>
                </div>
              )}

              {(promo.id === "happy_hour" || promo.id === "lunch_specials") && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl text-sm">
                   <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">Start Time</label>
                      <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red transition-all">
                        <Clock className="w-4 h-4 text-slate-400 mr-2" />
                        <input 
                          type="time"
                          value={getConfig(promo.id, "startTime")}
                          onChange={e => updateConfig(promo.id, "startTime", e.target.value)}
                          className="outline-none w-full bg-transparent text-slate-700"
                        />
                      </div>
                   </div>
                   <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">End Time</label>
                      <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red transition-all">
                        <Clock className="w-4 h-4 text-slate-400 mr-2" />
                        <input 
                          type="time"
                          value={getConfig(promo.id, "endTime")}
                          onChange={e => updateConfig(promo.id, "endTime", e.target.value)}
                          className="outline-none w-full bg-transparent text-slate-700"
                        />
                      </div>
                   </div>
                   <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">Discount Amount</label>
                      <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red transition-all">
                         <span className="text-slate-400 mr-1">$</span>
                         <input 
                          type="number"
                          placeholder="e.g. 3"
                          value={getConfig(promo.id, "discountAmount")}
                          onChange={e => updateConfig(promo.id, "discountAmount", e.target.value)}
                          className="outline-none w-full bg-transparent text-slate-700"
                        />
                      </div>
                   </div>
                </div>
              )}

              {promo.id === "loyalty" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl text-sm mb-4">
                   <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">Reward Amount</label>
                      <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red transition-all">
                         <span className="text-slate-400 mr-1">$</span>
                         <input 
                          type="number"
                          placeholder="e.g. 5"
                          value={getConfig(promo.id, "rewardAmount")}
                          onChange={e => updateConfig(promo.id, "rewardAmount", e.target.value)}
                          className="outline-none w-full bg-transparent text-slate-700"
                        />
                      </div>
                   </div>
                   <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">For Every Spent</label>
                      <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red transition-all">
                         <span className="text-slate-400 mr-1">$</span>
                         <input 
                          type="number"
                          placeholder="e.g. 50"
                          value={getConfig(promo.id, "spendThreshold")}
                          onChange={e => updateConfig(promo.id, "spendThreshold", e.target.value)}
                          className="outline-none w-full bg-transparent text-slate-700"
                        />
                      </div>
                   </div>
                </div>
              )}

              {["smart_campaign", "ads_all", "ads_new", "loyalty"].includes(promo.id) && (
                <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-2xl">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 text-sm mb-1">
                    <input 
                      type="checkbox"
                      checked={getConfig(promo.id, "hasCredit") || false}
                      onChange={e => updateConfig(promo.id, "hasCredit", e.target.checked)}
                      className="w-4 h-4 rounded text-dd-red focus:ring-dd-red border-slate-300 cursor-pointer"
                    />
                    Attach DoorDash Credits to this Promo
                  </label>
                  
                  {getConfig(promo.id, "hasCredit") && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Credit Amount</label>
                        <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                          <span className="text-slate-400 mr-1 font-semibold">$</span>
                          <input 
                            type="number"
                            placeholder="e.g. 300"
                            value={getConfig(promo.id, "creditAmount")}
                            onChange={e => updateConfig(promo.id, "creditAmount", e.target.value)}
                            className="outline-none bg-transparent w-full text-slate-700 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expiry Date (Optional)</label>
                        <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                          <input 
                            type="date"
                            value={getConfig(promo.id, "creditExpiry")}
                            onChange={e => updateConfig(promo.id, "creditExpiry", e.target.value)}
                            className="outline-none bg-transparent w-full text-slate-700 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}
