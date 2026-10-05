import { describe, it, expect, jest } from "@jest/globals";
import { toInquiryPayload, buildKommentar } from "@/lib/funnel-v3/toInquiryPayload";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_TEXTS, type FunnelState } from "@/lib/funnel-v3/types";
import { syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";

// The sync resolves the partner through the partner directory (a live Salesforce query in
// production). Answered here so nothing leaves the process.
jest.mock("@/components/partnerDirectory", () => {
  const actual = jest.requireActual("@/components/partnerDirectory") as object;
  return {
    ...actual,
    resolvePartner: jest.fn(async () => ({
      status: "partner",
      contactId: "003PARTNER",
      accountId: "001SALESPARTNER",
      name: "Petra Partner",
      firstName: "Petra",
      lastName: "Partner",
      company: "Partner AG",
    })),
  };
});

const SUBMISSION = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";

/** Fall Gerber (spec header, sample dossier): Ablösung + Erhöhung, STWE, Wädenswil. */
const gerber = (over: Partial<FunnelState> = {}): FunnelState => ({
  role: "kunde",
  ans: {
    ...DEFAULT_ANSWERS,
    antrag: "Ablösung",
    anrede: "Herr",
    immo: "Bestehende Immobilie",
    lieg: "Stockwerkeigentum",
    nutz: "Selbstbewohnt",
    heizung: "Gas",
    aufstockung: "Ja",
    kinder: "Ja",
    unterhalt: "Ja",
    kredite: "Ja",
    leasing: "Ja",
    laufzeit: "5 Jahre",
    s3a: "Ja",
  },
  borrowers: [{ id: "b1", vor: "Gary", nach: "Gerber", job: "Angestellt", pkSe: "Nein" }],
  txt: {
    ...EMPTY_TEXTS,
    vor: "Gary",
    nach: "Gerber",
    mail: "gary.gerber@example.ch",
    tel: "079 123 45 67",
    plz: "8820",
    ort: "Wädenswil",
    zweck: "Ablösung Privatkredit und Leasing",
    kommentar: "Bitte Rückruf am Vormittag.",
  },
  fin: { ...EMPTY_AMOUNTS, old: 449000, up: 201000, inc: 125000, val: 1450000 },
  ...over,
});

/** The checks at the top of POST /api/inquiry that can turn a submission into a 400. */
function serverRejects(p: any): string | null {
  if (!p.client?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.client.email)) return "email";
  for (const part of [p.project || {}, p.property || {}]) {
    if (part.renovation === "ja" && !(Number(part.renovationsBetrag) > 0)) return "renovation";
    if (part.finanzierungsangebote === "ja" && !(Array.isArray(part.angebote) && part.angebote.length)) return "angebote";
  }
  return null;
}

/** In-memory stand-in for components/salesforceApi — nothing leaves the process. */
function fakeSalesforce() {
  const calls: { accounts: any[]; cases: any[] } = { accounts: [], cases: [] };
  let n = 0;
  return {
    calls,
    api: {
      findAccountByEmail: jest.fn(async () => null),
      createAccount: jest.fn(async (data: any) => {
        calls.accounts.push(data);
        return { id: `001${++n}` };
      }),
      updatePersonAccount: jest.fn(async () => ({})),
      findContactByEmail: jest.fn(async () => ({ Id: "003PARTNER" })),
      findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQ" })),
      createOrUpdateCase: jest.fn(async (data: any) => {
        calls.cases.push(data);
        return { id: "500CASE" };
      }),
    },
  };
}

const quiet = () => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
};

describe("toInquiryPayload — Gerber, Kunde", () => {
  const p = toInquiryPayload(gerber(), { locale: "fr", submissionId: SUBMISSION, sharepointFolderId: "F1", documents: [{ id: "d" }], documentCompleteness: { complete: false, missing: [] } });

  it("envelope", () => {
    expect(p.customerType).toBe("direct");
    expect(p.locale).toBe("fr");
    expect(p.korrespondenzsprache).toBe("Französisch");
    expect(p.submissionId).toBe(SUBMISSION);
    expect(p.sharepointFolderId).toBe("F1");
    expect(p.documents).toEqual([{ id: "d" }]);
    expect(p.documentCompleteness).toEqual({ complete: false, missing: [] });
    expect(p.partner).toBeNull();
    expect(p.client).toEqual({ firstName: "Gary", lastName: "Gerber", email: "gary.gerber@example.ch", phone: "079 123 45 67" });
  });

  it("project and property in the values the server maps", () => {
    expect(p.project).toEqual({ projektArt: "abloesung", kreditnehmerTyp: "nat", borrowerType: "nat", liegenschaftZip: "8820", neubauArt: "" });
    expect(p.property).toMatchObject({
      zip: "8820",
      ort: "Wädenswil",
      artImmobilie: "bestehend",
      neubauArt: "",
      artLiegenschaft: "Wohnung",
      stockwerkeigentum: "ja",
      nutzung: "Selbstbewohnt",
      baurecht: "nein",
      neubauGrundbuchGvVorhanden: "",
      reserviert: "",
      renovation: "",
      finanzierungsangebote: "Nein",
      firmen: [],
    });
    expect(p.property.kreditnehmer).toEqual([
      { id: "b1", vorname: "Gary", name: "Gerber", email: "gary.gerber@example.ch", telefon: "079 123 45 67", geburtsdatum: "", erwerb: "angestellt", zivilstand: "", pkVorhanden: "" },
    ]);
  });

  it("financing", () => {
    expect(p.financing).toEqual({
      kaufpreis: "",
      abloesung_betrag: "449000",
      erhoehung: "Ja",
      erhoehung_betrag: "201000",
      brutto: "125000",
      immobilienwert: "1450000",
      hypoBetrag: "650000",
      modell: "5",
      leasingVorhanden: "ja",
      kommentar: "Verwendungszweck: Ablösung Privatkredit und Leasing\n\nBitte Rückruf am Vormittag.",
    });
    expect(p.borrowers).toEqual([{ type: "nat" }]);
  });

  it("carries the raw v3 state", () => {
    expect(p.v3.ans.lieg).toBe("Stockwerkeigentum");
    expect(p.v3.txt.zweck).toBe("Ablösung Privatkredit und Leasing");
    expect(p.v3.fin.val).toBe(1450000);
    expect(p.v3.borrowers).toHaveLength(1);
    expect(p.v3.calc.need).toBe(650000);
  });

  it("passes the server's request validation", () => {
    expect(serverRejects(p)).toBeNull();
    const withReno = toInquiryPayload(
      gerber({ ans: { ...gerber().ans, antrag: "Neue Hypothek", reno: "Ja", angebote: "Ja" }, fin: { ...EMPTY_AMOUNTS, kaufpreis: 900000, val: 1000000, inc: 200000 } }),
      { locale: "de", submissionId: SUBMISSION }
    );
    expect(withReno.property.renovation).toBe("Ja");
    expect(withReno.property.finanzierungsangebote).toBe("Ja");
    expect(serverRejects(withReno)).toBeNull();
  });

  it("is plain JSON", () => {
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});

describe("toInquiryPayload — mapping tables", () => {
  const map = (over: Partial<FunnelState["ans"]>) =>
    toInquiryPayload(gerber({ ans: { ...gerber().ans, ...over } }), { locale: "de", submissionId: SUBMISSION });

  it("Art der Immobilie / Neubau", () => {
    expect(map({ immo: "Neubau", nbDocs: "Ja" }).property).toMatchObject({ artImmobilie: "neubau", neubauArt: "bereits_erstellt", neubauGrundbuchGvVorhanden: "ja" });
    expect(map({ immo: "Neubau" }).project.neubauArt).toBe("bereits_erstellt");
    expect(map({ immo: "Bauprojekt" }).property).toMatchObject({ artImmobilie: "neubau", neubauArt: "bauprojekt", neubauGrundbuchGvVorhanden: "" });
  });

  it("Liegenschaft and Nutzung", () => {
    expect(map({ lieg: "Einfamilienhaus" }).property).toMatchObject({ artLiegenschaft: "Einfamilienhaus", stockwerkeigentum: "" });
    expect(map({ lieg: "Mehrfamilienhaus" }).property.artLiegenschaft).toBe("Mehrfamilienhaus");
    expect(map({ lieg: "Ferienobjekt" }).property.artLiegenschaft).toBe("Ferienobjekt");
    expect(map({ nutz: "Vermietet" }).property.nutzung).toBe("Rendite-Immobilie");
    expect(map({ nutz: "Zweitwohnsitz" }).property.nutzung).toBe("Zweitwohnsitz");
  });

  it("Laufzeit", () => {
    expect(map({ laufzeit: "SARON" }).financing.modell).toBe("saron");
    expect(map({ laufzeit: "Mix" }).financing.modell).toBe("mix");
    expect(map({ laufzeit: "10 Jahre" }).financing.modell).toBe("10");
    expect(map({ laufzeit: undefined }).financing.modell).toBe("");
  });

  it("Erhöhung = Nein drops the amount", () => {
    const p = map({ aufstockung: "Nein" });
    expect(p.financing.erhoehung).toBe("Nein");
    expect(p.financing.erhoehung_betrag).toBe("");
  });

  it("Kommentar", () => {
    expect(buildKommentar("", "Text")).toBe("Text");
    expect(buildKommentar("Renovation", "")).toBe("Verwendungszweck: Renovation");
    expect(buildKommentar("  ", "  ")).toBe("");
  });

  it("several borrowers, Selbständig with PK, Pensioniert", () => {
    const p = toInquiryPayload(
      gerber({
        borrowers: [
          { id: "b1", vor: "Gary", nach: "Gerber", job: "Selbständig", pkSe: "Ja" },
          { id: "b2", vor: "Anna", nach: "Gerber", job: "Pensioniert", pkSe: "Nein" },
        ],
      }),
      { locale: "de", submissionId: SUBMISSION }
    );
    expect(p.property.kreditnehmer.map((k: any) => [k.vorname, k.erwerb, k.pkVorhanden, k.email])).toEqual([
      ["Gary", "selbständig", "ja", "gary.gerber@example.ch"],
      ["Anna", "rentner", "", ""],
    ]);
  });
});

describe("toInquiryPayload — Berater, Neue Hypothek, juristische Person", () => {
  const state = gerber({
    role: "berater",
    ans: { ...DEFAULT_ANSWERS, antrag: "Neue Hypothek", kn: "Juristische Person", anrede: "Frau", immo: "Bestehende Immobilie", lieg: "Mehrfamilienhaus", nutz: "Vermietet", reserviert: "Ja", laufzeit: "SARON" },
    borrowers: [{ id: "b1", vor: "Petra", nach: "Muster", pkSe: "Nein" }],
    txt: { ...EMPTY_TEXTS, bmail: "berater@vzch.ch", pvor: "Bea", pnach: "Rater", ptel: "044 000 00 00", pfirma: "VZ", vor: "Petra", nach: "Muster", mail: "petra@etzel.ch", tel: "", plz: "8001", ort: "Zürich", firma: "Etzel Liegenschaften AG", zeichner: "Petra Muster" },
    fin: { ...EMPTY_AMOUNTS, kaufpreis: 2000000, val: 2100000 },
  });
  const p = toInquiryPayload(state, { locale: "de", submissionId: SUBMISSION });

  it("maps", () => {
    expect(p.customerType).toBe("partner");
    expect(p.client).toEqual({ email: "berater@vzch.ch" });
    expect(p.email).toBe("berater@vzch.ch");
    expect(p.partner).toEqual({ email: "berater@vzch.ch", vorname: "Bea", nachname: "Rater", telefon: "044 000 00 00", firma: "VZ" });
    expect(p.project.projektArt).toBe("kauf");
    expect(p.project.borrowerType).toBe("jur");
    expect(p.property.reserviert).toBe("ja");
    expect(p.property.renovation).toBe("Nein");
    expect(p.property.firmen).toEqual([{ firmenname: "Etzel Liegenschaften AG" }]);
    expect(p.property.kreditnehmer).toEqual([{ vorname: "Petra", name: "Muster", firmenname: "Etzel Liegenschaften AG", email: "petra@etzel.ch", telefon: "" }]);
    expect(p.financing).toMatchObject({ kaufpreis: "2000000", abloesung_betrag: "", erhoehung: "", brutto: "", immobilienwert: "2100000", hypoBetrag: "1680000", modell: "saron" });
    expect(p.borrowers).toEqual([{ type: "jur", firmaName: "Etzel Liegenschaften AG" }]);
    expect(serverRejects(p)).toBeNull();
  });
});

describe("the existing Salesforce sync accepts v3 payloads (fake API, nothing is sent)", () => {
  it("Gerber, Kunde", async () => {
    quiet();
    const sf = fakeSalesforce();
    const p: any = toInquiryPayload(gerber(), { locale: "de", submissionId: SUBMISSION });
    p.stage = "Needs Analysis";
    await syncFunnelStepsToSalesforce(p, sf.api);
    expect(sf.calls.accounts).toHaveLength(1);
    expect(sf.calls.accounts[0]).toMatchObject({ FirstName: "Gary", LastName: "Gerber", PersonEmail: "gary.gerber@example.ch", Phone: "079 123 45 67", Erwerbsstatus__c: "Angestellt" });
    const c = sf.calls.cases[0];
    expect(c).toMatchObject({
      Reason: "Ablösung",
      Kreditnehmer__c: "Natürliche Person",
      Korrespondenzsprache__c: "Deutsch",
      Art_der_Immobilie__c: "Bestehende Immobilie",
      Art_der_Liegenschaft__c: "Wohnung",
      Nutzung_der_Immobilie__c: "Selbstbewohnt",
      Hypothekarlaufzeiten__c: "5 Jahre",
      Einkommen__c: 125000,
      Erh_hung__c: 201000,
      Gesch_tzter_Hypothekenbedarf__c: 650000,
      Hypothekarvolumen__c: 650000,
      PLZ_Ort__c: "8820 Wädenswil",
      City__c: "Wädenswil",
      Case_Name__c: "8820 Wädenswil / Gary Gerber",
      Client__c: "0011",
      If_nat_rliche_person__c: "Angestellt",
      Bestehen_bereits_Finanzierungsangebote__c: false,
    });
    expect(c.Kommentar__c).toMatch(/^Verwendungszweck: /);
    jest.restoreAllMocks();
  });

  it("Berater, juristische Person", async () => {
    quiet();
    const sf = fakeSalesforce();
    const state = gerber({
      role: "berater",
      ans: { ...gerber().ans, kn: "Juristische Person" },
      txt: { ...gerber().txt, bmail: "berater@vzch.ch", tel: "", firma: "Etzel AG", zeichner: "Gary Gerber" },
    });
    await syncFunnelStepsToSalesforce(toInquiryPayload(state, { locale: "it", submissionId: SUBMISSION }), sf.api);
    expect(sf.calls.accounts[0]).toMatchObject({ LastName: "Etzel AG", PersonEmail: "gary.gerber@example.ch" });
    expect(sf.calls.cases[0]).toMatchObject({ Kreditnehmer__c: "Juristische Personen", Partner_Consultant__c: "003PARTNER", Korrespondenzsprache__c: "Italienisch", Case_Name__c: "8820 Wädenswil / Etzel AG" });
    jest.restoreAllMocks();
  });
});
