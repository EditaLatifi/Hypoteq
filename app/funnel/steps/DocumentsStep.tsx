"use client";
import { v4 as uuidv4 } from "uuid";
import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";


function DocumentsStep({ borrowers, docs, setDocs, addDocument, saveStep, back }: any) {
const { t } = useTranslation();
const { project, email, property } = useFunnelStore();

const isNeubau = property?.artImmobilie === "neubau";
const isAblösung = project?.projektArt === "abloesung";const isStockwerkeigentum = property?.artLiegenschaft === "Stockwerkeigentum";
const isMultipleEigentuemer = property?.kreditnehmer?.length > 1;
const isBauprojekt = property?.neubauArt === "bauprojekt";
const isRenovation = property?.renovation === "ja";



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


const documentsForNeuKaufJur = [
  {
    title: t("funnel.basicInformation" as any),
    items: [
      t("funnel.hypoteqFormular" as any),
      t("funnel.commercialRegisterExtract" as any),
      t("funnel.passportAuthorizedPerson" as any),
      t("funnel.annualFinancialStatements" as any),
      t("funnel.currentInterimBalance" as any),
      t("funnel.currentDebtCollectionExtract" as any),
      t("funnel.currentTaxReturn" as any),
      t("funnel.ownFundsProof" as any),
      t("funnel.taxReturnWithSchedules" as any),
    ],
  },

  {
    title: t("funnel.forNewConstruction" as any),
    items: [
      t("funnel.salesDocumentation" as any),
      t("funnel.constructionPlans" as any),
      t("funnel.landRegistryExtract" as any),
      t("funnel.purchaseContract" as any),
      t("funnel.cubatureIfNotAvailable" as any),
      t("funnel.buildingInsurancePolicy" as any),
    ],
  },

  {
    title: t("funnel.forRedemption" as any),
    items: [
      t("funnel.buildingDescription" as any),
      t("funnel.constructionPlans" as any),
      t("funnel.landRegistryExtractCurrent" as any),
      t("funnel.currentMortgageContract" as any),
    ],
  },

  {
    title: t("funnel.forCondominiumOwnership" as any),
    items: [
      t("funnel.condominiumFoundingAct" as any),
      t("funnel.usageManagementRegulations" as any),
      t("funnel.renovationFundInfo" as any),
    ],
  },

  {
    title: t("funnel.forOtherOwners" as any),
    items: [
      t("funnel.giftContract" as any),
      t("funnel.loanContract" as any),
      t("funnel.inheritanceContract" as any),
    ],
  },

  {
    title: t("funnel.forConstructionProject" as any),
    items: [
      t("funnel.buildingPermit" as any),
      t("funnel.projectPlanCostEstimate" as any),
    ],
  }
];

  // -----------------------------
  // DEFAULT SECTIONS (Nat. Person)
  // -----------------------------
const sections = [
  {
    title: t("funnel.basicInformation" as any),
    items: [
      t("funnel.mortgageFormular" as any),
      t("funnel.passportIDPermit" as any),
      t("funnel.ownFundsProofCurrent" as any),
      t("funnel.currentTaxReturn" as any),
    ],
  },

  {
    title: t("funnel.docSectionEmployees" as any),
    items: [
      t("funnel.currentSalaryStatement" as any),
      t("funnel.pensionFund3rdPillar" as any),
    ],
  },

  {
    title: t("funnel.docSectionSelfEmployed" as any),
    items: [
      t("funnel.currentSalaryStatement" as any),
      t("funnel.pensionFund3rdPillar" as any),
    ],
  },

  {
    title: t("funnel.docSectionRetiree" as any),
    items: [
      t("funnel.pensionCertificate" as any),
    ],
  },

  {
    title: t("funnel.docSectionAge50Plus" as any),
    items: [
      t("funnel.pensionClaim" as any),
      t("funnel.pensionFund3rdPillar" as any),
    ],
  },

  {
    title: t("funnel.docSectionNewConstruction" as any),
    items: [
      t("funnel.salesDocumentationShort" as any),
      t("funnel.constructionPlans" as any),
      t("funnel.purchaseContractShort" as any),
      t("funnel.buildingInsurancePolicyCurrent" as any),
      t("funnel.cubatureIfNotAvailable" as any),
      t("funnel.landRegistryExtract" as any),
    ],
  },

  {
    title: t("funnel.docSectionIfReserved" as any),
    items: [
      t("funnel.reservationContract" as any),
      t("funnel.reservationPaymentBankStatement" as any),
    ],
  },

  {
    title: t("funnel.docSectionInvestmentProperty" as any),
    items: [
      t("funnel.currentRentalOverview" as any),
    ],
  },

  {
    title: t("funnel.docSectionRedemption" as any),
    items: [
      t("funnel.buildingCertificate" as any),
      t("funnel.constructionPlans" as any),
      t("funnel.landRegistryExtractCurrent" as any),
      t("funnel.currentMortgageInvoice" as any),
    ],
  },

  {
    title: t("funnel.docSectionCondominium" as any),
    items: [
      t("funnel.condominiumOwnershipCertificate" as any),
      t("funnel.usageManagementRegulations" as any),
      t("funnel.condominiumMeetingProtocols" as any),
    ],
  },

  {
    title: t("funnel.docSectionOtherOwners" as any),
    items: [
      t("funnel.giftContract" as any),
      t("funnel.loanContract" as any),
      t("funnel.inheritanceConfirmation" as any),
    ],
  },

  {
    title: t("funnel.docSectionConstructionRenovation" as any),
    items: [
      t("funnel.buildingApplication" as any),
      t("funnel.projectPlansContractorAgreement" as any),
    ],
  },
];


const isJur = (borrowers ?? []).some((b: any) => b.type === "jur");

let selectedDocuments = isJur
  ? documentsForNeuKaufJur
  : sections;

  selectedDocuments = selectedDocuments.filter((section: any) => {
  const title = section.title;

  // Neubau
  if (title === t("funnel.docSectionNewConstruction" as any) || title === t("funnel.forNewConstruction" as any)) {
    return isNeubau;
  }

  // Ablösung
  if (title === t("funnel.docSectionRedemption" as any) || title === t("funnel.forRedemption" as any)) {
    return isAblösung;
  }

  // Stockwerkeigentum
  if (title === t("funnel.docSectionCondominium" as any) || title === t("funnel.forCondominiumOwnership" as any)) {
    return isStockwerkeigentum;
  }

  // Andere Eigentümer
  if (title === t("funnel.docSectionOtherOwners" as any) || title === t("funnel.forOtherOwners" as any)) {
    return isMultipleEigentuemer;
  }

  // Bauprojekt/Renovation
  if (title === t("funnel.docSectionConstructionRenovation" as any) || title === t("funnel.forConstructionProject" as any)) {
    return isBauprojekt || isRenovation;
  }

  // Falls reserviert
  if (title === t("funnel.docSectionIfReserved" as any)) {
    return property?.reserviert === "ja";
  }

  // Renditeobjekt
  if (title === t("funnel.docSectionInvestmentProperty" as any)) {
    return property?.nutzung === t("funnel.investmentProperty" as any);
  }

  return true;
});


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
  <div className="w-full flex justify-center pb-3 -mt-16 font-sfpro">

    <div className="w-full max-w-[1100px]">

      {/* HEADER AREA */}
      <div className="text-center mb-14">
        <h1 className="text-[38px] font-semibold text-[#132219] tracking-tight">
         {t("funnel.uploadDocumentsTitle" as any)}
        </h1>

      </div>

      {/* UPLOAD CARD */}
<div className="
  bg-[#CAF4761A] shadow-md rounded-3xl p-12 
  border border-[#E6E6E6]
  flex flex-col items-center gap-5 mb-16
">


    <div className="w-20 h-20  rounded-full flex items-center justify-center shadow-md">
  <img 
    src="/images/upload.svg" 
    alt="Upload" 
    className="w-10 h-10"
  />
</div>


        <h2 className="text-[22px] font-semibold text-[#132219]">
          {t("funnel.selectFileOrDrop" as any)}
        </h2>

        <p className="text-gray-500 text-[15px]">
          {t("funnel.fileFormatsSize" as any)}
        </p>

        <label className="cursor-pointer mt-3">
<input
  type="file"
  className="hidden"
  multiple    
  onChange={handleUpload}
/>
          <div className="bg-[#132219] text-white px-8 py-3 rounded-full text-sm tracking-wide hover:bg-black">
            {t("funnel.browseFiles" as any)}
          </div>
          
        </label>

<div className="flex flex-col items-center mt-6">
  <div className="h-[1px] w-24 bg-[#132219]/20 mb-4"></div>

  <p className="text-[16px] text-[#132219]/70 leading-relaxed text-center max-w-[480px]">
    {t("funnel.uploadAllDocuments" as any)}  
    Markieren Sie hochgeladene Dateien ganz einfach mit einer Checkbox. 
    <span className="opacity-60"> (optional)</span>
  </p>
</div>

      </div>

      {/* SECTION LIST */}
      <div className="space-y-16">

        {selectedDocuments.map((section, index) => (
          <div
            key={index}
            className="bg-white shadow-sm rounded-3xl p-10 border border-[#F0F0F0]"
          >
            {/* SECTION HEADER */}
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[22px] font-semibold text-[#132219] tracking-tight">
                {section.title}
              </h3>

              <div className="w-10 h-10 rounded-full bg-[#F6F6F6] flex items-center justify-center shadow-inner">
                <span className="text-lg opacity-70">📄</span>
              </div>
            </div>

            {/* DOCUMENT GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {section.items.map((doc, idx) => {
const saved = docs.some((d: { name: string }) => d.name === doc);

                return (
                  <div
                    key={idx}
                    onClick={() => toggleDocument(doc)}
                    className={`
                      flex items-center justify-between
                      px-6 py-4 cursor-pointer rounded-2xl
                      shadow-sm border transition-all  

                      ${
                        saved
                          ? "bg-[#EAF7D8] border-[#CAEBAA]"
                          : "bg-[#FAFAFA] border-[#E4E4E4] hover:bg-[#F2F2F2]"
                      }
                    `}
                  >
                    <span className="text-[15px] text-[#132219] leading-tight">
                      {doc}
                    </span>

                    {/* CHECK CIRCLE */}
                    <div
                      className={`
                        w-6 h-6 rounded-full flex items-center justify-center
                        ${saved ? "bg-[#CAF476] border-[#132219]" : "bg-white border-gray-300"}
                        border transition
                      `}
                    >
                      {saved && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-4 h-4 text-[#132219]"
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
      <div className="flex justify-between mt-20">
        
        <button
          onClick={back}
          className="px-8 py-3 rounded-full border border-[#132219] text-[#132219] hover:bg-[#F7F7F7]"
        >
          Zurück
        </button>

        <button
          onClick={saveStep}
          className="px-10 py-3 bg-[#CAF476] rounded-full font-medium text-[#132219] shadow hover:bg-[#BCDF6A]"
        >
          Weiter
        </button>

      </div>
    </div>
  </div>
);

}

export default DocumentsStep;
