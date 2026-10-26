/**
 * Fall-Dossier (Spezifikation 3 Schritt 6, DECISIONS D11/D12): the model in the funnel
 * language, drawn as a PDF. Used by the closing on the server (stored in the case folder as
 * `{Fallnummer}_00_Fall-Dossier.pdf`) and by the preview before it.
 */

import { buildDossierModel, type DossierInput } from "./model";
import { renderDossierPdf } from "./render";

export { buildDossierModel, dossierDocumentCount, toUploadedFile } from "./model";
export type { DossierFile, DossierInput, DossierModel } from "./model";
export { renderDossierPdf } from "./render";
export { attachmentDisposition, dossierDownloadName, dossierFileName, dossierPersonName } from "./fileName";

export async function createDossierPdf(input: DossierInput): Promise<Uint8Array> {
  return renderDossierPdf(buildDossierModel(input), { date: input.date });
}
