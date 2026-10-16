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

import { syncFunnelStepsToSalesforce, toSalesforceDate, toWaermeerzeugung, withV5CheckStateBlocks } from "@/components/syncFunnelStepsToSalesforce";
import { SALESFORCE_CASE_FIELDS } from "@/components/salesforceFieldConfig";
import { EMPTY_AMOUNTS, EMPTY_EM, type FunnelState } from "@/lib/funnel-v3/types";
import { ablState, jurState, kaufState, v5Payload } from "./v5Fixtures";

function fakeSalesforce() {
  const calls: { accounts: any[]; updates: any[]; cases: any[] } = { accounts: [], updates: [], cases: [] };
  let n = 0;
  return {
    calls,
    api: {
      findAccountByEmail: jest.fn(async () => null),
      createAccount: jest.fn(async (data: any) => {
        calls.accounts.push(data);
        return { id: `001${++n}` };
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

  it("Kaufdatum → Kaufdatum__c as a date; a typo is not sent; at an Ablösung the Ablösedatum of the Zinsabrechnung", async () => {
    expect((await sync(kaufState({ txt: { ...kaufState().txt, kaufdatum: "30.11.2026" } }))).c.Kaufdatum__c).toBe("2026-11-30");
    const typo = await sync(kaufState({ txt: { ...kaufState().txt, kaufdatum: "Ende 2026" } }));
    expect(typo.c.Kaufdatum__c ?? null).toBeNull();
    expect(typo.json.answers.kaufdatum).toBe("Ende 2026");
    expect((await sync(ablState({ info: { abl: "30.01.2028" } }))).c.Kaufdatum__c).toBe("2028-01-30");
    expect(SALESFORCE_CASE_FIELDS.Kaufdatum__c).toBe("date");
  });

  it("toSalesforceDate: real calendar dates only", () => {
    expect(toSalesforceDate("1.2.2026")).toBe("2026-02-01");
    expect(toSalesforceDate("2026-02-01")).toBe("2026-02-01");
    expect(toSalesforceDate("31.02.2026")).toBeNull();
    expect(toSalesforceDate("19.05.26")).toBeNull();
    expect(toSalesforceDate("")).toBeNull();
    expect(toSalesforceDate(undefined)).toBeNull();
  });

  it("Renovation Ja/Nein → Gibt_es_Renovationen…; the Renovationsbetrag only in the JSON (V4), but in the Gesamtfinanzierung", async () => {
    const { c, json } = await sync(kaufState({ ans: { ...kaufState().ans, reno: "Ja" }, fin: { ...kaufState().fin, renoBetrag: 80000 } }));
    expect(c.Gibt_es_Renovationen_oder_Zusatzkosten__c).toBe(true);
    expect(c.Betrag__c ?? null).toBeNull();
    expect(json.answers.renovationsBetrag).toBe(80000);
    // (1'000'000 + 80'000) × 80 %
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(864000);
    expect((await sync(kaufState())).c.Gibt_es_Renovationen_oder_Zusatzkosten__c).toBe(false);
  });

  it("Heizungsart from the documents → Waermeerzeugung__c; unknown values are not sent", async () => {
    expect((await sync(kaufState({ info: { heizung: "Luft-Wasser-Wärmepumpe" } }))).c.Waermeerzeugung__c).toBe("Wärmepumpe Luft-Wasser");
    const unknown = await sync(kaufState({ info: { heizung: "Elektro" } }));
    expect(unknown.c).not.toHaveProperty("Waermeerzeugung__c");
    expect(unknown.json.info.heizung).toBe("Elektro");
    expect(toWaermeerzeugung("Ölheizung")).toBe("Öl");
    expect(toWaermeerzeugung("Heizöl")).toBe("Öl");
    expect(toWaermeerzeugung("Gasolio")).toBe("Öl");
    expect(toWaermeerzeugung("Erdgas")).toBe("Gas Erdgas");
    expect(toWaermeerzeugung("Gas-Kondensation")).toBe("Gas Erdgas");
    expect(toWaermeerzeugung("Fernwärme")).toBe("Fernwärme");
    expect(toWaermeerzeugung("Pellets")).toBe("Holz");
    expect(toWaermeerzeugung("Elektroboiler")).toBeNull();
    expect(toWaermeerzeugung("")).toBeNull();
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

  it("company: Account named after the Firma with its phone; the zeichnungsberechtigte Person on the Case and in the JSON", async () => {
    const { sf, c, json } = await sync(jurState());
    expect(sf.calls.accounts).toHaveLength(1);
    expect(sf.calls.accounts[0]).toMatchObject({ LastName: "Immo Beispiel AG", PersonEmail: "info@immo-ag.ch", Phone: "044 555 66 77" });
    expect(c.Kreditnehmer__c).toBe("Juristische Personen");
    expect(c.Kommentar__c).toBe("Zeichnungsberechtigte Person: Petra Beispiel");
    expect(json.kontakt).toEqual({ telefon: "044 555 66 77", zeichnungsberechtigt: "Petra Beispiel" });
    expect(c.Case_Name__c).toBe("8400 Winterthur / Immo Beispiel AG");
  });

  it("company with Gewerbe → Nutzung «Für eigenes Geschäft»; the Kommentar keeps the customer's text", async () => {
    const s = jurState({ ans: { ...jurState().ans, nutz: "Gewerbe" }, txt: { ...jurState().txt, kommentar: "Eigene Werkstatt" } });
    const { c } = await sync(s);
    expect(c.Nutzung_der_Immobilie__c).toBe("Für eigenes Geschäft");
    expect(c.Kommentar__c).toBe("Zeichnungsberechtigte Person: Petra Beispiel\n\nEigene Werkstatt");
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
  it("Testfall Rosanna: 400'000, not 800'000 from the Objektwert", async () => {
    const s = kaufState({ fin: { ...EMPTY_AMOUNTS, kaufpreis: 500000, val: 1000000, inc: 150000 } });
    const { c, json } = await sync(s);
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(400000);
    expect(c.Hypothekarvolumen__c).toBe(400000);
    expect(json.calc).toMatchObject({ gesamtfinanzierung: 400000, belehnung: 80, tragbarkeit: 19.6, urteil: "ok" });
  });

  it("the foundation's blocks stay: entry, sources, signature", async () => {
    const s = kaufState({ mode: "schnell", src: { "fin.inc": { doc: "Lohnausweis 2025", unsure: false } } } as Partial<FunnelState>);
    const { json } = await sync(s);
    expect(json.entry).toBe("schnell");
    expect(json.sources).toEqual({ "fin.inc": "Lohnausweis 2025" });
    expect(json.signature).toMatchObject({ status: "uploaded", method: "upload" });
  });

  it("withV5CheckStateBlocks leaves foreign or oversized values alone", () => {
    expect(withV5CheckStateBlocks("not json", { calc: { a: 1 } })).toBe("not json");
    const json = JSON.stringify({ version: 1 });
    expect(withV5CheckStateBlocks(json, { calc: { a: 1 } }, 20)).toBe(json);
    expect(JSON.parse(withV5CheckStateBlocks(json, { calc: { a: 1 }, kontakt: {} }))).toEqual({ version: 1, calc: { a: 1 } });
  });
});
