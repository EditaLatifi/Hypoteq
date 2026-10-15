import { describe, it, expect, afterEach } from "@jest/globals";
import {
  CASE_STATUSES,
  PORTAL_STATUSES,
  actionRequired,
  isRelabel,
  matchesFilter,
  normalizePortalStatus,
  portalStatus,
  statusDef,
  timeline,
  type DocStatus,
} from "@/lib/portal/status";

/** Partnerportal case status (handoff 14.10.2026, chapter 5; DECISIONS P2, P3, P20). */

describe("the handoff's status table", () => {
  const table: [string, string, number][] = [
    ["Neue Anfrage", "neutral", 0],
    ["Dokumente ausstehend", "warning", 1],
    ["Dokumente vollständig", "info", 2],
    ["In Prüfung", "info", 2],
    ["Bereit für Kreditgeber", "info", 3],
    ["Bei Kreditgeber", "info", 4],
    ["Rückmeldung erhalten", "accent", 5],
    ["Nachbearbeitung notwendig", "warning", 5],
    ["Finanzierung bestätigt", "success", 5],
    ["Abgeschlossen", "success", 7],
    ["Abgelehnt", "danger", -1],
    ["Storniert", "danger", -1],
  ];
  it.each(table)("%s → %s, step %i", (status, tone, step) => {
    expect(statusDef(status)).toMatchObject({ tone, step });
  });
  it("has exactly the twelve statuses, ranked in the handoff's order", () => {
    expect(CASE_STATUSES).toHaveLength(12);
    const ranks = CASE_STATUSES.map((s) => PORTAL_STATUSES[s].rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
  it("reads the statuses of before the handoff as their successors", () => {
    expect(statusDef("Pausiert").step).toBe(2);
    expect(statusDef("Nicht weiterverfolgt").tone).toBe("danger");
  });
});

describe("portalStatus — derived from Stage__c / Status", () => {
  const base = { stage: "Needs Analysis", sfStatus: "New" };
  it("a fresh Case is Neue Anfrage", () => {
    expect(portalStatus(base)).toBe("Neue Anfrage");
  });
  it("missing documents make it Dokumente ausstehend", () => {
    expect(portalStatus({ ...base, missingCount: 2 })).toBe("Dokumente ausstehend");
    expect(portalStatus({ ...base, docsComplete: false })).toBe("Dokumente ausstehend");
  });
  it("complete documents before HYPOTEQ starts: Dokumente vollständig", () => {
    expect(portalStatus({ ...base, docsComplete: true })).toBe("Dokumente vollständig");
  });
  it("HYPOTEQ working on it (In Bearbeitung, Qualifiziert, Escalated, On Hold): In Prüfung", () => {
    expect(portalStatus({ stage: "In Bearbeitung", sfStatus: "New" })).toBe("In Prüfung");
    expect(portalStatus({ ...base, sfStatus: "Qualifiziert", docsComplete: true })).toBe("In Prüfung");
    expect(portalStatus({ ...base, sfStatus: "Escalated" })).toBe("In Prüfung");
    expect(portalStatus({ ...base, sfStatus: "On Hold" })).toBe("In Prüfung");
  });
  it("Proposal is Bereit für Kreditgeber", () => {
    expect(portalStatus({ stage: "Proposal", sfStatus: "Qualifiziert" })).toBe("Bereit für Kreditgeber");
  });
  it("banks asked: Bei Kreditgeber; an offer: Rückmeldung erhalten", () => {
    expect(portalStatus({ ...base, banksRequested: "UBS;ZKB" })).toBe("Bei Kreditgeber");
    expect(portalStatus({ ...base, banksRequested: "UBS", offerDate: "2026-10-01" })).toBe("Rückmeldung erhalten");
  });
  it("a document asked for again at the lenders: Nachbearbeitung notwendig", () => {
    expect(portalStatus({ ...base, banksRequested: "UBS", missingCount: 1, reworkCount: 1 })).toBe("Nachbearbeitung notwendig");
    expect(portalStatus({ ...base, offerDate: "2026-10-01", missingCount: 1, reworkCount: 1 })).toBe("Nachbearbeitung notwendig");
    // Plain missing paper at the lenders does not move the Case back.
    expect(portalStatus({ ...base, banksRequested: "UBS", missingCount: 1 })).toBe("Bei Kreditgeber");
  });
  it("closed is Abgeschlossen, Verloren is Storniert even when closed", () => {
    expect(portalStatus({ ...base, sfStatus: "Closed" })).toBe("Abgeschlossen");
    expect(portalStatus({ ...base, isClosed: true, banksRequested: "UBS" })).toBe("Abgeschlossen");
    expect(portalStatus({ stage: "Verloren", sfStatus: "Closed", isClosed: true })).toBe("Storniert");
  });
});

describe("Portal_Status__c overrides the derivation (P2)", () => {
  it("wins whenever it holds one of the twelve statuses", () => {
    expect(portalStatus({ stage: "Verloren", isClosed: true, portalStatus: "Finanzierung bestätigt" })).toBe("Finanzierung bestätigt");
    expect(portalStatus({ stage: "Needs Analysis", missingCount: 3, portalStatus: "Abgelehnt" })).toBe("Abgelehnt");
  });
  it("is read however Salesforce spells it", () => {
    expect(normalizePortalStatus("Bereit fuer Kreditgeber")).toBe("Bereit für Kreditgeber");
    expect(normalizePortalStatus("  BEREIT FÜR KREDITGEBER ")).toBe("Bereit für Kreditgeber");
    expect(normalizePortalStatus("Dokumente_vollstaendig")).toBe("Dokumente vollständig");
    expect(normalizePortalStatus("Rueckmeldung erhalten")).toBe("Rückmeldung erhalten");
    expect(normalizePortalStatus("Pausiert")).toBe("In Prüfung");
  });
  it("is ignored when empty, missing or unknown — the derivation applies", () => {
    for (const v of [null, undefined, "", "  ", "Irgendwas", 42]) expect(normalizePortalStatus(v)).toBeNull();
    expect(portalStatus({ stage: "In Bearbeitung", portalStatus: "Irgendwas" })).toBe("In Prüfung");
    expect(portalStatus({ stage: "In Bearbeitung", portalStatus: null })).toBe("In Prüfung");
  });
});

describe("PORTAL_STAGE_MAP", () => {
  const before = process.env.PORTAL_STAGE_MAP;
  afterEach(() => {
    if (before === undefined) delete process.env.PORTAL_STAGE_MAP;
    else process.env.PORTAL_STAGE_MAP = before;
  });
  it("pins a stage, also with a status name from before the handoff", () => {
    process.env.PORTAL_STAGE_MAP = JSON.stringify({ "Bank angefragt": "Bei Kreditgeber", Verloren: "Abgelehnt", Alt: "Nicht weiterverfolgt" });
    expect(portalStatus({ stage: "bank angefragt" })).toBe("Bei Kreditgeber");
    expect(portalStatus({ stage: "Verloren" })).toBe("Abgelehnt");
    expect(portalStatus({ stage: "Alt" })).toBe("Storniert");
  });
  it("loses against Portal_Status__c", () => {
    process.env.PORTAL_STAGE_MAP = JSON.stringify({ Verloren: "Abgelehnt" });
    expect(portalStatus({ stage: "Verloren", portalStatus: "Storniert" })).toBe("Storniert");
  });
});

describe("timeline", () => {
  it("marks the steps before the current one done", () => {
    const tl = timeline("Bei Kreditgeber");
    expect(tl.current).toBe(4);
    expect(tl.steps.filter((s) => s.done).map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(tl.steps.find((s) => s.current)?.index).toBe(4);
    expect(tl.ended).toBe(false);
  });
  it("Neue Anfrage is on step 1 of 7 with nothing done", () => {
    const tl = timeline("Neue Anfrage");
    expect(tl.current).toBe(0);
    expect(tl.steps.some((s) => s.done)).toBe(false);
    expect(tl.steps).toHaveLength(7);
  });
  it("Abgeschlossen ticks all seven", () => {
    const tl = timeline("Abgeschlossen");
    expect(tl.allDone).toBe(true);
    expect(tl.steps.every((s) => s.done)).toBe(true);
  });
  it.each(["Abgelehnt", "Storniert"])("%s shows no progress, only the notice", (s) => {
    const tl = timeline(s);
    expect(tl.ended).toBe(true);
    expect(tl.steps.some((x) => x.done || x.current)).toBe(false);
  });
});

describe("«Aktion erforderlich»", () => {
  const docs = (...s: DocStatus[]) => s.map((status) => ({ status }));
  it.each<DocStatus>(["fehlt", "ungueltig", "neu"])("a document that is %s, on an open Case", (s) => {
    expect(actionRequired("In Prüfung", docs("vorhanden", s))).toBe(true);
  });
  it("not for documents on file, in review or uploaded", () => {
    expect(actionRequired("Dokumente ausstehend", docs("vorhanden", "pruefung", "hochgeladen"))).toBe(false);
    expect(actionRequired("Neue Anfrage", [])).toBe(false);
  });
  it.each(["Abgeschlossen", "Abgelehnt", "Storniert", "Nicht weiterverfolgt"])("never on a %s Case", (s) => {
    expect(actionRequired(s, docs("fehlt", "neu"))).toBe(false);
  });
});

describe("Case list filters", () => {
  it("In Bearbeitung: from complete documents to rework, not new requests", () => {
    for (const s of ["Dokumente vollständig", "In Prüfung", "Bereit für Kreditgeber", "Nachbearbeitung notwendig"]) expect(matchesFilter("In Bearbeitung", s, 0)).toBe(true);
    for (const s of ["Neue Anfrage", "Dokumente ausstehend", "Bei Kreditgeber"]) expect(matchesFilter("In Bearbeitung", s, 0)).toBe(false);
  });
  it("Bei Kreditgeber includes feedback and the confirmed financing", () => {
    for (const s of ["Bei Kreditgeber", "Rückmeldung erhalten", "Finanzierung bestätigt"]) expect(matchesFilter("Bei Kreditgeber", s, 0)).toBe(true);
  });
  it("Dokumente fehlen is the «Aktion erforderlich» rule", () => {
    expect(matchesFilter("Dokumente fehlen", "Neue Anfrage", 2)).toBe(true);
    expect(matchesFilter("Dokumente fehlen", "Dokumente ausstehend", 0)).toBe(false);
    expect(matchesFilter("Dokumente fehlen", "Storniert", 2)).toBe(false);
  });
  it("Offen and Abgeschlossen split the Cases", () => {
    for (const s of CASE_STATUSES) expect(matchesFilter("Offen", s, 0)).toBe(!matchesFilter("Abgeschlossen", s, 0));
    expect(matchesFilter("Abgeschlossen", "Abgelehnt", 0)).toBe(true);
  });
});

describe("isRelabel — a renamed state is not news", () => {
  it("covers the statuses of before the handoff", () => {
    expect(isRelabel("Pausiert", "In Prüfung")).toBe(true);
    expect(isRelabel("Nicht weiterverfolgt", "Storniert")).toBe(true);
    expect(isRelabel("In Prüfung", "Dokumente vollständig")).toBe(true);
  });
  it("leaves real moves alone", () => {
    expect(isRelabel("In Prüfung", "Bei Kreditgeber")).toBe(false);
    expect(isRelabel("Rückmeldung erhalten", "Finanzierung bestätigt")).toBe(false);
    expect(isRelabel("Dokumente vollständig", "In Prüfung")).toBe(false);
  });
});
