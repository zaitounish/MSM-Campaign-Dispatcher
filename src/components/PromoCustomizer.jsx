import React from "react";
import { Settings2, DollarSign, Clock, Users, ArrowRight } from "lucide-react";
import { PROMO_CATALOG } from "./PromoSelector";

// ── Exported validator   used by App.jsx to gate the next-step button ──────────
// Returns an array of human-readable error strings.
// Empty array = all configs valid.
export function getPromoConfigErrors(selectedPromos, promoConfigs, isUltimate) {
  if (isUltimate) return []; // Ultimate has no restrictions
  if (selectedPromos.length === 1 && selectedPromos[0] === "blank") return []; // Blank needs no config
  const errors = [];
  if (selectedPromos.includes("discount")) {
    const cfg = promoConfigs["discount"] || {};
    const discountType = cfg.discountType || "percentage";
    const mst = parseFloat(cfg.minSubtotal);

    // Min subtotal must be at least $5
    if (!isNaN(mst) && mst < 5) {
      errors.push("Discount: Minimum subtotal must be at least $5.");
    }
    if (isNaN(mst) || cfg.minSubtotal === "") {
      errors.push("Discount: Please enter a minimum subtotal.");
    }

    if (discountType === "dollar" && !isNaN(mst) && mst >= 5) {
      const dollarVal = parseFloat(cfg.dollarAmount);
      const minDollar = Math.ceil(mst * 0.10);
      if (isNaN(dollarVal) || cfg.dollarAmount === "") {
        errors.push("Discount: Please enter a discount amount.");
      } else if (dollarVal < minDollar) {
        errors.push(`Discount: Dollar off amount must be at least $${minDollar} (10% of $${mst} min subtotal).`);
      }
    }
  }
  return errors;
}

export default function PromoCustomizer({ selectedPromos, promoConfigs, setPromoConfigs, userProfile }) {
  const isUltimate = userProfile?.role === "ultimate";

  // ── Portal-accurate discount tier math ──────────────────────────────────────
  // Reverse-engineered from DoorDash merchant portal behavior:
  //   first = ceil(minSubtotal × (pct + 0.05))
  //   step  = ceil(minSubtotal × 0.05)
  //   tiers = [first, first+step, first+step×2]
  const computePortalTiers = (pct, minSubtotal) => {
    const p = parseFloat(pct) / 100;
    const m = parseFloat(minSubtotal);
    if (!p || !m || isNaN(p) || isNaN(m)) return null;
    const first = Math.ceil(m * (p + 0.05));
    const step = Math.ceil(m * 0.05);
    return [first, first + step, first + step * 2];
  };

  // Blank campaign has no configuration panel   it's purely a free-form email
  if (selectedPromos.length === 0 || (selectedPromos.length === 1 && selectedPromos[0] === "blank")) return null;

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

  // Exclude 'blank' from the config items list   it has no configurable fields
  const selectedItems = PROMO_CATALOG.flatMap(c => c.items).filter(i => selectedPromos.includes(i.id) && i.id !== "blank");

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500 mt-8">
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-2">
        <Settings2 className="w-5 h-5 text-slate-500" />
        <h3 className="font-bold text-slate-800">Customize Selected Campaigns</h3>
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

              {/* Smart Campaign Configuration */}
              {promo.id === "smart_campaign" && (
                <div className="max-w-2xl">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Campaign Mode</label>
                  <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
                    <button
                      onClick={() => updateConfig(promo.id, "isCartLevel", false)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${!getConfig(promo.id, "isCartLevel")
                        ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                        : "text-slate-500 hover:text-slate-700"
                        }`}
                    >
                      Item Promotion
                    </button>
                    <button
                      onClick={() => updateConfig(promo.id, "isCartLevel", true)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${getConfig(promo.id, "isCartLevel")
                        ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                        : "text-slate-500 hover:text-slate-700"
                        }`}
                    >
                      Spend X Get Y
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {!getConfig(promo.id, "isCartLevel")
                      ? "Algorithm chooses specific items to discount."
                      : "Algorithm applies discount to the whole cart."}
                  </p>
                </div>
              )}

              {/* Delivery Fee Configuration */}
              {promo.id === "delivery_fee" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Target Audience</label>
                    <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                      <Users className="w-4 h-4 text-slate-400 mr-2" />
                      <select
                        value={getConfig(promo.id, "audience") || "all"}
                        onChange={e => updateConfig(promo.id, "audience", e.target.value)}
                        className="outline-none bg-transparent w-full text-slate-700 sm:text-sm cursor-pointer"
                      >
                        <option value="all">All Customers</option>
                        <option value="new_to_merchant">New Customers</option>
                        <option value="existing_consumers_to_merchant">Existing Customers</option>
                        <option value="churned_users">Lapsed Customers</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Minimum Subtotal</label>
                    <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                      <DollarSign className="w-4 h-4 text-slate-400 mr-1" />
                      <select
                        value={getConfig(promo.id, "minSubtotal") || "25"}
                        onChange={e => updateConfig(promo.id, "minSubtotal", e.target.value)}
                        className="outline-none bg-transparent w-full text-slate-700 sm:text-sm cursor-pointer"
                      >
                        <option value="15">$15.00</option>
                        <option value="20">$20.00</option>
                        <option value="25">$25.00</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {promo.id === "ads" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                  <div>
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
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Target Audience</label>
                    <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                      <Users className="w-4 h-4 text-slate-400 mr-2" />
                      <select
                        value={getConfig(promo.id, "audience") || "all"}
                        onChange={e => updateConfig(promo.id, "audience", e.target.value)}
                        className="outline-none bg-transparent w-full text-slate-700 sm:text-sm cursor-pointer"
                      >
                        <option value="all">All Customers</option>
                        <option value="new_to_merchant">New Customers</option>
                        <option value="existing_consumers_to_merchant">Existing Customers</option>
                        <option value="churned_users">Lapsed Customers</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {promo.id === "discount" && (() => {
                // discountType defaults to 'percentage' so reps always see a valid state on open
                const discountType = getConfig(promo.id, "discountType") || "percentage";
                return (
                  <div className="space-y-4 max-w-2xl">

                    {/* Mode Toggle & Target Audience | Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Discount Type</label>
                        <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
                          <button
                            onClick={() => updateConfig(promo.id, "discountType", "percentage")}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${discountType === "percentage"
                              ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                              : "text-slate-500 hover:text-slate-700"
                              }`}
                          >
                            % Percentage Off
                          </button>
                          <button
                            onClick={() => updateConfig(promo.id, "discountType", "dollar")}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${discountType === "dollar"
                              ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                              : "text-slate-500 hover:text-slate-700"
                              }`}
                          >
                            $ Dollar Off
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Target Audience</label>
                        <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                          <Users className="w-4 h-4 text-slate-400 mr-2" />
                          <select
                            value={getConfig(promo.id, "audience") || "all"}
                            onChange={e => updateConfig(promo.id, "audience", e.target.value)}
                            className="outline-none bg-transparent w-full text-slate-700 sm:text-sm cursor-pointer"
                          >
                            <option value="all">All Customers</option>
                            <option value="new_to_merchant">New Customers</option>
                            <option value="existing_consumers_to_merchant">Existing Customers</option>
                            <option value="churned_users">Lapsed Customers</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* ── Mode 1: Percentage Off ── */}
                    {discountType === "percentage" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                          {/* Percentage selector */}
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Percentage Amount</label>
                            {isUltimate ? (
                              // Ultimate: free-form input
                              <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                                <span className="text-slate-400 mr-1 font-bold">%</span>
                                <input
                                  type="number"
                                  placeholder="e.g. 20"
                                  min="1" max="100"
                                  value={getConfig(promo.id, "percentageAmount")}
                                  onChange={e => updateConfig(promo.id, "percentageAmount", e.target.value)}
                                  className="outline-none bg-transparent w-full text-slate-700 sm:text-sm"
                                />
                              </div>
                            ) : (
                              // Rep / Manager: locked to 15 / 20 / 25
                              <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                                <span className="text-slate-400 mr-1 font-bold">%</span>
                                <select
                                  value={getConfig(promo.id, "percentageAmount") || "20"}
                                  onChange={e => updateConfig(promo.id, "percentageAmount", e.target.value)}
                                  className="outline-none bg-transparent w-full text-slate-700 sm:text-sm cursor-pointer"
                                >
                                  <option value="15">15%</option>
                                  <option value="20">20%</option>
                                  <option value="25">25%</option>
                                </select>
                              </div>
                            )}
                            {/* <p className="text-xs text-slate-400 mt-1">Maps to <code>cpo</code></p> */}
                          </div>

                          {/* Min subtotal */}
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Min Subtotal</label>
                            <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                              <DollarSign className="w-4 h-4 text-slate-400 mr-1" />
                              <input
                                type="number"
                                placeholder="e.g. 20"
                                min={isUltimate ? "0" : "5"}
                                step="1"
                                value={getConfig(promo.id, "minSubtotal")}
                                onChange={e => updateConfig(promo.id, "minSubtotal", e.target.value)}
                                className="outline-none bg-transparent w-full text-slate-700 sm:text-sm"
                              />
                            </div>
                            {/* <p className="text-xs text-slate-400 mt-1">Maps to <code>mst</code> (×100 → cents){!isUltimate && " · min $5"}</p> */}
                          </div>
                        </div>

                        {/* ── Portal tier preview (rep/manager only) ── */}
                        {!isUltimate && (() => {
                          const pct = getConfig(promo.id, "percentageAmount") || "20";
                          const mst = getConfig(promo.id, "minSubtotal");
                          const tiers = mst ? computePortalTiers(pct, mst) : null;
                          return tiers ? (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                              <p className="text-xs font-bold text-blue-700 mb-2">📊 Portal-generated discount tiers (DoorDash will offer these 3 options)</p>
                              <div className="flex gap-3">
                                {tiers.map((t, i) => (
                                  <div key={i} className="flex-1 bg-white border border-blue-200 rounded-lg py-2 text-center">
                                    <p className="text-lg font-black text-dd-red">${t}</p>
                                    <p className="text-[10px] text-slate-400 font-semibold">Tier {i + 1}</p>
                                  </div>
                                ))}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-2">These match what the DoorDash merchant portal auto-generates for {pct}% off with a ${mst} min.</p>
                            </div>
                          ) : (
                            /* <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                              ⚠️ Enter a Min Subtotal to preview the portal discount tiers.
                            </p> */ null
                          );
                        })()}

                        {/* Max discount cap   ultimate only */}
                        {isUltimate && (
                          <div className="max-w-xs">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Max Discount Cap</label>
                            <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                              <DollarSign className="w-4 h-4 text-slate-400 mr-1" />
                              <input
                                type="number"
                                placeholder="e.g. 10"
                                value={getConfig(promo.id, "maxDiscount")}
                                onChange={e => updateConfig(promo.id, "maxDiscount", e.target.value)}
                                className="outline-none bg-transparent w-full text-slate-700 sm:text-sm"
                              />
                            </div>
                            {/* <p className="text-xs text-slate-400 mt-1">Maps to <code>cmpv</code> (×100 → cents)</p> */}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Mode 2: Dollar Off ── */}
                    {discountType === "dollar" && (() => {
                      const mst = parseFloat(getConfig(promo.id, "minSubtotal")) || 0;
                      const minDollar = !isUltimate && mst > 0 ? Math.ceil(mst * 0.10) : null;
                      const dollarVal = parseFloat(getConfig(promo.id, "dollarAmount")) || 0;
                      const tooLow = minDollar !== null && dollarVal > 0 && dollarVal < minDollar;
                      return (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Discount Amount</label>
                              <div className={`flex items-center bg-white border rounded-lg px-3 py-2 focus-within:ring-1 transition-all ${tooLow ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-400" : "border-slate-300 focus-within:border-dd-red focus-within:ring-dd-red"}`}>
                                <DollarSign className="w-4 h-4 text-slate-400 mr-1" />
                                <input
                                  type="number"
                                  placeholder="e.g. 6"
                                  min={minDollar ?? 1}
                                  value={getConfig(promo.id, "dollarAmount")}
                                  onChange={e => updateConfig(promo.id, "dollarAmount", e.target.value)}
                                  className="outline-none bg-transparent w-full text-slate-700 sm:text-sm"
                                />
                              </div>
                              {tooLow && (
                                <p className="text-xs text-red-500 mt-1 font-semibold">⚠️ Must be at least ${minDollar} (10% of ${mst} min subtotal)</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Min Subtotal</label>
                              <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                                <DollarSign className="w-4 h-4 text-slate-400 mr-1" />
                                <input
                                  type="number"
                                  placeholder="e.g. 30"
                                  min={isUltimate ? "0" : "5"}
                                  value={getConfig(promo.id, "minSubtotal")}
                                  onChange={e => updateConfig(promo.id, "minSubtotal", e.target.value)}
                                  className="outline-none bg-transparent w-full text-slate-700 sm:text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                  </div>
                );
              })()}

              {promo.id === "bogo" && (
                <div className="max-w-2xl">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Target Audience</label>
                  <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-dd-red focus-within:ring-1 focus-within:ring-dd-red transition-all">
                    <Users className="w-4 h-4 text-slate-400 mr-2" />
                    <select
                      value={getConfig(promo.id, "audience") || "all"}
                      onChange={e => updateConfig(promo.id, "audience", e.target.value)}
                      className="outline-none bg-transparent w-full text-slate-700 sm:text-sm cursor-pointer"
                    >
                      <option value="all">All Customers</option>
                      <option value="new_to_merchant">New Customers</option>
                      <option value="existing_consumers_to_merchant">Existing Customers</option>
                      <option value="churned_users">Lapsed Customers</option>
                    </select>
                  </div>
                </div>
              )}

              {["loyalty", "happy_hour", "lunch_specials"].includes(promo.id) && (
                <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                  No configuration needed. DoorDash handles this automatically.
                </div>
              )}


            </div>
          );
        })}
      </div>
    </div>
  );
}
