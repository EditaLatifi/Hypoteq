/**
 * Portal status of a Case, as the partner sees it (HYPOTEQ answers of 19.10.2026, B18 / D.3).
 *
 * Pure: no Salesforce, no database — the tests drive it directly.
 *
 * Salesforce sets Case.Portal_Status__c itself (two flows, from the Case and its
 * Opportunity), with exactly the eleven values of CASE_STATUSES; the portal only reads it
 * (DECISIONS P2). The wording is HYPOTEQ's and is shown to the partner as it is.
 *
 * Older Cases the flows have not touched have the field empty. For them the status is still
 * derived from the fields HYPOTEQ maintains (values read from the org on 23.09.2026) and
 * mapped onto the same eleven values (DECISIONS P20):
 *
 *   Stage__c   Needs Analysis | In Bearbeitung | Proposal (retired) | Verloren
 *   Status     New | Qualifiziert | On Hold | Escalated | Closed
 *   Welche_Banken_wurden_angefragt__c   filled once the dossier went to lenders
 *   Angebot_Datum__c                    set once a lender answered with an offer
 *   Documents_completed__c / funnel verdict   whether documents are still missing
 *
 * PORTAL_STAGE_MAP ({"<Stage__c>": "<status>"}) can pin a stage to a status without a deploy.
 * «Verloren» is never shown: the derivation calls it «Anfrage zurückgezogen».
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

/** The values of Case.Portal_Status__c, exactly as the restricted picklist has them (D.3). */
export const CASE_STATUSES = [
  "Anfrage eingegangen",
  "Unterlagen fehlen noch",
  "Wir prüfen die Unterlagen",
  "Anfrage wird für die Bank vorbereitet",
  "Bei der Bank in Prüfung",
  "Angebot liegt vor",
  "Kleine Nacharbeit nötig",
  "Finanzierung bestätigt",
  "Abgeschlossen",
  "Leider abgelehnt",
  "Anfrage zurückgezogen",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** step: index into STEPS (0-based); STEPS.length = every step done; -1 = no timeline. */
type StatusDef = { tone: Tone; step: number; rank: number };

// D.3 counts the steps from 1: «Timeline 1» is STEPS[0].
export const PORTAL_STATUSES: Record<CaseStatus, StatusDef> = {
  "Anfrage eingegangen": { tone: "neutral", step: 0, rank: 0 },
  "Unterlagen fehlen noch": { tone: "warning", step: 1, rank: 1 },
  "Wir prüfen die Unterlagen": { tone: "info", step: 2, rank: 2 },
  "Anfrage wird für die Bank vorbereitet": { tone: "info", step: 3, rank: 3 },
  "Bei der Bank in Prüfung": { tone: "info", step: 4, rank: 4 },
  "Angebot liegt vor": { tone: "accent", step: 5, rank: 5 },
  "Kleine Nacharbeit nötig": { tone: "warning", step: 5, rank: 6 },
  "Finanzierung bestätigt": { tone: "success", step: 5, rank: 7 },
  Abgeschlossen: { tone: "success", step: STEPS.length, rank: 8 },
  "Leider abgelehnt": { tone: "danger", step: -1, rank: 9 },
  // Withdrawn is not a failure the partner has to act on (DECISIONS P31).
  "Anfrage zurückgezogen": { tone: "neutral", step: -1, rank: 10 },
};

export const CLOSED_STATUSES: string[] = ["Abgeschlossen", "Leider abgelehnt", "Anfrage zurückgezogen"];
/** Ended without a financing: the timeline gives way to a notice. */
export const ENDED_STATUSES: string[] = ["Leider abgelehnt", "Anfrage zurückgezogen"];

/**
 * What the portal showed before Portal_Status__c, and the value that stands for the same
 * state now. Stored notifications and the notification baseline (PortalCaseSeen) still name
 * them, and PORTAL_STAGE_MAP may still say them.
 */
export const LEGACY_STATUSES: Record<string, CaseStatus> = {
  "Neue Anfrage": "Anfrage eingegangen",
  "Dokumente ausstehend": "Unterlagen fehlen noch",
  "Dokumente vollständig": "Wir prüfen die Unterlagen",
  "In Prüfung": "Wir prüfen die Unterlagen",
  "Bereit für Kreditgeber": "Anfrage wird für die Bank vorbereitet",
  "Bei Kreditgeber": "Bei der Bank in Prüfung",
  "Rückmeldung erhalten": "Angebot liegt vor",
  "Nachbearbeitung notwendig": "Kleine Nacharbeit nötig",
  Abgelehnt: "Leider abgelehnt",
  Storniert: "Anfrage zurückgezogen",
  // Before the handoff of 14.10.2026.
  Pausiert: "Wir prüfen die Unterlagen",
  "Nicht weiterverfolgt": "Anfrage zurückgezogen",
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
// "Kleine Nacharbeit noetig", "KLEINE NACHARBEIT NÖTIG" and "Kleine_Nacharbeit_nötig" all match.
function canon(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

const BY_CANON = new Map<string, CaseStatus>([
  ...CASE_STATUSES.map((s) => [canon(s), s] as [string, CaseStatus]),
  ...Object.entries(LEGACY_STATUSES).map(([k, v]) => [canon(k), v] as [string, CaseStatus]),
]);

/** One of the eleven statuses, written however Salesforce or an env value spells it; else null. */
export function normalizePortalStatus(raw: unknown): CaseStatus | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return BY_CANON.get(canon(raw)) ?? null;
}

/** Whether the value is one of the eleven (not a legacy name). */
export function isCaseStatus(v: unknown): v is CaseStatus {
  return typeof v === "string" && (CASE_STATUSES as readonly string[]).includes(v);
}

// A picklist value the portal does not know (HYPOTEQ added one) is logged once per instance;
// the Case then falls back to the derivation instead of showing an unknown badge.
const warnedUnknown = new Set<string>();

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

/** Whether Salesforce has set Case.Portal_Status__c to a value the portal knows. */
export function hasPortalStatus(raw: unknown): boolean {
  return normalizePortalStatus(raw) !== null;
}

export function portalStatus(p: StatusInput): CaseStatus {
  const pinned = normalizePortalStatus(p.portalStatus);
  if (pinned) return pinned;
  if (typeof p.portalStatus === "string" && p.portalStatus.trim() && !warnedUnknown.has(p.portalStatus)) {
    warnedUnknown.add(p.portalStatus);
    console.warn(`[portal] unknown Portal_Status__c value «${p.portalStatus}»; deriving the status instead`);
  }
  const override = stageOverride(p.stage);
  if (override) return override;

  const stage = (p.stage || "").trim().toLowerCase();
  const status = (p.sfStatus || "").trim().toLowerCase();
  const rework = (p.reworkCount ?? 0) > 0;

  // The org keeps no loss reason, so a lost Case is withdrawn, never «Verloren».
  if (stage === "verloren") return "Anfrage zurückgezogen";
  if (p.isClosed || status === "closed") return "Abgeschlossen";
  // At the lenders, a document HYPOTEQ asks for again sends the Case back to the partner.
  if (p.offerDate) return rework ? "Kleine Nacharbeit nötig" : "Angebot liegt vor";
  if (p.banksRequested && p.banksRequested.trim()) return rework ? "Kleine Nacharbeit nötig" : "Bei der Bank in Prüfung";

  const docsMissing = (p.missingCount ?? 0) > 0 || p.docsComplete === false;
  if (docsMissing) return "Unterlagen fehlen noch";
  if (stage === "proposal") return "Anfrage wird für die Bank vorbereitet";

  // HYPOTEQ is working on it, or has everything to start. On Hold is a pause inside that
  // work; the Case page says so.
  const inProgress = stage === "in bearbeitung" || status === "qualifiziert" || status === "escalated" || status === "on hold";
  if (inProgress || p.docsComplete === true) return "Wir prüfen die Unterlagen";
  return "Anfrage eingegangen";
}

/** The current name of a status, also for a legacy one; the value itself when unknown. */
export function currentStatus(status: string): string {
  return isCaseStatus(status) ? status : LEGACY_STATUSES[status] || normalizePortalStatus(status) || status;
}

export function statusDef(status: string): StatusDef {
  const s = currentStatus(status);
  return (PORTAL_STATUSES as Record<string, StatusDef>)[s] || { tone: "neutral", step: 0, rank: 99 };
}

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.includes(currentStatus(status));
}

export function isEndedStatus(status: string): boolean {
  return ENDED_STATUSES.includes(currentStatus(status));
}

// ---------------------------------------------------------------------------
// Timeline «Bearbeitungsstand»
// ---------------------------------------------------------------------------

export type TimelineStep = { index: number; done: boolean; current: boolean };
export type Timeline = { ended: boolean; allDone: boolean; current: number; steps: TimelineStep[] };

/**
 * The seven steps for a status: the value's step is the active one, the ones before it are
 * done. Abgeschlossen ticks all of them; Leider abgelehnt and Anfrage zurückgezogen show
 * none (`ended`) — the page shows a notice instead.
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
 * Case.Partner_Action_Required__c as the portal read it. `managed`: Salesforce's flows look
 * after this Case (it has a Portal_Status__c), so an unticked box means «nothing to do» —
 * on an older Case an unticked box only means the flow never ran.
 */
export type ActionFlag = { value: boolean | null | undefined; managed: boolean };

/**
 * «Aktion erforderlich», never on an Abgeschlossen, Leider abgelehnt or Anfrage zurückgezogen
 * Case. Partner_Action_Required__c decides where Salesforce sets it (B25 / D.3): ticked =
 * action, unticked on a Case the flows manage = none. Otherwise (field not in the org, Case
 * the flows never touched) the document rule of the handoff: a document is Fehlt, Ungültig
 * or Neu erforderlich.
 */
export function actionRequired(status: string, docs: { status: DocStatus }[], flag?: ActionFlag | null): boolean {
  if (isClosedStatus(status)) return false;
  if (flag?.value === true) return true;
  if (flag && flag.value === false && flag.managed) return false;
  return docs.some((d) => needsDocument(d.status));
}

// ---------------------------------------------------------------------------
// Case list filters (also the dashboard KPI tiles)
// ---------------------------------------------------------------------------

export const CASE_FILTERS = ["Alle", "Offen", "Dokumente fehlen", "In Bearbeitung", "Bei Kreditgeber", "Abgeschlossen"] as const;
export type CaseFilter = (typeof CASE_FILTERS)[number];

export function parseFilter(raw: unknown): CaseFilter {
  return (CASE_FILTERS as readonly string[]).includes(raw as string) ? (raw as CaseFilter) : "Alle";
}

const IN_PROGRESS: string[] = ["Wir prüfen die Unterlagen", "Anfrage wird für die Bank vorbereitet", "Kleine Nacharbeit nötig"];
const AT_LENDER: string[] = ["Bei der Bank in Prüfung", "Angebot liegt vor", "Finanzierung bestätigt"];

export type FilterCase = {
  status: string;
  /** Documents that are Fehlt, Ungültig or Neu erforderlich. */
  needCount: number;
  /** The Case's «Aktion erforderlich»; without it, `needCount > 0` stands in. */
  actionRequired?: boolean;
};

export function matchesFilter(filter: CaseFilter, c: FilterCase): boolean {
  const status = currentStatus(c.status);
  const closed = isClosedStatus(status);
  switch (filter) {
    case "Alle":
      return true;
    case "Offen":
      return !closed;
    case "Dokumente fehlen":
      return !closed && ((c.actionRequired ?? c.needCount > 0) || status === "Unterlagen fehlen noch");
    case "In Bearbeitung":
      return IN_PROGRESS.includes(status);
    case "Bei Kreditgeber":
      return AT_LENDER.includes(status);
    case "Abgeschlossen":
      // Only a finished financing. A withdrawn or rejected request is closed too, but counting
      // it here contradicted «Finanziert»; it stays under «Alle» (DECISIONS P35).
      return status === "Abgeschlossen";
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Whether a status change only renames the state. The notification baseline (PortalCaseSeen)
 * of every Case still holds a name from before Portal_Status__c; the first sync after the
 * switch sees a new name for each of them — from the new wording, and from HYPOTEQ's flows
 * judging the Case themselves. That first change updates what the portal remembers but sends
 * no notification, or every partner would get one per Case on release day (DECISIONS P20).
 */
export function isRelabel(prev: string, next: string): boolean {
  return prev !== next && !isCaseStatus(prev) && prev in LEGACY_STATUSES;
}
