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
import { showsInFunnelThankYou } from "@/components/funnelThankYou";
import { applyDocumentCorrections } from "@/components/funnelCorrections";
import { v4 as uuidv4 } from "uuid";

export default function FunnelPage() {
  const { t, locale } = useTranslation();
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
    setBorrowers([{ id: uuidv4(), type: "" }]);
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
  // Which of the sidebar's five groups the current internal step belongs to. The mockups
  // give Unterlagen a group of its own, which is right — it is where the customer does the
  // most work — so Financing and Documents no longer share one. Presentation only: the
  // internal step numbering and every validation hanging off it are unchanged.
  const getSidebarStep = () => {
    if (step <= 3) return 1;  // Start, Project, Borrowers -> Allgemeines
    if (step === 4) return 2; // Property                  -> Projekt & Objekt
    if (step === 5) return 3; // Financing                 -> Kalkulator
    if (step === 6) return 4; // Documents / Summary       -> Unterlagen
    return 5;                 //                              Abschluss
  };

  const sidebarStep = getSidebarStep();

  // -------------------------------------
  // STATE
  // -------------------------------------

  const [clientData, setClientData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    partnerEmail: "",
  });

  const [projectData, setProjectData] = useState({
    projektArt: "" as "" | "kauf" | "abloesung",
    liegenschaftZip: "",
    kreditnehmerTyp: "",
  });

  const [propertyData, setPropertyData] = useState({
    artImmobilie: "",
    zip: "",
    ort: "",
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
  // Validate borrower type is selected
  if (!borrowers || !borrowers[0] || !borrowers[0].type || borrowers[0].type === "") {
    console.log("❌ BorrowersStep validation failed - no type selected");
    return; // Don't proceed if no type selected
  }
  // Borrowers are already saved in store by BorrowersStep
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



  const saveStep6 = async (payload?: any) => {
    // Corrections the customer accepted from a document, applied AFTER the financing form
    // below is pushed. setFinancing replaces the whole object with a copy frozen on step 5,
    // so applying them first would revert them — see financingOverrides in DocumentsStep.
    const overrides = payload?.financingOverrides ?? {};
    // For partners: ensure all data is in store, then submit
    setProject(projectData);
    setProperty(propertyData);
    setBorrowers(useFunnelStore.getState().borrowers);
    setFinancing(applyDocumentCorrections(financingData, overrides));
    
    // Small delay to ensure state is updated
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await submitFinal(payload);
  };

  // -------------------------------------
  // RENDER
  // -------------------------------------
// `payload` comes from DocumentsStep and carries documentCompleteness. Everything else is
// still read from the store — only the client knows which document sections were rendered,
// so that verdict cannot be recomputed here or on the server.
const submitFinal = async (payload?: any) => {
  try {
    // Always push latest local state to store before submitting
    const currentType = useFunnelStore.getState().customerType;
    if (currentType === "partner") {
      setClient({ email: clientData.partnerEmail });
    } else {
      setClient(clientData);
    }
    setProject(projectData);
    setProperty(propertyData);
    // Same reason as in saveStep6: this runs after it, with the step-5 copy of the form, so
    // a value the customer took from a document would be reverted here instead.
    setFinancing(applyDocumentCorrections(financingData, payload?.financingOverrides));
    setBorrowers(borrowers);

    // Small delay to ensure state is updated
    await new Promise(resolve => setTimeout(resolve, 100));

    const storeState = useFunnelStore.getState();
    const {
      customerType: latestCustomerType,
      client,
      project,
      property,
      borrowers: latestBorrowers,
      financing,
    } = storeState;

    console.log("📊 Full Store State:", storeState);
    console.log("📊 Submitting data to API:", {
      customerType: latestCustomerType,
      client,
      project,
      property,
      borrowers: latestBorrowers,
      financing,
    });

    // 1️⃣ Create Inquiry
    const res = await fetch("/api/inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerType: latestCustomerType,
        locale,
        client,
        project,
        property,
        borrowers: latestBorrowers,
        financing,
        documentCompleteness: payload?.documentCompleteness ?? null,
        sharepointFolderId: payload?.sharepointFolderId ?? null,
        // The id the documents step filed its uploads under. Passed on so the
        // Inquiry is created with it and can claim them.
        submissionId: payload?.submissionId ?? null,
      }),
    });

    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      console.error("❌ Failed to parse JSON from /api/inquiry:", jsonErr);
      alert("Serverfehler (Ungültige Antwort). Bitte später erneut versuchen.");
      return;
    }

    if (!res.ok || !data.success) {
      console.error("❌ API Error:", data.error || data);
      alert(data.error || "Etwas ist schief gelaufen. Bitte versuchen Sie es erneut.");
      return;
    }

    console.log("📌 Inquiry created:", data);

    // Direct customers have no document step, so step 7 is their only final screen.
    if (showsInFunnelThankYou(customerType)) {
      setStep(7);
      return;
    }

    // 2️⃣ Extract inquiryId for partners (fixed)
    const inquiryId = data.inquiryId;

    // 3️⃣ Upload documents to SharePoint (partners only)
    // DocumentsStep already uploads files via its own SharePoint flow and
    // marks them with `uploaded: true`. Re-uploading here would call the
    // 2-arg upload helper (missing email) and fail. Skip anything already done.
    if (uploadedDocs && uploadedDocs.length > 0) {
      for (const doc of uploadedDocs) {
        if (doc.file && !doc.uploaded) {
          try {
            console.log("⬆ Uploading:", doc.name);
            await uploadDocToSharepoint(doc.file, inquiryId);
          } catch (uploadErr) {
            console.error("❌ Error uploading document:", doc.name, uploadErr);
            alert(`Fehler beim Hochladen von ${doc.name}. Bitte versuchen Sie es erneut.`);
            return;
          }
        }
      }
      console.log("🎉 All docs uploaded!");
    }

    // 4️⃣ Final screen — partners only reach here, and they do NOT go to step 7.
    //
    // They submit from DocumentsStep, whose progress popup finishes its animation and then
    // navigates to the localised thank-you page (/de/danke, /fr/merci, /it/grazie,
    // /en/thank-you). Setting step 7 as well is what produced two "Vielen Dank" screens for
    // one submission: step 7 rendered, then the redirect landed a moment later. Direct
    // customers returned at the top of this function and keep step 7.
    console.log("✅ Inquiry created; DocumentsStep will navigate to the thank-you page");

  } catch (err) {
    console.error("❌ Error in submitFinal:", err);
    alert("Serverfehler. Bitte später erneut versuchen.");
  }
};


  return (
    // The shell from the funnel mockups: the page sits on the brand's darkest forest and the
    // funnel itself is a card floating on it. The card is desktop-only — on a phone the
    // mockup's 412px device frame is the canvas showing a phone, not a border a real phone
    // should draw around its own screen, so there it goes full-bleed.
    <div
      className="w-full min-h-screen flex justify-center"
      style={{ background: "var(--forest-900)", fontFamily: "var(--font-text)" }}
    >
      <div
        className="w-full md:my-7 md:max-w-[1360px] md:rounded-2xl md:overflow-hidden"
        style={{ background: "var(--paper)" }}
      >
        <div className="flex flex-col md:flex-row items-stretch md:min-h-[940px]">

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
    saveStep={saveStep3}
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


       {step === 6 && (
 <DocumentsStep
  borrowers={borrowers}
  docs={uploadedDocs}
  setDocs={setUploadedDocs}
  addDocument={addDocument}
  saveStep={customerType === "direct" ? submitFinal : saveStep6}
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
      </div>
    </div>
  );
}
