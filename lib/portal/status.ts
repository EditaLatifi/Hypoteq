/**
 * Portal status of a Case, as the partner sees it.
 *
 * The org has no portal-specific status field, so the status is derived from the fields
 * HYPOTEQ already maintains (values read from the org on 23.09.2026):
 *
 *   Stage__c   Needs Analysis | In Bearbeitung | Proposal (retired) | Verloren
 *   Status     New | Qualifiziert | On Hold | Escalated | Closed
 *   Welche_Banken_wurden_angefragt__c   filled once the dossier went to lenders
 *   Angebot_Datum__c                    set once a lender answered with an offer
 *   Documents_completed__c / funnel verdict   whether documents are still missing
 *
 * PORTAL_STAGE_MAP ({"<Stage__c>": "<portal status>"}) can pin a stage to a status
 * without a deploy, e.g. when HYPOTEQ adds a new stage value.
 */

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

type StatusDef = { tone: Tone; step: number; rank: number };

export const PORTAL_STATUSES: Record<string, StatusDef> = {
  "Neue Anfrage": { tone: "neutral", step: 0, rank: 0 },
  "Dokumente ausstehend": { tone: "warning", step: 1, rank: 1 },
  "In Prüfung": { tone: "info", step: 2, rank: 2 },
  "Bei Kreditgeber": { tone: "info", step: 4, rank: 3 },
  "Rückmeldung erhalten": { tone: "accent", step: 5, rank: 4 },
  Pausiert: { tone: "warning", step: 2, rank: 5 },
  Abgeschlossen: { tone: "success", step: 7, rank: 6 },
  "Nicht weiterverfolgt": { tone: "danger", step: -1, rank: 7 },
};

export const CLOSED_STATUSES = ["Abgeschlossen", "Nicht weiterverfolgt"];

export type StatusInput = {
  stage?: string | null;
  sfStatus?: string | null;
  isClosed?: boolean | null;
  banksRequested?: string | null;
  offerDate?: string | null;
  docsComplete?: boolean | null;
  missingCount?: number;
};

function stageOverride(stage: string | null | undefined): string | null {
  const raw = process.env.PORTAL_STAGE_MAP;
  if (!raw || !stage) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    const hit = Object.entries(map).find(([k]) => k.toLowerCase() === stage.trim().toLowerCase())?.[1];
    return hit && PORTAL_STATUSES[hit] ? hit : null;
  } catch {
    console.error("[portal] PORTAL_STAGE_MAP is not valid JSON; ignoring it");
    return null;
  }
}

export function portalStatus(p: StatusInput): string {
  const override = stageOverride(p.stage);
  if (override) return override;

  const stage = (p.stage || "").trim().toLowerCase();
  const status = (p.sfStatus || "").trim().toLowerCase();

  if (stage === "verloren") return "Nicht weiterverfolgt";
  if (p.isClosed || status === "closed") return "Abgeschlossen";
  if (p.offerDate) return "Rückmeldung erhalten";
  if (p.banksRequested && p.banksRequested.trim()) return "Bei Kreditgeber";
  if (status === "on hold") return "Pausiert";

  const docsMissing = (p.missingCount ?? 0) > 0 || p.docsComplete === false;
  if (docsMissing) return "Dokumente ausstehend";

  const inProgress = stage === "in bearbeitung" || stage === "proposal" || status === "qualifiziert" || status === "escalated";
  if (inProgress || p.docsComplete === true) return "In Prüfung";
  return "Neue Anfrage";
}

export function statusDef(status: string): StatusDef {
  return PORTAL_STATUSES[status] || { tone: "neutral", step: 0, rank: 99 };
}

export const CASE_FILTERS = ["Alle", "Offen", "Dokumente fehlen", "In Bearbeitung", "Bei Kreditgeber", "Abgeschlossen"] as const;
export type CaseFilter = (typeof CASE_FILTERS)[number];

export function matchesFilter(filter: CaseFilter, status: string, missingDocs: number): boolean {
  const closed = CLOSED_STATUSES.includes(status);
  switch (filter) {
    case "Alle":
      return true;
    case "Offen":
      return !closed;
    case "Dokumente fehlen":
      return !closed && (missingDocs > 0 || status === "Dokumente ausstehend");
    case "In Bearbeitung":
      return !closed && (status === "In Prüfung" || status === "Pausiert" || status === "Neue Anfrage");
    case "Bei Kreditgeber":
      return !closed && (status === "Bei Kreditgeber" || status === "Rückmeldung erhalten");
    case "Abgeschlossen":
      return closed;
  }
}
