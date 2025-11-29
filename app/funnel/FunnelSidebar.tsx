"use client";

import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useState } from "react";

interface Props {
  step: number;
}

export default function FunnelSidebar({ step }: Props) {
  const { t } = useTranslation();
  const { borrowers } = useFunnelStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isJur = borrowers?.[0]?.type === "jur";

  const steps = [
    { id: 1, label: t("funnel.stepGeneral" as any) },
    { id: 2, label: t("funnel.stepFinancing" as any) },
    {
      id: 3,
      label: isJur
        ? t("funnel.stepCalculatorDocuments" as any)
        : t("funnel.stepCalculatorSummary" as any),
    },
    { id: 4, label: t("funnel.stepCompletion" as any) },
  ];

  return (
    <>
      {/* Mobile Header - Hide on tablet and desktop */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <img src="/images/logo.png" className="h-8" alt="Logo" />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-[#132219]"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
        
        {/* Mobile Progress Indicator */}
        <div className="px-4 lg:pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">{t("funnel.step" as any)} {step} / {steps.length}</span>
            <span className="text-xs font-medium text-[#132219]">{steps[step - 1]?.label}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className="bg-[#CAF476] h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(step / steps.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Mobile Dropdown Menu - Hide on tablet and desktop */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed top-[88px] left-0 right-0 bg-white border-b border-gray-200 z-40 shadow-lg">
          <div className="px-4 py-4 space-y-3">
            {steps.map((s) => {
              const isActive = s.id === step;
              const isCompleted = s.id < step;

              return (
                <div key={s.id} className="flex items-center gap-3">
                  <div
                    className={`
                      w-8 h-8 rounded-full border flex items-center justify-center
                      text-sm font-semibold transition-all
                      ${isActive || isCompleted 
                        ? "bg-[#CAF476] border-[#132219] text-[#132219]"
                        : "border-gray-300 text-gray-400"
                      }
                    `}
                  >
                    {s.id}
                  </div>
                  <div className={`text-sm ${isActive || isCompleted ? "text-[#132219] font-medium" : "text-gray-400"}`}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tablet & Desktop Sidebar */}
      <div className="hidden md:flex w-[200px] lg:w-[250px] min-h-screen bg-[#E2E2E2] flex-col px-4 lg:px-5 py-8 lg:py-10 border-r border-gray-300">

      {/* LOGO */}
      <img src="/images/logo.png" className="w-[120px] lg:w-[140px] h-auto mb-10 lg:mb-14" />

      {/* STEPS */}
      <div className="flex flex-col gap-6 lg:gap-10">
        {steps.map((s) => {
          const isActive = s.id === step;
          const isCompleted = s.id < step;

          return (
            <div key={s.id} className="relative flex items-center gap-2 lg:gap-3 mb-4 lg:mb-6">

              {isActive && (
                <div className="absolute -left-4 h-full w-1.5 bg-[#132219] rounded-r-md" />
              )}

              <div
                className={`
                  w-[38px] h-[38px] lg:w-[46px] lg:h-[46px] rounded-full border flex items-center justify-center
                  text-[16px] lg:text-[18px] font-semibold transition-all duration-200
                  ${isActive || isCompleted 
                    ? "bg-[#CAF476] border-[#132219] text-[#132219]"
                    : "border-[#A0A0A0] text-[#A0A0A0]"
                  }
                `}
              >
                {s.id}
              </div>

              <div>
                <div className="text-[11px] lg:text-[12px] text-gray-500">{t("funnel.step" as any)} {s.id}</div>
                <div
                  className={`
                    text-[14px] lg:text-[16px] transition-all duration-200
                    ${isActive || isCompleted
                      ? "text-[#132219]"
                      : "text-[#A0A0A0]"
                    }
                  `}
                >
                  {s.label}
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}
