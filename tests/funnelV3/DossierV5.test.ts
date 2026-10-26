/**
 * The Fall-Dossier with the v5 data (Handover 2, 3.1, 6; the v5 reference dossier): the Kauf
 * block, the Ablösedatum, Netto-Mietertrag, Kreditnehmer 2 only when captured, the company,
 * the chips with their documents, the Eigenmittel table, values from the documents with
 * their source, the Auskunftsermächtigung, the v5 list with P0 — built the way the closing
 * builds it (completion.ts dossierInputFor).
 */
import { describe, it, expect } from "@jest/globals";
import { PDFDocument } from "pdf-lib";
import { buildDossierModel, createDossierPdf, type DossierModel } from "@/lib/funnel-v3/dossier";
import { previewInput } from "@/lib/funnel-v3/dossier/preview";
import { dossierInputFor } from "@/lib/funnel-v3/completion";
import { normaliseFunnelState } from "@/lib/funnel-v3/legacy";
import { EMPTY_AMOUNTS, EMPTY_EM, type FunnelState } from "@/lib/funnel-v3/types";
import { CASE_NO, ablState, jurState, kaufState, v5Payload } from "./v5Fixtures";

const DATE = new Date("2026-10-15T10:00:00Z");
const LATER = { choice: "later" as const, at: "2026-10-15T09:00:00.000Z", method: "upload" as const };

function inputFor(state: FunnelState, opts: Parameters<typeof v5Payload>[1] = {}) {
  const data = v5Payload(state, opts);
  return dossierInputFor(data, normaliseFunnelState(data.v3)!, data.v3Completion.files, CASE_NO, DATE);
}
const model = (state: FunnelState, opts: Parameters<typeof v5Payload>[1] = {}) => buildDossierModel(inputFor(state, opts));

/** label → value (and source) of a section's two columns. */
function kvs(m: DossierModel, index: number): Record<string, string> {
  const s = m.sections[index];
  return Object.fromEntries([...(s.columns?.[0] ?? []), ...(s.columns?.[1] ?? [])].map((kv) => [kv.label, kv.value]));
}
function source(m: DossierModel, index: number, label: string): string | undefined {
  const s = m.sections[index];
  return [...(s.columns?.[0] ?? []), ...(s.columns?.[1] ?? [])].find((kv) => kv.label === label)?.source;
}

describe("01 Antrag", () => {
  it("Kauf: Kaufpreis, Kaufdatum, Renovationsbetrag, reserviert; the Auskunftsermächtigung pending", () => {
    const m = model(
      kaufState({
        ans: { ...kaufState().ans, reno: "Ja", reserviert: "Ja" },
        fin: { ...kaufState().fin, renoBetrag: 80000 },
        txt: { ...kaufState().txt, kaufdatum: "30.11.2026" },
        sig: LATER,
      })
    );
    expect(kvs(m, 0)).toMatchObject({
      Kaufpreis: "CHF 1'000'000",
      Kaufdatum: "30.11.2026",
      Renovationsbetrag: "CHF 80'000",
      "Liegenschaft reserviert": "Ja",
      Gesamtfinanzierung: "CHF 864'000",
      Auskunftsermächtigung: "Unterschrift ausstehend · Erinnerung nach 2 und 5 Tagen",
    });
    expect(m.signature).toBe("later");
    expect(m.cover.description).toBe("Einfamilienhaus, Selbstbewohnt. Kauf zum Preis von CHF 1'000'000 und Renovationen von CHF 80'000.");
  });

  it("Ablösung: Zins and Ablösedatum from the Zinsabrechnung, marked «aus Dokument»", () => {
    const m = model(ablState({ info: { bank: "Musterbank", zins: "SARON 0.80 %", abl: "31.03.2028" } }));
    expect(kvs(m, 0)).toMatchObject({
      "Bestehende Bank": "Musterbank",
      "Bestehende Hypothek": "CHF 400'000 · SARON 0.80 %",
      Ablösedatum: "31.03.2028",
      "Gewünschte Erhöhung": "CHF 100'000",
      Gesamtfinanzierung: "CHF 500'000",
      Auskunftsermächtigung: "unterzeichnet erhalten",
    });
    expect(source(m, 0, "Ablösedatum")).toBe("aus Dokument");
    expect(m.cover.description).toBe("Stockwerkeigentum, Selbstbewohnt. Ablösung der bestehenden Hypothek der Musterbank von CHF 400'000 per 31.03.2028 und Erhöhung um CHF 100'000.");
    expect(kvs(m, 0)).not.toHaveProperty("Kaufpreis");
  });
});

describe("02 Objekt", () => {
  it("rented: the Netto-Mietertrag; self-occupied: none; Neubau-Art only at a Neubau", () => {
    const rented = model(kaufState({ ans: { ...kaufState().ans, nutz: "Vermietet" }, fin: { ...kaufState().fin, miete: 36000 } }));
    expect(kvs(rented, 1)["Jährlicher Netto-Mietertrag"]).toBe("CHF 36'000");
    const own = model(kaufState({ fin: { ...kaufState().fin, miete: 36000 } }));
    expect(kvs(own, 1)).not.toHaveProperty("Jährlicher Netto-Mietertrag");
    expect(kvs(own, 1)).not.toHaveProperty("Neubau-Art");
    const neubau = model(kaufState({ ans: { ...kaufState().ans, immo: "Neubau", nbDocs: "Nein" } }));
    expect(kvs(neubau, 1)).toMatchObject({ "Neubau-Art": "Bereits erstellt", "Grundbuchauszug und GVZ-Police vorhanden": "Nein" });
  });

  it("what the object documents say, with the address on the cover", () => {
    const m = model(kaufState({ info: { adresse: "Seestrasse 1, 8001 Zürich", baujahr: "1998", heizung: "Wärmepumpe", versSumme: "CHF 1'200'000", efSaldo: "CHF 10'000" } }));
    expect(kvs(m, 1)).toMatchObject({ Adresse: "Seestrasse 1, 8001 Zürich", Baujahr: "1998", Heizung: "Wärmepumpe", Versicherungssumme: "CHF 1'200'000", Erneuerungsfonds: "CHF 10'000" });
    expect(source(m, 1, "Heizung")).toBe("aus Dokument");
    expect(m.cover.title).toEqual(["Lea Muster", "Seestrasse 1, 8001 Zürich"]);
  });
});

describe("03 Kreditnehmer", () => {
  it("the ID, the tax return and the Lohnausweis of Kreditnehmer 1; a prefilled income names its document", () => {
    const m = model(
      kaufState({
        info: { geb: "12.03.1985", nat: "Schweiz", zivil: "ledig", ag: "Muster AG", kinder: "2" },
        src: { "fin.inc": { doc: "Lohnausweis 2025", unsure: false } },
      })
    );
    expect(kvs(m, 2)).toMatchObject({
      "Kreditnehmer 1": "Lea Muster · 12.03.1985 · Schweiz",
      Zivilstand: "ledig",
      Arbeitgeber: "Muster AG",
      Kinder: "2",
      "Bruttoeinkommen Haushalt": "CHF 200'000",
    });
    expect(source(m, 2, "Kreditnehmer 1")).toBe("aus Dokument");
    expect(source(m, 2, "Bruttoeinkommen Haushalt")).toBe("aus Dokument · Lohnausweis 2025");
  });

  it("Kreditnehmer 2 only when captured", () => {
    const without = model(kaufState({ borrowers: [...kaufState().borrowers, { id: "b2", vor: "", nach: "", pkSe: "Nein" }] }));
    expect(kvs(without, 2)).not.toHaveProperty("Kreditnehmer 2");
    expect(kvs(without, 0).Kreditnehmer).toBe("Natürliche Person, 1 Kreditnehmer");
    const withKn2 = model(
      kaufState({
        borrowers: [...kaufState().borrowers, { id: "b2", vor: "Tom", nach: "Muster", pkSe: "Nein" }],
        fin: { ...EMPTY_AMOUNTS, kaufpreis: 1000000, val: 1000000, inc: 120000, inc2: 80000 },
      })
    );
    expect(kvs(withKn2, 2)).toMatchObject({ "Kreditnehmer 2": "Tom Muster", "Bruttoeinkommen Haushalt": "CHF 200'000" });
    expect(withKn2.cover.title[0]).toBe("Lea Muster & Tom Muster");
  });

  it("chips with what their documents say; Steueroptimierung when tapped", () => {
    const m = model(
      kaufState({
        ans: { ...kaufState().ans, unterhalt: "Ja", kredite: "Ja", buerge: "Ja", steuer: "Ja" },
        txt: { ...kaufState().txt, buergeName: "Hans Bürge" },
        info: { unterhaltBetrag: "CHF 1'200/Mt.", kreditRest: "CHF 24'000", kreditRate: "CHF 500" },
      })
    );
    expect(kvs(m, 2)).toMatchObject({
      Unterhaltszahlungen: "Ja · Betrag CHF 1'200/Mt.",
      Privatkredite: "Ja · Restschuld CHF 24'000 · Rate CHF 500",
      Solidarbürgschaft: "Hans Bürge",
      "Interesse an Steueroptimierung": "Ja",
    });
    expect(source(m, 2, "Privatkredite")).toBe("aus Dokument");
  });

  it("company: Firma, UID, Sitz, signatory and contact — no Kreditnehmer rows, no Unterhalt", () => {
    const m = model(jurState({ info: { uid: "CHE-123.456.789", sitz: "Winterthur" } }));
    const k = kvs(m, 2);
    expect(k).toMatchObject({
      Firma: "Immo Beispiel AG",
      UID: "CHE-123.456.789",
      Sitz: "Winterthur",
      "Zeichnungsberechtigte Person": "Petra Beispiel",
      "E-Mail / Telefon": "info@immo-ag.ch · 044 555 66 77",
    });
    expect(Object.keys(k).some((l) => l.startsWith("Kreditnehmer ") || l === "Unterhaltszahlungen" || l === "Kreditnehmer ab 50")).toBe(false);
  });
});

describe("04 Finanzierung — the Eigenmittel table", () => {
  it("entered rows, total with %, hard part, Gesamtkosten with a renovation; PK-Verpfändung as security", () => {
    const m = model(
      kaufState({
        ans: { ...kaufState().ans, reno: "Ja" },
        fin: { ...kaufState().fin, renoBetrag: 100000 },
        em: { ...EMPTY_EM, spar: 150000, pkVor: 50000, pkVerp: 30000, darl: 20000 },
        src: { "em.spar": { doc: "Kontoauszug", unsure: false } },
      })
    );
    const sub = m.sections[3].subTables!;
    expect(sub.map((s) => s.title)).toEqual(["Eigenmittel – Aufteilung"]);
    const rows = sub[0].table.rows.map((r) => [r[0].text, r[1].text, r[0].sub ?? ""]);
    expect(rows).toEqual([
      ["Ersparnisse / Bankguthaben", "CHF 150'000", "aus Dokument · Kontoauszug"],
      ["PK-Vorbezug", "CHF 50'000", ""],
      ["PK-Verpfändung", "CHF 30'000", "Sicherheit, zählt nicht zu den Eigenmitteln"],
      ["Darlehen", "CHF 20'000", ""],
      ["Eigenmittel total", "CHF 220'000 · 20.0 %", ""],
      ["davon harte Eigenmittel", "CHF 170'000", ""],
      ["Gesamtkosten (Kaufpreis und Renovation)", "CHF 1'100'000", ""],
    ]);
    expect(m.sections[3].notes!.some((n) => n.startsWith("Eigenmittel:"))).toBe(false);
  });

  it("hard equity below 10 % of the Kaufpreis is noted; no Eigenmittel → the «keine» note", () => {
    const low = model(kaufState({ em: { ...EMPTY_EM, pkVor: 150000, spar: 50000 } }));
    expect(low.sections[3].notes).toContain("Harte Eigenmittel unter 10 % des Kaufpreises.");
    const none = model(kaufState());
    expect(none.sections[3].subTables).toBeUndefined();
    expect(none.sections[3].notes).toContain("Eigenmittel: keine besonderen Quellen angegeben.");
  });

  it("Ablösung: «Vorsorge» with Säule 3a and PK-Verpfändung", () => {
    const m = model(ablState({ em: { ...EMPTY_EM, s3a: 25000, pkVerp: 40000 } }));
    const sub = m.sections[3].subTables!;
    expect(sub[0].title).toBe("Vorsorge");
    expect(sub[0].table.rows.map((r) => r[0].text)).toEqual(["Säule 3a", "PK-Verpfändung"]);
  });
});

describe("the annex: the Auskunftsermächtigung and the v5 list («Verlauf» is gone, HYPOTEQ 23.10.2026)", () => {
  it("signed: P0 in annex C with its state", () => {
    const m = model(kaufState());
    expect(m.sections).toHaveLength(4);
    const c = m.annex.groups.find((g) => g.title.startsWith("C · "))!;
    const p0 = c.table.rows.find((r) => r[1].text === "HYPOTEQ Auskunftsermächtigung")!;
    expect(p0[3].text).toBe("Auskunftsermächtigung: unterzeichnet erhalten");
    expect(m.status.counts.fulfilled).toBe(m.status.counts.total);
  });

  it("pending: «Unterschrift ausstehend» in the annex; P0 missing counts", () => {
    const m = model(kaufState({ sig: LATER }));
    const p0 = m.annex.groups.flatMap((g) => g.table.rows).find((r) => r[1].text === "HYPOTEQ Auskunftsermächtigung")!;
    expect(p0[1].sub).toContain("Fehlt");
    expect(p0[3].text).toBe("Auskunftsermächtigung: Unterschrift ausstehend · Erinnerung nach 2 und 5 Tagen");
    expect(m.status.counts.fulfilled).toBe(m.status.counts.total - 1);
  });

  it("the v5 list: Renovationsliste with a renovation, Produktvereinbarung at an Ablösung, no Rahmenvertrag", () => {
    const reno = model(kaufState({ ans: { ...kaufState().ans, reno: "Ja" }, fin: { ...kaufState().fin, renoBetrag: 50000 } }));
    expect(reno.status.requirements.map((r) => r.instance.id)).toContain("reno_liste");
    const abl = model(ablState());
    const ids = abl.status.requirements.map((r) => r.instance.id);
    expect(ids).toEqual(expect.arrayContaining(["produkt", "hyp_zins", "vollmacht"]));
    expect(ids).not.toContain("hyp_rahmen");
  });
});

describe("languages and the PDF", () => {
  it("French labels for the v5 rows", () => {
    const m = model(kaufState({ sig: LATER, txt: { ...kaufState().txt, kaufdatum: "30.11.2026" } }), { locale: "fr" });
    expect(kvs(m, 0)).toMatchObject({ "Date d’achat": "30.11.2026", "Autorisation de renseignements": "signature en attente · rappel après 2 et 5 jours" });
  });

  it("renders every v5 case to a valid PDF in every language", async () => {
    const states = [
      kaufState({ ans: { ...kaufState().ans, reno: "Ja", kredite: "Ja" }, fin: { ...kaufState().fin, renoBetrag: 80000 }, em: { ...EMPTY_EM, spar: 200000, pkVerp: 30000 }, info: { geb: "12.03.1985", heizung: "Gas → Wärmepumpe ✓" }, sig: LATER }),
      ablState({ info: { abl: "31.03.2028", zins: "SARON 0.80 %" }, em: { ...EMPTY_EM, s3a: 25000 } }),
      jurState({ info: { uid: "CHE-123.456.789" } }),
    ];
    for (const lang of ["de", "fr", "it", "en"] as const) {
      for (const s of states) {
        const bytes = await createDossierPdf(inputFor(s, { locale: lang }));
        const doc = await PDFDocument.load(bytes);
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("the «Entwurf» preview carries the v5 marks", () => {
  it("prefill marks, the signature choice and a hand-placed copy", () => {
    const input = previewInput({
      lang: "de",
      state: { ...kaufState(), src: { "fin.inc": { doc: "Lohnausweis 2025", unsure: false }, "bad key": { doc: "x" } }, sig: LATER } as any,
      files: [{ id: "f1", name: "vollmacht.pdf", uploadState: "uploaded", analysisState: "failed", instanceId: "vollmacht", assignedByUser: true, analysis: { status: "failed", fields: {} } }],
    });
    expect(input.state.src).toEqual({ "fin.inc": { doc: "Lohnausweis 2025", unsure: false } });
    expect(input.state.sig).toEqual({ choice: "later", at: LATER.at, method: "upload" });
    expect(input.files[0].assignedByUser).toBe(true);
    // An unreadable copy placed with the block's own button counts as received (V21).
    expect(buildDossierModel(input).signature).toBe("received");
  });
});

describe("stored dossier input", () => {
  it("keeps a file the user placed by hand, as the draft does", () => {
    const data = v5Payload(kaufState());
    const files = [
      { documentId: "d1", originalName: "scan.jpg", instanceId: "vollmacht", analysis: { status: "failed" }, assignedByUser: true },
      { documentId: "d2", originalName: "other.pdf", instanceId: null, analysis: null, assignedByUser: true },
    ] as any;
    const input = dossierInputFor(data, normaliseFunnelState(data.v3)!, files, CASE_NO, DATE);
    expect(input.files[0].assignedByUser).toBe(true);
    // Without a placement there is nothing the user assigned it to.
    expect(input.files[1].assignedByUser).toBeUndefined();
  });
});
