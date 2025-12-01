"use client";
import { v4 as uuidv4 } from "uuid";
import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";


function DocumentsStep({ borrowers, docs, setDocs, addDocument, saveStep, back }: any) {
const { t } = useTranslation();
const { project, email, property, financing } = useFunnelStore();

const isNeubau = property?.artImmobilie === "neubau";
const isAblösung = project?.projektArt === "abloesung";
const isStockwerkeigentum = property?.artLiegenschaft === "Stockwerkeigentum";
const isWohnung = property?.artLiegenschaft === "Wohnung";
const isMehrfamilienhaus = property?.artLiegenschaft === "Mehrfamilienhaus";
const isMultipleEigentuemer = property?.kreditnehmer?.length > 1;
const isBauprojekt = property?.neubauArt === "bauprojekt";
const isRenovation = property?.renovation === "ja";
const isReserviert = property?.reserviert === "ja";
const hasSchenkung = financing?.eigenmittel_schenkung && Number(financing.eigenmittel_schenkung) > 0;

// Helper function to calculate age from Swiss date format (DD.MM.YYYY)
const calculateAge = (birthdate: string): number => {
  if (!birthdate) return 0;
  const parts = birthdate.split(".");
  if (parts.length !== 3) return 0;
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
  const year = parseInt(parts[2]);
  const birthDate = new Date(year, month, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Check if any borrower is 50+ years old
const hasAge50Plus = (property?.kreditnehmer || []).some((kn: any) => calculateAge(kn.geburtsdatum) >= 50);

// Check employment status
const hasAngestellt = (property?.kreditnehmer || []).some((kn: any) => kn.erwerbsstatus === "angestellt");
const hasSelbständig = (property?.kreditnehmer || []).some((kn: any) => kn.erwerbsstatus === "selbständig");
const hasRentner = (property?.kreditnehmer || []).some((kn: any) => kn.erwerbsstatus === "rentner");



async function uploadDocToSharepoint(file: File, inquiryId: string, email: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("inquiryId", inquiryId);
  formData.append("email", email);

  const res = await fetch("/api/upload-doc", {
    method: "POST",
    body: formData,
  });

  return res.json();
}


// ===================================
// JURISTISCHE PERSON - Document Structure
// ===================================
const documentsForJur = [
  {
    title: t("funnel.personalDocuments" as any),
    items: [
      t("funnel.commercialRegisterCurrent" as any),
      t("funnel.passportAuthorizedPersonJur" as any),
      t("funnel.annualFinancialStatementsJur" as any),
      t("funnel.interimBalanceIfAvailable" as any),
      t("funnel.taxReturnLatestJur" as any),
      t("funnel.ownFundsProofJur" as any),
      t("funnel.taxReturnLatestJur" as any),
    ],
  },

  // NEUBAU documents for Juristische Person
  ...(isNeubau ? [{
    title: "Neubau",
    items: [
      t("funnel.salesDocPhotos" as any),
      t("funnel.constructionPlansNetArea" as any),
      t("funnel.landRegistryIfAvailable" as any),
      t("funnel.purchaseOrRenovationContract" as any),
      t("funnel.buildingInsuranceIfAvailable" as any),
    ],
  }] : []),

  // ABLÖSUNG documents for Juristische Person
  ...(isAblösung ? [{
    title: "Ablösung",
    items: [
      t("funnel.constructionDescriptionPhotos" as any),
      t("funnel.constructionPlansNetArea" as any),
      t("funnel.landRegistryNotOlder6Months" as any),
      t("funnel.currentMortgageContract" as any),
    ],
  }] : []),

  // STOCKWERKEIGENTUM for Juristische Person
  ...(isStockwerkeigentum ? [{
    title: "Stockwerkeigentum",
    items: [
      t("funnel.condominiumActValue" as any),
      t("funnel.usageRegulationsSTWE" as any),
      t("funnel.renovationFundInfoCondominium" as any),
    ],
  }] : []),

  // ANDERE EIGENMITTEL for Juristische Person
  ...(hasSchenkung ? [{
    title: t("funnel.otherOwnFunds" as any),
    items: [
      t("funnel.giftContract" as any),
      t("funnel.loanContractGift" as any),
      t("funnel.inheritanceContract" as any),
    ],
  }] : []),

  // BAUPROJEKT / RENOVATION for Juristische Person
  ...((isBauprojekt || isRenovation) ? [{
    title: "Bauprojekt / Renovation",
    items: [
      t("funnel.buildingPermitDoc2" as any),
      t("funnel.projectPlanCostEstimate" as any),
    ],
  }] : []),
];

  // ===================================
  // NATÜRLICHE PERSON - Document Structure
  // ===================================
const sections = [
  {
    title: t("funnel.personalDocuments" as any),
    items: [
      t("funnel.passportIDAllBorrowers" as any),
      t("funnel.ownFundsProofOfficial" as any),
      t("funnel.taxReturnLatest" as any),
    ],
  },

  // Conditional: Show only if Angestellt
  ...(hasAngestellt ? [{
    title: t("funnel.forEmployed" as any),
    items: [
      t("funnel.salaryStatementBonus" as any),
      t("funnel.pensionFund3rdPillarBuyback" as any),
    ],
  }] : []),

  // Conditional: Show only if Selbständig
  ...(hasSelbständig ? [{
    title: t("funnel.forSelfEmployed" as any),
    items: [
      t("funnel.balanceSheetAudit3Years" as any),
      t("funnel.pensionFund3rdPillarBuyback" as any),
    ],
  }] : []),

  // Conditional: Show only if Rentner
  ...(hasRentner ? [{
    title: t("funnel.forRetirees" as any),
    items: [
      t("funnel.pensionCertificatePKAHV" as any),
    ],
  }] : []),

  // Conditional: Show only if age 50+
  ...(hasAge50Plus ? [{
    title: t("funnel.from50Years" as any),
    items: [
      t("funnel.pensionForecastAHV" as any),
      t("funnel.pensionFund3rdPillarBuyback" as any),
    ],
  }] : []),

  // NEUBAU documents for Natürliche Person
  ...(isNeubau ? [{
    title: "Neubau",
    items: [
      t("funnel.salesDocPhotos" as any),
      t("funnel.constructionPlansNetArea" as any),
      t("funnel.landRegistryIfAvailable" as any),
      t("funnel.purchaseContractDraft" as any),
      t("funnel.buildingInsuranceIfAvailable" as any),
    ],
  }] : []),

  // Conditional: Show only if reserviert (for Neubau)
  ...((isReserviert && isNeubau) ? [{
    title: t("funnel.reservation" as any),
    items: [
      t("funnel.renovationContract" as any),
      t("funnel.bankStatementReservation" as any),
    ],
  }] : []),

  // Conditional: Show only if Renditeobjekt
  ...((property?.nutzung === t("funnel.investmentProperty" as any)) ? [{
    title: "Renditeobjekt",
    items: [
      t("funnel.rentalOverviewCurrent" as any),
    ],
  }] : []),

  // ABLÖSUNG documents for Natürliche Person
  ...(isAblösung ? [{
    title: "Ablösung",
    items: [
      t("funnel.constructionDescriptionPhotos" as any),
      t("funnel.constructionPlansNetArea" as any),
      t("funnel.landRegistryNotOlder6Months" as any),
      t("funnel.currentMortgageContract" as any),
    ],
  }] : []),

  // STOCKWERKEIGENTUM
  ...(isStockwerkeigentum ? [{
    title: "Stockwerkeigentum",
    items: [
      t("funnel.condominiumActValue" as any),
      t("funnel.usageRegulationsSTWE" as any),
      t("funnel.renovationFundInfoCondominium" as any),
    ],
  }] : []),

  // ANDERE EIGENMITTEL
  ...(hasSchenkung ? [{
    title: t("funnel.otherOwnFunds" as any),
    items: [
      t("funnel.giftContract" as any),
      t("funnel.loanContractGift" as any),
      t("funnel.inheritanceConfirmation" as any),
    ],
  }] : []),

  // BAUPROJEKT / RENOVATION
  ...((isBauprojekt || isRenovation) ? [{
    title: "Bauprojekt / Renovation",
    items: [
      t("funnel.buildingPermitDoc2" as any),
      t("funnel.projectPlanCostEstimate" as any),
    ],
  }] : []),
];


const isJur = (borrowers ?? []).some((b: any) => b.type === "jur");

// Select document structure based on borrower type
let selectedDocuments = isJur ? documentsForJur : sections;


const handleUpload = async (e: any) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  for (const file of files) {
    const uploadRes = await uploadDocToSharepoint(
      file,
      project?.id ?? "no-inquiry-id",
      email ?? "no-email"
    );

    if (uploadRes?.error) {
      console.error("Upload failed:", uploadRes.error);
      alert(t("funnel.uploadError" as any));
      continue;
    }

    const newDoc = {
      id: uuidv4(),
      name: file.name,
      size: file.size,
      file,
      sharepointUrl: uploadRes?.data?.webUrl ?? null,
    };

    setDocs((prev: any[]) => [...prev, newDoc]);
    addDocument(newDoc);
  }
};


  const toggleDocument = (docName: string) => {
    const exists = docs.find((d: any) => d.name === docName);

    if (exists) {
      // remove
      setDocs((prev: any[]) => prev.filter((d) => d.name !== docName));
    } else {
      // add placeholder (pa file, vetëm për checked state)
      const newDoc = {
        id: uuidv4(),
        name: docName,
        size: 0,
        file: null,
      };

      setDocs((prev: any[]) => [...prev, newDoc]);
    }
  };
return (
  <div className="w-full flex justify-center pb-3 px-4 md:px-6 lg:-mt-16 font-sfpro">

    <div className="w-full max-w-[1100px]">

      {/* HEADER AREA */}
      <div className="text-center mb-8 md:mb-12 lg:mb-14">
        <h1 className="text-[28px] sm:text-[32px] md:text-[38px] font-semibold text-[#132219] tracking-tight">
         {t("funnel.uploadDocuments" as any)}
        </h1>

      </div>

      {/* UPLOAD CARD */}
<div className="
  bg-[#CAF4761A] shadow-md rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-10 lg:p-12 
  border border-[#E6E6E6]
  flex flex-col items-center gap-4 md:gap-5 mb-8 md:mb-12 lg:mb-16
">


    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center shadow-md">
  <img 
    src="/images/upload.svg" 
    alt="Upload" 
    className="w-8 h-8 md:w-10 md:h-10"
  />
</div>


        <h2 className="text-[18px] sm:text-[20px] md:text-[22px] font-semibold text-[#132219] px-4">
          {t("funnel.selectFileOrDrop" as any)}
        </h2>

        <p className="text-gray-500 text-[14px] md:text-[15px] px-4 text-center">
          {t("funnel.fileFormatsSize" as any)}
        </p>

        <label className="cursor-pointer mt-3">
<input
  type="file"
  className="hidden"
  multiple    
  onChange={handleUpload}
/>
          <div className="bg-[#132219] text-white px-6 md:px-8 py-2.5 md:py-3 rounded-full text-sm md:text-base tracking-wide hover:bg-black transition-colors">
            {t("funnel.browseFiles" as any)}
          </div>
          
        </label>

<div className="flex flex-col items-center mt-5 md:mt-6 px-4">
  <div className="h-[1px] w-20 md:w-24 bg-[#132219]/20 mb-3 md:mb-4"></div>

  <p className="text-[14px] md:text-[16px] text-[#132219]/70 leading-relaxed text-center max-w-[480px]">
    {t("funnel.uploadAllDocuments" as any)} {t("funnel.checkboxOptionalText" as any)}
    <span className="opacity-60"> (optional)</span>
  </p>
</div>

      </div>

      {/* SECTION LIST */}
      <div className="space-y-8 md:space-y-12 lg:space-y-16">

        {selectedDocuments.map((section, index) => (
          <div
            key={index}
            className="bg-white shadow-sm rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-10 border border-[#F0F0F0]"
          >
            {/* SECTION HEADER */}
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <h3 className="text-[18px] sm:text-[20px] md:text-[22px] font-semibold text-[#132219] tracking-tight">
                {section.title}
              </h3>

              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#F6F6F6] flex items-center justify-center shadow-inner flex-shrink-0">
                <span className="text-base md:text-lg opacity-70">📄</span>
              </div>
            </div>

            {/* DOCUMENT GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
              {section.items.map((doc, idx) => {
const saved = docs.some((d: { name: string }) => d.name === doc);

                return (
                  <div
                    key={idx}
                    onClick={() => toggleDocument(doc)}
                    className={`
                      flex items-center justify-between gap-3
                      px-4 sm:px-5 md:px-6 py-3 sm:py-3.5 md:py-4 cursor-pointer rounded-xl md:rounded-2xl
                      shadow-sm border transition-all  

                      ${
                        saved
                          ? "bg-[#EAF7D8] border-[#CAEBAA]"
                          : "bg-[#FAFAFA] border-[#E4E4E4] hover:bg-[#F2F2F2]"
                      }
                    `}
                  >
                    <span className="text-[13px] sm:text-[14px] md:text-[15px] text-[#132219] leading-tight break-words">
                      {doc}
                    </span>

                    {/* CHECK CIRCLE */}
                    <div
                      className={`
                        w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center flex-shrink-0
                        ${saved ? "bg-[#CAF476] border-[#132219]" : "bg-white border-gray-300"}
                        border transition
                      `}
                    >
                      {saved && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-3 h-3 md:w-4 md:h-4 text-[#132219]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        ))}

      </div>

      {/* FOOTER BUTTONS */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 mt-12 md:mt-16 lg:mt-20">
        
        <button
          onClick={back}
          className="px-6 md:px-8 py-3 rounded-full border border-[#132219] text-[#132219] hover:bg-[#F7F7F7] transition-colors text-sm md:text-base order-2 sm:order-1"
        >
          Zurück
        </button>

        <button
          onClick={saveStep}
          className="px-8 md:px-10 py-3 bg-[#CAF476] rounded-full font-medium text-[#132219] shadow hover:bg-[#BCDF6A] transition-colors text-sm md:text-base order-1 sm:order-2"
        >
          Weiter
        </button>

      </div>
    </div>
  </div>
);

}

export default DocumentsStep;
