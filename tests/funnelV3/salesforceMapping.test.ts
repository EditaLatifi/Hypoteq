/**
 * Funnel v3 → Salesforce mapping gaps found by the audit (DECISIONS S6–S9):
 *   S6 Gesamtfinanzierung from the funnel calculation (v5: Kaufpreis-based, Handover 5); since
 *      HYPOTEQ 19.10. B14 also Tragbarkeit__c / EigenmittelProzent__c from calc.ts (v5 payloads)
 *   S7 Anrede → PersonAccount.Salutation on a NEW Account only
 *   S8 Verpf_ndung_PK__c from the PK-Verpfändung amount (v5), FR/IT spellings normalised
 *   S9 an old Ferienobjekt leaves Art_der_Liegenschaft__c unset
 * Every change is guarded by `stepData.v3`; the legacy payloads here pin the old behaviour.
 * The Salesforce API is faked in memory — nothing leaves the process.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { toInquiryPayload } from "@/lib/funnel-v3/toInquiryPayload";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_EM, EMPTY_TEXTS, type FunnelState } from "@/lib/funnel-v3/types";
import { syncFunnelStepsToSalesforce, toSalesforceSalutation } from "@/components/syncFunnelStepsToSalesforce";

const SUBMISSION = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";

/** v3 Kunde, Neue Hypothek: Kaufpreis 1'000'000, Objektwert 1'000'000, Einkommen 200'000. */
const kauf = (over: Partial<FunnelState> = {}): FunnelState => ({
  role: "kunde",
  mode: "begleitet",
  em: { ...EMPTY_EM },
  info: {},
  src: {},
  touched: {},
  sig: null,
  ans: {
    ...DEFAULT_ANSWERS,
    antrag: "Neue Hypothek",
    anrede: "Herr",
    immo: "Bestehende Immobilie",
    lieg: "Einfamilienhaus",
    nutz: "Selbstbewohnt",
    laufzeit: "10 Jahre",
  },
  borrowers: [{ id: "b1", vor: "Max", nach: "Mustermann", job: "Angestellt", pkSe: "Nein" }],
  txt: { ...EMPTY_TEXTS, vor: "Max", nach: "Mustermann", mail: "max.mustermann@example.ch", tel: "079 123 45 67", plz: "8000", ort: "Zürich" },
  fin: { ...EMPTY_AMOUNTS, kaufpreis: 1000000, val: 1000000, inc: 200000 },
  ...over,
});

const v3 = (over: Partial<FunnelState> = {}) => toInquiryPayload(kauf(over), { locale: "de", submissionId: SUBMISSION }) as any;

/** The old funnel's Kauf payload (no `v3`): Eigenmittel entered, hypoBetrag only informative. */
const legacyKauf = (financing: Record<string, string> = {}) => ({
  customerType: "direct",
  client: { firstName: "Lea", lastName: "Legacy", email: "lea@example.ch", phone: "079 000 00 00" },
  project: { projektArt: "kauf", borrowerType: "nat" },
  property: {
    zip: "8000",
    ort: "Zürich",
    artLiegenschaft: "Einfamilienhaus",
    nutzung: "Selbstbewohnt",
    kreditnehmer: [{ vorname: "Lea", name: "Legacy", email: "lea@example.ch", telefon: "079 000 00 00", erwerb: "angestellt" }],
  },
  financing: { kaufpreis: "1000000", eigenmittel_bar: "150000", eigenmittel_saeule3: "50000", brutto: "200000", ...financing },
  borrowers: [{ type: "nat" }],
});

/** The existing Tragbarkeit formula of the sync (S1), primary residence — legacy payloads only. */
const tragbarkeit = (mortgage: number, income: number) =>
  Math.round((mortgage * (0.05 + 0.008 + (0.8 - 0.6667) / 15)) / income * 100 * 10) / 10;

/** The Handover formula (calc.ts) a v5 payload writes since HYPOTEQ 19.10. B14. */
const v5Tragbarkeit = (mortgage: number, basis: number, income: number) =>
  Math.round(((mortgage * 0.05 + Math.max(mortgage - (basis * 2) / 3, 0) / 15 + basis * 0.01) / income) * 100 * 10) / 10;

/** In-memory stand-in for components/salesforceApi. */
function fakeSalesforce(opts: { existingAccount?: any; rejectSalutationOnce?: boolean } = {}) {
  const calls: { accounts: any[]; updates: any[]; cases: any[] } = { accounts: [], updates: [], cases: [] };
  let n = 0;
  let rejected = false;
  return {
    calls,
    api: {
      findAccountByEmail: jest.fn(async () => opts.existingAccount ?? null),
      createAccount: jest.fn(async (data: any) => {
        if (opts.rejectSalutationOnce && data.Salutation && !rejected) {
          rejected = true;
          throw Object.assign(new Error("Unable to create/update fields: Salutation"), { errorCode: "INVALID_FIELD_FOR_INSERT_UPDATE", fields: ["Salutation"] });
        }
        calls.accounts.push(data);
        return { id: `001${++n}` };
      }),
      updatePersonAccount: jest.fn(async (_id: string, data: any) => {
        calls.updates.push(data);
        return {};
      }),
      findContactByEmail: jest.fn(async () => null),
      findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQ" })),
      createOrUpdateCase: jest.fn(async (data: any) => {
        calls.cases.push(data);
        return { id: "500CASE" };
      }),
    },
  };
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("S6 — Gesamtfinanzierung of a v3 Kauf", () => {
  it("uses the funnel's Hypothek (Kaufpreis × 80 % without Eigenmittel) instead of Kaufpreis − 0", async () => {
    const sf = fakeSalesforce();
    const p = v3();
    expect(p.financing.hypoBetrag).toBe("800000");
    await syncFunnelStepsToSalesforce(p, sf.api);
    const c = sf.calls.cases[0];
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(800000);
    expect(c.Hypothekarvolumen__c).toBe(800000);
    // HYPOTEQ 19.10. B14: the funnel's values (calc.ts), no longer S1 (26.8 %).
    expect(c.EigenmittelProzent__c).toBe(20);
    expect(c.Tragbarkeit__c).toBe(v5Tragbarkeit(800000, 1000000, 200000));
    expect(c.Tragbarkeit__c).toBe(29.4);
    // No amount was entered, so no Eigenmittel__c.
    expect(c.Eigenmittel__c ?? null).toBeNull();
    expect(c.Kaufpreis__c).toBe(1000000);
  });

  it("a lower Objektwert lowers the Belehnungsbasis, not the Eigenmittel % of the Gesamtkosten", async () => {
    const sf = fakeSalesforce();
    const p = v3({ fin: { ...EMPTY_AMOUNTS, kaufpreis: 1000000, val: 900000, inc: 200000 } });
    // calc.ts v5: need = Kaufpreis × 80 % = 800'000 (not the Objektwert). HYPOTEQ 19.10. B14:
    // Eigenmittel % = (Gesamtkosten − Hypothek) / Gesamtkosten (was 11.1 on the Objektwert, S6).
    await syncFunnelStepsToSalesforce(p, sf.api);
    const c = sf.calls.cases[0];
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(800000);
    expect(c.EigenmittelProzent__c).toBe(20);
    expect(c.Tragbarkeit__c).toBe(v5Tragbarkeit(800000, 900000, 200000));
    expect(c.Geschaetzter_Objektwert__c).toBe(900000);

    // The payload's immobilienwert does not matter for a v5 payload: the answers are read.
    const sf2 = fakeSalesforce();
    const p2 = v3();
    p2.financing.immobilienwert = "";
    await syncFunnelStepsToSalesforce(p2, sf2.api);
    expect(sf2.calls.cases[0].EigenmittelProzent__c).toBe(20); // (1'000'000 − 800'000) / Gesamtkosten
  });

  it("Ablösung: Gesamtfinanzierung = old + Erhöhung, as before", async () => {
    const sf = fakeSalesforce();
    const p = v3({
      ans: { ...kauf().ans, antrag: "Ablösung", aufstockung: "Ja" },
      fin: { ...EMPTY_AMOUNTS, old: 380000, up: 170000, inc: 110000, val: 1240000 },
    });
    await syncFunnelStepsToSalesforce(p, sf.api);
    const c = sf.calls.cases[0];
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(550000);
    expect(c.Hypothekarvolumen__c).toBe(550000);
    // 100 − Belehnung (550'000 / 1'240'000) — the same figure S6 wrote.
    expect(c.EigenmittelProzent__c).toBe(55.6);
    // HYPOTEQ 19.10. B14: the funnel's Tragbarkeit (basis = Objektwert), not S1.
    expect(c.Tragbarkeit__c).toBe(v5Tragbarkeit(550000, 1240000, 110000));
    expect(c.Tragbarkeit__c).toBe(36.3);
  });

  it("legacy Kauf payload: Kaufpreis − Eigenmittel, hypoBetrag ignored, Eigenmittel__c written", async () => {
    const sf = fakeSalesforce();
    // hypoBetrag is present in legacy payloads too (informative) and must not be used.
    await syncFunnelStepsToSalesforce(legacyKauf({ hypoBetrag: "500000" }), sf.api);
    const c = sf.calls.cases[0];
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(800000);
    expect(c.Hypothekarvolumen__c).toBe(800000);
    expect(c.EigenmittelProzent__c).toBe(20);
    expect(c.Eigenmittel__c).toBe(200000);
    expect(c.Tragbarkeit__c).toBe(tragbarkeit(800000, 200000));
  });

  it("legacy Kauf payload without Eigenmittel is still booked as 100 % financed", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(legacyKauf({ eigenmittel_bar: "", eigenmittel_saeule3: "", hypoBetrag: "800000" }), sf.api);
    const c = sf.calls.cases[0];
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(1000000);
    expect(c.EigenmittelProzent__c).toBe(0);
    expect(c.Tragbarkeit__c).toBe(tragbarkeit(1000000, 200000));
  });
});

describe("S7 — Anrede → Salutation", () => {
  it("maps Herr/Frau", () => {
    expect(toSalesforceSalutation("Herr")).toBe("Mr.");
    expect(toSalesforceSalutation("Frau")).toBe("Mrs.");
    expect(toSalesforceSalutation("")).toBeNull();
    expect(toSalesforceSalutation(null)).toBeNull();
    expect(toSalesforceSalutation("Dr.")).toBeNull();
  });

  it("writes Mr. on the created Person Account", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3(), sf.api);
    expect(sf.calls.accounts).toHaveLength(1);
    expect(sf.calls.accounts[0]).toMatchObject({ FirstName: "Max", LastName: "Mustermann", Salutation: "Mr." });
  });

  it("writes Mrs. for Frau", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3({ ans: { ...kauf().ans, anrede: "Frau" }, txt: { ...kauf().txt, vor: "Anna" } }), sf.api);
    expect(sf.calls.accounts[0]).toMatchObject({ FirstName: "Anna", Salutation: "Mrs." });
  });

  it("does not touch the salutation of an existing Account", async () => {
    const sf = fakeSalesforce({ existingAccount: { Id: "001EXIST", PersonEmail: "max.mustermann@example.ch", IsPersonAccount: true } });
    await syncFunnelStepsToSalesforce(v3(), sf.api);
    expect(sf.api.createAccount).not.toHaveBeenCalled();
    expect(sf.calls.updates).toHaveLength(1);
    expect(sf.calls.updates[0]).not.toHaveProperty("Salutation");
    expect(sf.calls.updates[0]).toMatchObject({ Phone: "079 123 45 67", Erwerbsstatus__c: "Angestellt" });
    expect(sf.calls.cases[0].Client__c).toBe("001EXIST");
  });

  it("a rejected Salutation does not cost the Account or the Case", async () => {
    const sf = fakeSalesforce({ rejectSalutationOnce: true });
    const result = await syncFunnelStepsToSalesforce(v3(), sf.api);
    expect(sf.api.createAccount).toHaveBeenCalledTimes(2);
    expect(sf.calls.accounts).toHaveLength(1);
    expect(sf.calls.accounts[0]).not.toHaveProperty("Salutation");
    expect(sf.calls.accounts[0]).toMatchObject({ FirstName: "Max", LastName: "Mustermann" });
    expect(sf.calls.cases[0].Client__c).toBe("0011");
    expect(result.case).toEqual({ id: "500CASE" });
  });

  it("co-borrowers and legacy payloads get no Salutation", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(
      v3({ borrowers: [...kauf().borrowers, { id: "b2", vor: "Anna", nach: "Mustermann", job: "Angestellt", pkSe: "Nein" }] }),
      sf.api
    );
    expect(sf.calls.accounts).toHaveLength(2);
    expect(sf.calls.accounts[0].Salutation).toBe("Mr.");
    expect(sf.calls.accounts[1]).not.toHaveProperty("Salutation");

    const legacy = fakeSalesforce();
    await syncFunnelStepsToSalesforce(legacyKauf(), legacy.api);
    expect(legacy.calls.accounts[0]).not.toHaveProperty("Salutation");
  });
});

describe("S8 — Verpf_ndung_PK__c", () => {
  it("a PK-Verpfändung amount → 'Ja', none → 'Nein'", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3({ em: { ...EMPTY_EM, pkVerp: 50000 } }), sf.api);
    expect(sf.calls.cases[0].Verpf_ndung_PK__c).toBe("Ja");

    const sf2 = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3(), sf2.api);
    expect(sf2.calls.cases[0].Verpf_ndung_PK__c).toBe("Nein");
  });

  it("normalises the French and Italian spellings in the picklist sanitiser", async () => {
    for (const [raw, want] of [["Oui", "Ja"], ["Sì", "Ja"], ["si", "Ja"], ["Non", "Nein"], ["no", "Nein"], ["ja", "Ja"], ["YES", "Ja"]]) {
      const sf = fakeSalesforce();
      const p = v3();
      p.financing.pkVorbezug = raw;
      await syncFunnelStepsToSalesforce(p, sf.api);
      expect([raw, sf.calls.cases[0].Verpf_ndung_PK__c]).toEqual([raw, want]);
    }
  });
});

describe("S9 — Ferienobjekt (no longer offered, Handover 2)", () => {
  it("an old one leaves Art_der_Liegenschaft__c unset; Stockwerkeigentum still yields Wohnung", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3({ ans: { ...kauf().ans, lieg: "Ferienobjekt" as any, nutz: "Zweitwohnsitz" } }), sf.api);
    const c = sf.calls.cases[0];
    expect(c.Art_der_Liegenschaft__c ?? null).toBeNull();
    // The Nutzung stays intact. The Tragbarkeit is the funnel's (HYPOTEQ 19.10. B14): the Handover
    // formula has no Zweitwohnsitz rule (the old S1 rule left the amortisation out).
    expect(c.Nutzung_der_Immobilie__c).toBe("Zweitwohnsitz");
    expect(c.Tragbarkeit__c).toBe(v5Tragbarkeit(800000, 1000000, 200000));

    const sf2 = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3({ ans: { ...kauf().ans, lieg: "Stockwerkeigentum" } }), sf2.api);
    expect(sf2.calls.cases[0].Art_der_Liegenschaft__c).toBe("Wohnung");

    const sf3 = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3({ ans: { ...kauf().ans, lieg: "Mehrfamilienhaus" } }), sf3.api);
    expect(sf3.calls.cases[0].Art_der_Liegenschaft__c).toBe("Mehrfamilienhaus");
  });
});

describe("fields Salesforce refused are reported, not lost silently", () => {
  it("hands the API's dropped-field list through in the sync result", async () => {
    const sf = fakeSalesforce();
    const api = { ...sf.api, takeDroppedFields: jest.fn(() => ["Case.Partner_Consultant__c (INVALID_FIELD)"]) };
    const result = await syncFunnelStepsToSalesforce(v3(kauf()), api as any);
    expect(api.takeDroppedFields).toHaveBeenCalledTimes(1);
    expect((result as any).droppedFields).toEqual(["Case.Partner_Consultant__c (INVALID_FIELD)"]);
  });

  it("is an empty list for an API without a collector (fakes, older builds)", async () => {
    const sf = fakeSalesforce();
    const result = await syncFunnelStepsToSalesforce(v3(kauf()), sf.api);
    expect((result as any).droppedFields).toEqual([]);
  });
});
