/**
 * The dossier's file names — pure, without pdf-lib, so the funnel in the browser can name a
 * download the way the server does.
 */

/** `HQ-26-01-000001_00_Fall-Dossier.pdf` (group 00 sorts it first in the case folder). */
export function dossierFileName(caseNumber: string | null): string {
  return caseNumber ? `${caseNumber}_00_Fall-Dossier.pdf` : "00_Fall-Dossier.pdf";
}

interface NamedState {
  ans?: { kn?: string | null } | null;
  txt?: { vor?: string; nach?: string; firma?: string } | null;
  borrowers?: { vor?: string; nach?: string }[] | null;
}

/** «Vorname Nachname» of Kreditnehmer 1, the company for a juristische Person. */
export function dossierPersonName(state: NamedState | null | undefined): string {
  const txt = state?.txt ?? {};
  if (state?.ans?.kn === "Juristische Person") return (txt.firma ?? "").trim();
  const first = state?.borrowers?.[0] ?? {};
  return [(txt.vor || first.vor || "").trim(), (txt.nach || first.nach || "").trim()].filter(Boolean).join(" ");
}

/**
 * The name the browser saves the dossier under (HYPOTEQ 23.10.2026, Kap. 9):
 * «HYPOTEQ Fall-Dossier – Max Mustermann.pdf». A dash instead of a colon, and no other
 * character Windows refuses in a file name.
 */
export function dossierDownloadName(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return clean ? `HYPOTEQ Fall-Dossier – ${clean}.pdf` : "HYPOTEQ Fall-Dossier.pdf";
}

/** `Content-Disposition` for a download name with umlauts and the dash (RFC 6266 / 5987). */
export function attachmentDisposition(name: string): string {
  const ascii = name
    .replace(/–/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
