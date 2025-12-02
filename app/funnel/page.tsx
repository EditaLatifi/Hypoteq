"use client";

import { useState, useEffect } from "react";
import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";
import ProgressBar from "@/components/ProgressBar"; 
import StartStep from "./steps/StartStep";
import ProjectStep from "./steps/ProjectStep";
import BorrowersStep from "./steps/BorrowersStep";
import PropertyStep from "./steps/PropertyStep";
import FinancingStep from "./steps/FinancingStep";
import DocumentsStep from "./steps/DocumentsStep";
import DirectSummaryStep from "./steps/DirectSummaryStep";
import FunnelSidebar from "./FunnelSidebar";
import { v4 as uuidv4 } from "uuid";

export default function FunnelPage() {
  const { t } = useTranslation();
  const {
    customerType,
    setCustomerType,
    setClient,
    setProject,
    setProperty,
    setFinancing,
    addDocument,
  } = useFunnelStore();

  const [step, setStep] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlType =
      params.get("customer") || params.get("customerType") || null;

    if (!customerType) {
      if (urlType === "direct" || urlType === "partner") {
        setCustomerType(urlType);
      }
    }
  }, [customerType, setCustomerType]);
  

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(1, s - 1));

  
const borrowers = useFunnelStore((state) => state.borrowers);
const setBorrowers = useFunnelStore((state) => state.setBorrowers);
useEffect(() => {
  if (!borrowers || borrowers.length === 0) {
    setBorrowers([{ id: uuidv4(), type: "nat" }]);
  }
}, []);


  async function uploadDocToSharepoint(file: File, inquiryId: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("inquiryId", inquiryId);

  const res = await fetch("/api/upload-doc", {
    method: "POST",
    body: formData,
  });

  return res.json();
}

  // -------------------------------------
  // CALCULATE SIDEBAR MAPPING
  // -------------------------------------
  const getSidebarStep = () => {
    if (step <= 3) return 1;               // StartStep, ProjectStep, BorrowersStep
    if (step === 4) return 2;              // PropertyStep
    if (step === 5 || step === 6) return 3; // FinancingStep + Documents/Summary
    return 4;                              // Final
  };

  const sidebarStep = getSidebarStep();

  // -------------------------------------
  // STATE
  // -------------------------------------

  const [clientData, setClientData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    zip: "",
    partnerEmail: "",
  });

  const [projectData, setProjectData] = useState({
    projektArt: "" as "" | "kauf" | "abloesung",
    liegenschaftZip: "",
    kreditnehmerTyp: "",
  });

  const [propertyData, setPropertyData] = useState({
    artImmobilie: "",
    artLiegenschaft: "",
    nutzung: "",
    renovation: "",
    renovationsBetrag: "",
    reserviert: "",
    finanzierungsangebote: "",
    angeboteListe: [] as string[],
    kreditnehmer: [
      {
        id: uuidv4(),
        vorname: "",
        name: "",
        geburtsdatum: "",
        status: "Angestellt",
      },
    ],
    firmen: [{ firmenname: "" }],
  });



  const [financingData, setFinancingData] = useState({
    kaufpreis: "",
    eigenmittel_bar: "",
    eigenmittel_saeule3: "",
    eigenmittel_pk: "",
    eigenmittel_schenkung: "",
    pkVorbezug: "",
    hypoBetrag: "",
    modell: "",
    einkommen: "",
    steueroptimierung: "",
    kaufdatum: "",
    kommentar: "",
    abloesung_betrag: "",
    erhoehung: "",
    erhoehung_betrag: "",
    abloesedatum: "",
  });

  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);

  // -------------------------------------
  // SAVE STEPS
  // -------------------------------------

  const saveStep1 = () => {
    if (customerType === "partner") {
      setClient({ email: clientData.partnerEmail });
    } else {
      setClient(clientData);
    }
    next();
  };

const saveStep2 = () => {
  setProject(projectData);
  next();
};


// Correct order
const saveStep3 = () => {
  setBorrowers(borrowers);
  next();
};

const saveStep4 = () => {
  setProperty(propertyData);
  next();
};

const saveStep5 = () => {
  setFinancing(financingData);
  next();
};



  const saveStep6 = () => {
    setStep(7);
  };

  // -------------------------------------
  // RENDER
  // -------------------------------------
const submitFinal = async () => {
  try {
    const {
      customerType,
      client,
      project,
      property,
      borrowers,
      financing,
    } = useFunnelStore.getState();

    console.log("📊 Submitting data to API:", {
      customerType,
      client,
      project,
      property,
      borrowers,
      financing,
    });

    // 1️⃣ Create Inquiry
    const res = await fetch("/api/inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerType,
        client,
        project,
        property,
        borrowers,
        financing,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error("❌ API Error:", errorData.error);
      alert(`Fehler: ${errorData.error || "Etwas ist schief gelaufen. Bitte versuchen Sie es erneut."}`);
      return;
    }

    const data = await res.json();
    console.log("📌 Inquiry created:", data);

    // For direct customers, skip document upload and go straight to thank you
    if (customerType === "direct") {
      setStep(7);
      return;
    }

    // 2️⃣ Extract inquiryId for partners
    const inquiryId = data.inquiry?.id;

    // 3️⃣ Upload documents to SharePoint (partners only)
    if (uploadedDocs && uploadedDocs.length > 0) {
      for (const doc of uploadedDocs) {
        if (doc.file) {
          console.log("⬆ Uploading:", doc.name);
          await uploadDocToSharepoint(doc.file, inquiryId);
        }
      }
      console.log("🎉 All docs uploaded!");
    }

    // 4️⃣ Move to success step
    setStep(7);

  } catch (err: any) {
    console.error("Error:", err);
    alert("Serverfehler. Bitte später erneut versuchen.");
  }
};


  return (
    <div className="w-full min-h-screen bg-white flex flex-col md:flex-row">

      <FunnelSidebar step={sidebarStep} />

      {/* Main Content - Add top padding only for mobile */}
      <div className="flex-1 w-full px-4 md:px-6 lg:px-8 pt-24 md:pt-0 pb-20 md:pb-24 lg:pb-32">

        
        <div className="mb-8 md:mb-16 lg:mb-[140px]">
          <ProgressBar step={step} />
        </div>

        {step === 1 && (
          <StartStep
            customerType={customerType}
            setCustomerType={setCustomerType}
            clientData={clientData}
            setClientData={setClientData}
            saveStep={saveStep1}
          />
        )}

        {step === 2 && (
          <ProjectStep
            data={projectData}
            setData={setProjectData}
            saveStep={saveStep2}
            back={back}
            customerType={customerType}
          />
        )}

{step === 3 && (
  <BorrowersStep
saveStep={next}

    back={back}
  />
)}


{step === 4 && (
<PropertyStep
  data={propertyData}
  setData={setPropertyData}
  saveStep={saveStep4}
  back={back}
  customerType={customerType}            // direct / partner
borrowerType={borrowers[0]?.type}


/>

)}

{step === 5 && (
  <FinancingStep
    data={financingData}
    setData={setFinancingData}
    projectData={projectData}
    propertyData={propertyData}
    borrowers={borrowers}      
    customerType={customerType}
    saveStep={saveStep5}
    back={back}
  />
)}


       {step === 6 && customerType === "direct" && (
  <DirectSummaryStep back={back} saveStep={submitFinal} />
)}


        {step === 6 && customerType === "partner" && (
 <DocumentsStep
  borrowers={borrowers}
  docs={uploadedDocs}
  setDocs={setUploadedDocs}
  addDocument={addDocument}
  saveStep={saveStep6}
  back={back}
/>

        )}

 {step === 7 && (
  <div className="w-full min-h-screen flex flex-col items-center justify-center -mt-[220px] text-center px-4">
    <h1 className="text-[48px] font-normal leading-tight">
      {t("funnel.thankYouTitle" as any)}
    </h1>

    <p className="text-[24px] font-normal mt-4">
      {t("funnel.thankYouMessage" as any)}
    </p>

    <button
      onClick={() => (window.location.href = "/")}
      className="mt-8 px-6 py-2 h-[32px] flex items-center gap-2 rounded-full 
                 border border-[#132219] text-[#132219] text-[14px] font-medium"
      style={{ backgroundColor: "#CAF476" }}
    >
      {t("funnel.backToHomepage" as any)}
    </button>
  </div>
)}

      </div>
    </div>
  );
}
