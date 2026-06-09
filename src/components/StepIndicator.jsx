import React, { useEffect } from "react";
import { Check, BarChart2 } from "lucide-react";

const STEPS = [
  { id: "upload", label: "Upload BOB", title: "Upload Book of Business" },
  { id: "select", label: "Select Merchants", title: "Select Merchants" },
  { id: "build", label: "Configure Promos", title: "Configure Promotions" },
  { id: "deliver", label: "Preview & Send", title: "Preview & Send Emails" },
];

export default function StepIndicator({ phase, setPhase, hasMerchants, hasPromos, onOpenAnalysis }) {
  const effectiveIndex = phase === "analyze" ? 0.5 : STEPS.findIndex(s => s.id === phase);

  // Update browser tab title per step
  useEffect(() => {
    if (phase === "analyze") {
      document.title = "BOB Analysis · MSM Campaign Dispatcher";
      return;
    }
    const step = STEPS.find(s => s.id === phase);
    document.title = step
      ? `${step.title} · MSM Campaign Dispatcher`
      : "MSM Campaign Dispatcher";
  }, [phase]);

  return (
    <div className="w-full max-w-4xl mx-auto my-8 px-4 flex items-center justify-between">
      {STEPS.map((step, index) => {
        const isCompleted = index < effectiveIndex;
        const isCurrent = index === effectiveIndex;
        const isDisabled =
          (step.id === "select" && !hasMerchants) ||
          (step.id === "build" && !hasMerchants) ||
          (step.id === "deliver" && (!hasMerchants || !hasPromos));

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-2 relative z-10 group">
              <button
                onClick={() => !isDisabled && setPhase(step.id)}
                disabled={isDisabled}
                aria-current={isCurrent ? "step" : undefined}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${isCompleted
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
              <span className={`text-xs font-semibold whitespace-nowrap transition-colors ${isCurrent ? "text-slate-800" : isDisabled ? "text-slate-400" : "text-slate-600"
                }`}>
                {step.label}
              </span>
            </div>

            {index < STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 bg-slate-200 relative mb-5 flex items-center justify-center">
                {/* Animated completion fill */}
                <div
                  className={`absolute top-0 left-0 h-full transition-all duration-500 ${effectiveIndex >= index + 1 ? "bg-green-500 w-full" : effectiveIndex === index + 0.5 ? "bg-green-500 w-1/2" : "bg-transparent w-0"}`}
                />
                {/* Phase 1.5 dot only on the first connector (between Upload and Select) */}
                {index === 0 && onOpenAnalysis && (() => {
                  const isDotCurrent = phase === "analyze";
                  const isDotCompleted = effectiveIndex >= 1;
                  return (
                    <button
                      onClick={onOpenAnalysis}
                      title="BOB Analysis"
                      className="relative z-10 group/dot flex flex-col items-center"
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 shadow-sm
                        ${isDotCompleted
                          ? "bg-green-400 border-green-500 hover:bg-green-300"
                          : isDotCurrent
                            ? "bg-dd-red border-red-500 shadow-md shadow-red-200"
                            : "bg-white border-slate-300 hover:border-dd-red hover:bg-red-50"
                        }`}
                      >
                        <BarChart2 className={`w-2.5 h-2.5 transition-colors ${isDotCompleted || isDotCurrent ? "text-white" : "text-slate-400 group-hover/dot:text-dd-red"}`} />
                      </div>
                      <span className={`absolute top-6 text-[9px] font-bold whitespace-nowrap transition-all ${isDotCurrent ? "text-slate-800 opacity-100" : "text-slate-400 opacity-0 group-hover/dot:opacity-100"}`}>
                        BOB Analysis
                      </span>
                    </button>
                  );
                })()}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
