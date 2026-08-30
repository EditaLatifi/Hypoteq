"use client";
import { v4 as uuidv4 } from "uuid";
import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { computeDocumentCompleteness } from "@/components/funnelDocumentCatalog";
import { documentSectionsFor } from "@/components/funnelDocumentSections";
import { FALLBACK_NAVIGATION_MS, thankYouPathFor } from "@/components/funnelThankYou";

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
  // Track upload status per document: 'idle' | 'uploading' | 'uploaded' | 'failed'
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
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

// What the AI made of each picked file, keyed by the doc's local id.
//
// Analysis runs when the customer selects a file, not at submit: section 31 wants a result
// while they are still looking at the page, and holding it until submit would mean the
// verdict arrives on a screen they are already leaving. The result is carried into the
// upload so the model is called once per document.
const [analyses, setAnalyses] = useState<Record<string, any>>({});
const [analysing, setAnalysing] = useState<Record<string, boolean>>({});

// Whether this step is still on screen, read by the fallback navigation in performSubmit:
// this step going away means the funnel put up a screen of its own and nothing here should
// navigate on top of it.
//
// Read when the timer fires rather than cancelled on unmount, deliberately. The timer is
// armed after `await saveStep(...)`, and that await is when the parent may swap the step
// out — so whether the unmount lands before or after the timer is set is a race, and a
// cleanup that runs first would clear nothing. Reading at fire time does not care.
const isMountedRef = useRef(true);
useEffect(
  () => () => {
    isMountedRef.current = false;
  },
  []
);

const isNeubau = property?.artImmobilie === "neubau";
const isBestand = property?.artImmobilie === "bestehend";
const isAblösung = project?.projektArt === "abloesung";
const isKauf = project?.projektArt === "kauf";
const isWohnung = property?.artLiegenschaft === "Wohnung";
// Strictly Stockwerkeigentum, as the spec defines it. This used to include "Wohnung",
// which asked every flat buyer for a Begründungsakt and a Verwaltungsreglement they may
// have no share in.
const isStockwerkeigentum = property?.artLiegenschaft === "Stockwerkeigentum";
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
  folderId: string | null = null,
  // Which requirement this file answers. Sent to finalize so the stored row says what the
  // file IS, not merely that a file arrived — the Dok_*__c booleans cannot express it (ten
  // of them cover forty documents) and nothing else records it.
  docType: string | null = null,
  // Result of the analysis run when the file was picked; stored with the upload row so the
  // audit trail (section 36) is written in the same request that creates the record.
  analysis: any = null
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
        originalFileName: file.name,
        email,
        inquiryId,
        // The Inquiry does not exist yet on a first submission, so the row is held against
        // this id and claimed once /api/inquiry creates the Inquiry under it.
        submissionId: inquiryId,
        docType,
        analysis,
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
// Which documents this case is asked for.
// The structure itself lives in components/funnelDocumentSections.ts so it can be tested
// across every combination of case type without rendering this component.
// ===================================
const isJur = (borrowers ?? []).some((b: any) => b.type === "jur");

const documentFlags = {
  isJur,
  isKauf,
  isNeubau,
  isBestand,
  isAbloesung: isAblösung,
  isStockwerkeigentum,
  isBauprojekt,
  isRenovation,
  isReserviert,
  isRenditeobjekt,
  // Per the spec: "Andere Eigentümer" keys off the number of borrowers, not off whether
  // gifted funds were declared.
  hasMultipleOwners: Boolean(isMultipleEigentuemer),
  hasAngestellt,
  hasSelbstaendig: hasSelbständig,
  hasRentner,
  hasAge50Plus,
};

// Titles are i18n keys in the module; resolve them for display here.
const buildSections = () =>
  documentSectionsFor(documentFlags).map((s) => ({ title: t(s.titleKey as any), items: s.items }));




// State for selectedDocuments to force rerender on relevant changes
const [selectedDocuments, setSelectedDocuments] = useState(buildSections);

useEffect(() => {
  setSelectedDocuments(buildSections());
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
    void analyseFile(newDoc.id, file, null);
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
    void analyseFile(newDoc.id, file, null);
  }

  console.log("✅ Files added to local list. Upload will happen when Weiter is clicked.");
};

const removeUploadedFile = (docId: string) => {
  setDocs((prev: any[]) => prev.filter((d: any) => d.id !== docId));
};

// Upload all files to SharePoint when Weiter button is clicked.
// Throws on the first failure so the caller can show one clean error and
// keep the popup in a consistent state.
//
// Returns the SharePoint folder the files went into. The caller needs the value
// immediately to put it in the submit payload, and `currentFolderId` is React state —
// it is still the pre-update value on this tick, so reading the state here would send
// null for every first-time submission.
const uploadAllFilesToSharePoint = async (): Promise<string | null> => {
  const filesToUpload = docs.filter((doc: any) => doc.file && !doc.uploaded);

  if (filesToUpload.length === 0) {
    console.log("ℹ️ No files to upload");
    return currentFolderId;
  }

  console.log("📤 Uploading", filesToUpload.length, "file(s) to SharePoint");
  let uploadFolderId = currentFolderId;

  for (const doc of filesToUpload) {
    console.log("⬆️ Uploading file:", doc.name, "with folder ID:", uploadFolderId);

    // Set status to uploading
    setUploadStatus((prev) => ({ ...prev, [doc.id]: 'uploading' }));

    const uploadRes = await uploadDocToSharepoint(
      doc.file,
      submissionId,
      email ?? "no-email",
      uploadFolderId,
      doc.docType ?? null,
      analyses[doc.id] ?? null
    );

    console.log("📦 Upload response for", doc.name, ":", uploadRes);

    if (uploadRes?.error || !uploadRes?.success) {
      console.error("❌ Upload failed for", doc.name, ":", uploadRes?.error);
      // Set status to failed
      setUploadStatus((prev) => ({ ...prev, [doc.id]: 'failed' }));
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

    // Set status to uploaded
    setUploadStatus((prev) => ({ ...prev, [doc.id]: 'uploaded' }));
  }

  console.log("✅ All files uploaded successfully");
  return uploadFolderId;
};


  // Send a picked file for classification and extraction.
  //
  // Failure is deliberately quiet: section 38 requires an AI outage to cost classification
  // and nothing else, so the file stays attached and the customer carries on exactly as
  // they did before this feature existed.
  const analyseFile = async (docId: string, file: File, expectedDocKey: string | null) => {
    setAnalysing((prev) => ({ ...prev, [docId]: true }));
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("visibleDocKeys", JSON.stringify(selectedDocuments.flatMap((s: any) => s.items)));
      if (expectedDocKey) form.append("expectedDocKey", expectedDocKey);
      form.append(
        "borrowers",
        JSON.stringify(
          (borrowers ?? []).map((b: any, i: number) => ({
            id: b.id || `borrower_${String(i + 1).padStart(2, "0")}`,
            name: [b.firstName || b.vorname, b.lastName || b.name].filter(Boolean).join(" "),
          }))
        )
      );

      const res = await fetch("/api/document-intelligence/analyse", { method: "POST", body: form });
      const json = await res.json();
      const analysis = json?.analysis ?? null;
      if (!analysis) return;

      setAnalyses((prev) => ({ ...prev, [docId]: analysis }));

      // Section 9: a file dropped in without picking a tile gets attached to whatever it
      // turned out to be. Only when the requirement is one this case was actually shown —
      // otherwise it would satisfy something the customer was never asked for.
      if (!expectedDocKey && analysis.funnelDocKey) {
        const visible = new Set(selectedDocuments.flatMap((sec: any) => sec.items));
        if (visible.has(analysis.funnelDocKey)) {
          setDocs((prev: any[]) =>
            prev.map((d: any) => (d.id === docId ? { ...d, docType: analysis.funnelDocKey } : d))
          );
        }
      }
    } catch {
      /* section 38: analysis is optional, the upload is not */
    } finally {
      setAnalysing((prev) => ({ ...prev, [docId]: false }));
    }
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

    for (const d of added) void analyseFile(d.id, d.file, docType);
  };

  const performSubmit = async () => {
    setShowPopup(true);
    setSubmitDone(false);
    // Reset upload status for a fresh attempt
    setUploadStatus({});
    try {
      const uploadedFolderId = await uploadAllFilesToSharePoint();
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
        // The id every file just uploaded was filed under. The Inquiry is created with this
        // as its own id, which is what lets those files be claimed — and it is the same id
        // the SharePoint folder name carries, so a Case can be traced to its folder.
        submissionId,
        // Where this submission's files went. Persisted so documents supplied later
        // through the Nachreich link land in the same folder — the folder name embeds
        // the upload date, so it cannot be re-derived on a later day.
        sharepointFolderId: uploadedFolderId,
        korrespondenzsprache: korrespondenzspracheValue,
        stage: "Needs Analysis"
      };
      console.log("Payload to saveStep:", payload);
      await saveStep(payload);

      // Real work succeeded — let the popup animate to 100% and fire onComplete.
      setSubmitDone(true);

      // The thank-you page is reached by the progress popup: it animates to 100% and then
      // navigates (see HypoteqLoadingPopup). This timer only rescues a customer the popup
      // left stranded on the upload form.
      //
      // 20s, not 1.5s. The popup needs roughly eight seconds to reach 100% — it is capped at
      // 90% until the upload actually finishes — so a 1.5s timer fired every time and cut
      // the animation off mid-way. Anything shorter than the popup's own run races it.
      //
      // It also skips if this step has gone away, which would mean the funnel advanced to a
      // screen of its own and this navigation is no longer wanted.
      const redirectPath = thankYouPathFor(
        typeof window !== "undefined" ? window.location.pathname : null
      );
      setTimeout(() => {
        // Still on the upload form long after a successful submit: the popup never took us.
        if (!isMountedRef.current) return;
        if (typeof window !== "undefined" && !window.location.pathname.startsWith(redirectPath)) {
          console.warn("[Funnel] Popup did not navigate; falling back to", redirectPath);
          window.location.href = redirectPath;
        }
      }, FALLBACK_NAVIGATION_MS);
    } catch (e) {
      console.error("❌ Submission failed:", e);
      setShowPopup(false);
      setSubmitDone(false);
      // Clear uploading status on error to allow retry
      setUploadStatus((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((key) => {
          if (updated[key] === 'uploading') {
            delete updated[key];
          }
        });
        return updated;
      });
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

      {/* LEGEND — states that submitting is possible without every document. Per spec there
          is deliberately no hard block, and no document is flagged in the UI. */}
      <div className="mb-6 md:mb-8 text-[13px] md:text-[14px] text-[#132219]/70 leading-relaxed">
        <p>{t("funnel.docRequiredHint" as any)}</p>
      </div>
      {/* `required` is no longer read per tile — every document is required — but the
          import stays in use for the completeness verdict below. */}

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

                // Get upload status for this document type
                const docUploadStatus = filesForDoc.length > 0 ? uploadStatus[filesForDoc[0]?.id] : undefined;
                const isUploading = docUploadStatus === 'uploading';
                const isUploadedSuccessfully = docUploadStatus === 'uploaded';
                const isUploadFailed = docUploadStatus === 'failed';

                return (
                  <label
                    key={idx}
                    className={`
                      flex items-center justify-between gap-3
                      px-4 sm:px-5 md:px-6 py-3 sm:py-3.5 md:py-4 cursor-pointer rounded-xl md:rounded-2xl
                      shadow-sm border transition-all

                      ${
                        isUploadedSuccessfully
                          ? "bg-[#EAF7D8] border-[#CAEBAA]"
                          : isUploadFailed
                            ? "bg-[#FADDD1] border-[#F4A49C]"
                            : isUploading
                              ? "bg-[#F3F8FF] border-[#C5E4FF]"
                              : saved
                                ? "bg-[#EAF7D8] border-[#CAEBAA]"
                                : // One neutral resting style for every document: the tile
                                  // no longer signals required vs optional, so a two-tone
                                  // palette would reintroduce the distinction visually.
                                  "bg-[#FAFAFA] border-[#E4E4E4] hover:bg-[#F2F2F2]"
                      }
                    `}
                  >
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleDocTypeUpload(e, doc)}
                      disabled={isUploading}
                    />
                    <span className="text-[13px] sm:text-[14px] md:text-[15px] text-[#132219] leading-tight break-words">
                      {t(doc as any)}
                      {/* What the analysis made of this file (sections 31 and 34): one line
                          when all is well, the problem itself when it is not. The customer
                          never sees a confidence number — section 15 allows three states and
                          a percentage would only invite arguing with it. */}
                      {filesForDoc.map((f: any) => {
                        if (analysing[f.id]) {
                          return (
                            <span key={f.id} className="block text-[11px] sm:text-[12px] text-[#132219]/60 mt-0.5">
                              ◌ {t("funnel.docAnalysing" as any)}
                            </span>
                          );
                        }
                        const a = analyses[f.id];
                        if (!a) return null;
                        if (a.status === "rejected" && a.mismatchedRequirement) {
                          return (
                            <span key={f.id} className="block text-[11px] sm:text-[12px] text-[#B3261E] mt-0.5">
                              ⚠ {t("funnel.docWrongDocument" as any)}
                            </span>
                          );
                        }
                        if (a.status === "outdated" && a.freshness) {
                          return (
                            <span key={f.id} className="block text-[11px] sm:text-[12px] text-[#8A5A00] mt-0.5">
                              ⚠ {t("funnel.docOutdated" as any)}
                            </span>
                          );
                        }
                        if (a.status === "unsupported" || a.status === "failed") {
                          // Section 21 and 38: the file is kept and still counts; only the
                          // automatic recognition is missing.
                          return (
                            <span key={f.id} className="block text-[11px] sm:text-[12px] text-[#132219]/60 mt-0.5">
                              {t("funnel.docNotRecognised" as any)}
                            </span>
                          );
                        }
                        const count = Object.keys(a.fields || {}).length;
                        return (
                          <span key={f.id} className="block text-[11px] sm:text-[12px] text-[#2E6B2E] mt-0.5">
                            ✓ {a.classification?.label}
                            {count > 0 ? ` — ${count} ${t("funnel.docFieldsRead" as any)}` : ""}
                            {a.status === "review_required" ? ` · ${t("funnel.docPleaseCheck" as any)}` : ""}
                          </span>
                        );
                      })}
                      {/* No required/optional marker at all, at HYPOTEQ's request: every
                          document is presented the same way. The distinction still exists
                          in the catalog and still drives the completeness check and the
                          "fehlende Unterlagen" mail — it is simply not shown. */}
                      {saved && (
                        <span className="block text-[11px] sm:text-[12px] text-[#132219]/60 mt-0.5">
                          {filesForDoc.map((f: any) => f.name).join(", ")}
                        </span>
                      )}
                    </span>

                    {/* STATUS INDICATOR */}
                    <div
                      className={`
                        w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0
                        border transition
                        ${
                          isUploadedSuccessfully
                            ? "bg-[#CAF476] border-[#132219]"
                            : isUploadFailed
                              ? "bg-[#FF6B6B] border-[#C92A2A]"
                              : isUploading
                                ? "bg-[#E3F2FD] border-[#90CAF9]"
                                : saved
                                  ? "bg-[#CAF476] border-[#132219]"
                                  : "bg-white border-gray-300"
                        }
                      `}
                    >
                      {isUploading && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-3 h-3 md:w-4 md:h-4 text-[#1976D2] animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                        </svg>
                      )}
                      {isUploadFailed && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-3 h-3 md:w-4 md:h-4 text-white"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                      )}
                      {isUploadedSuccessfully && (
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
                      {saved && !isUploading && !isUploadFailed && !isUploadedSuccessfully && (
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
                      {/* Nothing attached yet: an upload arrow, not an empty circle. The
                          bare circle read as a checkbox to tick — which is precisely the
                          self-declaration this step replaced — rather than as a target to
                          drop a file on. */}
                      {!saved && !isUploading && !isUploadFailed && !isUploadedSuccessfully && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-3.5 h-3.5 md:w-[17px] md:h-[17px] text-[#132219]/50"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
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
            {docs.filter((d: any) => d.file && !d.docType).map((doc: any) => {
              const status = uploadStatus[doc.id];
              const isUploading = status === 'uploading';
              const isUploadedSuccessfully = status === 'uploaded';
              const isUploadFailed = status === 'failed';

              return (
                <div
                  key={doc.id}
                  className={`
                    flex items-center justify-between rounded-xl px-4 py-3 shadow-sm border transition-all
                    ${
                      isUploadedSuccessfully
                        ? "bg-[#EAF7D8] border-[#CAEBAA]"
                        : isUploadFailed
                          ? "bg-[#FADDD1] border-[#F4A49C]"
                          : isUploading
                            ? "bg-[#F3F8FF] border-[#C5E4FF]"
                            : "bg-white border-gray-200"
                    }
                  `}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <svg className={`w-5 h-5 ${isUploadedSuccessfully ? 'text-[#132219]' : isUploadFailed ? 'text-[#C92A2A]' : 'text-[#132219]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#132219] truncate">{doc.name}</p>
                      <p className="text-xs text-gray-500">{(doc.size / 1024).toFixed(2)} KB</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isUploading && (
                      <svg
                        className="w-5 h-5 text-[#1976D2] animate-spin flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                      </svg>
                    )}
                    {isUploadedSuccessfully && (
                      <svg
                        className="w-5 h-5 text-green-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                    {isUploadFailed && (
                      <svg
                        className="w-5 h-5 text-red-600 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                      </svg>
                    )}
                    <button
                      onClick={() => removeUploadedFile(doc.id)}
                      className="ml-2 p-1 hover:bg-red-50 rounded-full transition-colors flex-shrink-0"
                      disabled={isUploading}
                    >
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
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
