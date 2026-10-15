/**
 * Portal status of a Case, as the partner sees it (handoff 14.10.2026, chapter 5).
 *
 * Pure: no Salesforce, no database — the tests drive it directly.
 *
 * The twelve statuses of the handoff are derived from the fields HYPOTEQ already maintains
 * (values read from the org on 23.09.2026):
 *
 *   Stage__c   Needs Analysis | In Bearbeitung | Proposal (retired) | Verloren
 *   Status     New | Qualifiziert | On Hold | Escalated | Closed
 *   Welche_Banken_wurden_angefragt__c   filled once the dossier went to lenders
 *   Angebot_Datum__c                    set once a lender answered with an offer
 *   Documents_completed__c / funnel verdict   whether documents are still missing
 *
 * Case.Portal_Status__c, once HYPOTEQ creates it, wins over the derivation whenever it holds
 * one of the twelve statuses (DECISIONS P2). PORTAL_STAGE_MAP ({"<Stage__c>": "<status>"})
 * can pin a stage to a status without a deploy, e.g. when HYPOTEQ adds a stage value.
 * The derivation itself is DECISIONS P7.
 */

/** German step labels; the shown labels (with soft hyphens) are in the dictionary `steps`. */
export const STEPS = [
  "Anfrage eingegangen",
  "Dokumente werden geprüft",
  "Unterlagen vollständig",
  "Finanzierungsanfrage vorbereitet",
  "An Kreditgeber übermittelt",
  "Rückmeldung erhalten",
  "Finanzierung abgeschlossen",
] as const;

export type Tone = "neutral" | "warning" | "info" | "accent" | "success" | "danger";

export const CASE_STATUSES = [
  "Neue Anfrage",
  "Dokumente ausstehend",
  "Dokumente vollständig",
  "In Prüfung",
  "Bereit für Kreditgeber",
  "Bei Kreditgeber",
  "Rückmeldung erhalten",
  "Nachbearbeitung notwendig",
  "Finanzierung bestätigt",
  "Abgeschlossen",
  "Abgelehnt",
  "Storniert",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** step: index into STEPS (0-based); STEPS.length = every step done; -1 = no timeline. */
type StatusDef = { tone: Tone; step: number; rank: number };

export const PORTAL_STATUSES: Record<CaseStatus, StatusDef> = {
  "Neue Anfrage": { tone: "neutral", step: 0, rank: 0 },
  "Dokumente ausstehend": { tone: "warning", step: 1, rank: 1 },
  "Dokumente vollständig": { tone: "info", step: 2, rank: 2 },
  "In Prüfung": { tone: "info", step: 2, rank: 3 },
  "Bereit für Kreditgeber": { tone: "info", step: 3, rank: 4 },
  "Bei Kreditgeber": { tone: "info", step: 4, rank: 5 },
  "Rückmeldung erhalten": { tone: "accent", step: 5, rank: 6 },
  "Nachbearbeitung notwendig": { tone: "warning", step: 5, rank: 7 },
  "Finanzierung bestätigt": { tone: "success", step: 5, rank: 8 },
  Abgeschlossen: { tone: "success", step: STEPS.length, rank: 9 },
  Abgelehnt: { tone: "danger", step: -1, rank: 10 },
  Storniert: { tone: "danger", step: -1, rank: 11 },
};

export const CLOSED_STATUSES: string[] = ["Abgeschlossen", "Abgelehnt", "Storniert"];
/** Ended without a financing: the timeline gives way to a notice. */
export const ENDED_STATUSES: string[] = ["Abgelehnt", "Storniert"];

/**
 * What the portal showed before the handoff. Old notifications still name them, and an
 * env value (PORTAL_STAGE_MAP) or a Portal_Status__c may still say them.
 */
const LEGACY_ALIASES: Record<string, CaseStatus> = {
  Pausiert: "In Prüfung",
  "Nicht weiterverfolgt": "Storniert",
};

export type StatusInput = {
  stage?: string | null;
  sfStatus?: string | null;
  isClosed?: boolean | null;
  banksRequested?: string | null;
  offerDate?: string | null;
  docsComplete?: boolean | null;
  /** Documents confirmed missing (Fehlt, Neu erforderlich, Ungültig). */
  missingCount?: number;
  /** Of those, the documents HYPOTEQ asks for again (Neu erforderlich, Ungültig). */
  reworkCount?: number;
  /** Case.Portal_Status__c, when the org has the field. */
  portalStatus?: string | null;
};

// Lower case, no accents, umlauts spelled out the same way on both sides, letters only:
// "Dokumente_vollstaendig", "BEREIT FÜR KREDITGEBER" and "Bereit fuer Kreditgeber" all match.
function canon(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

const BY_CANON = new Map<string, CaseStatus>([
  ...CASE_STATUSES.map((s) => [canon(s), s] as [string, CaseStatus]),
  ...Object.entries(LEGACY_ALIASES).map(([k, v]) => [canon(k), v] as [string, CaseStatus]),
]);

/** One of the twelve statuses, written however Salesforce or an env value spells it; else null. */
export function normalizePortalStatus(raw: unknown): CaseStatus | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return BY_CANON.get(canon(raw)) ?? null;
}

function stageOverride(stage: string | null | undefined): CaseStatus | null {
  const raw = process.env.PORTAL_STAGE_MAP;
  if (!raw || !stage) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    const hit = Object.entries(map).find(([k]) => k.toLowerCase() === stage.trim().toLowerCase())?.[1];
    return normalizePortalStatus(hit);
  } catch {
    console.error("[portal] PORTAL_STAGE_MAP is not valid JSON; ignoring it");
    return null;
  }
}

export function portalStatus(p: StatusInput): CaseStatus {
  const pinned = normalizePortalStatus(p.portalStatus);
  if (pinned) return pinned;
  const override = stageOverride(p.stage);
  if (override) return override;

  const stage = (p.stage || "").trim().toLowerCase();
  const status = (p.sfStatus || "").trim().toLowerCase();
  const rework = (p.reworkCount ?? 0) > 0;

  if (stage === "verloren") return "Storniert";
  if (p.isClosed || status === "closed") return "Abgeschlossen";
  // At the lenders, a document HYPOTEQ asks for again sends the Case back to the partner.
  if (p.offerDate) return rework ? "Nachbearbeitung notwendig" : "Rückmeldung erhalten";
  if (p.banksRequested && p.banksRequested.trim()) return rework ? "Nachbearbeitung notwendig" : "Bei Kreditgeber";

  const docsMissing = (p.missingCount ?? 0) > 0 || p.docsComplete === false;
  if (docsMissing) return "Dokumente ausstehend";
  if (stage === "proposal") return "Bereit für Kreditgeber";

  // HYPOTEQ is working on it. On Hold is a pause inside that work; the Case page says so.
  const inProgress = stage === "in bearbeitung" || status === "qualifiziert" || status === "escalated" || status === "on hold";
  if (inProgress) return "In Prüfung";
  if (p.docsComplete === true) return "Dokumente vollständig";
  return "Neue Anfrage";
}

export function statusDef(status: string): StatusDef {
  const s = (PORTAL_STATUSES as Record<string, StatusDef>)[status] ? status : LEGACY_ALIASES[status];
  return (s && (PORTAL_STATUSES as Record<string, StatusDef>)[s]) || { tone: "neutral", step: 0, rank: 99 };
}

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.includes(status) || CLOSED_STATUSES.includes(LEGACY_ALIASES[status] || "");
}

// ---------------------------------------------------------------------------
// Timeline «Bearbeitungsstand»
// ---------------------------------------------------------------------------

export type TimelineStep = { index: number; done: boolean; current: boolean };
export type Timeline = { ended: boolean; allDone: boolean; current: number; steps: TimelineStep[] };

/**
 * The seven steps for a status. Abgeschlossen ticks all of them; Abgelehnt and Storniert
 * show none (`ended`) — the page shows a notice instead.
 */
export function timeline(status: string): Timeline {
  const step = statusDef(status).step;
  const ended = step < 0;
  const current = ended ? -1 : Math.min(step, STEPS.length);
  return {
    ended,
    allDone: current >= STEPS.length,
    current,
    steps: STEPS.map((_, index) => ({ index, done: !ended && index < current, current: !ended && index === current })),
  };
}

// ---------------------------------------------------------------------------
// Documents (handoff 5, DECISIONS P3)
// ---------------------------------------------------------------------------

export type DocStatus = "vorhanden" | "fehlt" | "pruefung" | "ungueltig" | "neu" | "hochgeladen";

export const DOC_TONES: Record<DocStatus, Tone> = {
  vorhanden: "success",
  fehlt: "danger",
  pruefung: "info",
  ungueltig: "danger",
  neu: "warning",
  hochgeladen: "accent",
};

/** Statuses that ask something of the partner. */
export const NEED_DOC_STATUSES: DocStatus[] = ["fehlt", "ungueltig", "neu"];

export function needsDocument(status: DocStatus): boolean {
  return NEED_DOC_STATUSES.includes(status);
}

/**
 * «Aktion erforderlich»: a document is Fehlt, Ungültig or Neu erforderlich, and the Case is
 * not Abgeschlossen, Abgelehnt or Storniert.
 */
export function actionRequired(status: string, docs: { status: DocStatus }[]): boolean {
  return !isClosedStatus(status) && docs.some((d) => needsDocument(d.status));
}

// ---------------------------------------------------------------------------
// Case list filters (also the dashboard KPI tiles)
// ---------------------------------------------------------------------------

export const CASE_FILTERS = ["Alle", "Offen", "Dokumente fehlen", "In Bearbeitung", "Bei Kreditgeber", "Abgeschlossen"] as const;
export type CaseFilter = (typeof CASE_FILTERS)[number];

export function parseFilter(raw: unknown): CaseFilter {
  return (CASE_FILTERS as readonly string[]).includes(raw as string) ? (raw as CaseFilter) : "Alle";
}

const IN_PROGRESS: string[] = ["Dokumente vollständig", "In Prüfung", "Bereit für Kreditgeber", "Nachbearbeitung notwendig"];
const AT_LENDER: string[] = ["Bei Kreditgeber", "Rückmeldung erhalten", "Finanzierung bestätigt"];

/** `needCount`: documents that are Fehlt, Ungültig or Neu erforderlich. */
export function matchesFilter(filter: CaseFilter, status: string, needCount: number): boolean {
  const closed = isClosedStatus(status);
  switch (filter) {
    case "Alle":
      return true;
    case "Offen":
      return !closed;
    case "Dokumente fehlen":
      return !closed && needCount > 0;
    case "In Bearbeitung":
      return IN_PROGRESS.includes(status);
    case "Bei Kreditgeber":
      return AT_LENDER.includes(status);
    case "Abgeschlossen":
      return closed;
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

// The statuses the portal showed before the handoff, and what the same Case shows now.
// Moving between them is a new name for the same state, not news.
const RELABELLED: [string, string][] = [
  ["Pausiert", "In Prüfung"],
  ["Pausiert", "Dokumente ausstehend"],
  ["Nicht weiterverfolgt", "Storniert"],
  ["Nicht weiterverfolgt", "Abgelehnt"],
  ["In Prüfung", "Dokumente vollständig"],
];

/**
 * Whether a status change only renames the state (e.g. the first sync after this release
 * sees «Pausiert» become «In Prüfung»). Such a change updates what the portal remembers but
 * sends no notification — otherwise every partner would get an e-mail per Case on release day.
 */
export function isRelabel(prev: string, next: string): boolean {
  return RELABELLED.some(([a, b]) => a === prev && b === next);
}
