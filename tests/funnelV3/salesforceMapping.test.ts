/**
 * Funnel v3 → Salesforce mapping gaps found by the audit (DECISIONS S6–S9):
 *   S6 Gesamtfinanzierung (financing.hypoBetrag) instead of Kaufpreis − 0 for a v3 Kauf
 *   S7 Anrede → PersonAccount.Salutation on a NEW Account only
 *   S8 Verpf_ndung_PK__c from ans.pk, FR/IT spellings normalised
 *   S9 Ferienobjekt leaves Art_der_Liegenschaft__c unset
 * Every change is guarded by `stepData.v3`; the legacy payloads here pin the old behaviour.
 * The Salesforce API is faked in memory — nothing leaves the process.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { toInquiryPayload } from "@/lib/funnel-v3/toInquiryPayload";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_TEXTS, type FunnelState } from "@/lib/funnel-v3/types";
import { syncFunnelStepsToSalesforce, toSalesforceSalutation } from "@/components/syncFunnelStepsToSalesforce";

const SUBMISSION = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";

/** v3 Kunde, Neue Hypothek: Kaufpreis 1'000'000, Objektwert 1'000'000, Einkommen 200'000. */
const kauf = (over: Partial<FunnelState> = {}): FunnelState => ({
  role: "kunde",
  ans: {
    ...DEFAULT_ANSWERS,
    antrag: "Neue Hypothek",
    anrede: "Herr",
    immo: "Bestehende Immobilie",
    lieg: "Einfamilienhaus",
    nutz: "Selbstbewohnt",
    laufzeit: "10 Jahre",
  },
  borrowers: [{ id: "b1", vor: "Gary", nach: "Gerber", job: "Angestellt", pkSe: "Nein" }],
  txt: { ...EMPTY_TEXTS, vor: "Gary", nach: "Gerber", mail: "gary.gerber@example.ch", tel: "079 123 45 67", plz: "8820", ort: "Wädenswil" },
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

/** The existing Tragbarkeit formula of the sync (S1), primary residence. */
const tragbarkeit = (mortgage: number, income: number) =>
  Math.round((mortgage * (0.05 + 0.008 + (0.8 - 0.6667) / 15)) / income * 100 * 10) / 10;

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
  it("uses hypoBetrag (Objektwert × 80 %) instead of Kaufpreis − 0", async () => {
    const sf = fakeSalesforce();
    const p = v3();
    expect(p.financing.hypoBetrag).toBe("800000");
    await syncFunnelStepsToSalesforce(p, sf.api);
    const c = sf.calls.cases[0];
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(800000);
    expect(c.Hypothekarvolumen__c).toBe(800000);
    expect(c.EigenmittelProzent__c).toBe(20);
    expect(c.Tragbarkeit__c).toBe(tragbarkeit(800000, 200000));
    expect(c.Tragbarkeit__c).toBe(26.8);
    // No amount was entered, so no Eigenmittel__c.
    expect(c.Eigenmittel__c ?? null).toBeNull();
    expect(c.Kaufpreis__c).toBe(1000000);
  });

  it("falls back to the Kaufpreis as object value when no Objektwert was given", async () => {
    const sf = fakeSalesforce();
    const p = v3({ fin: { ...EMPTY_AMOUNTS, kaufpreis: 1000000, val: 900000, inc: 200000 } });
    // calc.ts: need = val × 80 % = 720'000; Eigenmittel % on the Objektwert.
    await syncFunnelStepsToSalesforce(p, sf.api);
    const c = sf.calls.cases[0];
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(720000);
    expect(c.EigenmittelProzent__c).toBe(20);

    const sf2 = fakeSalesforce();
    const p2 = v3();
    p2.financing.immobilienwert = "";
    await syncFunnelStepsToSalesforce(p2, sf2.api);
    expect(sf2.calls.cases[0].EigenmittelProzent__c).toBe(20); // (1'000'000 − 800'000) / Kaufpreis
  });

  it("Ablösung: Gesamtfinanzierung = old + Erhöhung, as before", async () => {
    const sf = fakeSalesforce();
    const p = v3({
      ans: { ...kauf().ans, antrag: "Ablösung", aufstockung: "Ja" },
      fin: { ...EMPTY_AMOUNTS, old: 449000, up: 201000, inc: 125000, val: 1450000 },
    });
    await syncFunnelStepsToSalesforce(p, sf.api);
    const c = sf.calls.cases[0];
    expect(c.Gesch_tzter_Hypothekenbedarf__c).toBe(650000);
    expect(c.Hypothekarvolumen__c).toBe(650000);
    expect(c.EigenmittelProzent__c).toBe(55.2);
    expect(c.Tragbarkeit__c).toBe(tragbarkeit(650000, 125000));
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
    expect(sf.calls.accounts[0]).toMatchObject({ FirstName: "Gary", LastName: "Gerber", Salutation: "Mr." });
  });

  it("writes Mrs. for Frau", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3({ ans: { ...kauf().ans, anrede: "Frau" }, txt: { ...kauf().txt, vor: "Anna" } }), sf.api);
    expect(sf.calls.accounts[0]).toMatchObject({ FirstName: "Anna", Salutation: "Mrs." });
  });

  it("does not touch the salutation of an existing Account", async () => {
    const sf = fakeSalesforce({ existingAccount: { Id: "001EXIST", PersonEmail: "gary.gerber@example.ch", IsPersonAccount: true } });
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
    expect(sf.calls.accounts[0]).toMatchObject({ FirstName: "Gary", LastName: "Gerber" });
    expect(sf.calls.cases[0].Client__c).toBe("0011");
    expect(result.case).toEqual({ id: "500CASE" });
  });

  it("co-borrowers and legacy payloads get no Salutation", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(
      v3({ borrowers: [...kauf().borrowers, { id: "b2", vor: "Anna", nach: "Gerber", job: "Angestellt", pkSe: "Nein" }] }),
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
  it("ans.pk = Ja → 'Ja', Nein → 'Nein'", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3({ ans: { ...kauf().ans, pk: "Ja" } }), sf.api);
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

describe("S9 — Ferienobjekt", () => {
  it("leaves Art_der_Liegenschaft__c unset; Stockwerkeigentum still yields Wohnung", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3({ ans: { ...kauf().ans, lieg: "Ferienobjekt", nutz: "Zweitwohnsitz" } }), sf.api);
    const c = sf.calls.cases[0];
    expect(c.Art_der_Liegenschaft__c ?? null).toBeNull();
    // The Nutzung and the Zweitwohnsitz rule (no amortisation in the Tragbarkeit) stay intact.
    expect(c.Nutzung_der_Immobilie__c).toBe("Zweitwohnsitz");
    expect(c.Tragbarkeit__c).toBe(Math.round((800000 * 0.058) / 200000 * 100 * 10) / 10);

    const sf2 = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3({ ans: { ...kauf().ans, lieg: "Stockwerkeigentum" } }), sf2.api);
    expect(sf2.calls.cases[0].Art_der_Liegenschaft__c).toBe("Wohnung");

    const sf3 = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3({ ans: { ...kauf().ans, lieg: "Mehrfamilienhaus" } }), sf3.api);
    expect(sf3.calls.cases[0].Art_der_Liegenschaft__c).toBe("Mehrfamilienhaus");
  });
});
