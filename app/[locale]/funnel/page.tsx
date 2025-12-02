"use client";

import { useState, useEffect } from "react";
import { useFunnelStore } from "@/src/store/funnelStore";
import ProgressBar from "@/components/ProgressBar"; 
import StartStep from "../../funnel/steps/StartStep";
import ProjectStep from "../../funnel/steps/ProjectStep";
import BorrowersStep from "../../funnel/steps/BorrowersStep";
import PropertyStep from "../../funnel/steps/PropertyStep";
import FinancingStep from "../../funnel/steps/FinancingStep";
import DocumentsStep from "../../funnel/steps/DocumentsStep";
import DirectSummaryStep from "../../funnel/steps/DirectSummaryStep";
import FunnelSidebar from "../../funnel/FunnelSidebar";
import { v4 as uuidv4 } from "uuid";

export default function FunnelPage() {
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
  setFinancing(financingData); // push local financing state to store
  next();
};



  const saveStep6 = async () => {
    // For partners: ensure all data is in store, then submit
    setProject(projectData);
    setProperty(propertyData);
    setBorrowers(borrowers);
    setFinancing(financingData);
    
    // Small delay to ensure state is updated
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await submitFinal();
  };

  // -------------------------------------
  // RENDER
  // -------------------------------------
const submitFinal = async () => {
  try {
    const storeState = useFunnelStore.getState();
    const {
      customerType,
      email,
      client,
      project,
      property,
      borrowers,
      financing,
    } = storeState;

    console.log("📊 Full Store State:", storeState);
    console.log("📌 Submitting final data:", {
      customerType,
      email,
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
        email: email || client?.email,
        client,
        project,
        property,
        borrowers,
        financing,
      }),
    });

    const data = await res.json();

    if (!data.success) {
      console.error("Failed:", data.error);
      alert("Etwas ist schief gelaufen. Bitte versuchen Sie es erneut.");
      return;
    }

    console.log("📌 Inquiry created:", data);

    // 2️⃣ Extract inquiryId
    const inquiryId = data.inquiry?.id;

    if (!inquiryId) {
      console.error("No inquiry ID received");
      alert("Fehler: Keine Anfrage-ID erhalten.");
      return;
    }

    // 3️⃣ Upload documents to SharePoint (only if uploadedDocs exists)
    if (uploadedDocs && uploadedDocs.length > 0) {
      for (const doc of uploadedDocs) {
        if (doc.file) {
          console.log("⬆ Uploading:", doc.name);
          await uploadDocToSharepoint(doc.file, inquiryId);
        }
      }
      console.log("🎉 All docs uploaded!");
    } else {
      console.log("📌 No documents to upload (direct customer)");
    }

    // 4️⃣ Move to success step
    console.log("✅ Moving to thank you page, current step:", step);
    window.scrollTo({ top: 0, behavior: "smooth" });
    next();
    console.log("✅ next() called successfully");

  } catch (err: any) {
    console.error("❌ Error in submitFinal:", err);
    alert("Serverfehler. Bitte später erneut versuchen.");
  }
};


  return (
    <div className="w-full min-h-screen bg-white flex">

      <FunnelSidebar step={sidebarStep} />

<div className="flex-1 pt-[100px] md:pt-0 w-full pl-0 lg:pr-8 lg:pb-32 px-4">

        
        <div className="mb-[140px] hidden md:block">
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
  projectData={projectData}
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
  <div className="w-full min-h-screen flex flex-col items-center justify-center px-4 py-12 md:py-20 lg:-mt-[220px] text-center">
    <div className="max-w-[700px] mx-auto">
      {/* Success Icon */}
      <div className="mb-6 md:mb-8">
        <svg className="w-16 h-16 md:w-20 md:h-20 mx-auto text-[#CAF476]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
        </svg>
      </div>

      <h1 className="text-[28px] sm:text-[36px] md:text-[48px] lg:text-[52px] font-normal leading-tight mb-4 md:mb-6">
        Vielen Dank, dass Sie das<br className="hidden sm:block" />
        <span className="sm:hidden"> </span>Formular ausgefüllt haben.
      </h1>

      <p className="text-[18px] sm:text-[20px] md:text-[24px] font-normal text-[#132219]/80">
        Wir melden uns in Kürze bei Ihnen!
      </p>

      <button
        onClick={() => (window.location.href = "/de")}
        className="mt-8 md:mt-10 px-6 md:px-8 py-3 md:py-3.5 flex items-center justify-center gap-2 rounded-full 
                   border border-[#132219] text-[#132219] text-[14px] md:text-[16px] font-medium
                   hover:opacity-90 transition-opacity mx-auto"
        style={{ backgroundColor: "#CAF476" }}
      >
        Zurück zur Homepage
      </button>
    </div>
  </div>
)}

      </div>
    </div>
  );
}
