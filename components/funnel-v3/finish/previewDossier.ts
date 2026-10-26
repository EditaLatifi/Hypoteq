/**
 * «Fall-Dossier herunterladen» before the closing: asks /api/dossier/preview for the PDF and
 * hands it to the browser as a download, saved as «HYPOTEQ Fall-Dossier – Max Mustermann.pdf»
 * (HYPOTEQ 23.10.2026). Only what the dossier draws is sent — never the File objects themselves.
 */

import { dossierDownloadName, dossierPersonName } from "@/lib/funnel-v3/dossier/fileName";
import type { FileEntry } from "@/lib/funnel-v3/files";
import type { Lang } from "@/lib/funnel-v3/i18n";
import type { FunnelState } from "@/lib/funnel-v3/types";

export type PreviewBody = ReturnType<typeof previewBody>;

export function previewBody(state: FunnelState & { files: unknown[]; skipped?: Iterable<string> }, lang: Lang) {
  const files = (state.files as FileEntry[]).map((f) => ({
    id: f.id,
    name: f.name,
    uploadState: f.uploadState,
    analysisState: f.analysisState,
    analysis: f.analysis,
    instanceId: f.instanceId ?? null,
    keep: f.keep,
    outdatedOverride: f.outdatedOverride,
    // A signed Auskunftsermächtigung placed with its own button counts even unread (V21).
    assignedByUser: f.assignedByUser,
  }));
  return {
    lang,
    // v5: the prefill marks («aus Dokument») and the signature choice are drawn too.
    state: { role: state.role, ans: state.ans, txt: state.txt, fin: state.fin, em: state.em, info: state.info, borrowers: state.borrowers, src: state.src, sig: state.sig },
    files,
    skipped: state.skipped ? [...state.skipped] : [],
  };
}

/** The preview PDF for this body. */
export async function fetchDraftDossier(body: unknown, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<Blob> {
  const res = await fetchImpl("/api/dossier/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

/** The name the dossier of this body is saved under. */
export function draftDossierName(body: { state?: Parameters<typeof dossierPersonName>[0] } | null | undefined): string {
  return dossierDownloadName(dossierPersonName(body?.state ?? null));
}

export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export async function downloadDraftDossier(body: PreviewBody, fetchImpl: typeof fetch = fetch): Promise<void> {
  saveBlob(await fetchDraftDossier(body, fetchImpl), draftDossierName(body));
}
