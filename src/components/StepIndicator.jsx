import React, { useEffect } from "react";
import { Check, ChevronRight } from "lucide-react";

const STEPS = [
  { id: "upload",  label: "Upload BOB",        title: "Upload Book of Business" },
  { id: "select",  label: "Select Merchants",  title: "Select Merchants"        },
  { id: "build",   label: "Configure Promos",  title: "Configure Promotions"    },
  { id: "deliver", label: "Preview & Send",    title: "Preview & Send Emails"   },
];

export default function StepIndicator({ phase, setPhase, hasMerchants, hasPromos }) {
  const currentIndex = STEPS.findIndex(s => s.id === phase);

  // Update browser tab title per step
  useEffect(() => {
    const step = STEPS.find(s => s.id === phase);
    document.title = step
      ? `${step.title} · MSM Campaign Dispatcher`
      : "MSM Campaign Dispatcher";
  }, [phase]);

  return (
    <div className="w-full max-w-4xl mx-auto my-8 px-4 flex items-center justify-between">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent   = index === currentIndex;
        const isDisabled  =
          (step.id === "select"  && !hasMerchants) ||
          (step.id === "build"   && !hasMerchants) ||
          (step.id === "deliver" && (!hasMerchants || !hasPromos));

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-2 relative z-10 group">
              <button
                onClick={() => !isDisabled && setPhase(step.id)}
                disabled={isDisabled}
                aria-current={isCurrent ? "step" : undefined}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                  isCompleted
                    ? "bg-green-500 text-white shadow-md shadow-green-200"
                    : isCurrent
                      ? "bg-dd-red text-white shadow-md shadow-red-200 ring-4 ring-red-50"
                      : isDisabled
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-white text-slate-500 border border-slate-300 hover:border-dd-red cursor-pointer"
                }`}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : index + 1}
              </button>
              <span className={`text-xs font-semibold whitespace-nowrap transition-colors ${
                isCurrent ? "text-slate-800" : isDisabled ? "text-slate-400" : "text-slate-600"
              }`}>
                {step.label}
              </span>
            </div>

            {index < STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 bg-slate-200 relative mb-5">
                <div
                  className={`absolute top-0 left-0 h-full transition-all duration-500 ${isCompleted ? "bg-green-500 w-full" : "bg-transparent w-0"}`}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
