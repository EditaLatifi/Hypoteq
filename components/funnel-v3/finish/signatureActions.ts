"use client";

/**
 * The block's two actions (Handover 6): «Vorlage herunterladen» and «Unterzeichnet hochladen».
 *
 * The upload is the funnel's own pipeline (lib/funnel-v3/upload.ts: SharePoint → row → AI),
 * but the file is placed on P0 at once, whatever its name (Handover 6 «eigener Upload-Button,
 * unabhängig vom Dateinamen»): a hand assignment, which placement keeps (placeFile.ts). The AI's
 * reading then only decides «erhalten» or «Unterschrift fehlt» (signature.ts).
 *
 * DocuSign (later phase) replaces exactly this file's upload: a signing flow would end in
 * markSignatureReceived on the server instead of a file on P0 (lib/funnel-v3/signatureServer.ts).
 */

import type { StoreApi } from "zustand";
import type { AuthorizationData } from "@/lib/funnel-v3/authorization";
import { authorizationFileName } from "@/lib/funnel-v3/authorizationData";
import { baseId, getRequirement, SIGNATURE_REQUIREMENT_ID } from "@/lib/funnel-v3/requirements";
import type { FunnelV3Store } from "@/lib/funnel-v3/store";
import { addPickedFiles, auditEntry, screenFiles, type RejectReason } from "@/lib/funnel-v3/upload";

type Store = Pick<StoreApi<FunnelV3Store>, "getState">;

const LABEL_DE = getRequirement(SIGNATURE_REQUIREMENT_ID)?.labelDe ?? "HYPOTEQ Auskunftsermächtigung";

/**
 * Upload `file` as the signed copy. Earlier copies placed by hand lose their place (the new one
 * replaces them; they stay in the folder, placed by the AI like any other file). The store must
 * be the one the upload pipeline is bound to (the funnel's, or the Nachreich page's).
 */
export function addSignatureCopy(store: Store, file: File): { ok: true; id: string } | { ok: false; reason: RejectReason } {
  const { accepted, rejected } = screenFiles([{ file }]);
  if (!accepted.length) return { ok: false, reason: rejected[0]?.reason ?? "type" };
  const s = store.getState();
  for (const f of s.files) {
    if (f.assignedByUser && f.instanceId && baseId(f.instanceId) === SIGNATURE_REQUIREMENT_ID) {
      s.updateFile(f.id, { instanceId: null, assignedByUser: false });
    }
  }
  const added = addPickedFiles(accepted);
  // The same file picked earlier (drop zone) is not uploaded twice: that entry is placed instead.
  const target = added[0] ?? store.getState().files.find((f) => f.name === file.name && f.size === file.size && f.uploadState !== "failed");
  if (!target) return { ok: false, reason: "type" };
  store.getState().updateFile(target.id, (f) => ({
    instanceId: SIGNATURE_REQUIREMENT_ID,
    assignedByUser: true,
    audit: [...(f.audit ?? []), auditEntry("docs.audit.assigned", { label: LABEL_DE })],
  }));
  return { ok: true, id: target.id };
}

/** Fetch a PDF and hand it to the browser as a download. */
export async function downloadPdf(url: string, init: RequestInit | undefined, fileName: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  }
}

/** «Vorlage herunterladen» in the closing: prefilled from what the browser holds. */
export function downloadAuthorization(data: AuthorizationData, fetchImpl: typeof fetch = fetch): Promise<void> {
  return downloadPdf(
    "/api/funnel/authorization",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) },
    authorizationFileName(data),
    fetchImpl
  );
}
