/**
 * «Fall-Dossier als PDF» before the closing: asks /api/dossier/preview for the «Entwurf» and
 * hands it to the browser as a download. Only what the dossier draws is sent — never the File
 * objects themselves.
 */

import type { FileEntry } from "@/lib/funnel-v3/files";
import type { Lang } from "@/lib/funnel-v3/i18n";
import type { FunnelState } from "@/lib/funnel-v3/types";

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
  }));
  return {
    lang,
    state: { role: state.role, ans: state.ans, txt: state.txt, fin: state.fin, borrowers: state.borrowers },
    files,
    skipped: state.skipped ? [...state.skipped] : [],
  };
}

export async function downloadDraftDossier(body: unknown, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl("/api/dossier/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = "Fall-Dossier_Entwurf.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
