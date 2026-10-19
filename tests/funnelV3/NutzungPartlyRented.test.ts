/**
 * HYPOTEQ 19.10. B5: «Vermietet & teilweise selbstbewohnt» is the fourth Nutzung of a natürliche
 * Person (DECISIONS V58). It counts as rented for the Netto-Mietertrag and the Mieterspiegel
 * (O14) and as self-occupied for the home address on the Auskunftsermächtigung (V33); Salesforce
 * gets the picklist value as it is. The Salesforce API is a fake — nothing leaves the process.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("@/components/partnerDirectory", () => ({
  __esModule: true,
  resolvePartner: jest.fn(async () => ({ status: "unknown" })),
}));

import { NUTZUNG_OPTIONS, NUTZUNG_PARTLY_RENTED, isOwnerOccupiedNutzung, isRentedNutzung, type FunnelState } from "@/lib/funnel-v3/types";
import { answerAllowed, applyAnswer } from "@/lib/funnel-v3/store";
import { visibleFields } from "@/components/funnel-v3/logic";
import { reasonTextDe, reqList } from "@/lib/funnel-v3/requirements";
import { toInquiryPayload } from "@/lib/funnel-v3/toInquiryPayload";
import { authorizationDataFromState } from "@/lib/funnel-v3/authorizationData";
import { normaliseFunnelState } from "@/lib/funnel-v3/legacy";
import { LANGS, hasKey, optionLabel } from "@/lib/funnel-v3/i18n";
import { syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
import { ablState, kaufState, SUBMISSION, v5Payload } from "./v5Fixtures";

const partly = (s: FunnelState, miete = 24000): FunnelState => ({ ...s, ans: { ...s.ans, nutz: NUTZUNG_PARTLY_RENTED }, fin: { ...s.fin, miete } });

function fakeSalesforce() {
  const cases: any[] = [];
  return {
    cases,
    api: {
      findAccountByEmail: jest.fn(async () => null),
      createAccount: jest.fn(async () => ({ id: "001A" })),
      updatePersonAccount: jest.fn(async () => ({})),
      findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQ" })),
      createOrUpdateCase: jest.fn(async (data: any) => {
        cases.push(data);
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

describe("the option", () => {
  it("is the fourth Nutzung of a natürliche Person, never of a company", () => {
    expect(NUTZUNG_OPTIONS["Natürliche Person"]).toEqual(["Selbstbewohnt", "Vermietet", "Zweitwohnsitz", "Vermietet & teilweise selbstbewohnt"]);
    expect(NUTZUNG_OPTIONS["Juristische Person"]).not.toContain(NUTZUNG_PARTLY_RENTED);
    const s = kaufState();
    expect(answerAllowed(s.ans, "nutz", NUTZUNG_PARTLY_RENTED)).toBe(true);
    expect(answerAllowed({ ...s.ans, kn: "Juristische Person" }, "nutz", NUTZUNG_PARTLY_RENTED)).toBe(false);
  });

  it("has a label in all four languages", () => {
    for (const lang of LANGS) expect(hasKey(lang, `opt.nutz.${NUTZUNG_PARTLY_RENTED}`)).toBe(true);
    expect(optionLabel("de", "nutz", NUTZUNG_PARTLY_RENTED)).toBe("Vermietet & teilweise selbstbewohnt");
    expect(optionLabel("fr", "nutz", NUTZUNG_PARTLY_RENTED)).not.toBe(NUTZUNG_PARTLY_RENTED);
  });

  it("rented and self-occupied at once", () => {
    expect(isRentedNutzung(NUTZUNG_PARTLY_RENTED)).toBe(true);
    expect(isOwnerOccupiedNutzung(NUTZUNG_PARTLY_RENTED)).toBe(true);
    expect([isRentedNutzung("Vermietet"), isOwnerOccupiedNutzung("Vermietet")]).toEqual([true, false]);
    expect([isRentedNutzung("Selbstbewohnt"), isOwnerOccupiedNutzung("Selbstbewohnt")]).toEqual([false, true]);
    expect([isRentedNutzung("Zweitwohnsitz"), isOwnerOccupiedNutzung("Zweitwohnsitz")]).toEqual([false, false]);
    expect([isRentedNutzung(undefined), isOwnerOccupiedNutzung(undefined)]).toEqual([false, false]);
  });

  it("survives a stored state (legacy.ts)", () => {
    expect(normaliseFunnelState({ version: 2, ans: { nutz: NUTZUNG_PARTLY_RENTED }, txt: {} })!.ans.nutz).toBe(NUTZUNG_PARTLY_RENTED);
  });
});

describe("like «Vermietet»: Netto-Mietertrag and Mieterspiegel", () => {
  it("shows the Netto-Mietertrag field and keeps the amount", () => {
    const s = partly(kaufState());
    expect(visibleFields("objekt", s)).toContain("miete");
    const kept = applyAnswer({ ans: { ...s.ans, nutz: "Vermietet" }, txt: s.txt, fin: s.fin, em: s.em, borrowers: s.borrowers }, "nutz", NUTZUNG_PARTLY_RENTED);
    expect(kept.fin.miete).toBe(24000);
    const cleared = applyAnswer({ ans: s.ans, txt: s.txt, fin: s.fin, em: s.em, borrowers: s.borrowers }, "nutz", "Selbstbewohnt");
    expect(cleared.fin.miete).toBe(0);
  });

  it("asks for the Mieterspiegel (O14), naming the answer as the reason", () => {
    const inst = reqList(partly(kaufState())).find((i) => i.id === "mieterspiegel");
    expect(inst).toBeDefined();
    expect(reasonTextDe(inst!.reason)).toContain("Vermietet & teilweise selbstbewohnt");
    expect(reqList(kaufState()).some((i) => i.id === "mieterspiegel")).toBe(false);
  });

  it("payload and Salesforce: the picklist value as it is, the Netto-Mietertrag in its Currency field", async () => {
    const s = partly(kaufState());
    const p = toInquiryPayload(s, { locale: "de", submissionId: SUBMISSION }) as any;
    expect(p.property.nutzung).toBe("Vermietet & teilweise selbstbewohnt");
    expect(p.financing.netto_mietertrag).toBe("24000");
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v5Payload(s), sf.api);
    expect(sf.cases[0].Nutzung_der_Immobilie__c).toBe("Vermietet & teilweise selbstbewohnt");
    expect(sf.cases[0].J_hrlicher_Netto_Mietertrag__c).toBe(24000);
  });
});

describe("like «Selbstbewohnt»: the home address on the Auskunftsermächtigung (V33)", () => {
  it("Ablösung of a partly rented home: Kreditnehmer 1's address is the object", () => {
    const s = partly(ablState({ info: { adresse: "Bahnhofstrasse 1, 3000 Bern" } }));
    const data = authorizationDataFromState(s, "de");
    expect(data.signers[0]).toMatchObject({ adresse: "Bahnhofstrasse 1", plzOrt: "3000 Bern" });
    const rented = authorizationDataFromState({ ...s, ans: { ...s.ans, nutz: "Vermietet" } }, "de");
    expect(rented.signers[0].adresse ?? null).toBeNull();
  });
});
