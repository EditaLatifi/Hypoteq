// STUB: replaced by the signature branch
/**
 * The prefilled HYPOTEQ Auskunftsermächtigung (Handover 6). The signature branch provides the
 * real module; this stub only fixes the contract so the closing mails compile and can be
 * tested with a mock. The PDF is empty here, and the mails never attach an empty file.
 */

export interface AuthorizationSigner {
  vor: string;
  nach: string;
  adresse?: string | null;
  plzOrt?: string | null;
  email?: string | null;
}

export interface AuthorizationData {
  lang: "de" | "en" | "fr" | "it";
  signers: AuthorizationSigner[];
  firma?: string | null;
  caseNumber?: string | null;
  objekt?: string | null;
  zweck?: "Neue Hypothek" | "Ablösung" | null;
}

export async function buildAuthorizationPdf(_data: AuthorizationData): Promise<Uint8Array> {
  return new Uint8Array();
}

export function authorizationFileName(data: AuthorizationData): string {
  return data.caseNumber ? `${data.caseNumber}_Auskunftsermaechtigung.pdf` : "HYPOTEQ_Auskunftsermaechtigung.pdf";
}
