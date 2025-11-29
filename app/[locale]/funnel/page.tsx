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

    const data = await res.json();

    if (!data.success) {
      console.error("Failed:", data.error);
      alert("Etwas ist schief gelaufen. Bitte versuchen Sie es erneut.");
      return;
    }

    console.log("📌 Inquiry created:", data);

    // 2️⃣ Extract inquiryId
    const inquiryId = data.inquiry.id;

    // 3️⃣ Upload documents to SharePoint
    for (const doc of uploadedDocs) {
      if (doc.file) {
        console.log("⬆ Uploading:", doc.name);
        await uploadDocToSharepoint(doc.file, inquiryId);
      }
    }

    console.log("🎉 All docs uploaded!");

    // 4️⃣ Move to success step
    setStep(7);

  } catch (err: any) {
    console.error("Error:", err);
    alert("Serverfehler. Bitte später erneut versuchen.");
  }
};


  return (
    <div className="w-full min-h-screen bg-white flex">

      <FunnelSidebar step={sidebarStep} />

<div className="flex-1 w-full pl-0 lg:pr-8 lg:pb-32 px-4">

        
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


/>

)}

{step === 5 && (
  <FinancingStep
    data={financingData}
    setData={setFinancingData}
    projectData={projectData}
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
      Vielen Dank, dass Sie das<br />Formular ausgefüllt haben.
    </h1>

    <p className="text-[24px] font-normal mt-4">
      Wir melden uns in Kürze bei Ihnen!
    </p>

    <button
      onClick={() => (window.location.href = "/de")}
      className="mt-8 px-6 py-2 h-[32px] flex items-center gap-2 rounded-full 
                 border border-[#132219] text-[#132219] text-[14px] font-medium"
      style={{ backgroundColor: "#CAF476" }}
    >
      Zurück zur Homepage
    </button>
  </div>
)}

      </div>
    </div>
  );
}
