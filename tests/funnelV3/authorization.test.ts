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
  SIGNER_FIELDS,
  TEMPLATES,
  buildAuthorizationPdf,
  authorizationFileName,
  caseLineText,
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

describe("the four templates (field map read from the PDFs)", () => {
  it.each(LANGS)("%s: Text1–5 left and Text6–10 right on page 1, Text11/12 «Datum / Ort» on page 2", async (lang) => {
    const bytes = readFileSync(path.join(process.cwd(), "public", "documents", TEMPLATES[lang].file));
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages().map((p) => p.ref);
    const where = (name: string) => {
      const w = doc.getForm().getTextField(name).acroField.getWidgets()[0];
      return { page: pages.findIndex((r) => r === w.P()) , rect: w.getRectangle() };
    };
    expect(doc.getForm().getFields()).toHaveLength(12);
    for (const [col, names] of SIGNER_FIELDS.entries()) {
      const rows = names.map(where);
      for (const r of rows) {
        expect(r.page).toBe(0);
        expect(col === 0 ? r.rect.x < 300 : r.rect.x > 300).toBe(true);
      }
      // Top to bottom: Vorname, Name, Adresse, PLZ/Ort, E-Mail.
      const ys = rows.map((r) => r.rect.y);
      expect([...ys].sort((a, b) => b - a)).toEqual(ys);
    }
    const [d1, d2] = DATE_PLACE_FIELDS.map(where);
    expect([d1.page, d2.page]).toEqual([1, 1]);
    expect(d1.rect.x).toBeLessThan(d2.rect.x);
  });
});

describe("buildAuthorizationPdf", () => {
  it("fills both Vollmachtgeber, leaves «Datum / Ort» empty and the form editable", async () => {
    const { form, value } = await load(await buildAuthorizationPdf(MUSTERMANN));
    expect(["Text1", "Text2", "Text3", "Text4", "Text5"].map(value)).toEqual(["Max Simon", "Mustermann", "Musterweg 1", "8000 Zürich", "max.mustermann@example.ch"]);
    expect(["Text6", "Text7", "Text8", "Text9", "Text10"].map(value)).toEqual(["Anna", "Muster", "", "", ""]);
    expect(value("Text11")).toBe("");
    expect(value("Text12")).toBe("");
    // Not flattened: the twelve fields are still there and writable.
    expect(form.getFields()).toHaveLength(12);
    expect(form.getFields().every((f) => f instanceof PDFTextField && !f.isReadOnly())).toBe(true);
  });

  it.each(LANGS)("%s: draws the case line above the first field row and the birth dates under the table", async (lang) => {
    const { calls } = spyText();
    const bytes = await buildAuthorizationPdf({ ...MUSTERMANN, lang, firma: null, signers: [MUSTERMANN.signers[0], { ...MUSTERMANN.signers[1], geburtsdatum: "1982-11-04" }] });
    const doc = await PDFDocument.load(bytes);
    const h = doc.getPage(0).getHeight();
    const top = (name: string) => {
      const r = doc.getForm().getTextField(name).acroField.getWidgets()[0].getRectangle();
      return { top: h - (r.y + r.height), bottom: h - r.y };
    };
    expect(calls).toHaveLength(3);
    const [line, b1, b2] = calls;
    expect(line.text).toContain("HQ-26-10-000123");
    expect(line.text).toContain("8000 Z");
    // Between the title and the first row; under the logo.
    expect(line.top).toBeLessThan(Math.min(top("Text1").top, top("Text6").top) - 4);
    expect(line.top).toBeGreaterThan(150);
    // Under the last row of both columns, in the left / right column.
    expect(b1.text).toMatch(/12\.03\.1979$/);
    expect(b2.text).toMatch(/04\.11\.1982$/);
    for (const b of [b1, b2]) expect(b.top).toBeGreaterThan(Math.max(top("Text5").bottom, top("Text10").bottom) + 4);
    expect(b1.x).toBeLessThan(200);
    expect(b2.x).toBeGreaterThan(280);
    // Small and never wider than the page.
    for (const c of calls) expect(c.size).toBeLessThanOrEqual(8);
  });

  it("the case line in each language: Anfrage, Objekt, Zweck, Firma", () => {
    expect(caseLineText({ ...MUSTERMANN, firma: "Mustermann Immobilien AG" })).toBe(
      "Anfrage HQ-26-10-000123 · Objekt: Musterweg 1, 8000 Zürich · Zweck: Ablösung · Firma: Mustermann Immobilien AG"
    );
    expect(caseLineText({ ...MUSTERMANN, lang: "fr", zweck: "Neue Hypothek" })).toBe("Demande HQ-26-10-000123 · Objet: Musterweg 1, 8000 Zürich · But: Nouvelle hypothèque");
    expect(caseLineText({ lang: "en", signers: [], zweck: "Ablösung" })).toBe("Purpose: Refinancing");
    expect(caseLineText({ lang: "it", signers: [] })).toBe("");
  });

  it("a juristische Person: the signatory in the left column, the company in the case line", async () => {
    const { calls } = spyText();
    const data = authorizationDataFromState(
      { ans: { ...DEFAULT_ANSWERS, kn: "Juristische Person", antrag: "Neue Hypothek" }, txt: { ...EMPTY_TEXTS, firma: "Muster Immobilien AG", zeichner: "Hans Peter Muster", mail: "hp@muster.ch", plz: "8001", ort: "Zürich" } },
      "de"
    );
    const { value } = await load(await buildAuthorizationPdf(data));
    expect(["Text1", "Text2", "Text5", "Text6"].map(value)).toEqual(["Hans Peter", "Muster", "hp@muster.ch", ""]);
    expect(calls[0].text).toBe("Objekt: 8001 Zürich · Zweck: Neue Hypothek · Firma: Muster Immobilien AG");
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
