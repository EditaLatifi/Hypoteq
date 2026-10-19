import { describe, it, expect, afterEach, jest } from "@jest/globals";
import {
  CASE_STATUSES,
  LEGACY_STATUSES,
  PORTAL_STATUSES,
  actionRequired,
  currentStatus,
  hasPortalStatus,
  isClosedStatus,
  isRelabel,
  matchesFilter,
  normalizePortalStatus,
  portalStatus,
  statusDef,
  timeline,
  type DocStatus,
} from "@/lib/portal/status";

/** Partnerportal case status (HYPOTEQ 19.10.2026 B18 / D.3; DECISIONS P2, P3, P20, P31). */

describe("Portal_Status__c: the eleven values of D.3", () => {
  // [value, tone, step (0-based; 7 = all done, -1 = notice)]
  const table: [string, string, number][] = [
    ["Anfrage eingegangen", "neutral", 0],
    ["Unterlagen fehlen noch", "warning", 1],
    ["Wir prüfen die Unterlagen", "info", 2],
    ["Anfrage wird für die Bank vorbereitet", "info", 3],
    ["Bei der Bank in Prüfung", "info", 4],
    ["Angebot liegt vor", "accent", 5],
    ["Kleine Nacharbeit nötig", "warning", 5],
    ["Finanzierung bestätigt", "success", 5],
    ["Abgeschlossen", "success", 7],
    ["Leider abgelehnt", "danger", -1],
    ["Anfrage zurückgezogen", "neutral", -1],
  ];
  it.each(table)("%s → %s, step %i", (status, tone, step) => {
    expect(statusDef(status)).toMatchObject({ tone, step });
  });
  it("has exactly the eleven values, ranked in D.3's order", () => {
    expect(CASE_STATUSES).toHaveLength(11);
    expect(CASE_STATUSES).toEqual(table.map(([s]) => s));
    const ranks = CASE_STATUSES.map((s) => PORTAL_STATUSES[s].rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
  it("never knows «Verloren»", () => {
    expect(normalizePortalStatus("Verloren")).toBeNull();
    expect(CASE_STATUSES as readonly string[]).not.toContain("Verloren");
  });
  it("reads every older status as the value that replaced it", () => {
    for (const [old, now] of Object.entries(LEGACY_STATUSES)) {
      expect(currentStatus(old)).toBe(now);
      expect(statusDef(old)).toEqual(statusDef(now));
    }
    expect(currentStatus("Storniert")).toBe("Anfrage zurückgezogen");
    expect(statusDef("Pausiert").step).toBe(2);
    expect(isClosedStatus("Nicht weiterverfolgt")).toBe(true);
  });
});

describe("Portal_Status__c wins over the derivation (P2)", () => {
  it("whenever it holds one of the eleven values", () => {
    expect(portalStatus({ stage: "Verloren", isClosed: true, portalStatus: "Finanzierung bestätigt" })).toBe("Finanzierung bestätigt");
    expect(portalStatus({ stage: "Needs Analysis", missingCount: 3, portalStatus: "Leider abgelehnt" })).toBe("Leider abgelehnt");
    expect(portalStatus({ stage: "Needs Analysis", portalStatus: "Kleine Nacharbeit nötig" })).toBe("Kleine Nacharbeit nötig");
  });
  it("is read however Salesforce spells it", () => {
    expect(normalizePortalStatus("Kleine Nacharbeit noetig")).toBe("Kleine Nacharbeit nötig");
    expect(normalizePortalStatus("  BEI DER BANK IN PRÜFUNG ")).toBe("Bei der Bank in Prüfung");
    expect(normalizePortalStatus("Anfrage_zurueckgezogen")).toBe("Anfrage zurückgezogen");
    expect(hasPortalStatus("Angebot liegt vor")).toBe(true);
    expect(hasPortalStatus("")).toBe(false);
  });
  it("is ignored when empty, missing or unknown — the derivation applies", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    for (const v of [null, undefined, "", "  ", 42]) expect(normalizePortalStatus(v)).toBeNull();
    expect(portalStatus({ stage: "In Bearbeitung", portalStatus: "Irgendwas Neues" })).toBe("Wir prüfen die Unterlagen");
    expect(portalStatus({ stage: "In Bearbeitung", portalStatus: null })).toBe("Wir prüfen die Unterlagen");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("fallback for Cases without Portal_Status__c — derived and mapped onto the eleven", () => {
  const base = { stage: "Needs Analysis", sfStatus: "New" };
  it("a fresh Case is Anfrage eingegangen", () => {
    expect(portalStatus(base)).toBe("Anfrage eingegangen");
  });
  it("missing documents: Unterlagen fehlen noch", () => {
    expect(portalStatus({ ...base, missingCount: 2 })).toBe("Unterlagen fehlen noch");
    expect(portalStatus({ ...base, docsComplete: false })).toBe("Unterlagen fehlen noch");
  });
  it("complete documents or HYPOTEQ at work (In Bearbeitung, Qualifiziert, Escalated, On Hold): Wir prüfen die Unterlagen", () => {
    expect(portalStatus({ ...base, docsComplete: true })).toBe("Wir prüfen die Unterlagen");
    expect(portalStatus({ stage: "In Bearbeitung", sfStatus: "New" })).toBe("Wir prüfen die Unterlagen");
    expect(portalStatus({ ...base, sfStatus: "Qualifiziert", docsComplete: true })).toBe("Wir prüfen die Unterlagen");
    expect(portalStatus({ ...base, sfStatus: "Escalated" })).toBe("Wir prüfen die Unterlagen");
    expect(portalStatus({ ...base, sfStatus: "On Hold" })).toBe("Wir prüfen die Unterlagen");
  });
  it("Proposal: Anfrage wird für die Bank vorbereitet", () => {
    expect(portalStatus({ stage: "Proposal", sfStatus: "Qualifiziert" })).toBe("Anfrage wird für die Bank vorbereitet");
  });
  it("banks asked: Bei der Bank in Prüfung; an offer: Angebot liegt vor", () => {
    expect(portalStatus({ ...base, banksRequested: "UBS;ZKB" })).toBe("Bei der Bank in Prüfung");
    expect(portalStatus({ ...base, banksRequested: "UBS", offerDate: "2026-10-01" })).toBe("Angebot liegt vor");
  });
  it("a document asked for again at the lenders: Kleine Nacharbeit nötig", () => {
    expect(portalStatus({ ...base, banksRequested: "UBS", missingCount: 1, reworkCount: 1 })).toBe("Kleine Nacharbeit nötig");
    expect(portalStatus({ ...base, offerDate: "2026-10-01", missingCount: 1, reworkCount: 1 })).toBe("Kleine Nacharbeit nötig");
    // Plain missing paper at the lenders does not move the Case back.
    expect(portalStatus({ ...base, banksRequested: "UBS", missingCount: 1 })).toBe("Bei der Bank in Prüfung");
  });
  it("closed is Abgeschlossen; Verloren is Anfrage zurückgezogen, even when closed", () => {
    expect(portalStatus({ ...base, sfStatus: "Closed" })).toBe("Abgeschlossen");
    expect(portalStatus({ ...base, isClosed: true, banksRequested: "UBS" })).toBe("Abgeschlossen");
    expect(portalStatus({ stage: "Verloren", sfStatus: "Closed", isClosed: true })).toBe("Anfrage zurückgezogen");
  });
  it("only ever returns one of the eleven", () => {
    const inputs = [base, { stage: "Verloren" }, { stage: "Proposal" }, { sfStatus: "Closed" }, { banksRequested: "UBS" }, { offerDate: "x", reworkCount: 1 }];
    for (const p of inputs) expect(CASE_STATUSES as readonly string[]).toContain(portalStatus(p));
  });
});

describe("PORTAL_STAGE_MAP", () => {
  const before = process.env.PORTAL_STAGE_MAP;
  afterEach(() => {
    if (before === undefined) delete process.env.PORTAL_STAGE_MAP;
    else process.env.PORTAL_STAGE_MAP = before;
  });
  it("pins a stage, also with an older status name", () => {
    process.env.PORTAL_STAGE_MAP = JSON.stringify({ "Bank angefragt": "Bei der Bank in Prüfung", Verloren: "Leider abgelehnt", Alt: "Bei Kreditgeber" });
    expect(portalStatus({ stage: "bank angefragt" })).toBe("Bei der Bank in Prüfung");
    expect(portalStatus({ stage: "Verloren" })).toBe("Leider abgelehnt");
    expect(portalStatus({ stage: "Alt" })).toBe("Bei der Bank in Prüfung");
  });
  it("loses against Portal_Status__c", () => {
    process.env.PORTAL_STAGE_MAP = JSON.stringify({ Verloren: "Leider abgelehnt" });
    expect(portalStatus({ stage: "Verloren", portalStatus: "Anfrage zurückgezogen" })).toBe("Anfrage zurückgezogen");
  });
});

describe("timeline: value step n = n-th step active", () => {
  it("marks the steps before the current one done", () => {
    const tl = timeline("Bei der Bank in Prüfung");
    expect(tl.current).toBe(4);
    expect(tl.steps.filter((s) => s.done).map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(tl.steps.find((s) => s.current)?.index).toBe(4);
    expect(tl.ended).toBe(false);
  });
  it("Anfrage eingegangen is on step 1 of 7 with nothing done", () => {
    const tl = timeline("Anfrage eingegangen");
    expect(tl.current).toBe(0);
    expect(tl.steps.some((s) => s.done)).toBe(false);
    expect(tl.steps).toHaveLength(7);
  });
  it.each(["Angebot liegt vor", "Kleine Nacharbeit nötig", "Finanzierung bestätigt"])("%s is on step 6", (s) => {
    expect(timeline(s).current).toBe(5);
  });
  it("Abgeschlossen ticks all seven", () => {
    const tl = timeline("Abgeschlossen");
    expect(tl.allDone).toBe(true);
    expect(tl.steps.every((s) => s.done)).toBe(true);
  });
  it.each(["Leider abgelehnt", "Anfrage zurückgezogen"])("%s shows no progress, only the notice", (s) => {
    const tl = timeline(s);
    expect(tl.ended).toBe(true);
    expect(tl.steps.some((x) => x.done || x.current)).toBe(false);
  });
});

describe("«Aktion erforderlich»", () => {
  const docs = (...s: DocStatus[]) => s.map((status) => ({ status }));
  it.each<DocStatus>(["fehlt", "ungueltig", "neu"])("without the flag: a document that is %s, on an open Case", (s) => {
    expect(actionRequired("Wir prüfen die Unterlagen", docs("vorhanden", s))).toBe(true);
  });
  it("not for documents on file, in review or uploaded", () => {
    expect(actionRequired("Unterlagen fehlen noch", docs("vorhanden", "pruefung", "hochgeladen"))).toBe(false);
    expect(actionRequired("Anfrage eingegangen", [])).toBe(false);
  });
  it.each(["Abgeschlossen", "Leider abgelehnt", "Anfrage zurückgezogen", "Nicht weiterverfolgt"])("never on a %s Case", (s) => {
    expect(actionRequired(s, docs("fehlt", "neu"))).toBe(false);
    expect(actionRequired(s, [], { value: true, managed: true })).toBe(false);
  });
  it("Partner_Action_Required__c ticked: action, whatever the documents say", () => {
    expect(actionRequired("Unterlagen fehlen noch", [], { value: true, managed: true })).toBe(true);
    expect(actionRequired("Anfrage eingegangen", docs("vorhanden"), { value: true, managed: false })).toBe(true);
  });
  it("unticked on a Case the flows manage: no action, even with a document the portal lists", () => {
    expect(actionRequired("Wir prüfen die Unterlagen", docs("fehlt"), { value: false, managed: true })).toBe(false);
  });
  it("unticked on an older Case (no Portal_Status__c), or unreadable: the document rule", () => {
    expect(actionRequired("Wir prüfen die Unterlagen", docs("fehlt"), { value: false, managed: false })).toBe(true);
    expect(actionRequired("Wir prüfen die Unterlagen", docs("fehlt"), { value: null, managed: true })).toBe(true);
    expect(actionRequired("Wir prüfen die Unterlagen", docs("vorhanden"), null)).toBe(false);
  });
});

describe("Case list filters and KPI tiles", () => {
  const c = (status: string, needCount = 0, action?: boolean) => ({ status, needCount, actionRequired: action });
  it("In Bearbeitung: HYPOTEQ checking, preparing for the bank, small rework", () => {
    for (const s of ["Wir prüfen die Unterlagen", "Anfrage wird für die Bank vorbereitet", "Kleine Nacharbeit nötig"]) expect(matchesFilter("In Bearbeitung", c(s))).toBe(true);
    for (const s of ["Anfrage eingegangen", "Unterlagen fehlen noch", "Bei der Bank in Prüfung"]) expect(matchesFilter("In Bearbeitung", c(s))).toBe(false);
  });
  it("Bei Kreditgeber: at the bank, the offer and the confirmed financing", () => {
    for (const s of ["Bei der Bank in Prüfung", "Angebot liegt vor", "Finanzierung bestätigt"]) expect(matchesFilter("Bei Kreditgeber", c(s))).toBe(true);
    expect(matchesFilter("Bei Kreditgeber", c("Abgeschlossen"))).toBe(false);
  });
  it("Dokumente fehlen: «Aktion erforderlich», or Salesforce saying Unterlagen fehlen noch", () => {
    expect(matchesFilter("Dokumente fehlen", c("Anfrage eingegangen", 2))).toBe(true);
    expect(matchesFilter("Dokumente fehlen", c("Wir prüfen die Unterlagen", 0, true))).toBe(true);
    expect(matchesFilter("Dokumente fehlen", c("Wir prüfen die Unterlagen", 2, false))).toBe(false);
    expect(matchesFilter("Dokumente fehlen", c("Unterlagen fehlen noch", 0, false))).toBe(true);
    expect(matchesFilter("Dokumente fehlen", c("Anfrage zurückgezogen", 2, true))).toBe(false);
  });
  it("Abgeschlossen is only a finished financing; withdrawn and rejected ones are neither open nor Abgeschlossen (P35)", () => {
    for (const s of CASE_STATUSES) expect(matchesFilter("Offen", c(s)) && matchesFilter("Abgeschlossen", c(s))).toBe(false);
    expect(matchesFilter("Abgeschlossen", c("Abgeschlossen"))).toBe(true);
    for (const ended of ["Leider abgelehnt", "Anfrage zurückgezogen"]) {
      expect(matchesFilter("Abgeschlossen", c(ended))).toBe(false);
      expect(matchesFilter("Offen", c(ended))).toBe(false);
      expect(matchesFilter("Alle", c(ended))).toBe(true);
    }
  });
  it("reads older status names too", () => {
    expect(matchesFilter("Bei Kreditgeber", c("Rückmeldung erhalten"))).toBe(true);
    expect(matchesFilter("Abgeschlossen", c("Storniert"))).toBe(false);
    expect(matchesFilter("Alle", c("Storniert"))).toBe(true);
  });
});

describe("isRelabel — the switch to Portal_Status__c is not news", () => {
  it("a baseline that still holds an older name changes without a notification", () => {
    expect(isRelabel("In Prüfung", "Wir prüfen die Unterlagen")).toBe(true);
    expect(isRelabel("Storniert", "Leider abgelehnt")).toBe(true);
    expect(isRelabel("Pausiert", "Unterlagen fehlen noch")).toBe(true);
    // The flows judge the Case themselves; the first difference is still only the switch.
    expect(isRelabel("Bei Kreditgeber", "Angebot liegt vor")).toBe(true);
  });
  it("leaves real moves between the eleven values alone", () => {
    expect(isRelabel("Wir prüfen die Unterlagen", "Bei der Bank in Prüfung")).toBe(false);
    expect(isRelabel("Angebot liegt vor", "Finanzierung bestätigt")).toBe(false);
    expect(isRelabel("Finanzierung bestätigt", "Abgeschlossen")).toBe(false);
    expect(isRelabel("Abgeschlossen", "Abgeschlossen")).toBe(false);
  });
});
