"use client";
import { v4 as uuidv4 } from "uuid";
import { useFunnelStore } from "@/src/store/funnelStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { computeDocumentCompleteness } from "@/components/funnelDocumentCatalog";
import { documentSectionsFor } from "@/components/funnelDocumentSections";
import { FALLBACK_NAVIGATION_MS, thankYouPathFor } from "@/components/funnelThankYou";
import {
  DOCUMENT_TYPES,
  candidateTypesFor,
  docTypeById,
} from "@/components/documentIntelligence/documentTypes";
import {
  compareWithFunnel,
  funnelFactsFrom,
  mismatchesOnly,
  type Comparison,
  type HumanDecision,
} from "@/components/documentIntelligence/compare";

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
const { project, email, property, financing, setFinancing } = useFunnelStore();

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

// Set once the server says analysis is switched off on this deployment. A ref rather than
// state because several files are analysed at the same time and this has to be readable the
// instant the first answer lands, without waiting for a render.
//
// It cannot spare the files already in flight — those learn it from their own reply — but
// it stops every later upload from being sent to an endpoint that will refuse it. On a
// production deployment that is the difference between one wasted upload and one per
// document, which on a phone connection is the customer's data allowance.
const docAiOffRef = useRef(false);

// Which requirement rows are expanded, keyed by the file id inside them.
const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

// Section 35's internal view, opened with ?intern=1. Read after mount rather than during
// render: the server has no query string, and reading it inline would make the first client
// render disagree with the server's and blank the step with a hydration error.
const [internView, setInternView] = useState(false);
useEffect(() => {
  try {
    setInternView(new URLSearchParams(window.location.search).get("intern") === "1");
  } catch {
    /* no window, no internal view — the customer's screen is the safe default */
  }
}, []);

// Differences between a document and what the customer already told the funnel, and what
// they decided about each (sections 16 and 14). Decisions are kept per document so they can
// travel with the upload into the audit trail — acting on a correction without recording it
// would leave section 36 with only the machine's half of the story.
const [mismatches, setMismatches] = useState<Record<string, Comparison[]>>({});
const [decisions, setDecisions] = useState<Record<string, HumanDecision[]>>({});

// The document open in the detail view (section 13), and any values corrected there.
// Corrections are held apart from the analysis so the original extraction survives them —
// section 36 needs both, not the latest state of one field.
const [openDoc, setOpenDoc] = useState<any | null>(null);
const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

// Funnel values the customer replaced with what a document said.
//
// Kept here and sent up with the submit payload, not left to the store alone. The parent
// pushes its own copy of the financing form on the way out — `setFinancing` replaces the
// whole object, and that copy was frozen back on step 5 — so a value corrected here is
// overwritten moments before it is sent. The customer accepts CHF 142'300, Salesforce
// receives CHF 150'000, and the only trace is an audit row saying otherwise. Travelling
// with the payload makes the correction the last write instead of the first.
const [financingOverrides, setFinancingOverrides] = useState<Record<string, string>>({});

// One object URL per opened document, released when it closes.
//
// Built here rather than in the markup because createObjectURL in a render body mints a new
// URL on every keystroke in the editable fields — the old ones are never freed, and the PDF
// viewer reloads and jumps back to page one each time, so a customer correcting a value on
// page three loses their place with every character.
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
useEffect(() => {
  const file = openDoc?.doc?.file;
  if (!file) {
    setPreviewUrl(null);
    return;
  }
  const url = URL.createObjectURL(file);
  setPreviewUrl(url);
  return () => URL.revokeObjectURL(url);
}, [openDoc]);

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
      analyses[doc.id]
        ? {
            ...analyses[doc.id],
            humanReview: decisions[doc.id] ?? [],
            // Section 13 corrections, kept beside the extraction rather than overwriting it.
            humanEdits: edits[doc.id] ?? {},
          }
        : null
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
    if (docAiOffRef.current) return;
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

      // Switched off on this deployment, which is not the same as having tried and failed.
      // Nothing is recorded against the file: the "please tell us what this is" picker
      // belongs to a document the AI could not place, and showing it here would hand the
      // customer work to compensate for a feature that never ran. The step behaves exactly
      // as it did before this feature existed.
      if (json?.disabled) {
        docAiOffRef.current = true;
        return;
      }

      const analysis = json?.analysis ?? null;
      if (!analysis) return;

      setAnalyses((prev) => ({ ...prev, [docId]: analysis }));

      // Section 28: the comparison is ours, not the model's. Only genuine differences are
      // surfaced — a value the funnel never captured is not a discrepancy (section 34).
      const found = mismatchesOnly(
        compareWithFunnel(
          analysis,
          funnelFactsFrom({ financing, property, borrowers: borrowers ?? [] })
        )
      );
      if (found.length) setMismatches((prev) => ({ ...prev, [docId]: found }));

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

  // Section 21: the file could not be placed, so the customer says what it is. The document
  // is never dropped over this — an unrecognised upload still counts, it just carries no
  // extracted values.
  const assignTypeManually = (docId: string, typeId: string) => {
    const spec = DOCUMENT_TYPES.find((t) => t.id === typeId);
    const visible = new Set(selectedDocuments.flatMap((sec: any) => sec.items));
    const key = spec?.funnelKeys.find((k) => visible.has(k)) ?? null;
    if (key) {
      setDocs((prev: any[]) => prev.map((d: any) => (d.id === docId ? { ...d, docType: key } : d)));
    }
    setAnalyses((prev) => ({
      ...prev,
      [docId]: {
        ...(prev[docId] ?? { fields: {} }),
        classification: { type: typeId, label: spec?.label ?? typeId, confidence: 1 },
        funnelDocKey: key,
        // Confirmed by a person, so it is no longer awaiting one.
        status: "confirmed",
        classifiedBy: "human",
      },
    }));
  };

  // Record what the customer decided about a discrepancy, and apply it (sections 14, 16).
  //
  // The funnel value is only overwritten when the rule names a field to write into. Own
  // funds, for instance, is read off one document but entered across four separate funnel
  // inputs — there is nothing to write back to, so accepting the document's figure there is
  // recorded but changes no input rather than guessing how to split it.
  const decideMismatch = (docId: string, c: Comparison, choice: "took_document" | "kept_own") => {
    const finalValue = choice === "took_document" ? c.documentValue : c.funnelValue;

    if (choice === "took_document" && c.writesBackTo) {
      const field = c.writesBackTo.split(".")[1];
      const value = String(c.documentValue);
      // Applied now so the rest of the step reflects it, and recorded so the submit can
      // apply it again after the parent has pushed its own copy of the form.
      setFinancing({ ...(financing as any), [field]: value });
      setFinancingOverrides((prev) => ({ ...prev, [field]: value }));
    }

    setDecisions((prev) => ({
      ...prev,
      [docId]: [
        ...(prev[docId] ?? []).filter((d) => d.field !== c.field),
        {
          field: c.field,
          documentValue: c.documentValue,
          funnelValue: c.funnelValue,
          choice,
          finalValue,
          decidedAt: new Date().toISOString(),
        },
      ],
    }));

    // Answered questions leave the screen; section 34 wants the exception visible, not
    // permanent.
    setMismatches((prev) => ({
      ...prev,
      [docId]: (prev[docId] ?? []).filter((m) => m.field !== c.field),
    }));
  };

  /**
   * The state of one requirement, as the mockup's status table defines it.
   *
   * Derived from what the analysis already decided rather than tracked separately — a second
   * copy of "is this document all right" is a second thing to keep in step, and the two
   * would disagree the first time a rule changed. The order matters: a wrong document is a
   * problem at any confidence, and a file nobody could identify is not "low confidence".
   */
  const rowStatus = (filesForDoc: any[]) => {
    const S = {
      missing: { badge: "badgeMissing", glyph: "○", bg: "var(--paper-200)", fg: "var(--on-light-45)", border: "var(--paper-300)" },
      analysing: { badge: "badgeAnalysing", glyph: "◌", bg: "var(--lime-200)", fg: "var(--lime-800)", border: "var(--lime-300)" },
      ok: { badge: "badgeConfirmed", glyph: "✓", bg: "var(--success-100)", fg: "var(--success-500)", border: "var(--paper-300)" },
      review: { badge: "badgeCheck", glyph: "⚠", bg: "var(--warning-100)", fg: "var(--warning-500)", border: "var(--warning-500)" },
      outdated: { badge: "badgeOutdated", glyph: "⚠", bg: "var(--warning-100)", fg: "var(--warning-500)", border: "var(--warning-500)" },
      wrong: { badge: "badgeWrong", glyph: "!", bg: "var(--danger-100)", fg: "var(--danger-500)", border: "var(--danger-500)" },
      unknown: { badge: "badgeUnknown", glyph: "?", bg: "var(--info-100)", fg: "var(--info-500)", border: "var(--info-500)" },
    };

    if (!filesForDoc.length) return S.missing;
    if (filesForDoc.some((f: any) => analysing[f.id])) return S.analysing;

    const list = filesForDoc.map((f: any) => analyses[f.id]).filter(Boolean);
    if (list.some((a: any) => a.status === "rejected")) return S.wrong;
    if (list.some((a: any) => a.status === "outdated")) return S.outdated;
    if (list.some((a: any) => a.status === "unsupported" || a.status === "failed")) return S.unknown;
    if (filesForDoc.some((f: any) => (mismatches[f.id] ?? []).length > 0)) return S.review;
    if (list.some((a: any) => a.status === "review_required")) return S.review;
    return S.ok;
  };

  /**
   * What the analysis made of one file (sections 31 and 34): one line when all is well, the
   * problem itself when it is not. The customer never sees a confidence number — section 15
   * allows three states, and a percentage only invites arguing with it.
   *
   * Shared by the two places a file can appear, because a file can be in either and the
   * customer does not know the difference. It shows under the requirement it answers, and it
   * shows under "weitere Dokumente" for a file dropped in without choosing one — which is
   * the flow section 9 actually asks for, and the one where until now nothing was rendered
   * at all: no spinner while it ran, and for a document that could not be placed, no picker
   * and no message, ever. The feature was working and invisible.
   */
  const renderAnalysisNote = (f: any) => {
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
      // Section 21: the file is kept and still counts; the customer is asked what it is
      // rather than being told it was rejected.
      const options = candidateTypesFor(selectedDocuments.flatMap((sec: any) => sec.items));
      return (
        <span key={f.id} className="block mt-1">
          <span className="block text-[11px] sm:text-[12px] text-[#132219]/60">
            {t("funnel.docNotRecognised" as any)}
          </span>
          {options.length > 0 && (
            <span className="flex flex-wrap gap-1.5 mt-1.5">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    assignTypeManually(f.id, o.id);
                  }}
                  className="px-2.5 py-1 rounded-full text-[11px] border border-[#132219]/30 text-[#132219] hover:bg-[#F2F2F2]"
                >
                  {o.label}
                </button>
              ))}
            </span>
          )}
        </span>
      );
    }
    const count = Object.keys(a.fields || {}).length;
    return (
      <span key={f.id} className="block text-[11px] sm:text-[12px] text-[#2E6B2E] mt-0.5">
        ✓ {a.classification?.label}
        {count > 0 ? ` — ${count} ${t("funnel.docFieldsRead" as any)}` : ""}
        {a.status === "review_required" ? ` · ${t("funnel.docPleaseCheck" as any)}` : ""}
        {count > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setOpenDoc({ doc: f, analysis: a });
            }}
            className="ml-2 underline text-[#132219]/70"
          >
            {t("funnel.docShowDetails" as any)}
          </button>
        )}
      </span>
    );
  };

  /**
   * Section 24's question, asked only when it is a real question: the document was
   * recognised, this case has more than one borrower, and the model either could not say who
   * it belongs to or was not confident enough to be trusted with it.
   *
   * On a single-borrower case there is nothing to ask, and asking anyway would be the exact
   * busywork section 34 forbids.
   */
  const renderPersonQuestion = (f: any) => {
    const a = analyses[f.id];
    if (!a || a.classification?.type === "unknown") return null;
    if (a.person?.assignedBy === "human") return null;

    const choices = borrowerChoices();
    if (choices.length < 2) return null;
    if (a.person?.borrowerId && (a.person?.confidence ?? 0) >= 0.7) return null;

    return (
      <span
        key={`person-${f.id}`}
        className="block mt-2"
        style={{
          border: "1px solid var(--info-500)",
          background: "var(--info-100)",
          borderRadius: "var(--radius-md)",
          padding: "12px 14px",
        }}
        onClick={(e) => e.preventDefault()}
      >
        <span style={{ display: "block", fontSize: "var(--text-body-sm)", color: "var(--forest-800)" }}>
          {t("funnel.docWhichBorrower" as any)}
        </span>
        <span className="flex flex-wrap gap-2 mt-2">
          {choices.map((b: any) => (
            <button
              key={b.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                assignPerson(f.id, b.id, b.name);
              }}
              style={{
                borderRadius: "var(--radius-pill)",
                padding: "7px 14px",
                fontSize: "var(--text-caption)",
                fontWeight: "var(--weight-semibold)" as any,
                background: "#fff",
                border: "1px solid var(--paper-400)",
                color: "var(--forest-800)",
              }}
            >
              {b.name}
            </button>
          ))}
        </span>
      </span>
    );
  };

  /**
   * Section 16 and 34: the exception, and only the exception. A difference the customer has
   * answered disappears; one they have not is shown with both ways out and no default.
   */
  /**
   * Section 24: which borrower a document belongs to, when the model could not say.
   *
   * Asked rather than guessed. On a two-earner dossier the wrong answer files Anna's salary
   * certificate under Max, and the mistake surfaces at the lender rather than here — so an
   * unclear attribution becomes a question, which is what the section asks for.
   *
   * Recorded as a human decision alongside the value corrections, so the audit trail says a
   * person made this call and not the model.
   */
  const assignPerson = (docId: string, borrowerId: string, name: string) => {
    setAnalyses((prev) => ({
      ...prev,
      [docId]: {
        ...(prev[docId] ?? {}),
        person: { borrowerId, confidence: 1, assignedBy: "human" },
      },
    }));
    setDecisions((prev) => ({
      ...prev,
      [docId]: [
        ...(prev[docId] ?? []).filter((d) => d.field !== "person"),
        {
          field: "person",
          documentValue: analyses[docId]?.person?.borrowerId ?? null,
          funnelValue: null,
          choice: "edited",
          finalValue: name,
          decidedAt: new Date().toISOString(),
        },
      ],
    }));
  };

  /** The borrowers this case has, in the shape the person question needs. */
  const borrowerChoices = () =>
    (borrowers ?? [])
      .map((b: any, i: number) => ({
        id: b.id || `borrower_${String(i + 1).padStart(2, "0")}`,
        name: [b.firstName || b.vorname, b.lastName || b.name].filter(Boolean).join(" ").trim(),
      }))
      .filter((b: any) => b.name);

  /** The small pill used for a field's state. One definition so the confidence chip and the
   *  corrected chip cannot drift into looking like two different kinds of thing. */
  const chip = (bg: string, fg: string) => ({
    background: bg,
    color: fg,
    borderRadius: "var(--radius-pill)",
    padding: "2px 9px",
    fontSize: "var(--text-micro)",
    fontWeight: "var(--weight-semibold)" as any,
    whiteSpace: "nowrap" as const,
  });

  /** Swiss grouping: 142300 -> 142'300. A gap you have to count digits to read is a gap
   *  the customer skims past. */
  const fmtNumber = (v: any) =>
    typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("de-CH") : String(v);

  const renderMismatches = (f: any) =>
    (mismatches[f.id] ?? []).map((m: any) => (
      <span
        key={`${f.id}-${m.field}`}
        className="block mt-2 rounded-lg border border-[#F4C48A] bg-[#FFF6E9] px-3 py-2"
        onClick={(e) => e.preventDefault()}
      >
        <span className="block text-[12px] font-semibold text-[#8A5A00]">
          ⚠ {m.label} {t("funnel.docMismatchTitle" as any)}
        </span>
        {/* The mockup's three columns, and section 16's worked example: what you said, what
            the document says, and the gap between them. The difference is the number that
            decides whether this is worth the customer's attention — CHF 7'700 is an argument,
            CHF 12 is a rounding — so leaving it to be worked out in their head was asking
            them to do the one piece of arithmetic the comparison already did. */}
        <span className="grid gap-3 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" }}>
          {[
            { label: t("funnel.docYourAnswer" as any), value: m.funnelValue, warn: false },
            { label: t("funnel.docInDocument" as any), value: m.documentValue, warn: false },
            ...(typeof m.difference === "number"
              ? [{ label: t("funnel.docDifference" as any), value: fmtNumber(m.difference), warn: true }]
              : []),
          ].map((c: any) => (
            <span key={c.label} className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: "var(--text-micro)",
                  letterSpacing: "var(--tracking-label)",
                  textTransform: "uppercase",
                  color: "var(--on-light-45)",
                }}
              >
                {c.label}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--text-lead)",
                  fontWeight: "var(--weight-semibold)" as any,
                  color: c.warn ? "var(--warning-500)" : "var(--forest-800)",
                }}
              >
                {typeof c.value === "number" ? fmtNumber(c.value) : String(c.value)}
              </span>
            </span>
          ))}
        </span>
        <span className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              decideMismatch(f.id, m, "took_document");
            }}
            className="px-3 py-1 rounded-full text-[12px] border border-[#132219] bg-[#CAF476] text-[#132219]"
          >
            {t("funnel.docTakeDocumentValue" as any)}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              decideMismatch(f.id, m, "kept_own");
            }}
            className="px-3 py-1 rounded-full text-[12px] border border-[#132219]/40 text-[#132219]"
          >
            {t("funnel.docKeepMyValue" as any)}
          </button>
        </span>
      </span>
    ));

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
        // Values the customer took from a document. Applied last by saveStep6, after the
        // parent writes its own financing copy, or they would be silently reverted.
        financingOverrides,
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
  <div className="w-full flex justify-center pb-3 px-4 md:px-6 font-sfpro">

    <div className="w-full max-w-[1100px]">

      {/* HEADER — the mockup's short lime rule, the display heading, and a lead that says
          what the step now actually does. Left-aligned rather than centred: the whole screen
          below it is a left-aligned list, and a centred heading over that reads as a title
          borrowed from a different page. */}
      <div className="flex flex-col gap-3 mb-8 md:mb-10">
        <span style={{ width: "var(--rule-length)", height: "var(--rule-weight)", background: "var(--lime-600)" }} />
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-display-3)",
            lineHeight: "var(--leading-snug)",
            letterSpacing: "var(--tracking-tight)",
            color: "var(--forest-800)",
            fontWeight: "var(--weight-bold)" as any,
            textWrap: "pretty" as any,
          }}
        >
          {t("funnel.uploadDocuments" as any)}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-lead)",
            lineHeight: "var(--leading-normal)",
            color: "var(--on-light-70)",
            maxWidth: "58ch",
          }}
        >
          {t("funnel.docUploadLead" as any)}
        </p>
      </div>

      {/* The drop zone moved up here, where the mockup puts it: the customer's first move on
          this screen is to hand over files, and the state of the dossier is the answer to
          that rather than the thing they have to read first.

          A label rather than a button, so the whole area opens the picker without a second
          control inside it. The size in the hint is 25 MB and not the mockup's 50: the route
          rejects anything larger, and a promise the server breaks is worse than a smaller
          promise it keeps. */}
      <label
        className="flex flex-col items-center gap-2.5 cursor-pointer mb-8 text-center"
        style={{
          background: isDragging ? "var(--lime-100)" : "var(--paper-100)",
          border: `1px dashed ${isDragging ? "var(--lime-600)" : "var(--paper-400)"}`,
          borderRadius: "var(--radius-lg)",
          padding: "34px 24px",
          transition: "var(--transition-control)",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input type="file" className="hidden" multiple onChange={handleUpload} />
        <img
          src="/images/HYPOTEQ_funnel_upload_icon.svg"
          alt=""
          style={{ width: 34, height: 34, opacity: 0.7 }}
        />
        <span
          style={{
            fontSize: "var(--text-lead)",
            fontWeight: "var(--weight-semibold)" as any,
            color: "var(--forest-800)",
          }}
        >
          {t("funnel.docDropTitle" as any)}
        </span>
        <span
          style={{
            fontSize: "var(--text-body-sm)",
            color: "var(--on-light-70)",
            maxWidth: "46ch",
          }}
        >
          {t("funnel.docDropHint" as any)}
        </span>
      </label>

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
      {/* Section 33: the case as a whole, not a document at a time. Recomputed from what
          the funnel asked for and what has actually been attached, with the count of things
          still waiting on a person — that second number is what section 33 adds over the
          plain completeness check. */}
      {(() => {
        const visible = selectedDocuments.flatMap((sec: any) => sec.items);
        const provided = new Set(
          docs.filter((d: any) => d.file && d.docType).map((d: any) => d.docType)
        );
        const have = visible.filter((k: string) => provided.has(k)).length;
        const needsCheck = docs.filter((d: any) => {
          const a = analyses[d.id];
          return a && (a.status === "review_required" || (mismatches[d.id] ?? []).length > 0);
        }).length;
        if (visible.length === 0) return null;

        // Two segments, not one. A bar that counts a document still waiting on a person as
        // done tells the customer they are finished when they are not — so what is settled
        // is green and what is attached but unresolved is amber, and only the rest is empty.
        const okCount = Math.max(0, have - needsCheck);
        const pct = (n: number) => `${(n / visible.length) * 100}%`;
        const open = visible.length - have;

        const tally = (n: number, label: string, bg: string, fg: string) =>
          n > 0 ? (
            <span
              key={label}
              style={{
                background: bg,
                color: fg,
                borderRadius: "var(--radius-pill)",
                padding: "5px 12px",
                fontSize: "var(--text-caption)",
                fontWeight: "var(--weight-semibold)" as any,
                whiteSpace: "nowrap",
              }}
            >
              {n} {label}
            </span>
          ) : null;

        return (
          <div
            className="mb-8 flex flex-col gap-4"
            style={{
              border: "var(--border-on-light)",
              borderRadius: "var(--radius-lg)",
              background: "#fff",
              padding: 22,
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <span
                  style={{
                    fontSize: "var(--text-micro)",
                    letterSpacing: "var(--tracking-label)",
                    textTransform: "uppercase",
                    color: "var(--on-light-45)",
                  }}
                >
                  {t("funnel.docCompleteness" as any)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "var(--text-title)",
                    color: "var(--forest-800)",
                    fontWeight: "var(--weight-bold)" as any,
                    lineHeight: 1.1,
                  }}
                >
                  {have} {t("funnel.docOf" as any)} {visible.length}{" "}
                  {t("funnel.docDocumentsWord" as any)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {tally(okCount, t("funnel.docTallyOk" as any), "var(--success-100)", "var(--success-500)")}
                {tally(needsCheck, t("funnel.docTallyCheck" as any), "var(--warning-100)", "var(--warning-500)")}
                {tally(open, t("funnel.docTallyOpen" as any), "var(--paper-200)", "var(--on-light-45)")}
              </div>
            </div>

            <div
              className="flex overflow-hidden"
              style={{ height: 8, borderRadius: 999, background: "var(--paper-200)" }}
            >
              <div style={{ width: pct(okCount), background: "var(--success-500)" }} />
              <div style={{ width: pct(needsCheck), background: "var(--warning-500)" }} />
            </div>
          </div>
        );
      })()}

      {/* WHAT THE AI ACTUALLY DID (spec sections 34 and 35).
          One quiet line for the customer: section 34 is explicit that they must not be shown
          thirty extracted fields when nothing is wrong, but the work has to be visible or the
          step looks exactly like the upload box it replaced. Counts, not confidence — a
          percentage invites arguing with a number the customer cannot check. */}
      {(() => {
        const done = docs.filter((d: any) => analyses[d.id]);
        if (!done.length) return null;
        const fields = done.reduce(
          (n: number, d: any) => n + Object.keys(analyses[d.id]?.fields ?? {}).length,
          0
        );
        const deviations = docs.reduce((n: number, d: any) => n + (mismatches[d.id] ?? []).length, 0);
        const decided = Object.values(decisions).reduce((n: number, l: any) => n + l.length, 0);

        return (
          <div
            className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2"
            style={{
              border: "var(--border-on-light)",
              borderRadius: "var(--radius-lg)",
              background: "var(--paper-100)",
              padding: "14px 18px",
            }}
          >
            <span
              style={{
                fontSize: "var(--text-micro)",
                letterSpacing: "var(--tracking-label)",
                textTransform: "uppercase",
                color: "var(--on-light-45)",
              }}
            >
              {t("funnel.aiReviewedTitle" as any)}
            </span>
            <span style={{ fontSize: "var(--text-body-sm)", color: "var(--on-light-70)" }}>
              {done.length} {t("funnel.aiDocsAnalysed" as any)} · {fields}{" "}
              {t("funnel.aiFieldsRead" as any)}
            </span>
            <span
              style={{
                fontSize: "var(--text-body-sm)",
                fontWeight: "var(--weight-semibold)" as any,
                color: deviations > 0 ? "var(--warning-500)" : "var(--success-500)",
              }}
            >
              {deviations > 0
                ? `${deviations} ${t("funnel.aiDeviations" as any)}`
                : decided > 0
                  ? `${decided} ${t("funnel.aiDeviations" as any)}`
                  : t("funnel.aiNoDeviation" as any)}
            </span>
          </div>
        );
      })()}

      {/* INTERNAL VIEW (section 35). Everything the customer's line deliberately hides:
          confidence per document, the model that read it, when, and how long it took.

          Behind ?intern=1 rather than a role, because the funnel has no notion of a HYPOTEQ
          employee — customerType only knows direct and partner. A URL flag is honest about
          being a stopgap; inventing a role here would create a second, weaker idea of who is
          internal, next to the one the admin API already enforces. It reveals nothing the
          viewer did not already upload themselves. */}
      {internView && Object.keys(analyses).length > 0 && (
        <div
          className="mb-8 flex flex-col gap-4"
          style={{
            border: "var(--border-on-light)",
            borderRadius: "var(--radius-lg)",
            background: "var(--paper-100)",
            padding: "20px 22px",
          }}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              style={{
                background: "var(--info-100)",
                color: "var(--info-500)",
                borderRadius: "var(--radius-pill)",
                padding: "4px 12px",
                fontSize: "var(--text-micro)",
                fontWeight: "var(--weight-semibold)" as any,
              }}
            >
              {t("funnel.aiInternTitle" as any)}
            </span>
            {(() => {
              const a: any = Object.values(analyses).find((x: any) => x?.audit);
              if (!a) return null;
              return (
                <span style={{ fontSize: "var(--text-caption)", color: "var(--on-light-70)" }}>
                  {t("funnel.aiInternModel" as any)} {a.audit.provider}/{a.audit.model}
                </span>
              );
            })()}
          </div>

          {/* The mockup's metric row. Four numbers a reviewer reads at a glance before
              deciding whether the list below is worth going through. */}
          {(() => {
            const all: any[] = Object.values(analyses).filter(Boolean);
            const metrics = [
              { value: all.length, label: t("funnel.aiDocsAnalysed" as any) },
              {
                value: all.filter((a: any) => a.status === "classified" || a.status === "confirmed").length,
                label: t("funnel.docTallyOk" as any),
              },
              {
                value: all.filter((a: any) =>
                  ["review_required", "rejected", "outdated", "unsupported", "failed"].includes(a.status)
                ).length,
                label: t("funnel.docTallyCheck" as any),
              },
              {
                value: all.reduce((n: number, a: any) => n + Object.keys(a.fields ?? {}).length, 0),
                label: t("funnel.aiFieldsRead" as any),
              },
            ];
            return (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" }}>
                {metrics.map((m) => (
                  <div key={m.label} className="flex flex-col gap-1">
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "var(--text-title)",
                        color: "var(--forest-800)",
                        fontWeight: "var(--weight-bold)" as any,
                        lineHeight: 1,
                      }}
                    >
                      {m.value}
                    </span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--on-light-70)" }}>
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}

          <div style={{ height: 1, background: "var(--paper-300)" }} />

          <div className="flex flex-col gap-2">
            <span
              style={{
                fontSize: "var(--text-micro)",
                letterSpacing: "var(--tracking-label)",
                textTransform: "uppercase",
                color: "var(--on-light-45)",
              }}
            >
              {t("funnel.aiInternValidations" as any)}
            </span>
            {docs
              .filter((d: any) => analyses[d.id])
              .map((d: any) => {
                const a = analyses[d.id];
                const conf = Math.round((a.classification?.confidence ?? 0) * 100);
                const low = Object.entries(a.fields ?? {}).filter(
                  ([, f]: any) => (f?.confidence ?? 0) < 0.9
                );
                return (
                  <div key={d.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      style={{
                        fontSize: "var(--text-micro)",
                        color: "var(--on-light-45)",
                        minWidth: 150,
                      }}
                    >
                      {a.audit?.originalFileName ?? d.name}
                    </span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--on-light-70)" }}>
                      {a.classification?.type} · {conf}% · {a.status} · {a.audit?.durationMs}ms
                      {low.length > 0 && ` · ${low.length} Feld(er) < 90%`}
                      {a.freshness && ` · ${a.freshness.ageMonths} Monate alt`}
                      {a.mismatchedRequirement && ` · erwartet ${a.mismatchedRequirement.expected}`}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="space-y-8 md:space-y-12 lg:space-y-16">

        {selectedDocuments.map((section, index) => (
          <div key={index} className="flex flex-col gap-2.5">
            {/* GROUP HEADER — the mockup's quiet rule-and-count line instead of a card
                around each section. The card was competing with the rows inside it for the
                same attention, and the rows are the part carrying a status. */}
            <div className="flex items-baseline gap-2.5">
              <span
                style={{
                  fontSize: "var(--text-micro)",
                  letterSpacing: "var(--tracking-label)",
                  textTransform: "uppercase",
                  color: "var(--on-light-45)",
                }}
              >
                {section.title}
              </span>
              <span className="flex-1" style={{ height: 1, background: "var(--paper-300)" }} />
              <span style={{ fontSize: "var(--text-micro)", color: "var(--on-light-45)" }}>
                {section.items.filter((k: string) => docs.some((d: any) => d.docType === k && d.file)).length}
                /{section.items.length}
              </span>
            </div>

            {/* ROWS */}
            <div className="flex flex-col gap-2.5">
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
                const rowState = rowStatus(filesForDoc);

                const rowFiles = filesForDoc.filter((f: any) => analyses[f.id]);
                const rowOpen = rowFiles.some((f: any) => openRows[f.id]);

                return (
                  <div
                    key={idx}
                    style={{
                      // White ground for every row; the status speaks through the glyph, the
                      // border and the badge rather than by tinting the whole card. A wall of
                      // coloured cards is how a list stops being readable at nine documents.
                      background: "#fff",
                      border: `1px solid ${rowState.border}`,
                      borderRadius: "var(--radius-md)",
                      overflow: "hidden",
                      transition: "var(--transition-control)",
                    }}
                  >
                  <label
                    className="flex items-start gap-3.5 cursor-pointer"
                    style={{ padding: "14px 18px" }}
                  >
                    {/* Status glyph, in the mockup's colours for this state. */}
                    <span
                      className="flex items-center justify-center flex-none"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        background: rowState.bg,
                        color: rowState.fg,
                        fontSize: "var(--text-body-sm)",
                        fontWeight: "var(--weight-semibold)" as any,
                        marginTop: 1,
                      }}
                      aria-hidden="true"
                    >
                      {rowState.glyph}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleDocTypeUpload(e, doc)}
                      disabled={isUploading}
                    />
                    <span className="flex-1 min-w-0 flex flex-col gap-1 break-words">
                      <span
                        style={{
                          fontSize: "var(--text-body)",
                          fontWeight: "var(--weight-semibold)" as any,
                          color: "var(--forest-800)",
                          lineHeight: "var(--leading-snug)",
                          textWrap: "pretty" as any,
                        }}
                      >
                        {t(doc as any)}
                      </span>
                      {filesForDoc.map((f: any) => renderAnalysisNote(f))}
                      {filesForDoc.map((f: any) => renderPersonQuestion(f))}
                      {filesForDoc.flatMap((f: any) => renderMismatches(f))}
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

                    {/* The state in words. The glyph alone asks the customer to learn a
                        legend; the badge says it outright, and the two agree by construction
                        because both come from rowStatus. */}
                    <span
                      className="flex-none"
                      style={{
                        background: rowState.bg,
                        color: rowState.fg,
                        borderRadius: "var(--radius-pill)",
                        padding: "4px 12px",
                        fontSize: "var(--text-micro)",
                        fontWeight: "var(--weight-semibold)" as any,
                        whiteSpace: "nowrap",
                        marginTop: 4,
                      }}
                    >
                      {t(("funnel." + rowState.badge) as any)}
                    </span>

                    {/* The mockup's chevron. preventDefault because it sits inside the label
                        whose click opens the file picker — without it, asking to see what was
                        read would also ask for another upload. */}
                    {rowFiles.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenRows((prev) => {
                            const next = { ...prev };
                            for (const f of rowFiles) next[f.id] = !rowOpen;
                            return next;
                          });
                        }}
                        className="flex-none"
                        style={{
                          color: "var(--on-light-45)",
                          fontSize: 14,
                          lineHeight: 1,
                          marginTop: 8,
                          transform: rowOpen ? "rotate(180deg)" : "none",
                          transition: "transform var(--duration-base) var(--ease-out)",
                        }}
                        aria-label={t("funnel.docShowDetails" as any)}
                      >
                        ▾
                      </button>
                    )}
                  </label>

                  {/* WHAT WAS READ, AND WHAT HAPPENED TO IT (sections 13 and 36).
                      In the row rather than only behind a modal: the modal is the right place
                      to correct a value against the page it came from, but the wrong place to
                      answer "what did it actually find" — a question asked in passing, which
                      nobody should have to open a dialog for. */}
                  {rowOpen &&
                    rowFiles.map((f: any) => {
                      const a = analyses[f.id];
                      const spec = docTypeById(a.classification?.type);
                      const entries = Object.entries(a.fields ?? {});
                      const decided = decisions[f.id] ?? [];
                      const editedKeys = Object.keys(edits[f.id] ?? {});

                      return (
                        <div
                          key={f.id}
                          className="flex flex-col gap-4"
                          style={{ padding: "0 18px 18px", animation: "hqrise .24s var(--ease-out) both" }}
                        >
                          {entries.length > 0 && (
                            <div className="flex flex-col" style={{ borderTop: "1px solid var(--paper-300)", paddingTop: 14 }}>
                              <span
                                style={{
                                  fontSize: "var(--text-micro)",
                                  letterSpacing: "var(--tracking-label)",
                                  textTransform: "uppercase",
                                  color: "var(--on-light-45)",
                                  paddingBottom: 8,
                                }}
                              >
                                {t("funnel.docExtractedInfo" as any)}
                              </span>
                              {entries.map(([key, fl]: any) => {
                                const label = spec?.fields.find((x: any) => x.key === key)?.label ?? key;
                                const corrected = edits[f.id]?.[key];
                                // Section 15's three states as words. A percentage invites the
                                // customer to argue with a number they cannot check; "bitte
                                // prüfen" tells them what to do instead.
                                const uncertain = (fl?.confidence ?? 0) < 0.9;
                                return (
                                  <div
                                    key={key}
                                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                                    style={{ padding: "7px 0", borderBottom: "1px solid var(--paper-200)" }}
                                  >
                                    <span style={{ fontSize: "var(--text-body-sm)", color: "var(--on-light-70)" }}>
                                      {label}
                                    </span>
                                    <span className="flex items-center gap-2.5 flex-wrap justify-end">
                                      <span
                                        style={{
                                          fontSize: "var(--text-body-sm)",
                                          fontWeight: "var(--weight-semibold)" as any,
                                          color: "var(--forest-800)",
                                        }}
                                      >
                                        {corrected ?? fmtNumber(fl?.value)}
                                        {fl?.unit ? " " + fl.unit : ""}
                                      </span>
                                      {corrected !== undefined ? (
                                        <span style={chip("var(--info-100)", "var(--info-500)")}>
                                          {t("funnel.docCorrected" as any)}
                                        </span>
                                      ) : uncertain ? (
                                        <span style={chip("var(--warning-100)", "var(--warning-500)")}>
                                          {t("funnel.docPleaseCheck" as any)}
                                        </span>
                                      ) : null}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* AUDIT TRAIL (section 36): what the AI found and what the human
                              made of it, in the order it happened. That is the whole question
                              the section exists to answer, and it was being stored where only
                              a database query could reach it. */}
                          <div className="flex flex-col gap-2" style={{ borderTop: "1px solid var(--paper-300)", paddingTop: 12 }}>
                            <span
                              style={{
                                fontSize: "var(--text-micro)",
                                letterSpacing: "var(--tracking-label)",
                                textTransform: "uppercase",
                                color: "var(--on-light-45)",
                              }}
                            >
                              {t("funnel.docAuditTrail" as any)}
                            </span>
                            {[
                              {
                                ts: a.audit?.analysedAt,
                                text:
                                  t("funnel.docAuditAnalysed" as any) +
                                  ": " + (a.audit?.originalFileName ?? f.name) +
                                  " → " + (a.classification?.label ?? "—"),
                              },
                              ...(a.suggestedFilename
                                ? [{ ts: a.audit?.analysedAt, text: t("funnel.docAuditRenamed" as any) + ": " + a.suggestedFilename }]
                                : []),
                              ...decided.map((d: any) => ({
                                ts: d.decidedAt,
                                text: t("funnel.docAuditDecided" as any) + ": " + d.field + " → " + fmtNumber(d.finalValue),
                              })),
                              ...editedKeys.map((k: string) => ({
                                ts: null,
                                text:
                                  t("funnel.docAuditEdited" as any) + ": " +
                                  (spec?.fields.find((x: any) => x.key === k)?.label ?? k),
                              })),
                            ].map((ev: any, i: number) => (
                              <div key={i} className="flex gap-2.5 items-baseline">
                                <span
                                  style={{
                                    fontSize: "var(--text-micro)",
                                    color: "var(--on-light-45)",
                                    whiteSpace: "nowrap",
                                    minWidth: 100,
                                  }}
                                >
                                  {ev.ts
                                    ? new Date(ev.ts).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })
                                    : "—"}
                                </span>
                                <span style={{ fontSize: "var(--text-caption)", color: "var(--on-light-70)" }}>
                                  {ev.text}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-wrap gap-2.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setOpenDoc({ doc: f, analysis: a });
                              }}
                              style={{
                                borderRadius: "var(--radius-pill)",
                                padding: "9px 18px",
                                fontSize: "var(--text-body-sm)",
                                fontWeight: "var(--weight-semibold)" as any,
                                background: "#fff",
                                border: "1px solid var(--paper-400)",
                                color: "var(--forest-800)",
                              }}
                            >
                              {t("funnel.docOpenDocument" as any)}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

          </div>
        ))}

      </div>

      {/* The mockup's closing reassurance, and it is true: the funnel has always allowed a
          submission with documents outstanding, and the completeness verdict travels with it
          so the Nachreichung mail can name what is still needed. Saying so here removes the
          reason a customer stalls on a document they cannot find tonight. */}
      {/* LETZTER BLICK (spec section 41, screen 7; the mockup's step 5).
          A last look before submitting, in the place the flow already ends rather than as a
          new step — adding one would change the navigation this redesign is not allowed to
          touch. Per section, not per document: eight green ticks are not a summary, they are
          the same list again. */}
      {(() => {
        const visible = selectedDocuments.flatMap((sec: any) => sec.items);
        if (!visible.length) return null;

        const rows = selectedDocuments
          .map((sec: any) => {
            const have = sec.items.filter((k: string) =>
              docs.some((d: any) => d.docType === k && d.file)
            ).length;
            const needsCheck = docs.some((d: any) => {
              if (!sec.items.includes(d.docType)) return false;
              const a = analyses[d.id];
              return (a && a.status === "review_required") || (mismatches[d.id] ?? []).length > 0;
            });
            return { name: sec.title, have, total: sec.items.length, needsCheck };
          })
          .filter((r: any) => r.total > 0);

        const changed = Object.values(decisions).reduce((n: number, l: any) => n + l.length, 0)
          + Object.values(edits).reduce((n: number, m: any) => n + Object.keys(m).length, 0);

        return (
          <div
            className="mt-8 flex flex-col gap-4"
            style={{
              border: "var(--border-on-light)",
              borderRadius: "var(--radius-lg)",
              background: "#fff",
              padding: 22,
            }}
          >
            <span
              style={{
                fontSize: "var(--text-micro)",
                letterSpacing: "var(--tracking-label)",
                textTransform: "uppercase",
                color: "var(--on-light-45)",
              }}
            >
              {t("funnel.finalCheckTitle" as any)}
            </span>

            <div className="flex flex-col">
              {rows.map((r: any) => {
                const complete = r.have >= r.total;
                const glyph = r.needsCheck ? "⚠" : complete ? "✓" : "○";
                const colour = r.needsCheck
                  ? "var(--warning-500)"
                  : complete
                    ? "var(--success-500)"
                    : "var(--on-light-45)";
                return (
                  <div
                    key={r.name}
                    className="flex items-center gap-3"
                    style={{ padding: "9px 0", borderBottom: "1px solid var(--paper-200)" }}
                  >
                    <span style={{ color: colour, fontWeight: "var(--weight-semibold)" as any, width: 16 }}>
                      {glyph}
                    </span>
                    <span
                      className="flex-1 min-w-0"
                      style={{ fontSize: "var(--text-body-sm)", color: "var(--forest-800)" }}
                    >
                      {r.name}
                    </span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--on-light-45)" }}>
                      {r.have}/{r.total}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Section 41 puts this line on the final screen, and it is the one thing on it
                a reviewer at HYPOTEQ will look for first: a figure the customer changed by
                hand is a figure no document backs. */}
            {changed > 0 && (
              <span style={{ fontSize: "var(--text-body-sm)", color: "var(--warning-500)" }}>
                ⚠ {changed} {t("funnel.finalCheckChanged" as any)}
              </span>
            )}

            <span style={{ fontSize: "var(--text-body-sm)", color: "var(--on-light-70)" }}>
              {t("funnel.docSubmitAnytime" as any)}
            </span>
          </div>
        );
      })()}

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
                      {/* A file lands here when it was dropped in without choosing a
                          requirement — section 9's whole point. It stays here when the AI
                          could not place it, so this is exactly where the picker and the
                          "wird analysiert" line are needed most. */}
                      {renderAnalysisNote(doc)}
                      {renderPersonQuestion(doc)}
                      {renderMismatches(doc)}
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

      {/* Section 13: the document on the left, what was read out of it on the right, and the
          values editable. The preview is built from the File the customer picked rather than
          from SharePoint — at this point the upload has not happened yet, and a preview that
          only works after submitting is a preview nobody uses.

          Edits are held separately from the extraction (see `edits`): section 36 wants the
          original value AND the corrected one, so overwriting the analysis in place would
          destroy exactly what the audit trail is for. */}
      {openDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpenDoc(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[1000px] max-h-[88vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEE]">
              <div>
                <div className="text-[12px] text-[#132219]/60">
                  {openDoc.analysis?.classification?.label}
                </div>
                <div className="text-[16px] font-semibold text-[#132219]">
                  {openDoc.doc?.name}
                </div>
                {/* The mockup's meta line. What the document itself says it is about, so the
                    person checking a value knows which document and whose it is without
                    reading the preview first. */}
                <div style={{ fontSize: "var(--text-caption)", color: "var(--on-light-45)", marginTop: 2 }}>
                  {[
                    openDoc.analysis?.documentDate,
                    (() => {
                      const id = openDoc.analysis?.person?.borrowerId;
                      if (!id) return null;
                      return borrowerChoices().find((b: any) => b.id === id)?.name ?? null;
                    })(),
                    `${Object.keys(openDoc.analysis?.fields ?? {}).length} ${t("funnel.docFieldsRead" as any)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenDoc(null)}
                className="text-[20px] leading-none text-[#132219]/60 px-2"
                aria-label="Schliessen"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
              <div className="min-h-[320px] rounded-xl border border-[#EEE] bg-[#FAFAFA] overflow-hidden">
                {previewUrl ? (
                  openDoc.doc.file.type?.startsWith("image/") ? (
                    <img
                      src={previewUrl}
                      alt={openDoc.doc.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <object
                      data={previewUrl}
                      type="application/pdf"
                      className="w-full h-[420px]"
                    >
                      <p className="p-4 text-[13px] text-[#132219]/70">
                        {openDoc.doc.name}
                      </p>
                    </object>
                  )
                ) : null}
              </div>

              <div>
                <div className="text-[13px] font-semibold text-[#132219] mb-2">
                  {t("funnel.docExtractedInfo" as any)}
                </div>
                <div className="space-y-2">
                  {Object.entries(openDoc.analysis?.fields ?? {}).map(([key, f]: any) => {
                    const edited = edits[openDoc.doc.id]?.[key];
                    const shown = edited ?? String(f.value ?? "");
                    return (
                      <label key={key} className="block">
                        <span className="block text-[11px] text-[#132219]/60">
                          {/* Section 13 asks for the document's own wording. The catalog
                              already carries it; showing "grossAnnualSalary" would make the
                              customer decode a field name to check their own salary. */}
                          {docTypeById(openDoc.analysis?.classification?.type)?.fields.find(
                            (fs: any) => fs.key === key
                          )?.label ?? key}
                          {/* Section 15 in the customer view: three states, never a
                              percentage — a number only invites arguing with it. */}
                          {f.confidence < 0.9 && (
                            <span className="ml-1 text-[#8A5A00]">
                              ⚠ {t("funnel.docPleaseCheck" as any)}
                            </span>
                          )}
                        </span>
                        <input
                          value={shown}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [openDoc.doc.id]: {
                                ...(prev[openDoc.doc.id] ?? {}),
                                [key]: e.target.value,
                              },
                            }))
                          }
                          className="w-full mt-0.5 px-3 py-2 rounded-lg border border-[#E4E4E4] text-[13px]"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 flex flex-wrap justify-end gap-2.5" style={{ borderTop: "1px solid var(--paper-300)" }}>
              {/* Abbrechen discards the edits made in this panel rather than merely closing
                  it. A dialog whose cancel button keeps your changes is a dialog nobody
                  trusts, and here the changes are numbers that travel to a lender. */}
              <button
                type="button"
                onClick={() => {
                  const id = openDoc.doc.id;
                  setEdits((prev) => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                  });
                  setOpenDoc(null);
                }}
                style={{
                  borderRadius: "var(--radius-pill)",
                  padding: "9px 18px",
                  fontSize: "var(--text-body-sm)",
                  fontWeight: "var(--weight-semibold)" as any,
                  background: "#fff",
                  border: "1px solid var(--paper-400)",
                  color: "var(--forest-800)",
                }}
              >
                {t("funnel.docCancel" as any)}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Section 14: a person has now looked at the values, so the document is no
                  // longer waiting for one. Closing the panel without this left it flagged
                  // "bitte prüfen" after it had been checked, which trains people to ignore
                  // the flag.
                  const id = openDoc.doc.id;
                  setAnalyses((prev) => ({
                    ...prev,
                    [id]: { ...(prev[id] ?? {}), status: "confirmed", confirmedByHuman: true },
                  }));
                  setOpenDoc(null);
                }}
                className="px-5 py-2 rounded-full text-[14px] border border-[#132219] bg-[#CAF476] text-[#132219]"
              >
                {t("funnel.docConfirmValues" as any)}
              </button>
            </div>
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
