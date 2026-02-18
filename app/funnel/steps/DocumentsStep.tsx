"use client";
import { v4 as uuidv4 } from "uuid";
import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useEffect } from "react";


function DocumentsStep({ borrowers, docs, setDocs, addDocument, saveStep, back }: any) {
const [loading, setLoading] = useState(false);
const { t } = useTranslation();
const { project, email, property, financing } = useFunnelStore();
const [isDragging, setIsDragging] = useState(false);
const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

// Generate unique submission ID if project.id doesn't exist
const submissionId = project?.id || uuidv4();
console.log("🆔 Submission ID:", submissionId, "project.id:", project?.id);

// Reset folderId when submission ID changes (new submission)
useEffect(() => {
  setCurrentFolderId(null);
  console.log("🔄 New submission detected, folder ID reset. Submission ID:", submissionId);
}, [submissionId]);

const isNeubau = property?.artImmobilie === "neubau";
const isBestand = property?.artImmobilie === "bestehend";
const isAblösung = project?.projektArt === "abloesung";
const isKauf = project?.projektArt === "kauf";
const isWohnung = property?.artLiegenschaft === "Wohnung";
const isStockwerkeigentum = property?.artLiegenschaft === "Stockwerkeigentum" || property?.artLiegenschaft === "Wohnung";
const isMehrfamilienhaus = property?.artLiegenschaft === "Mehrfamilienhaus";
const isMultipleEigentuemer = property?.kreditnehmer?.length > 1;
const isBauprojekt = property?.neubauArt === "bauprojekt";
const isRenovation = property?.renovation === "ja";
const isReserviert = property?.reserviert === "ja";
const isRenditeobjekt = property?.nutzung === "Rendite-Immobilie";

// Check for other funding sources (gift/donation, loan, inheritance)
// Currently only eigenmittel_schenkung exists in the data model
// When this is filled, user may need to provide gift contract, loan contract, or inheritance documents
const hasAndereEigenmittel = financing?.eigenmittel_schenkung && Number(financing.eigenmittel_schenkung) > 0;

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
const hasAngestellt = (property?.kreditnehmer || []).some((kn: any) => kn.erwerb === "angestellt");
const hasSelbständig = (property?.kreditnehmer || []).some((kn: any) => kn.erwerb === "selbständig");
const hasRentner = (property?.kreditnehmer || []).some((kn: any) => kn.erwerb === "rentner");

// Debug logging for conditions
console.log("📄 Document Conditions:", {
  "property.artImmobilie": property?.artImmobilie,
  "property.artLiegenschaft": property?.artLiegenschaft,
  "property.nutzung": property?.nutzung,
  "property.renovation": property?.renovation,
  "project.projektArt": project?.projektArt,
  "financing.eigenmittel_schenkung": financing?.eigenmittel_schenkung,
  isNeubau,
  isBestand,
  isAblösung,
  isKauf,
  isStockwerkeigentum,
  isWohnung,
  isMehrfamilienhaus,
  isBauprojekt,
  isRenovation,
  isReserviert,
  isRenditeobjekt,
  hasAndereEigenmittel,
  hasAngestellt,
  hasSelbständig,
  hasRentner,
  hasAge50Plus,
  "Ablösung Section Should Show": isAblösung,
  "Stockwerkeigentum Section Should Show": isStockwerkeigentum,
  "Rendite Section Should Show": isRenditeobjekt,
  "Renovation Section Should Show": isBauprojekt || isRenovation,
  "Andere Eigenmittel Section Should Show": hasAndereEigenmittel
});



async function uploadDocToSharepoint(file: File, inquiryId: string, email: string, folderId: string | null = null) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("inquiryId", inquiryId);
  formData.append("email", email);
  if (folderId) {
    formData.append("folderId", folderId);
  }

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
    title: t("funnel.documentsJur" as any),
    items: [
      t("funnel.commercialRegisterCurrent" as any), // Handelsregisterauszug (aktuell)
      t("funnel.passportAuthorizedPersonJur" as any), // Pass oder Identitätskarte der Zeichnungsberechtigten Person
      t("funnel.annualFinancialStatementsJur" as any), // Jahresabschlüsse (Bilanzen und Erfolgsrechnungen der letzten 3 Jahre)
      t("funnel.interimBalanceIfAvailable" as any), // Aktuelle Zwischenbilanz (falls vorhanden)
      t("funnel.taxReturnLatestJur" as any), // Aktuellste Steuererklärung (inkl. Schulden-, Wertschriten, Liegenschatsverzeichnis)
      t("funnel.ownFundsProofJur" as any), // Aufstellung und Nachweis der Eigenmittel
      t("funnel.taxReturnLatest" as any), // Aktuellste Steuererklärung (inkl. Schulden-, Wertschriften, Liegenschaftsverzeichnis)
    ],
  },

  // NEUBAU documents for Juristische Person (only if it's Kauf + Neubau, NOT for Ablösung)
  ...(isKauf && isNeubau && !isAblösung ? [{
    title: t("funnel.docSectionNeubau" as any),
    items: [
      t("funnel.salesDocPhotos" as any), // Verkaufsdokumentation (inkl. Fotos)
      t("funnel.constructionPlansNetArea" as any), // Bau-/Grundrisspläne
      t("funnel.landRegistryIfAvailable" as any), // Aktueller Grundbuchauszug falls vorhanden
      t("funnel.purchaseOrRenovationContract" as any), // Kaufvertrag (Entwurf/original) oder/und Renovationsvertrag
      t("funnel.buildingInsuranceIfAvailable" as any), // Aktuelle Gebäudeversicherungspolice (falls bereits vorhanden)
    ],
  }] : []),

  // BESTEHENDE IMMOBILIE documents for Juristische Person (only if it's Kauf + Bestehende Immobilie, NOT for Ablösung)
  ...(isKauf && isBestand && !isAblösung ? [{
    title: t("funnel.docSectionExistingProperty" as any),
    items: [
      t("funnel.constructionDescriptionPhotos" as any), // Baubeschrieb (inkl. Foto des Innen- und Aussenbereichs)
      t("funnel.constructionPlansNetArea" as any), // Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Dachform, Bodenbeläge, Baubeschrieb
      t("funnel.landRegistryNotOlder6Months" as any), // Aktueller Grundbuchauszug (nicht älter als 6 Monate)
      t("funnel.oldSalesDocuments" as any), // Alte Verkaufdokumente (falls vorhanden)
    ],
  }] : []),

  // ABLÖSUNG documents for Juristische Person
  ...(isAblösung ? [{
    title: t("funnel.docSectionAbloesung" as any),
    items: [
      t("funnel.constructionDescriptionPhotos" as any), // Baubeschrieb (inkl. Foto des Innen- und Aussenbereichs)
      t("funnel.constructionPlansNetArea" as any), // Bau-/Grundrisspläne
      t("funnel.landRegistryNotOlder6Months" as any), // Aktueller Grundbuchauszug (nicht älter als 6 Monate)
      t("funnel.currentMortgageContract" as any), // Aktueller Hypothekenvertrag (bei Ablösung der Hypothek)
    ],
  }] : []),

  // STOCKWERKEIGENTUM for Juristische Person
  ...(isStockwerkeigentum ? [{
    title: t("funnel.docSectionStockwerkeigentum" as any),
    items: [
      t("funnel.condominiumActValue" as any), // Stockwerkeigentum-Begründungsakt mit Wertquotenaufteilung
      t("funnel.usageRegulationsSTWE" as any), // Nutzungs- und Verwaltungsreglement der STWE-Gemeinschaft
      t("funnel.renovationFundInfoCondominium" as any), // Bei Stockwerkeigentum: Angaben über den Erneuerungsfonds
    ],
  }] : []),

  // ANDERE EIGENMITTEL for Juristische Person
  ...(hasAndereEigenmittel ? [{
    title: t("funnel.otherOwnFunds" as any),
    items: [
      t("funnel.giftContract" as any), // Schenkungsvertrag
      t("funnel.loanContractGift" as any), // Darlehensvertag
      t("funnel.inheritanceContract" as any), // Erbschafttsvertrag
    ],
  }] : []),

  // BAUPROJEKT / RENOVATION for Juristische Person
  ...((isBauprojekt || isRenovation) ? [{
    title: t("funnel.docSectionBauprojektRenovation" as any),
    items: [
      t("funnel.buildingPermitDoc2" as any), // Baubewilligung
      t("funnel.projectPlanCostEstimate" as any), // Projektplan, Baubeschrieb und Bauhandwerkerverzeichnis
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
      t("funnel.passportIDAllBorrowers" as any), // Pass, Identitätskarte, Aufenthaltsbewilligung (aller Kreditnehmer)
      t("funnel.ownFundsProofOfficial" as any), // Aktuelle Aufstellung und Nachweis der Eigenmittel (PDF)
      t("funnel.taxReturnLatest" as any), // Aktuellste Steuererklärung
    ],
  },

  // Conditional: Show only if Angestellt
  ...(hasAngestellt ? [{
    title: t("funnel.forEmployed" as any),
    items: [
      t("funnel.salaryStatementBonus" as any), // Aktueller Lohnausweis (inkl. Nachweis Bonuszahlungen der letzten 3 Jahre)
      t("funnel.pensionFund3rdPillarBuyback" as any), // Pensionskassenausweis und Rückkaufswerte von der 3. Säule
    ],
  }] : []),

  // Conditional: Show only if Selbständig
  ...(hasSelbständig ? [{
    title: t("funnel.forSelfEmployed" as any),
    items: [
      t("funnel.balanceSheetAudit3Years" as any), // Bilanz und Erfolgsrechnung (inkl. Revisionsbericht) der letzten 3 Jahre
      t("funnel.pensionFund3rdPillarBuyback" as any), // Pensionskassenausweis und Rückkaufswerte von der 3. Säule
    ],
  }] : []),

  // Conditional: Show only if Rentner
  ...(hasRentner ? [{
    title: t("funnel.forRetirees" as any),
    items: [
      t("funnel.pensionCertificatePKAHV" as any), // Rentenbeschenigung (PK, AHV)
    ],
  }] : []),

  // Conditional: Show only if age 50+ years
  ...(hasAge50Plus ? [{
    title: t("funnel.from50Years" as any), // "50 Jahre Alter der Kreditnehmer"
    items: [
      t("funnel.pensionForecastAHV" as any), // Rentenvorausberechnung (AHV)
      t("funnel.pensionFund3rdPillarBuyback" as any), // Pensionskassenausweis und Rückkaufswerte von der 3. Säule
    ],
  }] : []),

  // NEUBAU documents for Natürliche Person (only show if it's Kauf + Neubau, NOT for Ablösung)
  ...(isKauf && isNeubau && !isAblösung ? [{
    title: t("funnel.docSectionNeubau" as any),
    items: [
      t("funnel.salesDocPhotos" as any), // Verkaufsdokumentation (inkl. Fotos des Innen- und Aussenbereichs)
      t("funnel.constructionPlansNetArea" as any), // Bau-/Grundrisspläne inkl. Nettowohnfläche
      t("funnel.landRegistryIfAvailable" as any), // Aktueller Grundbuchauszug falls vorhanden
      t("funnel.purchaseContractDraft" as any), // Kaufvertrag (Entwurf/original)
      t("funnel.buildingInsuranceIfAvailable" as any), // Aktuelle Gebäudeversicherungspolice
    ],
  }] : []),

  // BESTEHENDE IMMOBILIE documents for Natürliche Person (only show if it's Kauf + Bestehende Immobilie, NOT for Ablösung)
  ...(isKauf && isBestand && !isAblösung ? [{
    title: t("funnel.docSectionExistingProperty" as any),
    items: [
      t("funnel.constructionDescriptionPhotos" as any), // Baubeschrieb (inkl. Foto des Innen- und Aussenbereichs)
      t("funnel.constructionPlansNetArea" as any), // Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Dachform, Bodenbeläge, Baubeschrieb
      t("funnel.landRegistryNotOlder6Months" as any), // Aktueller Grundbuchauszug (nicht älter als 6 Monate)
      t("funnel.oldSalesDocuments" as any), // Alte Verkaufdokumente (falls vorhanden)
    ],
  }] : []),

  // Show reservation documents if reserviert = "ja" (for any case)
  ...(isReserviert ? [{
    title: t("funnel.reservation" as any),
    items: [
      t("funnel.renovationContract" as any), // Renovationsvertrag
      t("funnel.bankStatementReservation" as any), // Bankauszug Reservationszahlung
    ],
  }] : []),

  // Conditional: Show only if Renditeobjekt (investment property)
  ...(isRenditeobjekt ? [{
    title: t("funnel.docSectionRenditeobjekt" as any),
    items: [
      t("funnel.rentalOverviewCurrent" as any), // Aktueller Mieterspiegel inkl. Mietzinsaufstellung
    ],
  }] : []),

  // ABLÖSUNG documents for Natürliche Person (only if Ablösung selected)
  ...(isAblösung ? [{
    title: t("funnel.docSectionAbloesung" as any),
    items: [
      t("funnel.constructionDescriptionPhotos" as any), // Baubeschrieb (inkl. Foto des Innen- und Aussenbereichs)
      t("funnel.constructionPlansNetArea" as any), // Bau-/Grundrisspläne
      t("funnel.landRegistryNotOlder6Months" as any), // Aktueller Grundbuchauszug (nicht älter als 6 Monate)
      t("funnel.currentMortgageContract" as any), // Aktueller Hypothekenvertrag (bei Ablösung der Hypothek)
    ],
  }] : []),

  // STOCKWERKEIGENTUM
  ...(isStockwerkeigentum ? [{
    title: t("funnel.docSectionStockwerkeigentum" as any),
    items: [
      t("funnel.condominiumActValue" as any), // Stockwerkeigentum-Begründungsakt mit Wertquotenaufteilung
      t("funnel.usageRegulationsSTWE" as any), // Nutzungs- und Verwaltungsreglement der STWE-Gemeinschaft
      t("funnel.renovationFundInfoCondominium" as any), // Bei Stockwerkeigentum: Angaben über den Erneuerungsfonds
    ],
  }] : []),

  // ANDERE EIGENMITTEL (if any other funding sources exist)
  ...(hasAndereEigenmittel ? [{
    title: t("funnel.otherOwnFunds" as any),
    items: [
      t("funnel.giftContract" as any), // Schenkungsvertrag
      t("funnel.loanContractGift" as any), // Darlehensvertrag
      t("funnel.inheritanceConfirmation" as any), // Erbschaftbestätigung
    ],
  }] : []),

  // BAUPROJEKT / RENOVATION
  ...((isBauprojekt || isRenovation) ? [{
    title: t("funnel.docSectionBauprojektRenovation" as any),
    items: [
      t("funnel.buildingPermitDoc2" as any), // Baubewilligung
      t("funnel.projectPlanCostEstimate" as any), // Projektplan, Baubeschrieb und Bauhandwerkerverzeichnis (inkl. Kostenvoranschlag und Kubatur)
    ],
  }] : []),
];


const isJur = (borrowers ?? []).some((b: any) => b.type === "jur");


// State for selectedDocuments to force rerender on relevant changes
const [selectedDocuments, setSelectedDocuments] = useState(isJur ? documentsForJur : sections);

useEffect(() => {
  setSelectedDocuments(isJur ? documentsForJur : sections);
  // Shto props kryesore si dependency për rifreskim të saktë
}, [
  isJur,
  isKauf,
  isNeubau,
  isBestand,
  isAblösung,
  isWohnung,
  isStockwerkeigentum,
  isMehrfamilienhaus,
  isMultipleEigentuemer,
  isBauprojekt,
  isRenovation,
  isReserviert,
  isRenditeobjekt,
  hasAndereEigenmittel,
  hasAngestellt,
  hasSelbständig,
  hasRentner,
  hasAge50Plus,
  JSON.stringify(documentsForJur),
  JSON.stringify(sections),
  JSON.stringify(borrowers),
  JSON.stringify(project),
  JSON.stringify(property),
  JSON.stringify(financing)
]);




const handleUpload = async (e: any) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  console.log("� Adding", files.length, "file(s) to local list (not uploading yet)");

  // Store files locally without uploading
  for (const file of files) {
    const newDoc = {
      id: uuidv4(),
      name: file.name,
      size: file.size,
      file,
      sharepointUrl: null, // Will be set after actual upload
      uploaded: false, // Track upload status
    };

    setDocs((prev: any[]) => [...prev, newDoc]);
  }
  
  console.log("✅ Files added to local list. Upload will happen when Weiter is clicked.");
};

const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(true);
};

const handleDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
};

const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
  
  const files = Array.from(e.dataTransfer.files);
  if (!files || files.length === 0) return;

  console.log("� Adding", files.length, "dragged file(s) to local list (not uploading yet)");

  // Store files locally without uploading
  for (const file of files) {
    const newDoc = {
      id: uuidv4(),
      name: file.name,
      size: file.size,
      file,
      sharepointUrl: null, // Will be set after actual upload
      uploaded: false, // Track upload status
    };

    setDocs((prev: any[]) => [...prev, newDoc]);
  }
  
  console.log("✅ Files added to local list. Upload will happen when Weiter is clicked.");
};

const removeUploadedFile = (docId: string) => {
  setDocs((prev: any[]) => prev.filter((d: any) => d.id !== docId));
};

// Upload all files to SharePoint when Weiter button is clicked
const uploadAllFilesToSharePoint = async () => {
  const filesToUpload = docs.filter((doc: any) => doc.file && !doc.uploaded);
  
  if (filesToUpload.length === 0) {
    console.log("ℹ️ No files to upload");
    return;
  }

  console.log("📤 Uploading", filesToUpload.length, "file(s) to SharePoint");
  let uploadFolderId = currentFolderId;

  for (const doc of filesToUpload) {
    console.log("⬆️ Uploading file:", doc.name, "with folder ID:", uploadFolderId);
    
    const uploadRes = await uploadDocToSharepoint(
      doc.file,
      submissionId,
      email ?? "no-email",
      uploadFolderId
    );

    console.log("📦 Upload response for", doc.name, ":", uploadRes);

    if (uploadRes?.error) {
      console.error("❌ Upload failed for", doc.name, ":", uploadRes.error);
      alert(t("funnel.uploadError" as any) + ": " + doc.name);
      continue;
    }

    // Store folderId from first upload to reuse for subsequent uploads
    if (!uploadFolderId && uploadRes?.folderId) {
      uploadFolderId = uploadRes.folderId;
      setCurrentFolderId(uploadFolderId);
      console.log("📁 Folder created, ID stored:", uploadFolderId);
    }

    // Update the document with SharePoint URL and mark as uploaded
    setDocs((prev: any[]) => 
      prev.map((d: any) => 
        d.id === doc.id 
          ? { ...d, sharepointUrl: uploadRes?.data?.webUrl ?? null, uploaded: true }
          : d
      )
    );
    
    // Update in store as well
    addDocument({
      ...doc,
      sharepointUrl: uploadRes?.data?.webUrl ?? null,
      uploaded: true
    });
  }
  
  console.log("✅ All files uploaded successfully");
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
<div 
  className={`
    bg-[#CAF4761A] shadow-md rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-10 lg:p-12 
    border-2 transition-all duration-200
    flex flex-col items-center gap-4 md:gap-5 mb-8 md:mb-12 lg:mb-16
    ${isDragging ? 'border-[#132219] bg-[#CAF47633]' : 'border-[#E6E6E6]'}
  `}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>


    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center shadow-md">
  <img 
    src="/images/HYPOTEQ_funnel_upload_icon.svg" 
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

      {/* UPLOADED FILES PREVIEW */}
      {docs && docs.length > 0 && docs.some((d: any) => d.file) && (
        <div className="mb-8 md:mb-12">
          <h3 className="text-lg font-semibold text-[#132219] mb-4">Uploaded Files ({docs.filter((d: any) => d.file).length})</h3>
          <div className="space-y-2">
            {docs.filter((d: any) => d.file).map((doc: any) => (
              <div
                key={doc.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm"
              >
                <div className="flex items-center gap-3 flex-1">
                  <svg className="w-5 h-5 text-[#132219]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#132219] truncate">{doc.name}</p>
                    <p className="text-xs text-gray-500">{(doc.size / 1024).toFixed(2)} KB</p>
                  </div>
                </div>
                <button
                  onClick={() => removeUploadedFile(doc.id)}
                  className="ml-4 p-1 hover:bg-red-50 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* UPLOADING INDICATOR */}
      {loading && (
        <div className="flex flex-col items-center justify-center mt-6 mb-2">
          <svg className="animate-spin h-8 w-8 text-[#132219] mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
          <span className="text-[#132219] font-semibold text-lg">{t("funnel.uploadingFilesText", "Uploading files, please wait...")}</span>
        </div>
      )}

      {/* FOOTER BUTTONS */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 mt-12 md:mt-16 lg:mt-20">
        <button
          onClick={back}
          className="px-6 md:px-8 py-3 rounded-full border border-[#132219] text-[#132219] hover:bg-[#F7F7F7] transition-colors text-sm md:text-base order-2 sm:order-1"
        >
          {t("funnel.backButtonText" as any)}
        </button>

        <button
          onClick={async () => {
            if (loading) return;
            setLoading(true);
            try {
              await uploadAllFilesToSharePoint();
              await saveStep();
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className={`px-8 md:px-10 py-3 bg-[#CAF476] rounded-full font-medium text-[#132219] shadow hover:bg-[#BCDF6A] transition-colors text-sm md:text-base order-1 sm:order-2 ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 text-[#132219] mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
              {t("funnel.loadingText" as any)}
            </span>
          ) : t("funnel.continueButton" as any)}
        </button>
      </div>
    </div>
  </div>
);

}

export default DocumentsStep;
