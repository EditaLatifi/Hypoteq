/**
 * The prefilled Auskunftsermächtigung (Handover 6; lib/funnel-v3/authorization.ts,
 * authorizationData.ts; DECISIONS V12, V31–V33) with the real templates from public/documents.
 */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, PDFPage, PDFTextField } from "pdf-lib";
import {
  DATE_PLACE_FIELDS,
  OBJECT_FIELD,
  PURPOSE_FIELD,
  SIGNER_FIELDS,
  TEMPLATES,
  buildAuthorizationPdf,
  authorizationFileName,
  caseLineText,
  purposeText,
  type AuthorizationData,
} from "@/lib/funnel-v3/authorization";
import {
  MAX_BODY_BYTES,
  authorizationDataFromState,
  authorizationPreview,
  normaliseAuthorizationData,
  parseAuthorizationBody,
  swissDate,
} from "@/lib/funnel-v3/authorizationData";
import { EMPTY_TEXTS, DEFAULT_ANSWERS } from "@/lib/funnel-v3/types";
import { LANGS } from "@/lib/funnel-v3/i18n";

const MUSTERMANN: AuthorizationData = {
  lang: "de",
  signers: [
    { vor: "Max Simon", nach: "Mustermann", adresse: "Musterweg 1", plzOrt: "8000 Zürich", email: "max.mustermann@example.ch", geburtsdatum: "12.03.1979" },
    { vor: "Anna", nach: "Muster" },
  ],
  caseNumber: "HQ-26-10-000123",
  objekt: "Musterweg 1, 8000 Zürich",
  zweck: "Ablösung",
};

async function load(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  const value = (name: string) => form.getTextField(name).getText() ?? "";
  return { doc, form, value };
}

/** Every drawText call: text and its baseline in points from the page TOP. */
function spyText() {
  const calls: { text: string; x: number; top: number; size: number }[] = [];
  const orig = PDFPage.prototype.drawText;
  const spy = jest.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text: string, options: any = {}) {
    calls.push({ text, x: options.x, top: this.getHeight() - options.y, size: options.size });
    return orig.call(this, text, options);
  });
  return { calls, spy };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the four templates (HYPOTEQ 21.10.2026, field map read from the PDFs)", () => {
  it.each(LANGS)("%s: two columns of six fields, Objekt and Zweck below, «Datum / Ort» on page 2", async (lang) => {
    const bytes = readFileSync(path.join(process.cwd(), "public", "documents", TEMPLATES[lang].file));
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages().map((p) => p.ref);
    const where = (name: string) => {
      const w = doc.getForm().getTextField(name).acroField.getWidgets()[0];
      return { page: pages.findIndex((r) => r === w.P()), rect: w.getRectangle() };
    };
    expect(doc.getForm().getFields()).toHaveLength(16);
    let lowest = Infinity;
    for (const [col, names] of SIGNER_FIELDS.entries()) {
      const rows = names.map(where);
      for (const r of rows) {
        expect(r.page).toBe(0);
        expect(col === 0 ? r.rect.x < 300 : r.rect.x > 300).toBe(true);
        lowest = Math.min(lowest, r.rect.y);
      }
      // Top to bottom: Vorname, Name, Geburtsdatum, Adresse, PLZ/Ort, E-Mail.
      const ys = rows.map((r) => r.rect.y);
      expect([...ys].sort((a, b) => b - a)).toEqual(ys);
    }
    const [objekt, zweck] = [OBJECT_FIELD, PURPOSE_FIELD].map(where);
    expect([objekt.page, zweck.page]).toEqual([0, 0]);
    expect(objekt.rect.y + objekt.rect.height).toBeLessThan(lowest);
    expect(zweck.rect.y).toBeLessThan(objekt.rect.y);
    const [d1, d2] = DATE_PLACE_FIELDS.map(where);
    expect([d1.page, d2.page]).toEqual([1, 1]);
    expect(d1.rect.x).toBeLessThan(d2.rect.x);
  });
});

describe("buildAuthorizationPdf", () => {
  it("fills both Kreditnehmer with birth dates, Objekt and Zweck; «Datum / Ort» stays empty, the form editable", async () => {
    const { form, value } = await load(await buildAuthorizationPdf({ ...MUSTERMANN, signers: [MUSTERMANN.signers[0], { ...MUSTERMANN.signers[1], geburtsdatum: "1982-11-04" }] }));
    expect(["Text1", "Text2", "Geburtsdatum1", "Text3", "Text4", "Text5"].map(value)).toEqual(["Max Simon", "Mustermann", "12.03.1979", "Musterweg 1", "8000 Zürich", "max.mustermann@example.ch"]);
    expect(["Text6", "Text7", "Geburtsdatum2", "Text8", "Text9", "Text10"].map(value)).toEqual(["Anna", "Muster", "04.11.1982", "", "", ""]);
    expect(value(OBJECT_FIELD)).toBe("Musterweg 1, 8000 Zürich");
    expect(value(PURPOSE_FIELD)).toBe("Ablösung");
    expect(value("Text11")).toBe("");
    expect(value("Text12")).toBe("");
    // Not flattened: the sixteen fields are still there and writable.
    expect(form.getFields()).toHaveLength(16);
    expect(form.getFields().every((f) => f instanceof PDFTextField && !f.isReadOnly())).toBe(true);
  });

  it.each(LANGS)("%s: draws only the case line, between the title and the first card", async (lang) => {
    const { calls } = spyText();
    await buildAuthorizationPdf({ ...MUSTERMANN, lang, firma: "Mustermann Immobilien AG" });
    expect(calls).toHaveLength(1);
    const [line] = calls;
    expect(line.text).toContain("HQ-26-10-000123");
    expect(line.text).toContain("Mustermann Immobilien AG");
    // Measured in the templates: the title ends at 116.4 (de, one line) / 134.5 (two lines), the
    // first card starts at 141.7 / 160.2. The baseline sits clear of both.
    const [titleEnd, cardTop] = lang === "de" ? [116.4, 141.7] : [134.5, 160.2];
    expect(line.top).toBeGreaterThan(titleEnd + line.size);
    expect(line.top).toBeLessThan(cardTop - 2);
    expect(line.size).toBeLessThanOrEqual(8);
  });

  it("the case line names what has no field: Anfrage and Firma; Zweck in the form's language", () => {
    expect(caseLineText({ ...MUSTERMANN, firma: "Mustermann Immobilien AG" })).toBe("Anfrage HQ-26-10-000123 · Firma: Mustermann Immobilien AG");
    expect(caseLineText({ ...MUSTERMANN, lang: "fr" })).toBe("Demande HQ-26-10-000123");
    expect(caseLineText({ lang: "en", signers: [], zweck: "Ablösung" })).toBe("");
    expect(purposeText({ lang: "en", signers: [], zweck: "Ablösung" })).toBe("Refinancing");
    expect(purposeText({ lang: "fr", signers: [], zweck: "Neue Hypothek" })).toBe("Nouvelle hypothèque");
    expect(purposeText({ lang: "it", signers: [] })).toBe("");
  });

  it("a juristische Person: the signatory in the left column, the company in the case line", async () => {
    const { calls } = spyText();
    const data = authorizationDataFromState(
      { ans: { ...DEFAULT_ANSWERS, kn: "Juristische Person", antrag: "Neue Hypothek" }, txt: { ...EMPTY_TEXTS, firma: "Muster Immobilien AG", zeichner: "Hans Peter Muster", mail: "hp@muster.ch", plz: "8001", ort: "Zürich" } },
      "de"
    );
    const { value } = await load(await buildAuthorizationPdf(data));
    expect(["Text1", "Text2", "Text5", "Text6"].map(value)).toEqual(["Hans Peter", "Muster", "hp@muster.ch", ""]);
    expect([value(OBJECT_FIELD), value(PURPOSE_FIELD)]).toEqual(["8001 Zürich", "Neue Hypothek"]);
    expect(calls[0].text).toBe("Firma: Muster Immobilien AG");
  });

  it("shrinks a long value to fit its field and draws characters Helvetica lacks as ASCII", async () => {
    const { form, value } = await load(
      await buildAuthorizationPdf({ lang: "de", signers: [{ vor: "Łukasz", nach: "Nowak‑Dvořák", email: "lukasz.nowak-dvorak@sehr-lange-firmenadresse-beispiel.ch" }] })
    );
    expect(value("Text1")).toBe("Lukasz");
    // ř is not in WinAnsi (→ r), á is; the non-breaking hyphen becomes a hyphen.
    expect(value("Text2")).toBe("Nowak-Dvorák");
    const da = (name: string) => form.getTextField(name).acroField.getDefaultAppearance() || "";
    const size = (name: string) => Number(da(name).match(/([\d.]+) Tf/)?.[1]);
    expect(size("Text1")).toBe(9);
    expect(size("Text5")).toBeLessThan(9);
    expect(size("Text5")).toBeGreaterThanOrEqual(6);
  });

  it("never more than two Vollmachtgeber (the form has two columns)", async () => {
    const { value } = await load(
      await buildAuthorizationPdf({ lang: "en", signers: [{ vor: "A", nach: "One" }, { vor: "B", nach: "Two" }, { vor: "C", nach: "Three" }] })
    );
    expect([value("Text2"), value("Text7")]).toEqual(["One", "Two"]);
  });

  it("no signers: the empty template of the language", async () => {
    const { value } = await load(await buildAuthorizationPdf({ lang: "it", signers: [] }));
    expect(SIGNER_FIELDS.flat().map(value).every((v) => v === "")).toBe(true);
  });
});

describe("authorizationFileName", () => {
  it("case number, form name of the language, person or company — ASCII only", () => {
    expect(authorizationFileName(MUSTERMANN)).toBe("HQ-26-10-000123_HYPOTEQ_Auskunftsermaechtigung_Mustermann-Max-Simon.pdf");
    expect(authorizationFileName({ lang: "fr", signers: [{ vor: "Zoé", nach: "Müller" }] })).toBe("HYPOTEQ_Pouvoir-d-information_Mueller-Zoe.pdf");
    expect(authorizationFileName({ lang: "it", signers: [], firma: "Rossi & Figli SA" })).toBe("HYPOTEQ_Procura-per-informazioni_Rossi-Figli-SA.pdf");
    expect(authorizationFileName({ lang: "en", signers: [] })).toBe("HYPOTEQ_Authorisation-for-information.pdf");
  });
});

describe("authorizationDataFromState (Handover 6 «aus Funnel und Dokumenten», V33)", () => {
  const base = {
    ans: { ...DEFAULT_ANSWERS, antrag: "Ablösung" as const, nutz: "Selbstbewohnt" as const },
    txt: { ...EMPTY_TEXTS, vor: "Max", nach: "Mustermann", mail: "max.mustermann@example.ch", plz: "8000", ort: "Zürich" },
    borrowers: [
      { id: "b1", vor: "Max", nach: "Mustermann" },
      { id: "b2", vor: "Anna", nach: "Muster" },
    ],
    info: { geb: "1979-03-12", adresse: "Musterweg 1, 8000 Zürich" },
  };

  it("Ablösung of the home: Kreditnehmer 1 with e-mail, birth date and the object as address; Kreditnehmer 2 by name", () => {
    const d = authorizationDataFromState(base, "de", { caseNumber: "HQ-26-10-000123" });
    expect(d).toEqual({
      lang: "de",
      signers: [
        { vor: "Max", nach: "Mustermann", email: "max.mustermann@example.ch", geburtsdatum: "12.03.1979", adresse: "Musterweg 1", plzOrt: "8000 Zürich" },
        { vor: "Anna", nach: "Muster", adresse: null, plzOrt: null, email: null, geburtsdatum: null },
      ],
      firma: null,
      caseNumber: "HQ-26-10-000123",
      objekt: "Musterweg 1, 8000 Zürich",
      zweck: "Ablösung",
    });
  });

  it("a purchase: the object is not the home — the address stays for the hand", () => {
    const d = authorizationDataFromState({ ...base, ans: { ...base.ans, antrag: "Neue Hypothek" }, info: {} }, "fr");
    expect(d.lang).toBe("fr");
    expect(d.signers[0]).toMatchObject({ adresse: null, plzOrt: null });
    expect(d.objekt).toBe("8000 Zürich");
    expect(d.zweck).toBe("Neue Hypothek");
  });

  it("falls back to the step-1 contact when no borrower was entered", () => {
    const d = authorizationDataFromState({ ...base, borrowers: [] }, "xx");
    expect(d.lang).toBe("de");
    expect(d.signers.map((s) => s.nach)).toEqual(["Mustermann"]);
  });

  it("the preview rows the closing block shows", () => {
    const rows = authorizationPreview(authorizationDataFromState(base, "de"));
    expect(rows.map((r) => r.key)).toEqual(["signers", "birth", "address", "object", "purpose"]);
    expect(rows[0].value).toBe("Max Mustermann, Anna Muster");
  });
});

describe("route input (POST /api/funnel/authorization)", () => {
  it("rejects what is too large, not JSON or not a list of signers", () => {
    expect(parseAuthorizationBody("x".repeat(MAX_BODY_BYTES + 1))).toMatchObject({ ok: false, status: 413 });
    expect(parseAuthorizationBody("{nope")).toMatchObject({ ok: false, status: 400 });
    expect(parseAuthorizationBody("[]")).toMatchObject({ ok: false, status: 400 });
    expect(parseAuthorizationBody(JSON.stringify({ signers: "Max" }))).toMatchObject({ ok: false, status: 400 });
    expect(parseAuthorizationBody(JSON.stringify({ signers: [1, 2, 3, 4, 5] }))).toMatchObject({ ok: false, status: 400 });
  });

  it("trims, limits and drops what does not belong", () => {
    const res = parseAuthorizationBody(
      JSON.stringify({ lang: "it", signers: [{ vor: "  Max\n", nach: "G".repeat(500), email: 42 }, { vor: "", nach: "" }], zweck: "Kredit", objekt: "  8000   Zürich ", extra: "x" })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lang).toBe("it");
    expect(res.data.signers).toHaveLength(1);
    expect(res.data.signers[0].vor).toBe("Max");
    expect(res.data.signers[0].nach).toHaveLength(200);
    expect(res.data.signers[0].email).toBeNull();
    expect(res.data.zweck).toBeNull();
    expect(res.data.objekt).toBe("8000 Zürich");
    expect(res.data).not.toHaveProperty("extra");
  });

  it("Swiss dates", () => {
    expect(swissDate("1979-03-12")).toBe("12.03.1979");
    expect(swissDate("1.2.1980")).toBe("01.02.1980");
    expect(swissDate("März 1980")).toBe("März 1980");
    expect(normaliseAuthorizationData({ lang: "de", signers: [{ vor: "A", nach: "B", geburtsdatum: "1980-02-01" }] }).signers[0].geburtsdatum).toBe("01.02.1980");
  });
});
