/**
 * Funnel v5 → Salesforce, the additions of Handover 8 and the «v2 ·» rows of
 * HYPOTEQ_Salesforce_Mapping_Vorschlag.csv, with the existing mapping winning every clash
 * (DECISIONS V5, V41): the value goes to the existing field and into Dokumenten_Check_State__c.
 * The Salesforce API is a fake — nothing leaves the process.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("@/components/partnerDirectory", () => ({
  __esModule: true,
  resolvePartner: jest.fn(async () => ({ status: "partner", contactId: "003PARTNER", accountId: "001PARTNERCO" })),
}));

import { syncFunnelStepsToSalesforce, toKaufdatumText, toSalesforceDate, toWaermeerzeugung, withV5CheckStateBlocks } from "@/components/syncFunnelStepsToSalesforce";
import { SALESFORCE_CASE_FIELDS } from "@/components/salesforceFieldConfig";
import { EMPTY_AMOUNTS, EMPTY_EM, type FunnelState } from "@/lib/funnel-v3/types";
import { ablState, jurState, kaufState, v5Payload } from "./v5Fixtures";

function fakeSalesforce() {
  const calls: { accounts: any[]; updates: any[]; cases: any[]; companies: any[]; contacts: any[] } = { accounts: [], updates: [], cases: [], companies: [], contacts: [] };
  let n = 0;
  return {
    calls,
    api: {
      findAccountByEmail: jest.fn(async () => null),
      createAccount: jest.fn(async (data: any) => {
        calls.accounts.push(data);
        return { id: `001${++n}` };
      }),
      findBusinessAccount: jest.fn(async () => null),
      createBusinessAccount: jest.fn(async (company: any) => {
        calls.companies.push(company);
        return { id: "001COMPANY" };
      }),
      findContactOnAccount: jest.fn(async () => null),
      createContact: jest.fn(async (data: any) => {
        calls.contacts.push(data);
        return { id: "003SIGNER" };
      }),
      updatePersonAccount: jest.fn(async (_id: string, data: any) => void calls.updates.push(data)),
      findContactByEmail: jest.fn(async () => null),
      findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQ" })),
      createOrUpdateCase: jest.fn(async (data: any) => {
        calls.cases.push(data);
        return { id: "500CASE" };
      }),
    },
  };
}

async function sync(state: FunnelState, opts: Parameters<typeof v5Payload>[1] = {}) {
  const sf = fakeSalesforce();
  await syncFunnelStepsToSalesforce(v5Payload(state, opts), sf.api);
  const c = sf.calls.cases[0];
  return { sf, c, json: JSON.parse(c.Dokumenten_Check_State__c) };
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("Objekt", () => {
  it("Netto-Mietertrag → J_hrlicher_Netto_Mietertrag__c, only when rented", async () => {
    const rented = await sync(kaufState({ ans: { ...kaufState().ans, nutz: "Vermietet" }, fin: { ...kaufState().fin, miete: 36000 } }));
    expect(rented.c.J_hrlicher_Netto_Mietertrag__c).toBe(36000);
    expect(rented.c.Nutzung_der_Immobilie__c).toBe("Rendite-Immobilie");
    const own = await sync(kaufState({ fin: { ...kaufState().fin, miete: 36000 } }));
    expect(own.c.J_hrlicher_Netto_Mietertrag__c ?? null).toBeNull();
  });

  it("Kaufdatum → Kaufdatum__c as «TT.MM.JJJJ» text and Kaufdatum_Datum__c as a date (HYPOTEQ 19.10. B13); at an Ablösung the Ablösedatum of the Zinsabrechnung", async () => {
    const kauf = await sync(kaufState({ txt: { ...kaufState().txt, kaufdatum: "30.11.2026" } }));
    expect(kauf.c.Kaufdatum__c).toBe("30.11.2026");
    expect(kauf.c.Kaufdatum_Datum__c).toBe("2026-11-30");
    // T.M.JJJJ is written as TT.MM.JJJJ.
    expect((await sync(kaufState({ txt: { ...kaufState().txt, kaufdatum: "1.4.2027" } }))).c.Kaufdatum__c).toBe("01.04.2027");
    // Not a date: the text field takes it as typed, the Date field stays empty; the JSON keeps it.
    const typo = await sync(kaufState({ txt: { ...kaufState().txt, kaufdatum: "Ende 2026" } }));
    expect(typo.c.Kaufdatum__c).toBe("Ende 2026");
    expect(typo.c).not.toHaveProperty("Kaufdatum_Datum__c");
    expect(typo.json.answers.kaufdatum).toBe("Ende 2026");
    const abl = await sync(ablState({ info: { abl: "31.03.2028" } }));
    expect(abl.c).toMatchObject({ Kaufdatum__c: "31.03.2028", Kaufdatum_Datum__c: "2028-03-31" });
    const none = await sync(kaufState());
    expect(none.c).not.toHaveProperty("Kaufdatum__c");
    expect(none.c).not.toHaveProperty("Kaufdatum_Datum__c");
    expect(SALESFORCE_CASE_FIELDS.Kaufdatum__c).toBe("string");
    expect(SALESFORCE_CASE_FIELDS.Kaufdatum_Datum__c).toBe("date");
    expect(toKaufdatumText("2026-02-01")).toBe("01.02.2026");
    expect(toKaufdatumText("  ")).toBeNull();
  });

  it("toSalesforceDate: real calendar dates only", () => {
    expect(toSalesforceDate("1.2.2026")).toBe("2026-02-01");
    expect(toSalesforceDate("2026-02-01")).toBe("2026-02-01");
    expect(toSalesforceDate("31.02.2026")).toBeNull();
    expect(toSalesforceDate("19.05.26")).toBeNull();
    expect(toSalesforceDate("")).toBeNull();
    expect(toSalesforceDate(undefined)).toBeNull();
  });

  it("Renovation Ja/Nein → Gibt_es_Renovationen…; the Renovationsbetrag → Renovationsbetrag__c (HYPOTEQ 19.10. B4), never Betrag__c; JSON as before", async () => {
    const { c, json } = await sync(kaufState({ ans: { ...kaufState().ans, reno: "Ja" }, fin: { ...kaufState().fin, renoBetrag: 80000 } }));
    expect(c.Gibt_es_Renovationen_oder_Zusatzkosten__c).toBe(true);
    expect(c.Renovationsbetrag__c).toBe(80000);
    expect(c).not.toHaveProperty("Betrag__c");
    expect(json.answers.renovationsBetrag).toBe(80000);
    // (1'000'000 + 80'000) × 80 %
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(864000);
    const none = await sync(kaufState());
    expect(none.c.Gibt_es_Renovationen_oder_Zusatzkosten__c).toBe(false);
    expect(none.c).not.toHaveProperty("Renovationsbetrag__c");
  });

  it("a Renovationsbetrag without Renovation = Ja is not written (legacy payload)", async () => {
    const sf = fakeSalesforce();
    const p = v5Payload(kaufState());
    delete p.v3;
    p.property.renovation = "nein";
    p.property.renovationsBetrag = "50000";
    await syncFunnelStepsToSalesforce(p, sf.api);
    expect(sf.calls.cases[0]).not.toHaveProperty("Renovationsbetrag__c");
    p.property.renovation = "ja";
    const sf2 = fakeSalesforce();
    await syncFunnelStepsToSalesforce(p, sf2.api);
    expect(sf2.calls.cases[0].Renovationsbetrag__c).toBe(50000);
  });

  it("Heizungsart from the documents → Waermeerzeugung__c with the picklist of HYPOTEQ 19.10. B15", async () => {
    expect((await sync(kaufState({ info: { heizung: "Luft-Wasser-Wärmepumpe" } }))).c.Waermeerzeugung__c).toBe("Wärmepumpe Luft-Wasser");
    // A heating none of the values names → «Andere»; the text stays in the JSON.
    const other = await sync(kaufState({ info: { heizung: "Elektro" } }));
    expect(other.c.Waermeerzeugung__c).toBe("Andere");
    expect(other.json.info.heizung).toBe("Elektro");
    // No text, or one that says there is nothing to read → nothing.
    expect((await sync(kaufState())).c).not.toHaveProperty("Waermeerzeugung__c");
    expect((await sync(kaufState({ info: { heizung: "unbekannt" } }))).c).not.toHaveProperty("Waermeerzeugung__c");
    const cases: [string, string | null][] = [
      ["Wärmepumpe", "Wärmepumpe Luft-Wasser"],
      ["Pompe à chaleur air-eau", "Wärmepumpe Luft-Wasser"],
      ["Wärmepumpe Wasser-Wasser", "Wärmepumpe Wasser-Wasser"],
      ["Sole-Wasser-Wärmepumpe (Erdsonde)", "Wärmepumpe Wasser-Wasser"],
      ["Erdsonde", "Wärmepumpe Wasser-Wasser"],
      ["Grundwasser-Wärmepumpe", "Wärmepumpe Wasser-Wasser"],
      ["pompa di calore acqua-acqua", "Wärmepumpe Wasser-Wasser"],
      ["Ölheizung", "Öl"],
      ["Heizöl", "Öl"],
      ["Gasolio", "Öl"],
      ["Erdgas", "Gas Erdgas"],
      ["Gas-Kondensation", "Gas Erdgas"],
      ["Biogas", "Gas Biogas"],
      ["Gasheizung (Biogas)", "Gas Biogas"],
      ["Fernwärme", "Fernwärme"],
      ["Pellets", "Holz"],
      ["Holzschnitzel", "Holz"],
      ["Elektroboiler", "Andere"],
      ["Solarthermie", "Andere"],
      ["keine Angabe", null],
      ["–", null],
      ["", null],
    ];
    for (const [text, want] of cases) expect([text, toWaermeerzeugung(text)]).toEqual([text, want]);
    expect(toWaermeerzeugung(undefined)).toBeNull();
  });
});

describe("Eigenmittel (Handover 8; clashes resolved by V5)", () => {
  const em = { ...EMPTY_EM, spar: 150000, s3a: 40000, pkVor: 50000, pkVerp: 30000, schenk: 20000, erbe: 10000, darl: 25000 };

  it("amounts in the existing fields; Ersparnisse__c and Eigenmittel_Total__c are not written", async () => {
    const { c } = await sync(kaufState({ em }));
    expect(c).toMatchObject({
      Bar__c: 150000,
      X3_Saeule__c: 40000,
      PK_Betrag__c: 50000,
      Schenkung_usw__c: 30000, // Schenkung + Erbvorbezug
      Verpf_ndung_PK__c: "Ja",
    });
    // The funnel's «Eigenmittel total» (with the Darlehen, without the PK-Verpfändung).
    expect(c.Eigenmittel__c).toBe(295000);
    expect(c).not.toHaveProperty("Ersparnisse__c");
    expect(c).not.toHaveProperty("Eigenmittel_Total__c");
  });

  it("the JSON carries the split, the PK-Verpfändung amount, the Darlehen and the funnel's total and %", async () => {
    const { json } = await sync(kaufState({ em }));
    expect(json.answers.eigenmittel).toEqual({ spar: 150000, s3a: 40000, pkVor: 50000, pkVerp: 30000, schenk: 20000, erbe: 10000, darl: 25000 });
    expect(json.calc).toMatchObject({ eigenmittelTotal: 295000, eigenmittelProzent: 29.5, harteEigenmittel: 245000, gesamtfinanzierung: 705000 });
  });

  it("no PK-Verpfändung → Nein; an Ablösung has no Eigenmittel total (its Säule 3a is Vorsorge)", async () => {
    expect((await sync(kaufState())).c.Verpf_ndung_PK__c).toBe("Nein");
    const abl = await sync(ablState({ em: { ...EMPTY_EM, s3a: 25000 } }));
    expect(abl.c.X3_Saeule__c).toBe(25000);
    expect(abl.c).not.toHaveProperty("Eigenmittel__c");
    expect(abl.json.calc).not.toHaveProperty("eigenmittelTotal");
  });
});

describe("Person", () => {
  it("Steueroptimierung chip → Steueroptimierung__c", async () => {
    expect((await sync(kaufState({ ans: { ...kaufState().ans, steuer: "Ja" } }))).c.Steueroptimierung__c).toBe(true);
    expect((await sync(kaufState())).c.Steueroptimierung__c).toBe(false);
  });

  it("Zivilstand and Geburtsdatum from the documents → the Person Account", async () => {
    const { sf } = await sync(kaufState({ info: { zivil: "verheiratet", geb: "04.01.1980" } }));
    expect(sf.calls.accounts[0]).toMatchObject({ Zivilstand__c: "Verheiratet", Geburtsdatum__c: "1980-01-04" });
  });

  it("phone in both roles → Account.Phone (PersonMobilePhone of the proposal is not written)", async () => {
    const kunde = await sync(kaufState());
    expect(kunde.sf.calls.accounts[0]).toMatchObject({ PersonEmail: "lea.muster@kunde.ch", Phone: "079 111 22 33" });
    const berater = await sync(ablState());
    expect(berater.sf.calls.accounts[0]).toMatchObject({ PersonEmail: "marco.beispiel@kunde.ch", Phone: "078 222 33 44" });
    expect(berater.c.Partner_Consultant__c).toBe("003PARTNER");
    for (const r of [kunde, berater]) {
      expect(r.sf.calls.accounts[0]).not.toHaveProperty("PersonMobilePhone");
      expect(r.json.kontakt.telefon).toBeTruthy();
    }
  });

  it("company: a Business Account named after the Firma, the zeichnungsberechtigte Person as its Contact (HYPOTEQ 19.10. B16); the JSON as before", async () => {
    const { sf, c, json } = await sync(jurState());
    expect(sf.calls.accounts).toHaveLength(0); // no Person Account named after the company
    expect(sf.calls.companies).toEqual([{ name: "Immo Beispiel AG", phone: "044 555 66 77", uid: null, sitz: null, street: null }]);
    expect(sf.calls.contacts).toEqual([{ AccountId: "001COMPANY", FirstName: "Petra", LastName: "Beispiel", Email: "info@immo-ag.ch", Phone: "044 555 66 77" }]);
    expect(c).toMatchObject({ AccountId: "001COMPANY", Client__c: "001COMPANY", ContactId: "003SIGNER", Kreditnehmer__c: "Juristische Personen" });
    // The signatory is no longer the first line of the Kommentar (V41).
    expect(c.Kommentar__c ?? null).toBeNull();
    expect(json.kontakt).toEqual({ telefon: "044 555 66 77", zeichnungsberechtigt: "Petra Beispiel" });
    // HYPOTEQ 19.10. D.4: «{Firma} – {PLZ} {Ort}».
    expect(c.Case_Name__c).toBe("Immo Beispiel AG – 8400 Winterthur");
  });

  it("company with Gewerbe → Nutzung «Für eigenes Geschäft»; the Kommentar is the customer's text", async () => {
    const s = jurState({ ans: { ...jurState().ans, nutz: "Gewerbe" }, txt: { ...jurState().txt, kommentar: "Eigene Werkstatt" } });
    const { c } = await sync(s);
    expect(c.Nutzung_der_Immobilie__c).toBe("Für eigenes Geschäft");
    expect(c.Kommentar__c).toBe("Eigene Werkstatt");
  });

  it("Kreditnehmer 2 → Client_2__c only when captured", async () => {
    const one = await sync(kaufState());
    expect(one.c.Client_2__c).toBeNull();
    expect(one.sf.calls.accounts).toHaveLength(1);
    const two = await sync(
      kaufState({
        borrowers: [
          { id: "b1", vor: "Lea", nach: "Muster", job: "Angestellt", pkSe: "Nein" },
          { id: "b2", vor: "Tom", nach: "Muster", pkSe: "Nein" },
        ],
        fin: { ...EMPTY_AMOUNTS, kaufpreis: 1000000, val: 1000000, inc: 120000, inc2: 80000 },
      })
    );
    expect(two.sf.calls.accounts.map((a: any) => `${a.FirstName} ${a.LastName}`)).toEqual(["Lea Muster", "Tom Muster"]);
    expect(two.c.Client_2__c).toBe("0012");
    expect(two.c.Einkommen__c).toBe(200000);
    expect(two.json.answers.einkommenKn2).toBe(80000);
  });
});

describe("Gesamtfinanzierung from the v5 calculation and the JSON (Handover 5, 8)", () => {
  it("Testfall Rosanna: 400'000, not 800'000 from the Objektwert; Tragbarkeit__c 19.6 % (HYPOTEQ 19.10. B1, B14)", async () => {
    const s = kaufState({ fin: { ...EMPTY_AMOUNTS, kaufpreis: 500000, val: 1000000, inc: 150000 } });
    const { c, json } = await sync(s);
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(400000);
    expect(c.Hypothekarvolumen__c).toBe(400000);
    expect(json.calc).toMatchObject({ gesamtfinanzierung: 400000, belehnung: 80, tragbarkeit: 19.6, urteil: "ok" });
    // The same figures in the Percent fields: 19.6 % and the 20 % the 80 % rule leaves.
    expect(c.Tragbarkeit__c).toBe(19.6);
    expect(c.EigenmittelProzent__c).toBe(20);
  });

  it("the foundation's blocks stay: entry, sources, signature", async () => {
    const s = kaufState({ mode: "schnell", src: { "fin.inc": { doc: "Lohnausweis 2025", unsure: false } } } as Partial<FunnelState>);
    const { json } = await sync(s);
    expect(json.entry).toBe("schnell");
    expect(json.sources).toEqual({ "fin.inc": "Lohnausweis 2025" });
    expect(json.signature).toMatchObject({ status: "uploaded", method: "upload" });
  });

  it("Eigenmittel % with Eigenmittel entered is the funnel's «x %»; an Ablösung writes 100 − Belehnung; a company has no Tragbarkeit", async () => {
    const withEm = await sync(kaufState({ em: { ...EMPTY_EM, spar: 150000, s3a: 50000 } }));
    expect(withEm.c.EigenmittelProzent__c).toBe(20);
    expect(withEm.json.calc.eigenmittelProzent).toBe(20);
    const more = await sync(kaufState({ em: { ...EMPTY_EM, spar: 300000 } }));
    expect(more.c.EigenmittelProzent__c).toBe(30);
    // 400'000 + 100'000 on 1'200'000 → Belehnung 41.7 %.
    const abl = await sync(ablState());
    expect(abl.c.EigenmittelProzent__c).toBe(58.3);
    expect(abl.c.Tragbarkeit__c).toBe(abl.json.calc.tragbarkeit);
    const jur = await sync(jurState());
    expect(jur.c).not.toHaveProperty("Tragbarkeit__c");
    expect(jur.c.EigenmittelProzent__c).toBe(20);
  });

  it("withV5CheckStateBlocks leaves foreign or oversized values alone", () => {
    expect(withV5CheckStateBlocks("not json", { calc: { a: 1 } })).toBe("not json");
    const json = JSON.stringify({ version: 1 });
    expect(withV5CheckStateBlocks(json, { calc: { a: 1 } }, 20)).toBe(json);
    expect(JSON.parse(withV5CheckStateBlocks(json, { calc: { a: 1 }, kontakt: {} }))).toEqual({ version: 1, calc: { a: 1 } });
  });
});

describe("evaluable fields of HYPOTEQ 19.10. (B13, B15, B17, D.1)", () => {
  it("Geschätzter Objektwert → Geschaetzter_Objektwert__c as entered; empty at a Kauf → not written", async () => {
    expect((await sync(kaufState({ fin: { ...kaufState().fin, val: 1100000 } }))).c.Geschaetzter_Objektwert__c).toBe(1100000);
    const empty = await sync(kaufState({ fin: { ...kaufState().fin, val: 0 } }));
    expect(empty.c).not.toHaveProperty("Geschaetzter_Objektwert__c");
    expect(empty.c.Kaufpreis__c).toBe(1000000);
    expect((await sync(ablState())).c.Geschaetzter_Objektwert__c).toBe(1200000);
  });

  it("Erhöhung → Erh_hung__c (the field in use); Erh_hung_betrag__c is never written", async () => {
    const { c } = await sync(ablState());
    expect(c.Erh_hung__c).toBe(100000);
    expect(c).not.toHaveProperty("Erh_hung_betrag__c");
    const none = await sync(ablState({ ans: { ...ablState().ans, aufstockung: "Nein" }, fin: { ...ablState().fin, up: 0 } }));
    expect(none.c.Erh_hung__c ?? null).toBeNull();
  });

  it("Wie_viele_Kunden__c = the borrowers linked in Salesforce", async () => {
    expect((await sync(kaufState())).c.Wie_viele_Kunden__c).toBe("1");
    const two = await sync(
      kaufState({
        borrowers: [
          { id: "b1", vor: "Lea", nach: "Muster", job: "Angestellt", pkSe: "Nein" },
          { id: "b2", vor: "Tom", nach: "Muster", pkSe: "Nein" },
        ],
      })
    );
    expect(two.c.Wie_viele_Kunden__c).toBe("2");
  });

  it("at most 3 borrowers in Salesforce; a fourth one does not cost the lead", async () => {
    const sf = fakeSalesforce();
    const p = v5Payload(kaufState());
    delete p.v3;
    p.property.kreditnehmer = ["Anna", "Ben", "Cleo", "Dan"].map((v, i) => ({ vorname: v, name: "Muster", email: `${v.toLowerCase()}@kunde.ch`, telefon: `07900000${i}` }));
    await syncFunnelStepsToSalesforce(p, sf.api);
    expect(sf.calls.accounts).toHaveLength(3);
    expect(sf.calls.cases[0]).toMatchObject({ Wie_viele_Kunden__c: "3", Client_3__c: "0013" });
  });

  it("Darlehen → Darlehen_Eigenmittel__c (Currency); the Eigenmittel total keeps it, the JSON too", async () => {
    const { c, json } = await sync(kaufState({ em: { ...EMPTY_EM, spar: 100000, darl: 40000 } }));
    expect(c.Darlehen_Eigenmittel__c).toBe(40000);
    expect(c.Eigenmittel__c).toBe(140000);
    expect(json.answers.eigenmittel.darl).toBe(40000);
    expect((await sync(kaufState())).c.Darlehen_Eigenmittel__c ?? null).toBeNull();
  });

  it("the chips in Checkboxes, true and false, beside the JSON answers", async () => {
    const on = await sync(kaufState({ ans: { ...kaufState().ans, kredite: "Ja", leasing: "Ja", unterhalt: "Ja", buerge: "Ja" }, txt: { ...kaufState().txt, buergeName: "Max Bürge" } }));
    expect(on.c).toMatchObject({ Privatkredit__c: true, Leasing__c: true, Unterhaltspflicht__c: true, Solidarbuergschaft__c: true });
    expect(on.json.answers).toMatchObject({ kredite: "Ja", leasing: "Ja", unterhalt: "Ja", buerge: "Ja" });
    const off = await sync(kaufState());
    expect(off.c).toMatchObject({ Privatkredit__c: false, Leasing__c: false, Unterhaltspflicht__c: false, Solidarbuergschaft__c: false });
  });

  it("legacy payloads: no chip Checkboxes; the v1 immobilienwert is the Geschätzter Objektwert", async () => {
    const sf = fakeSalesforce();
    const p = v5Payload(kaufState());
    delete p.v3;
    p.financing.immobilienwert = "950000";
    await syncFunnelStepsToSalesforce(p, sf.api);
    const c = sf.calls.cases[0];
    expect(c).not.toHaveProperty("Privatkredit__c");
    expect(c).not.toHaveProperty("Solidarbuergschaft__c");
    expect(c.Geschaetzter_Objektwert__c).toBe(950000);
  });

  it("B13 stays as confirmed: Ersparnisse → Bar__c, Eigenmittel total → Eigenmittel__c, phone → Account.Phone", async () => {
    const { sf, c } = await sync(kaufState({ em: { ...EMPTY_EM, spar: 120000 } }));
    expect(c).toMatchObject({ Bar__c: 120000, Eigenmittel__c: 120000 });
    expect(sf.calls.accounts[0].Phone).toBe("079 111 22 33");
  });

  it("every field written is in the field configuration (writeWithFieldFallback drops what the org lacks)", async () => {
    const { c } = await sync(kaufState({ ans: { ...kaufState().ans, reno: "Ja" }, fin: { ...kaufState().fin, renoBetrag: 1, val: 1 }, txt: { ...kaufState().txt, kaufdatum: "01.01.2027" }, em: { ...EMPTY_EM, darl: 1 } }));
    for (const f of ["Renovationsbetrag__c", "Kaufdatum__c", "Kaufdatum_Datum__c", "Geschaetzter_Objektwert__c", "Darlehen_Eigenmittel__c", "Privatkredit__c", "Leasing__c", "Unterhaltspflicht__c", "Solidarbuergschaft__c", "Wie_viele_Kunden__c", "Tragbarkeit__c", "EigenmittelProzent__c"]) {
      expect([f, f in c]).toEqual([f, true]);
      expect([f, SALESFORCE_CASE_FIELDS[f]]).toEqual([f, expect.any(String)]);
    }
  });
});
