"use client";

import { useEffect, useState } from "react";
import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";
import { v4 as uuidv4 } from "uuid";

function BorrowersStep({ saveStep , back}: any) {
  const { t } = useTranslation();
  const borrowers = useFunnelStore((state) => state.borrowers);
  const setBorrowers = useFunnelStore((state) => state.setBorrowers);
  const [showError, setShowError] = useState(false);

  // Initialize default borrower on mount - but without a type selected
  useEffect(() => {
    if (!borrowers || borrowers.length === 0) {
      setBorrowers([{ id: uuidv4(), type: "" }]);
    }
  }, [borrowers, setBorrowers]);

const selectType = (type: "nat" | "jur") => {
  const updated = [{ id: borrowers[0]?.id || uuidv4(), type }];
  setBorrowers(updated);
  setShowError(false); // Clear error when selection is made
};

const handleContinue = () => {
  // Validate that a type has been selected
  if (!borrowers[0]?.type || borrowers[0]?.type === "") {
    setShowError(true);
    return;
  }
  saveStep();
};


  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8 pt-[150px] lg:pt-0 lg:pl-20 lg:pr-48">
      <h2 className="text-3xl md:text-4xl lg:text-[48px] font-semibold text-[#132219] mb-6 md:mb-7 lg:mb-8">
        {t("funnel.borrowerType" as any)}
      </h2>

      <div className="flex flex-col md:flex-row gap-4 md:gap-5 lg:gap-[26px] mb-12 md:mb-16 lg:mb-12">
        {/* Natürliche Person Card */}
        <div
          onClick={() => selectType("nat")}
          className={`
            w-full md:w-[360px] h-[200px] lg:h-[240px] rounded-[10px] cursor-pointer
            flex flex-col justify-between items-center p-6 lg:p-8 border
            transition-colors duration-200
            ${borrowers[0]?.type === "nat" ? "bg-[#CAF476] border-[#132219]" : "bg-white border-[#132219]"}
            hover:bg-[#CAF476]
          `}
        >
          <img src="/images/HYPOTEQ_funnel_natural_person_icon.svg" alt={t("funnel.naturalPerson" as any)} className="w-[80px] lg:w-[100px] h-[60px] lg:h-[80px]" />
          <p className="text-[20px] lg:text-[24px] text-[#132219] font-normal">{t("funnel.naturalPerson" as any)}</p>
        </div>

        {/* Juristische Person Card */}
        <div
          onClick={() => selectType("jur")}
          className={`
            w-full md:w-[360px] h-[200px] lg:h-[240px] rounded-[10px] cursor-pointer
            flex flex-col justify-between items-center p-6 lg:p-8 border
            transition-colors duration-200
            ${borrowers[0]?.type === "jur" ? "bg-[#CAF476] border-[#132219]" : "bg-white border-[#132219]"}
            hover:bg-[#CAF476]
          `}
        >
          <img src="/images/HYPOTEQ_funnel_legal_entity_icon.svg" alt={t("funnel.legalEntity" as any)} className="w-[80px] lg:w-[100px] h-[60px] lg:h-[80px]" />
          <p className="text-[20px] lg:text-[24px] text-[#132219] font-normal">{t("funnel.legalEntity" as any)}</p>
        </div>
      </div>
      
      {/* Error Message */}
      {showError && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {t("funnel.pleaseSelectBorrowerType" as any) || "Please select a borrower type."}
        </div>
      )}

      {/* ========================================================= */}
      {/*  BUTTONS                                                  */}
      {/* ========================================================= */}
      <div className="flex justify-between mt-12 lg:mt-20">
        <button onClick={back} className="px-4 lg:px-6 py-2 border border-[#132219] rounded-full text-sm lg:text-base">
          {t("funnel.back" as any)}
        </button>
        <button 
          onClick={handleContinue} 
          className={`px-4 md:px-5 lg:px-6 py-2 rounded-full text-sm md:text-base transition-opacity ${
            borrowers[0]?.type ? 'bg-[#CAF476] text-[#132219]' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {t("funnel.continue" as any)}
        </button>
      </div>
    </div>
  );
}

export default BorrowersStep;
