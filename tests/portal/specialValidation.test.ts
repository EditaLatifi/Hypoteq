import { describe, it, expect } from "@jest/globals";
import { special } from "@/lib/portal/i18n/special";
import { DICTS, LOCALES } from "@/lib/portal/i18n/dict";
import {
  EMPTY_ANSWERS,
  MAX_AMOUNT,
  SPECIAL_MAX_FILE_BYTES,
  SPECIAL_TYPES,
  TIMEFRAMES,
  fileProblem,
  formatChfAmount,
  normalizeAnswers,
  parseAmount,
  parseEigenmittel,
  reachableStep,
  specialArt,
  specialRef,
  stepErrors,
  summaryRows,
  validateSpecial,
  type SpecialAnswers,
} from "@/lib/portal/special";

/**
 * The wizard's rules (handoff 4 «Spezialfinanzierung», prototype `sfValid`): Art required;
 * Name/Firma required; Betrag ≥ 4 digits and Beschreibung ≥ 20 characters; Dokumente
 * optional; the acknowledgement required. The server runs the very same checks.
 */

const VALID: SpecialAnswers = {
  ...EMPTY_ANSWERS,
  type: "rendite",
  kunde: "Anna Muster",
  ort: "8400 Winterthur",
  betrag: "2'500'000",
  objekt: "MFH mit 8 Wohnungen, Uster",
  beschreibung: "Kauf eines Mehrfamilienhauses mit 8 Wohnungen als Anlage.",
};

describe("stepErrors", () => {
  it("blocks each step on its own required field, as the prototype does", () => {
    expect(stepErrors(EMPTY_ANSWERS, false)).toEqual(["type", "kunde", "betrag", null, "ack"]);
    expect(stepErrors(VALID, true)).toEqual([null, null, null, null, null]);
  });

  it("needs a name of at least two characters", () => {
    expect(stepErrors({ ...VALID, kunde: "A" }, true)[1]).toBe("kunde");
    expect(stepErrors({ ...VALID, kunde: "Al" }, true)[1]).toBeNull();
  });

  it("needs at least four digits for the amount, whatever the formatting", () => {
    expect(stepErrors({ ...VALID, betrag: "850" }, true)[2]).toBe("betrag");
    expect(stepErrors({ ...VALID, betrag: "CHF 1'000.–" }, true)[2]).toBeNull();
    expect(stepErrors({ ...VALID, betrag: "2.5 Mio" }, true)[2]).toBe("betrag");
  });

  it("refuses an amount the database cannot hold", () => {
    expect(stepErrors({ ...VALID, betrag: String(MAX_AMOUNT + 1) }, true)[2]).toBe("betragHigh");
  });

  it("needs a description of at least 20 characters, not counting the spaces around it", () => {
    expect(stepErrors({ ...VALID, beschreibung: "   zu kurz für uns   " }, true)[2]).toBe("text");
    expect(stepErrors({ ...VALID, beschreibung: "x".repeat(20) }, true)[2]).toBeNull();
  });

  it("leaves the documents optional", () => {
    expect(stepErrors(VALID, true)[3]).toBeNull();
  });
});

describe("reachableStep", () => {
  it("lets the stepper jump only as far as the first invalid step", () => {
    expect(reachableStep(EMPTY_ANSWERS, false)).toBe(0);
    expect(reachableStep({ ...EMPTY_ANSWERS, type: "mezzanine" }, false)).toBe(1);
    expect(reachableStep({ ...VALID, beschreibung: "" }, false)).toBe(2);
    expect(reachableStep(VALID, false)).toBe(4);
    expect(reachableStep(VALID, true)).toBe(4);
  });
});

describe("validateSpecial (server side)", () => {
  it("accepts complete answers and returns the amount as a number", () => {
    const v = validateSpecial(VALID, true);
    expect(v).toEqual({ ok: true, answers: expect.objectContaining({ type: "rendite", kunde: "Anna Muster" }), amount: 2500000 });
  });

  it("names the first failing step", () => {
    expect(validateSpecial({ ...VALID, type: "kredit" }, true)).toEqual({ ok: false, error: "type", step: 0 });
    expect(validateSpecial({ ...VALID, betrag: "" }, true)).toEqual({ ok: false, error: "betrag", step: 2 });
    expect(validateSpecial(VALID, "true")).toEqual({ ok: false, error: "ack", step: 4 });
  });

  it("refuses over-long input instead of cutting it silently", () => {
    expect(validateSpecial({ ...VALID, kunde: "A".repeat(500) }, true)).toEqual({ ok: false, error: "tooLong", step: 1 });
    expect(validateSpecial({ ...VALID, beschreibung: "x".repeat(6000) }, true)).toEqual({ ok: false, error: "tooLong", step: 2 });
  });

  it("does not trust anything that is not a plain object of strings", () => {
    expect(validateSpecial(null, true)).toEqual({ ok: false, error: "type", step: 0 });
    expect(validateSpecial({ ...VALID, kunde: { $ne: "" } }, true)).toEqual({ ok: false, error: "kunde", step: 1 });
  });
});

describe("normalizeAnswers", () => {
  it("collapses whitespace in single-line fields and keeps line breaks in the description", () => {
    const a = normalizeAnswers({ ...VALID, kunde: "  Anna \n  Muster ", beschreibung: "Zeile 1\r\nZeile   2  " });
    expect(a.kunde).toBe("Anna Muster");
    expect(a.beschreibung).toBe("Zeile 1\nZeile 2");
  });

  it("falls back to the defaults for unknown choices", () => {
    const a = normalizeAnswers({ ...VALID, kundeTyp: "verein", zeitrahmen: "morgen" });
    expect(a.kundeTyp).toBe("privat");
    expect(a.zeitrahmen).toBe("1-3");
  });
});

describe("amounts in the Swiss format", () => {
  it("parses what partners type", () => {
    expect(parseAmount("850'000")).toBe(850000);
    expect(parseAmount("CHF 1 200 000")).toBe(1200000);
    expect(parseAmount("")).toBeNull();
  });

  it("writes CHF with apostrophes", () => {
    expect(formatChfAmount(850000)).toBe("CHF 850'000");
    expect(formatChfAmount(2500000)).toBe("CHF 2'500'000");
    expect(formatChfAmount(null)).toBe("–");
  });

  it("turns Eigenmittel into a number only when it is a plain amount", () => {
    expect(parseEigenmittel("CHF 400'000")).toBe(400000);
    expect(parseEigenmittel("400'000.–")).toBe(400000);
    expect(parseEigenmittel("ca. 30 %")).toBeNull();
    expect(parseEigenmittel("400k")).toBeNull();
    expect(parseEigenmittel("")).toBeNull();
  });
});

describe("fileProblem", () => {
  it("accepts PDF, JPG, PNG and Excel up to 20 MB", () => {
    for (const name of ["a.pdf", "b.JPG", "c.jpeg", "d.png", "e.xlsx", "f.xls"]) expect(fileProblem(name, 1000)).toBeNull();
    expect(fileProblem("big.pdf", SPECIAL_MAX_FILE_BYTES)).toBeNull();
  });

  it("refuses other types, empty and oversized files", () => {
    expect(fileProblem("plan.docx", 1000)).toBe("type");
    expect(fileProblem("noext", 1000)).toBe("type");
    expect(fileProblem("a.pdf", 0)).toBe("size");
    expect(fileProblem("a.pdf", SPECIAL_MAX_FILE_BYTES + 1)).toBe("size");
  });

  it("checks the MIME type SharePoint reports, when there is one", () => {
    expect(fileProblem("a.pdf", 1000, "application/pdf")).toBeNull();
    expect(fileProblem("a.pdf", 1000, "text/html")).toBe("type");
  });
});

describe("summary and labels", () => {
  it("lists the review step's facts in German for the team", () => {
    const rows = summaryRows(special.de, VALID, 2);
    expect(rows).toEqual([
      { k: "Art", v: "Renditeobjekt" },
      { k: "Endkunde", v: "Anna Muster · Privatperson" },
      { k: "Wohnort / Sitz", v: "8400 Winterthur" },
      { k: "Kontakt", v: "–" },
      { k: "Finanzierungsbetrag", v: "CHF 2'500'000" },
      { k: "Eigenmittel", v: "–" },
      { k: "Objekt / Projekt", v: "MFH mit 8 Wohnungen, Uster" },
      { k: "Zeitrahmen", v: "In 1–3 Monaten" },
      { k: "Dokumente", v: "2 Dateien" },
    ]);
  });

  it("words the Case's Art «Spezialfinanzierung · <Typ>», short for «Andere»", () => {
    expect(specialArt(special.de, "mezzanine")).toBe("Spezialfinanzierung · Mezzanine-Finanzierung");
    expect(specialArt(special.de, "andere")).toBe("Spezialfinanzierung · Andere");
  });

  it("gives every request a short reference", () => {
    expect(specialRef("3f9a1c2b-0000-4000-8000-000000000000")).toBe("SP-3F9A1C");
  });
});

describe("texts in four languages", () => {
  it("are wired into the portal dictionary for every language", () => {
    for (const l of LOCALES) {
      expect(DICTS[l].special).toBe(special[l]);
      expect(DICTS[l].support.types.frage).toBeTruthy();
    }
  });

  it("have five steps, every type with helpful documents and every timeframe", () => {
    for (const l of LOCALES) {
      const s = special[l];
      expect(s.steps).toHaveLength(5);
      for (const k of SPECIAL_TYPES) {
        expect(s.types[k].label).toBeTruthy();
        expect(s.types[k].docs.length).toBeGreaterThan(0);
      }
      for (const z of TIMEFRAMES) expect(s.zeitOpts[z]).toBeTruthy();
    }
  });

  it("keep the handoff's notice copy word for word in German", () => {
    expect(special.de.noticeText).toBe(
      "Spezialfinanzierungen werden von HYPOTEQ einzeln beurteilt und fallen nicht unter die bestehende Partnervereinbarung. Machbarkeit, Konditionen und Vergütung vereinbaren wir pro Fall separat. Wir melden uns innert 2 Arbeitstagen bei Ihnen."
    );
  });
});
