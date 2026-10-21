"use client";

import DocumentsPanel from "../documents/DocumentsPanel";
import Closing from "../finish/Closing";
import { useScreen } from "../hooks";

/**
 * «Unterlagen» — step 2 of the Schnellanmeldung (Handover 3): every document there is, single
 * files or a whole folder; the right column fills with what was read (DocsRail FillRail).
 */
export function ScreenUpload() {
  return <DocumentsPanel variant="upload" />;
}

/**
 * The last step: «Unterlagen & Abschluss» (Begleitet, Handover 2 Schritt 4) — the upload with
 * the whole list — or «Fehlende Unterlagen & Abschluss» (Schnell, Handover 3 Schritt 6) — the
 * whole list too, what is there and what is still open (HYPOTEQ 21.10.2026). The closing
 * follows in both (Kennzahlen, Hinweise, Prüfliste, Auskunftsermächtigung,
 * «Finanzierungsanfrage abschliessen»).
 */
export function ScreenAbschluss() {
  const { mode } = useScreen();
  return (
    <>
      <DocumentsPanel variant={mode === "schnell" ? "missing" : "guided"} />
      <Closing />
    </>
  );
}
