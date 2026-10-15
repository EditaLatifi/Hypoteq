import { getRequirement } from "@/lib/funnel-v3/requirements";
import { docCategory, type DocCategory, type ReworkDoc } from "@/lib/portal/requiredDocs";
import type { DocStatus } from "@/lib/portal/status";

/**
 * The document list of one Case as the partner sees it (handoff 5, DECISIONS P3, P11). Pure:
 * lib/portal/salesforce.ts gathers the sources, this decides what each document shows.
 */

/**
 * A document of the Case.
 *
 * `state` says whether it is still outstanding; the upload routes go by it:
 * - fehlt: confirmed missing — the funnel's verdict, unticked in a checklist a caseworker
 *   has saved, or asked for again (Neu erforderlich / Ungültig)
 * - offen: required by HYPOTEQ's document list for a new Case, not confirmed yet
 * - vorhanden: on file at HYPOTEQ, or uploaded through the portal
 *
 * `status` is what the partner sees.
 */
export type CaseDoc = {
  key: string | null;
  name: string;
  state: "fehlt" | "offen" | "vorhanden";
  status: DocStatus;
  category: DocCategory;
  /** Whose document it is, for per-borrower documents. */
  person: string | null;
  /** Expected by HYPOTEQ's list rather than confirmed missing (state «offen»). */
  expected?: boolean;
  /** The latest portal upload of this document. */
  upload: { at: string; fileName: string } | null;
  /** An upload outside the Case's document list («Weiteres Dokument»). */
  extra?: boolean;
};

/** A document HYPOTEQ has on file, under the funnel keys it stands for (may be none). */
export type PresentDoc = { name: string; keys: string[] };

export type PortalUploadRow = { docKey: string | null; fileName: string; at: Date };

// What the partner must act on first, then what HYPOTEQ checks, then what is on file.
const DOC_ORDER: Record<DocStatus, number> = { neu: 0, ungueltig: 0, fehlt: 1, hochgeladen: 2, pruefung: 3, vorhanden: 4 };

/**
 * The upload route writes to the Case itself (updateCaseCompleteness); a change to the Case
 * later than this after an upload is HYPOTEQ's.
 */
export const REVIEW_SLACK_MS = 10 * 60_000;

/** One row per document: the same paper ticked as a Dok_*__c flag and in the tab, or under two labels, is listed once. */
export function dedupePresent(list: PresentDoc[]): PresentDoc[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const ids = d.keys.length ? d.keys : [`name:${d.name}`];
    if (ids.some((k) => seen.has(k))) return false;
    ids.forEach((k) => seen.add(k));
    return true;
  });
}

// A v3 requirement id also stands for the old funnel keys of the same document, so an upload
// against "lohnausweise#b1" hides a tab tick that reads as "funnel.salaryStatementBonus".
function withLegacyKeys(keys: string[]): Set<string> {
  return new Set(keys.flatMap((k) => [k, ...(k.includes(".") ? [] : getRequirement(k)?.legacyKeys || [])]));
}

export type CaseDocsInput = {
  /** Keys confirmed missing (rework keys already taken out). */
  missing: string[];
  /** Keys expected by HYPOTEQ's list. */
  open: string[];
  rework: ReworkDoc[];
  /** Every portal upload of the Case, newest first. */
  uploads: PortalUploadRow[];
  present: PresentDoc[];
  /** Whose per-person document a key is. */
  persons: Map<string, string>;
  label: (key: string) => string;
  /** «Weiteres Dokument» in the reader's language. */
  otherLabel: string;
  /** Whether the Case is past HYPOTEQ's review (status from «Bereit für Kreditgeber» on). */
  pastReview: boolean;
  /** Case.LastModifiedDate. */
  lastChange: string | null | undefined;
};

/**
 * - asked for again: «Neu erforderlich» / «Ungültig»; confirmed or expected missing: «Fehlt»
 * - uploaded through the portal: «In Prüfung» (listed document) or «Hochgeladen» (extra),
 *   «Vorhanden» once the Case is past review and HYPOTEQ changed it after the upload
 * - on file at HYPOTEQ: «Vorhanden» — unless an upload of the same document already says so
 */
export function buildCaseDocs(p: CaseDocsInput): CaseDoc[] {
  const last = p.lastChange ? new Date(p.lastChange).getTime() : NaN;
  const checked = (at: Date) => p.pastReview && Number.isFinite(last) && last - at.getTime() > REVIEW_SLACK_MS;
  const doc = (key: string, state: CaseDoc["state"], status: DocStatus, person?: string | null): CaseDoc => ({
    key,
    name: p.label(key),
    state,
    status,
    category: docCategory(key),
    person: person ?? p.persons.get(key) ?? null,
    upload: null,
  });

  const latest = new Map<string, PortalUploadRow>();
  for (const u of p.uploads) if (u.docKey && !latest.has(u.docKey)) latest.set(u.docKey, u);
  const uploadedKeys = withLegacyKeys(Array.from(latest.keys()));

  const docs: CaseDoc[] = [
    // The checklist's German label when the key is not one the funnel texts know.
    ...p.rework.map((r) => {
      const d = doc(r.key, "fehlt", r.state, r.person);
      return d.name === r.key ? { ...d, name: r.label } : d;
    }),
    ...p.missing.map((key) => doc(key, "fehlt", "fehlt")),
    ...p.open.map((key) => ({ ...doc(key, "offen", "fehlt"), expected: true })),
    ...Array.from(latest.values()).map((u) => ({
      ...doc(u.docKey!, "vorhanden", checked(u.at) ? "vorhanden" : "pruefung"),
      upload: { at: u.at.toISOString(), fileName: u.fileName },
    })),
    ...p.uploads
      .filter((u) => !u.docKey)
      .map(
        (u): CaseDoc => ({
          key: null,
          name: p.otherLabel,
          state: "vorhanden",
          status: checked(u.at) ? "vorhanden" : "hochgeladen",
          category: "weitere",
          person: null,
          upload: { at: u.at.toISOString(), fileName: u.fileName },
          extra: true,
        })
      ),
    ...dedupePresent(p.present)
      .filter((d) => !d.keys.some((k) => uploadedKeys.has(k)))
      .map((d): CaseDoc => ({ key: null, name: d.name, state: "vorhanden", status: "vorhanden", category: docCategory(d.keys[0]), person: null, upload: null })),
  ];
  return docs.sort((a, b) => DOC_ORDER[a.status] - DOC_ORDER[b.status]);
}
