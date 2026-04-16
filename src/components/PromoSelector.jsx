import React from "react";
import { CheckCircle2, TrendingUp, Users, RefreshCw, Gift, HandCoins, Percent, Clock, Coffee, Star } from "lucide-react";

export const PROMO_CATALOG = [
  {
    category: "Recommended for you",
    items: [
      { id: "smart_campaign", name: "Smart campaign", desc: "DoorDash will personalize each discount in real-time.", icon: TrendingUp },
      { id: "ads_all", name: "Advertise to all customers", desc: "Featured prominently on the app to all customers.", icon: Users },
    ]
  },
  {
    category: "More ways to help you grow",
    items: [
      { id: "ads_new", name: "Advertise to new customers", desc: "Target entirely new customers to your store.", icon: RefreshCw },
      { id: "bogo", name: "Buy 1, get 1 free promotion", desc: "Include a free item with purchase of the same item.", icon: Gift },
      { id: "delivery_fee", name: "Pay customer's delivery fee", desc: "Cover delivery fees to stand out.", icon: HandCoins },
      { id: "discount", name: "Offer a discount promotion", desc: "Incentivize customers with a tailored % or $ discount.", icon: Percent },
      { id: "happy_hour", name: "Happy Hour discount", desc: "Attract more customers from 2-5 pm local time.", icon: Clock },
      { id: "lunch_specials", name: "Lunch Specials", desc: "Attract more customers from 11 am - 2 pm local time.", icon: Coffee },
      { id: "loyalty", name: "Loyalty program", desc: "Reward most loyal customers for reordering.", icon: Star }
    ]
  }
];

export default function PromoSelector({ selectedPromos, setSelectedPromos }) {
  const togglePromo = (id) => {
    setSelectedPromos(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {PROMO_CATALOG.map((section) => (
        <div key={section.category} className="space-y-4">
          <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2">
            {section.category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {section.items.map((promo) => {
              const isSelected = selectedPromos.includes(promo.id);
              const Icon = promo.icon;
              
              return (
                <button
                  key={promo.id}
                  onClick={() => togglePromo(promo.id)}
                  className={`relative text-left p-5 rounded-2xl border transition-all duration-200 bg-white shadow-sm flex flex-col gap-3 outline-none ${
                    isSelected 
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
    </div>
  );
}
