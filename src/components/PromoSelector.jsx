import React from "react";
import { CheckCircle2, TrendingUp, Users, Gift, HandCoins, Percent, Clock, Coffee, Star, FileEdit } from "lucide-react";

export const PROMO_CATALOG = [
  {
    category: "Recommended for you",
    items: [
      { id: "smart_campaign", name: "Smart campaign", desc: "DoorDash will personalize each discount in real-time.", icon: TrendingUp },
      { id: "ads", name: "Advertise to customers", desc: "Featured prominently on the app to your selected audience.", icon: Users },
    ]
  },
  {
    category: "More ways to help you grow",
    items: [
      { id: "bogo", name: "Buy 1, get 1 free promotion", desc: "Include a free item with purchase of the same item.", icon: Gift },
      { id: "delivery_fee", name: "Pay customer's delivery fee", desc: "Cover delivery fees to stand out.", icon: HandCoins },
      { id: "discount", name: "Offer a discount promotion", desc: "Incentivize customers with a tailored % or $ discount.", icon: Percent },
      { id: "happy_hour", name: "Happy Hour discount", desc: "Attract more customers from 2-5 pm local time.", icon: Clock },
      { id: "lunch_specials", name: "Lunch Specials", desc: "Attract more customers from 11 am - 2 pm local time.", icon: Coffee },
      { id: "loyalty", name: "Loyalty program", desc: "Reward most loyal customers for reordering.", icon: Star }
    ]
  }
];

// The blank campaign is separate   mutually exclusive with all others
export const BLANK_PROMO = {
  id: "blank",
  name: "Blank Email",
  desc: "Send a free-form email with no campaign promotion attached.",
  icon: FileEdit,
};

export default function PromoSelector({ selectedPromos, setSelectedPromos }) {
  const isBlankSelected = selectedPromos.includes("blank");

  const togglePromo = (id) => {
    if (id === "blank") {
      // Blank is mutually exclusive   clear everything else and toggle blank
      setSelectedPromos(prev => prev.includes("blank") ? [] : ["blank"]);
      return;
    }
    // Any standard promo clears blank first
    setSelectedPromos(prev => {
      const withoutBlank = prev.filter(p => p !== "blank");
      if (withoutBlank.includes(id)) {
        return withoutBlank.filter(p => p !== id);
      }
      if (withoutBlank.length >= 3) {
        return withoutBlank; // Enforce max 3 promos
      }
      return [...withoutBlank, id];
    });
  };

  const isAtLimit = !isBlankSelected && selectedPromos.length >= 3;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {isAtLimit && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold px-4 py-3 rounded-xl flex items-center justify-between shadow-sm">
          <span>You have reached the maximum limit of 3 promotions per email.</span>
        </div>
      )}

      {PROMO_CATALOG.map((section) => (
        <div key={section.category} className="space-y-4">
          <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2">
            {section.category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {section.items.map((promo) => {
              const isSelected = selectedPromos.includes(promo.id);
              const isDisabled = (isBlankSelected && promo.id !== "blank") || (isAtLimit && !isSelected);
              const Icon = promo.icon;

              return (
                <button
                  key={promo.id}
                  onClick={() => togglePromo(promo.id)}
                  disabled={isDisabled}
                  className={`relative text-left p-5 rounded-2xl border transition-all duration-200 bg-white shadow-sm flex flex-col gap-3 outline-none ${isDisabled
                      ? "border-slate-200 opacity-40 cursor-not-allowed"
                      : isSelected
                        ? "border-dd-red bg-red-50/10 ring-1 ring-dd-red shadow-md"
                        : "border-slate-200 hover:border-dd-red hover:shadow-md"
                    }`}
                >
                  {isSelected && (
                    <div className="absolute top-4 right-4 text-dd-red bg-white rounded-full">
                      <CheckCircle2 className="w-5 h-5 fill-red-50" />
                    </div>
                  )}

                  <div className={`p-2.5 rounded-xl w-fit ${isSelected ? "bg-red-100 text-dd-red" : "bg-slate-100 text-slate-600"}`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  <div>
                    <h4 className={`font-bold ${isSelected ? "text-slate-900" : "text-slate-800"}`}>
                      {promo.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {promo.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Blank email option ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-2">
          Other
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(() => {
            const promo = BLANK_PROMO;
            const isSelected = selectedPromos.includes(promo.id);
            const isDisabled = !isBlankSelected && selectedPromos.length > 0;
            const Icon = promo.icon;
            return (
              <button
                key={promo.id}
                onClick={() => togglePromo(promo.id)}
                disabled={isDisabled}
                className={`relative text-left p-5 rounded-2xl border transition-all duration-200 bg-white shadow-sm flex flex-col gap-3 outline-none ${isDisabled
                    ? "border-slate-200 opacity-40 cursor-not-allowed"
                    : isSelected
                      ? "border-violet-400 bg-violet-50/20 ring-1 ring-violet-400 shadow-md"
                      : "border-slate-200 hover:border-violet-400 hover:shadow-md"
                  }`}
              >
                {isSelected && (
                  <div className="absolute top-4 right-4 text-violet-500 bg-white rounded-full">
                    <CheckCircle2 className="w-5 h-5 fill-violet-50" />
                  </div>
                )}

                <div className={`p-2.5 rounded-xl w-fit ${isSelected ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-600"}`}>
                  <Icon className="w-5 h-5" />
                </div>

                <div>
                  <h4 className={`font-bold ${isSelected ? "text-slate-900" : "text-slate-800"}`}>
                    {promo.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {promo.desc}
                  </p>
                </div>

                {/* "Doesn't count" badge */}
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                    ✦ Doesn't count toward daily limit
                  </span>
                </div>
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
