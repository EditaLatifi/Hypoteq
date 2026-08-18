"use client";
import { v4 as uuidv4 } from "uuid";
import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { isRequiredDoc, computeDocumentCompleteness } from "@/components/funnelDocumentCatalog";

const HypoteqLoadingPopup = dynamic(() => import("./HypoteqLoadingPopup"), { ssr: false });

// Map funnel language code to Salesforce picklist value
const FUNNEL_LANG_TO_SF: Record<string, string> = {
  de: "Deutsch",
  fr: "Französisch",
  it: "Italienisch",
  en: "Englisch",
};


function DocumentsStep({ borrowers, docs, setDocs, addDocument, saveStep, back }: any) {
  // Remove loading state, only use showPopup
  const [showPopup, setShowPopup] = useState(false);
  // Set to true only after upload + save have actually succeeded.
  // The loading popup uses this to know it's safe to animate to 100% and redirect.
  const [submitDone, setSubmitDone] = useState(false);
const { t } = useTranslation();
const { project, email, property, financing } = useFunnelStore();

// Robustly extract language from URL (e.g. /de/funnel, /fr/funnel, etc.)
let langFromUrl = "de"; // fallback default
if (typeof window !== "undefined") {
  const pathParts = window.location.pathname.split("/");
  if (pathParts.length > 1 && pathParts[1]) {
    langFromUrl = pathParts[1].toLowerCase();
  }
  const allowedLangs = ["de", "fr", "it", "en"];
  if (!allowedLangs.includes(langFromUrl)) {
    langFromUrl = "de";
  }
}
// Debug log for language extraction
if (typeof window !== "undefined") {
  console.log("🌐 Pathname:", window.location.pathname, "| Extracted lang:", langFromUrl);
}

// Map to Salesforce value, fallback to 'Deutsch' if not recognized
const korrespondenzspracheValue = FUNNEL_LANG_TO_SF[langFromUrl] || FUNNEL_LANG_TO_SF["de"];
if (typeof window !== "undefined") {
  console.log("🗣️ korrespondenzspracheValue for Salesforce:", korrespondenzspracheValue);
}
const [isDragging, setIsDragging] = useState(false);
const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

// Stable submission ID for the whole step. Must NOT be regenerated on every
// render (a fresh uuid each render changes the SharePoint folder key and can
// scatter one submission's documents across multiple folders). Prefer the real
// project.id once it exists, otherwise keep the id generated on first mount.
const submissionIdRef = useRef<string>(project?.id || uuidv4());
if (project?.id && submissionIdRef.current !== project.id) {
  submissionIdRef.current = project.id;
}
const submissionId = submissionIdRef.current;
console.log("🆔 Submission ID:", submissionId, "project.id:", project?.id);

// Reset folderId when the submission ID changes (a genuinely new submission).
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
  "Ablösung Section Should Show": isAblösung,
  "Stockwerkeigentum Section Should Show": isStockwerkeigentum,
  "Rendite Section Should Show": isRenditeobjekt,
  "Renovation Section Should Show": isBauprojekt || isRenovation,
  "Andere Eigenmittel Section Should Show": hasAndereEigenmittel
});



// 5 MiB chunks — multiple of 320 KiB as required by Microsoft Graph.
const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;
// Per-chunk network timeout. A stalled chunk must not hang the whole popup.
const CHUNK_TIMEOUT_MS = 120_000;

async function uploadDocToSharepoint(
  file: File,
  inquiryId: string,
  email: string,
  folderId: string | null = null
) {
  try {
    const startRes = await fetch("/api/upload-doc/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        email,
        inquiryId,
        folderId,
      }),
    });
    const startJson = await startRes.json();
    if (!startRes.ok || !startJson?.uploadUrl) {
      return { error: startJson?.details || startJson?.error || "Failed to start upload" };
    }
    const { uploadUrl, folderId: resolvedFolderId } = startJson;

    const total = file.size;
    let driveItem: any = null;
    let offset = 0;

    while (offset < total) {
      const end = Math.min(offset + UPLOAD_CHUNK_SIZE, total);
      const chunk = file.slice(offset, end);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);

      let chunkRes: Response;
      try {
        chunkRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Range": `bytes ${offset}-${end - 1}/${total}`,
          },
          body: chunk,
          signal: controller.signal,
        });
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return { error: `Upload stalled on chunk ${offset}-${end - 1}` };
        }
        return { error: err?.message || "Network error during chunk upload" };
      } finally {
        clearTimeout(timeoutId);
      }

      if (chunkRes.status === 202) {
        offset = end;
        continue;
      }
      if (chunkRes.status === 200 || chunkRes.status === 201) {
        try {
          driveItem = await chunkRes.json();
        } catch {
          driveItem = null;
        }
        offset = end;
        break;
      }

      let errBody: any = null;
      try {
        errBody = await chunkRes.json();
      } catch {
        errBody = null;
      }
      return {
        error:
          errBody?.error?.message ||
          `Chunk upload failed: HTTP ${chunkRes.status}`,
      };
    }

    if (!driveItem) {
      return { error: "Upload completed without a final response from Graph" };
    }

    const finalizeRes = await fetch("/api/upload-doc/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        email,
        inquiryId,
        driveItem,
      }),
    });
    const finalizeJson = await finalizeRes.json();
    if (!finalizeRes.ok || !finalizeJson?.success) {
      return {
        error:
          finalizeJson?.details ||
          finalizeJson?.error ||
          "Failed to finalize upload",
      };
    }

    return {
      success: true,
      data: driveItem,
      folderId: resolvedFolderId,
    };
  } catch (err: any) {
    return { error: err?.message || "Network error" };
  }
}


// ===================================
// JURISTISCHE PERSON - Document Structure
// ===================================
const documentsForJur = [
  {
    title: t("funnel.documentsJur" as any),
    items: [
      "funnel.commercialRegisterCurrent", // Handelsregisterauszug (aktuell)
      "funnel.passportAuthorizedPersonJur", // Pass oder Identitätskarte der Zeichnungsberechtigten Person
      "funnel.annualFinancialStatementsJur", // Jahresabschlüsse (Bilanzen und Erfolgsrechnungen der letzten 3 Jahre)
      "funnel.interimBalanceIfAvailable", // Aktuelle Zwischenbilanz (falls vorhanden)
      "funnel.taxReturnLatestJur", // Aktuellste Steuererklärung (inkl. Schulden-, Wertschriten, Liegenschatsverzeichnis)
      "funnel.ownFundsProofJur", // Aufstellung und Nachweis der Eigenmittel
      "funnel.taxReturnLatest", // Aktuellste Steuererklärung (inkl. Schulden-, Wertschriften, Liegenschaftsverzeichnis)
    ],
  },

  // NEUBAU documents for Juristische Person (only if it's Kauf + Neubau, NOT for Ablösung)
  ...(isKauf && isNeubau && !isAblösung ? [{
    title: t("funnel.docSectionNeubau" as any),
    items: [
      "funnel.salesDocPhotos", // Verkaufsdokumentation (inkl. Fotos)
      "funnel.constructionPlansNetArea", // Bau-/Grundrisspläne
      "funnel.landRegistryIfAvailable", // Aktueller Grundbuchauszug falls vorhanden
      "funnel.purchaseOrRenovationContract", // Kaufvertrag (Entwurf/original) oder/und Renovationsvertrag
      "funnel.buildingInsuranceIfAvailable", // Aktuelle Gebäudeversicherungspolice (falls bereits vorhanden)
    ],
  }] : []),

  // BESTEHENDE IMMOBILIE documents for Juristische Person (only if it's Kauf + Bestehende Immobilie, NOT for Ablösung)
  ...(isKauf && isBestand && !isAblösung ? [{
    title: t("funnel.docSectionExistingProperty" as any),
    items: [
      "funnel.constructionDescriptionPhotos", // Baubeschrieb (inkl. Foto des Innen- und Aussenbereichs)
      "funnel.constructionPlansNetArea", // Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Dachform, Bodenbeläge, Baubeschrieb
      "funnel.landRegistryNotOlder6Months", // Aktueller Grundbuchauszug (nicht älter als 6 Monate)
      "funnel.oldSalesDocuments", // Alte Verkaufdokumente (falls vorhanden)
    ],
  }] : []),

  // ABLÖSUNG documents for Juristische Person
  ...(isAblösung ? [{
    title: t("funnel.docSectionAbloesung" as any),
    items: [
      "funnel.constructionDescriptionPhotos", // Baubeschrieb (inkl. Foto des Innen- und Aussenbereichs)
      "funnel.constructionPlansNetArea", // Bau-/Grundrisspläne
      "funnel.landRegistryNotOlder6Months", // Aktueller Grundbuchauszug (nicht älter als 6 Monate)
      "funnel.currentMortgageContract", // Aktueller Hypothekenvertrag (bei Ablösung der Hypothek)
    ],
  }] : []),

  // STOCKWERKEIGENTUM for Juristische Person
  ...(isStockwerkeigentum ? [{
    title: t("funnel.docSectionStockwerkeigentum" as any),
    items: [
      "funnel.condominiumActValue", // Stockwerkeigentum-Begründungsakt mit Wertquotenaufteilung
      "funnel.usageRegulationsSTWE", // Nutzungs- und Verwaltungsreglement der STWE-Gemeinschaft
      "funnel.renovationFundInfoCondominium", // Bei Stockwerkeigentum: Angaben über den Erneuerungsfonds
    ],
  }] : []),

  // ANDERE EIGENMITTEL for Juristische Person
  ...(hasAndereEigenmittel ? [{
    title: t("funnel.otherOwnFunds" as any),
    items: [
      "funnel.giftContract", // Schenkungsvertrag
      "funnel.loanContractGift", // Darlehensvertag
      "funnel.inheritanceContract", // Erbschafttsvertrag
    ],
  }] : []),

  // BAUPROJEKT / RENOVATION for Juristische Person
  ...((isBauprojekt || isRenovation) ? [{
    title: t("funnel.docSectionBauprojektRenovation" as any),
    items: [
      "funnel.buildingPermitDoc2", // Baubewilligung
      "funnel.projectPlanCostEstimate", // Projektplan, Baubeschrieb und Bauhandwerkerverzeichnis (inkl. Kostenvoranschlag und Kubatur)
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
      "funnel.passportIDAllBorrowers", // Pass, Identitätskarte, Aufenthaltsbewilligung (aller Kreditnehmer)
      "funnel.ownFundsProofOfficial", // Aktuelle Aufstellung und Nachweis der Eigenmittel (PDF)
      "funnel.taxReturnLatest", // Aktuellste Steuererklärung
    ],
  },

  // Conditional: Show only if Angestellt
  ...(hasAngestellt ? [{
    title: t("funnel.forEmployed" as any),
    items: [
      "funnel.salaryStatementBonus", // Aktueller Lohnausweis (inkl. Nachweis Bonuszahlungen der letzten 3 Jahre)
      "funnel.pensionFund3rdPillarBuyback", // Pensionskassenausweis und Rückkaufswerte von der 3. Säule
    ],
  }] : []),

  // Conditional: Show only if Selbständig
  ...(hasSelbständig ? [{
    title: t("funnel.forSelfEmployed" as any),
    items: [
      "funnel.balanceSheetAudit3Years", // Bilanz und Erfolgsrechnung (inkl. Revisionsbericht) der letzten 3 Jahre
      "funnel.pensionFund3rdPillarBuyback", // Pensionskassenausweis und Rückkaufswerte von der 3. Säule
    ],
  }] : []),

  // Conditional: Show only if Rentner
  ...(hasRentner ? [{
    title: t("funnel.forRetirees" as any),
    items: [
      "funnel.pensionCertificatePKAHV", // Rentenbeschenigung (PK, AHV)
    ],
  }] : []),

  // Conditional: Show only if age 50+ years
  ...(hasAge50Plus ? [{
    title: t("funnel.from50Years" as any), // "50 Jahre Alter der Kreditnehmer"
    items: [
      "funnel.pensionForecastAHV", // Rentenvorausberechnung (AHV)
      "funnel.pensionFund3rdPillarBuyback", // Pensionskassenausweis und Rückkaufswerte von der 3. Säule
    ],
  }] : []),

  // NEUBAU documents for Natürliche Person (only show if it's Kauf + Neubau, NOT for Ablösung)
  ...(isKauf && isNeubau && !isAblösung ? [{
    title: t("funnel.docSectionNeubau" as any),
    items: [
      "funnel.salesDocPhotos", // Verkaufsdokumentation (inkl. Fotos des Innen- und Aussenbereichs)
      "funnel.constructionPlansNetArea", // Bau-/Grundrisspläne inkl. Nettowohnfläche
      "funnel.landRegistryIfAvailable", // Aktueller Grundbuchauszug falls vorhanden
      "funnel.purchaseContractDraft", // Kaufvertrag (Entwurf/original)
      "funnel.buildingInsuranceIfAvailable", // Aktuelle Gebäudeversicherungspolice
    ],
  }] : []),

  // BESTEHENDE IMMOBILIE documents for Natürliche Person (only show if it's Kauf + Bestehende Immobilie, NOT for Ablösung)
  ...(isKauf && isBestand && !isAblösung ? [{
    title: t("funnel.docSectionExistingProperty" as any),
    items: [
      "funnel.constructionDescriptionPhotos", // Baubeschrieb (inkl. Foto des Innen- und Aussenbereichs)
      "funnel.constructionPlansNetArea", // Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Dachform, Bodenbeläge, Baubeschrieb
      "funnel.landRegistryNotOlder6Months", // Aktueller Grundbuchauszug (nicht älter als 6 Monate)
      "funnel.oldSalesDocuments", // Alte Verkaufdokumente (falls vorhanden)
    ],
  }] : []),

  // Show reservation documents if reserviert = "ja" (for any case)
  ...(isReserviert ? [{
    title: t("funnel.reservation" as any),
    items: [
      "funnel.reservationContractDoc", // Reservationsvertrag
      "funnel.bankStatementReservation", // Bankauszug Reservationszahlung
    ],
  }] : []),

  // Conditional: Show only if Renditeobjekt (investment property)
  ...(isRenditeobjekt ? [{
    title: t("funnel.docSectionRenditeobjekt" as any),
    items: [
      "funnel.rentalOverviewCurrent", // Aktueller Mieterspiegel inkl. Mietzinsaufstellung
    ],
  }] : []),

  // ABLÖSUNG documents for Natürliche Person (only if Ablösung selected)
  ...(isAblösung ? [{
    title: t("funnel.docSectionAbloesung" as any),
    items: [
      "funnel.constructionDescriptionPhotos", // Baubeschrieb (inkl. Foto des Innen- und Aussenbereichs)
      "funnel.constructionPlansNetArea", // Bau-/Grundrisspläne
      "funnel.landRegistryNotOlder6Months", // Aktueller Grundbuchauszug (nicht älter als 6 Monate)
      "funnel.currentMortgageContract", // Aktueller Hypothekenvertrag (bei Ablösung der Hypothek)
    ],
  }] : []),

  // STOCKWERKEIGENTUM
  ...(isStockwerkeigentum ? [{
    title: t("funnel.docSectionStockwerkeigentum" as any),
    items: [
      "funnel.condominiumActValue", // Stockwerkeigentum-Begründungsakt mit Wertquotenaufteilung
      "funnel.usageRegulationsSTWE", // Nutzungs- und Verwaltungsreglement der STWE-Gemeinschaft
      "funnel.renovationFundInfoCondominium", // Bei Stockwerkeigentum: Angaben über den Erneuerungsfonds
    ],
  }] : []),

  // ANDERE EIGENMITTEL (if any other funding sources exist)
  ...(hasAndereEigenmittel ? [{
    title: t("funnel.otherOwnFunds" as any),
    items: [
      "funnel.giftContract", // Schenkungsvertrag
      "funnel.loanContractGift", // Darlehensvertrag
      "funnel.inheritanceConfirmation", // Erbschaftbestätigung
    ],
  }] : []),

  // BAUPROJEKT / RENOVATION
  ...((isBauprojekt || isRenovation) ? [{
    title: t("funnel.docSectionBauprojektRenovation" as any),
    items: [
      "funnel.buildingPermitDoc2", // Baubewilligung
      "funnel.projectPlanCostEstimate", // Projektplan, Baubeschrieb und Bauhandwerkerverzeichnis (inkl. Kostenvoranschlag und Kubatur)
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
      docType: null, // loose upload — counts as an extra, not as a required document
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
      docType: null, // loose upload — counts as an extra, not as a required document
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

// Upload all files to SharePoint when Weiter button is clicked.
// Throws on the first failure so the caller can show one clean error and
// keep the popup in a consistent state.
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

    if (uploadRes?.error || !uploadRes?.success) {
      console.error("❌ Upload failed for", doc.name, ":", uploadRes?.error);
      throw new Error(`Upload failed for ${doc.name}: ${uploadRes?.error || "unknown"}`);
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


  // Attach real files to a specific document type. This replaces the old
  // toggleDocument(), which only recorded a tick with `file: null` — so a customer could
  // green-check the whole list having uploaded nothing, and no upload was ever associated
  // with the document it was meant to satisfy.
  const handleDocTypeUpload = (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const added = Array.from(files).map((file) => ({
      id: uuidv4(),
      name: file.name,
      size: file.size,
      file,
      docType,
      sharepointUrl: null,
      uploaded: false,
    }));

    // Re-picking for the same document replaces what was there, so the tile always
    // reflects the current selection rather than accumulating stale entries.
    setDocs((prev: any[]) => [
      ...prev.filter((d: any) => !(d.docType === docType && !d.uploaded)),
      ...added,
    ]);
    e.target.value = "";
  };

  const performSubmit = async () => {
    setShowPopup(true);
    setSubmitDone(false);
    try {
      await uploadAllFilesToSharePoint();
      // Completeness is decided here because only the client knows which document
      // sections were actually rendered for this case type. The server re-checks nothing;
      // it just records the verdict and picks the confirmation mail.
      const visibleDocKeys = selectedDocuments.flatMap((sec: any) => sec.items);
      const providedDocKeys = docs
        .filter((d: any) => d.file && d.docType)
        .map((d: any) => d.docType);
      const completeness = computeDocumentCompleteness(visibleDocKeys, providedDocKeys);
      console.log("📋 Document completeness:", completeness);

      const payload = {
        project,
        property,
        financing,
        email,
        borrowers,
        docs,
        documentCompleteness: completeness,
        korrespondenzsprache: korrespondenzspracheValue,
        stage: "Needs Analysis"
      };
      console.log("Payload to saveStep:", payload);
      await saveStep(payload);

      // Real work succeeded — let the popup animate to 100% and fire onComplete.
      setSubmitDone(true);

      // Safety-net redirect: if the popup was unmounted (e.g. submitFinal
      // called setStep(7)) before its onComplete could fire, force the
      // browser to the thank-you page anyway so the user always lands
      // on a final URL instead of a half-rendered in-page state.
      const lang =
        (typeof window !== "undefined" && window.location.pathname.split("/")[1]) || "de";
      const thankYouPaths: Record<string, string> = {
        de: "/de/danke",
        fr: "/fr/merci",
        it: "/it/grazie",
        en: "/en/thank-you"
      };
      const redirectPath = thankYouPaths[lang] || "/de/danke";
      setTimeout(() => {
        if (typeof window !== "undefined" && !window.location.pathname.startsWith(redirectPath)) {
          window.location.href = redirectPath;
        }
      }, 1500);
    } catch (e) {
      console.error("❌ Submission failed:", e);
      setShowPopup(false);
      setSubmitDone(false);
      alert(t("funnel.uploadError" as any) + "\n\n" + (e as Error)?.message);
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

      {/* AUSKUNFTSERMÄCHTIGUNG — Download in 4 languages, sign & upload */}
      <div className="mb-10 md:mb-14 bg-[#FFF8E1] border-[1.5px] border-[#F9A825] rounded-lg py-4 px-5">
        <div className="flex items-start gap-3 md:gap-4 mb-4 md:mb-5">
          <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#F9A825] flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-white font-bold text-base md:text-lg leading-none">!</span>
          </div>
          <div className="flex-1">
            <h3 className="text-[16px] sm:text-[18px] md:text-[20px] font-semibold text-[#132219] leading-tight">
              {t("funnel.auskunftsermaechtigungTitle" as any)}
            </h3>
            <p className="text-[13px] sm:text-[14px] md:text-[15px] text-[#132219]/80 mt-1.5 leading-relaxed">
              {t("funnel.auskunftsermaechtigungDescription" as any)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
          {[
            {
              flag: "/images/HYPOTEQ_documents_flag_german.png",
              label: t("documents.section2Doc1"),
              file: "/documents/Auskunftsermaechtigung-1.pdf",
            },
            {
              flag: "/images/HYPOTEQ_documents_flag_french.png",
              label: t("documents.section2Doc2"),
              file: "/documents/20250711_HYPOTEQ-Pouvoir-dinformation-1-1.pdf",
            },
            {
              flag: "/images/HYPOTEQ_documents_flag_italian.png",
              label: t("documents.section2Doc3"),
              file: "/documents/20250711_HYPOTEQ-Procura-per-informazioni-1.pdf",
            },
            {
              flag: "/images/HYPOTEQ_documents_flag_english.png",
              label: t("documents.section2Doc4"),
              file: "/documents/20250711_HYPOTEQ-Authorisation-for-information-1.pdf",
            },
          ].map((doc, i) => (
            <a
              key={i}
              href={doc.file}
              target="_blank"
              rel="noopener noreferrer"
              className="flex justify-between items-center bg-white border border-[#E0D6CC] rounded-full px-4 sm:px-5 py-2.5 sm:py-3 hover:bg-[#FFF3E0] transition-colors"
            >
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <img
                  src={doc.flag}
                  alt="language flag"
                  className="w-5 h-5 flex-shrink-0"
                />
                <p className="text-[13px] sm:text-[14px] font-medium text-[#132219] leading-tight truncate">
                  {doc.label}
                </p>
              </div>
              <span className="ml-3 flex-shrink-0 bg-[#F9A825] text-white text-[10px] sm:text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded">
                PDF
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* LEGEND — explains the star and states there is no hard block, per spec:
          the customer may always submit, even with required documents missing. */}
      <div className="mb-6 md:mb-8 flex items-start gap-2 text-[13px] md:text-[14px] text-[#132219]/70 leading-relaxed">
        <span className="text-[#C0392B] font-semibold leading-none mt-[2px]">*</span>
        <p>{t("funnel.docRequiredHint" as any)}</p>
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
                // `doc` is an i18n key, not a label — a tile counts as satisfied only when
                // a real file is bound to it. Ticking without uploading is what used to make
                // a dossier look complete when nothing had been sent.
                const filesForDoc = docs.filter((d: any) => d.docType === doc && d.file);
                const saved = filesForDoc.length > 0;
                const required = isRequiredDoc(doc);

                return (
                  <label
                    key={idx}
                    className={`
                      flex items-center justify-between gap-3
                      px-4 sm:px-5 md:px-6 py-3 sm:py-3.5 md:py-4 cursor-pointer rounded-xl md:rounded-2xl
                      shadow-sm border transition-all

                      ${
                        saved
                          ? "bg-[#EAF7D8] border-[#CAEBAA]"
                          : required
                            ? "bg-[#FFFDF5] border-[#F0D48A] hover:bg-[#FFF8E6]"
                            : "bg-[#FAFAFA] border-[#E4E4E4] hover:bg-[#F2F2F2]"
                      }
                    `}
                  >
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleDocTypeUpload(e, doc)}
                    />
                    <span className="text-[13px] sm:text-[14px] md:text-[15px] text-[#132219] leading-tight break-words">
                      {t(doc as any)}
                      {required ? (
                        <span className="text-[#C0392B] font-semibold"> *</span>
                      ) : (
                        // Spec: optional fields must be marked as such, not merely left
                        // unstarred — an unmarked tile reads as "we forgot the star".
                        <span className="text-[#132219]/45 font-normal"> ({t("funnel.docOptionalBadge" as any)})</span>
                      )}
                      {saved && (
                        <span className="block text-[11px] sm:text-[12px] text-[#132219]/60 mt-0.5">
                          {filesForDoc.map((f: any) => f.name).join(", ")}
                        </span>
                      )}
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
                  </label>
                );
              })}
            </div>

          </div>
        ))}

      </div>

      {/* UPLOAD CARD — catch-all for anything that fits none of the fields above.
          Deliberately placed AFTER the sections and visually quieter than them: a file
          dropped here carries docType: null, so it satisfies no required document and
          does not count towards completeness. While this card sat on top it was the
          obvious place to drop a Lohnausweis, which then still produced a "fehlende
          Unterlagen" mail naming the document the customer had just sent. */}
      <div className="mt-10 md:mt-14 mb-6 md:mb-8">
        <h3 className="text-[18px] sm:text-[20px] md:text-[22px] font-semibold text-[#132219] tracking-tight">
          {t("funnel.additionalDocumentsTitle" as any)}
        </h3>
        <p className="mt-1.5 text-[13px] md:text-[14px] text-[#132219]/60 leading-relaxed">
          {t("funnel.additionalDocumentsHint" as any)}
        </p>
      </div>
<div
  className={`
    bg-[#FAFAFA] rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-10
    border-2 border-dashed transition-all duration-200
    flex flex-col items-center gap-3 md:gap-4 mb-8 md:mb-12
    ${isDragging ? 'border-[#132219] bg-[#CAF47633]' : 'border-[#E0E0E0]'}
  `}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>


    <div className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center">
  <img
    src="/images/HYPOTEQ_funnel_upload_icon.svg"
    alt="Upload"
    className="w-7 h-7 md:w-8 md:h-8 opacity-70"
  />
</div>


        <h2 className="text-[15px] sm:text-[16px] md:text-[17px] font-medium text-[#132219] px-4 text-center">
          {t("funnel.selectFileOrDrop" as any)}
        </h2>

        <p className="text-gray-500 text-[13px] md:text-[14px] px-4 text-center">
          {t("funnel.fileFormatsSize" as any)}
        </p>

        <label className="cursor-pointer mt-2">
<input
  type="file"
  className="hidden"
  multiple
  onChange={handleUpload}
/>
          <div className="bg-[#132219] text-white px-6 md:px-7 py-2 md:py-2.5 rounded-full text-[13px] md:text-sm tracking-wide hover:bg-black transition-colors">
            {t("funnel.browseFiles" as any)}
          </div>

        </label>

      </div>

      {/* UPLOADED FILES PREVIEW — loose uploads only. Files bound to a document type are
          already listed on their own tile, so listing them again here made the same file
          look like two separate uploads. */}
      {docs?.some((d: any) => d.file && !d.docType) && (
        <div className="mb-8 md:mb-12">
          <h3 className="text-lg font-semibold text-[#132219] mb-4">
            {t("funnel.additionalDocumentsTitle" as any)} ({docs.filter((d: any) => d.file && !d.docType).length})
          </h3>
          <div className="space-y-2">
            {docs.filter((d: any) => d.file && !d.docType).map((doc: any) => (
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

      {/* UPLOADING INDICATOR (Popup only) */}
      <HypoteqLoadingPopup
        isOpen={showPopup}
        isComplete={submitDone}
        onComplete={(redirectPath: string) => {
          window.location.href = redirectPath;
        }}
      />

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
            if (showPopup) return;
            await performSubmit();
          }}
          disabled={showPopup}
          className={`px-8 md:px-10 py-3 bg-[#CAF476] rounded-full font-medium text-[#132219] shadow hover:bg-[#BCDF6A] transition-colors text-sm md:text-base order-1 sm:order-2 ${showPopup ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {t("funnel.continueButton" as any)}
        </button>
      </div>
    </div>
  </div>
);

}

export default DocumentsStep;
