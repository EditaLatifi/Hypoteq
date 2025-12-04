"use client";

import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useState } from "react";

function ProjectStep({ data, setData, saveStep, customerType, back }: any) {
  const { t } = useTranslation();
  const project = useFunnelStore((state) => state.project);
  const setProject = useFunnelStore((state) => state.setProject);
  const [errors, setErrors] = useState({ projektArt: "" });
const selectCard = (value: string) => {
  console.log("🔹 selectCard fired, value:", value);

  // 1) Update LOCAL STATE
  setData((prev: any) => ({ ...prev, projektArt: value }));

  // 2) Update STORE
  setProject((prev: any) => ({ ...prev, projektArt: value }));

  // Debug without projectData (because projectData DOES NOT exist here)
  console.log("🔹 After set:", {
    local: { ...data, projektArt: value },
    store: useFunnelStore.getState().project
  });

  setTimeout(() => saveStep(), 50);
};



  const title =
    customerType === "partner"
      ? t("funnel.projectTitlePartner" as any)
      : t("funnel.projectTitle" as any);

  const subtitle =
    customerType === "partner"
      ? t("funnel.projectSubtitlePartner" as any)
      : t("funnel.projectSubtitle" as any);

  return (
    <div className="w-full max-w-[1400px] pt-[150px] md:pt-0 mx-auto px-4 md:px-8 lg:pl-20 lg:pr-48">
      {/* TITLE */}
      <h2 className="text-3xl md:text-4xl lg:text-[48px] font-semibold text-[#132219] mb-2 md:mb-2.5 lg:mb-3">
        {title}
      </h2>

      <p className="text-lg md:text-xl lg:text-[24px] text-[#132219]/80 mb-8 md:mb-10 lg:mb-12">{subtitle}</p>

      {/* CARDS */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-5 lg:gap-[26px]">
        <div
          onClick={() => selectCard("kauf")}
          className={`
            w-full md:w-[360px] h-[200px] lg:h-[240px] rounded-[10px] cursor-pointer flex flex-col justify-between items-center p-6 lg:p-8 transition-all duration-200 border
            ${data.projektArt === "kauf" ? "bg-[#CAF476] border-[#132219]" : "bg-white border-[#132219]"}
            hover:bg-[#CAF476]
          `}
        >
          <img src="/images/HYPOTEQ_funnel_project_type1.svg" className="w-[45px] lg:w-[55px] h-[30px] lg:h-[38px]" />
          <div className="flex flex-col w-full items-center">
            <p className="text-[20px] lg:text-[24px] text-[#132219] font-normal">{t("funnel.newMortgageCard" as any)}</p>
            <div className="w-full h-[1px] bg-[#132219] mt-2"></div>
          </div>
        </div>

        <div
          onClick={() => selectCard("abloesung")}
          className={`
            w-full md:w-[360px] h-[200px] lg:h-[240px] rounded-[10px] cursor-pointer flex flex-col justify-between items-center p-6 lg:p-8 transition-all duration-200 border
            ${data.projektArt === "abloesung" ? "bg-[#CAF476] border-[#132219]" : "bg-white border-[#132219]"}
            hover:bg-[#CAF476]
          `}
        >
          <img src="/images/HYPOTEQ_funnel_project_type2.svg" className="w-[45px] lg:w-[55px] h-[30px] lg:h-[38px]" />
          <div className="flex flex-col w-full items-center">
            <p className="text-[20px] lg:text-[24px] text-[#132219] font-normal">{t("funnel.redemptionCard" as any)}</p>
            <div className="w-full h-[1px] bg-[#132219] mt-2"></div>
          </div>
        </div>
      </div>
         {/* ========================================================= */}
      {/*  BUTTONS                                                  */}
      {/* ========================================================= */}
      {errors.projektArt && (
        <p className="text-red-500 text-sm mt-4">{errors.projektArt}</p>
      )}
      <div className="flex justify-between mt-12 lg:mt-20">
        <button onClick={back} className="px-4 lg:px-6 py-2 border border-[#132219] rounded-full text-sm lg:text-base">
          {t("funnel.back" as any)}
        </button>
        <button 
          onClick={() => {
            if (!data.projektArt) {
              setErrors((prev: any) => ({ ...prev, projektArt: t("funnel.pleaseSelectOption" as any) || "Please select a project type" }));
              return;
            }
            setErrors({ projektArt: "" });
            saveStep();
          }} 
          className="px-4 lg:px-6 py-2 bg-[#CAF476] text-[#132219] rounded-full text-sm lg:text-base">
          {t("funnel.continue" as any)}
        </button>
      </div>
    </div>
  );
}

export default ProjectStep;
