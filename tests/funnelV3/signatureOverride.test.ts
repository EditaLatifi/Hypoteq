/**
 * HYPOTEQ 19.10. A.4 / E.4: the AI check of the Auskunftsermächtigung never blocks. Over a copy
 * it judged unsigned, with another name or not the form, «Trotzdem einreichen – HYPOTEQ prüft
 * manuell» frees «Finanzierungsanfrage abschliessen»; the choice is kept with its time
 * (`sig.override`), the copy counts as received at the submit, and the AI's assessment goes along
 * only as a note — in the Case JSON, the internal mail and the dossier (DECISIONS V67). Nothing is
 * sent: Salesforce and the mail transport are fakes.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("@/components/partnerDirectory", () => ({
  __esModule: true,
  resolvePartner: jest.fn(async () => ({ status: "unknown" })),
}));

import { signatureJson, signatureReviewNote, signatureView, signatureWithServer, type SignatureFile } from "@/lib/funnel-v3/signature";
import { signatureModel } from "@/components/funnel-v3/finish/signatureModel";
import { finishGate } from "@/components/funnel-v3/logic";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { authorizationDataFromState } from "@/lib/funnel-v3/authorizationData";
import { optionLabel, translate } from "@/lib/funnel-v3/i18n";
import { SIGNATURE_REQUIREMENT_ID } from "@/lib/funnel-v3/requirements";
import { syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
import { signatureAtSubmit } from "@/lib/funnel-v3/mail/signatureAtSubmit";
import { buildClosingMails } from "@/lib/funnel-v3/mail";
import { buildDossierModel } from "@/lib/funnel-v3/dossier";
import { dossierInputFor } from "@/lib/funnel-v3/completion";
import { normaliseFunnelState } from "@/lib/funnel-v3/legacy";
import { createSignatureServer, type SignatureRow } from "@/lib/funnel-v3/signatureServer";
import type { FileEntry } from "@/lib/funnel-v3/files";
import type { SignatureState } from "@/lib/funnel-v3/types";
import { CASE_NO, RETURN_URL, kaufState, v5Payload } from "./v5Fixtures";

const SIGNER = { kind: "borrower" as const, first: "Lea", last: "Muster", display: "Lea Muster" };
const AT = "2026-10-19T09:00:00.000Z";
const OVERRIDE: SignatureState = { choice: "uploaded", at: AT, method: "upload", override: true, overrideAt: "2026-10-19T09:05:00.000Z" };
const UPLOADED: SignatureState = { choice: "uploaded", at: AT, method: "upload" };
const NOTE = "AI-Hinweis: Unterschrift nicht erkannt – manuell prüfen";

const unsignedAnalysis = { status: "done" as const, docTypeId: SIGNATURE_REQUIREMENT_ID, docTypeLabel: "vollmacht", confidence: 0.9, requirementId: SIGNATURE_REQUIREMENT_ID, fields: { Unterschrift: { value: "fehlt", confidence: 0.9 } } };
const unsignedFile: SignatureFile = { fileId: "sig-1", instanceId: SIGNATURE_REQUIREMENT_ID, analysis: unsignedAnalysis as any, assignedByUser: true };

/** A v5 submission whose copy on P0 the AI found unsigned. */
function unsignedPayload(sig: SignatureState) {
  const p = v5Payload(kaufState({ sig }), { signed: true });
  for (const f of p.v3Completion.files) if (f.requirementId === SIGNATURE_REQUIREMENT_ID) f.analysis = { ...unsignedAnalysis };
  return p;
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("the signature view", () => {
  it("unsigned blocks; submitted anyway it is received, flagged, and the closing is free", () => {
    expect(signatureView([unsignedFile], UPLOADED, SIGNER)).toMatchObject({ status: "unsigned", override: false, canFinish: false });
    const v = signatureView([unsignedFile], OVERRIDE, SIGNER);
    expect(v).toEqual({ status: "received", fileIds: ["sig-1"], problems: ["signature"], override: true, canFinish: true });
    expect(finishGate(v)).toEqual({ enabled: true, labelKey: "s6.submitTitle" });
  });

  it("the wrong name and the wrong form can be submitted anyway too", () => {
    const wrongName: SignatureFile = { ...unsignedFile, analysis: { ...unsignedAnalysis, fields: { Vollmachtgeber: { value: "Hans Anders", confidence: 0.9 } } } as any };
    expect(signatureView([wrongName], OVERRIDE, SIGNER)).toMatchObject({ status: "received", problems: ["name"], canFinish: true });
    const wrongForm: SignatureFile = { ...unsignedFile, analysis: { ...unsignedAnalysis, docTypeId: "lohnausweise", fields: {} } as any };
    expect(signatureView([wrongForm], OVERRIDE, SIGNER)).toMatchObject({ status: "received", problems: ["form"], canFinish: true });
  });

  it("a good copy needs no override; without a copy the override means nothing", () => {
    const good: SignatureFile = { ...unsignedFile, analysis: { ...unsignedAnalysis, fields: {} } as any };
    expect(signatureView([good], OVERRIDE, SIGNER)).toMatchObject({ status: "received", override: false, problems: [] });
    expect(signatureView([], OVERRIDE, SIGNER)).toMatchObject({ status: "missing", override: false, canFinish: false });
  });
});

describe("the note", () => {
  it("per finding and language", () => {
    expect(signatureReviewNote(["signature"])).toBe(NOTE);
    expect(signatureReviewNote(["signature", "name"])).toBe("AI-Hinweis: Unterschrift nicht erkannt, Name passt nicht zum Kreditnehmer – manuell prüfen");
    expect(signatureReviewNote(["form"], "fr")).toBe("Note IA : formulaire d’autorisation HYPOTEQ non reconnu – à vérifier manuellement");
    expect(signatureReviewNote([], "en")).toBe("AI note: signature not recognised – check manually");
  });

  it("the JSON block: uploaded, the choice with its time, the AI's findings as a note — no bank note", () => {
    const json = signatureWithServer(signatureJson(signatureView([unsignedFile], OVERRIDE, SIGNER), OVERRIDE), null);
    expect(json).toEqual({ status: "uploaded", at: AT, method: "upload", override: true, overrideAt: "2026-10-19T09:05:00.000Z", aiProblems: ["signature"], aiNote: NOTE });
  });
});

describe("the closing block (SignatureBlock / signatureModel)", () => {
  const t = (k: string, p?: Record<string, string | number>) => translate("de", k, p);
  const opt = (g: string, v: string | null | undefined) => optionLabel("de", g, v);
  const files: FileEntry[] = [
    { id: "sig-1", name: "Scan.jpg", size: 1, uploadState: "uploaded", documentId: "d1", analysisState: "done", analysis: unsignedAnalysis as any, instanceId: SIGNATURE_REQUIREMENT_ID, assignedByUser: true },
  ];
  const model = (sig: SignatureState, context?: "nachreich") =>
    signatureModel({ view: signatureView([unsignedFile], sig, SIGNER), files, later: context ? null : false, data: authorizationDataFromState(kaufState(), "de"), jp: false, context }, t, opt);

  it("«Unterschrift fehlt» offers «Trotzdem einreichen – HYPOTEQ prüft manuell»", () => {
    const m = model(UPLOADED);
    expect(m).toMatchObject({ status: "unsigned", title: "Unterschrift fehlt", canFinish: false });
    expect(m.override).toEqual({ chosen: false, hint: expect.stringContaining("nur ein Hinweis"), label: "Trotzdem einreichen – HYPOTEQ prüft manuell" });
  });

  it("chosen: «Wird von HYPOTEQ manuell geprüft», the finding stays visible, it can be undone, the closing is free", () => {
    const m = model(OVERRIDE);
    expect(m).toMatchObject({ title: "Wird von HYPOTEQ manuell geprüft", canFinish: true, showSteps: true, later: null });
    expect(m.lines).toContain("Auf der hochgeladenen Auskunftsermächtigung fehlt die Unterschrift. Bitte unterzeichnet hochladen.");
    expect(m.override).toEqual({ chosen: true, hint: "", label: "Doch nicht so einreichen" });
    expect(m.files).toEqual([{ id: "sig-1", name: "Scan.jpg", state: "review" }]);
  });

  it("not on the Nachreich page", () => {
    expect(model(UPLOADED, "nachreich").override).toBeNull();
  });

  it("in all four languages", () => {
    for (const lang of ["de", "en", "fr", "it"]) {
      for (const k of ["override", "overrideHint", "overrideUndo", "review", "reviewSub", "reviewBadge"]) expect([lang, k, translate(lang, `sig.${k}`)]).not.toEqual([lang, k, `sig.${k}`]);
    }
    expect(translate("fr", "sig.override")).toBe("Soumettre quand même – HYPOTEQ vérifie manuellement");
  });
});

describe("the store", () => {
  beforeEach(() => useFunnelV3.getState().reset());

  it("records the choice with its time, undoes it, and a new copy starts without it", () => {
    const s = () => useFunnelV3.getState();
    s().setSignature("uploaded");
    s().setSignatureOverride(true);
    expect(s().sig).toMatchObject({ choice: "uploaded", method: "upload", override: true, overrideAt: expect.any(String) });
    s().setSignatureOverride(false);
    expect(s().sig).not.toHaveProperty("override");
    expect(s().sig).not.toHaveProperty("overrideAt");
    s().setSignatureOverride(true);
    s().setSignature("uploaded");
    expect(s().sig?.override).toBeUndefined();
  });

  it("over «Später nachreichen» the override is an uploaded copy", () => {
    useFunnelV3.getState().setSignature("later");
    useFunnelV3.getState().setSignatureOverride(true);
    expect(useFunnelV3.getState().sig).toMatchObject({ choice: "uploaded", override: true });
  });
});

describe("after the submit", () => {
  function fakeSalesforce() {
    const cases: any[] = [];
    return {
      cases,
      api: {
        findAccountByEmail: jest.fn(async () => null),
        createAccount: jest.fn(async () => ({ id: "001A" })),
        updatePersonAccount: jest.fn(async () => ({})),
        findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQ" })),
        createOrUpdateCase: jest.fn(async (d: any) => {
          cases.push(d);
          return { id: "500CASE" };
        }),
      },
    };
  }

  it("Dokumenten_Check_State__c.signature carries the choice and the AI note; without the override it stays «unsigned»", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(unsignedPayload(OVERRIDE), sf.api);
    const json = JSON.parse(sf.cases[0].Dokumenten_Check_State__c);
    expect(json.signature).toMatchObject({ status: "uploaded", override: true, overrideAt: "2026-10-19T09:05:00.000Z", aiProblems: ["signature"], aiNote: NOTE });
    const plain = fakeSalesforce();
    await syncFunnelStepsToSalesforce(unsignedPayload(UPLOADED), plain.api);
    expect(JSON.parse(plain.cases[0].Dokumenten_Check_State__c).signature).toMatchObject({ status: "unsigned" });
  });

  it("recordSignatureAtSubmit gets «uploaded»: the row is received, no reminders follow", async () => {
    const at = await signatureAtSubmit(unsignedPayload(OVERRIDE), async () => "drive-1");
    expect(at).toMatchObject({ state: "uploaded", driveItemId: "drive-1" });
    expect((await signatureAtSubmit(unsignedPayload(UPLOADED), async () => null)).state).toBeNull();

    const rows = new Map<string, SignatureRow>();
    const server = createSignatureServer({
      db: {
        find: async (id) => rows.get(id) ?? null,
        create: async (row) => void rows.set(row.inquiryId, { method: "upload", fileName: null, driveItemId: null, requestedAt: null, receivedAt: null, remindersSent: 0, lastReminderAt: null, ...row } as SignatureRow),
        update: async (id, data) => void rows.set(id, { ...rows.get(id)!, ...data }),
        listPending: async () => [...rows.values()].filter((r) => r.status === "pending"),
        claimReminder: async () => true,
        releaseReminder: async () => {},
        findInquiry: async () => null,
        findDocuments: async () => [],
        setNachreichLink: async () => {},
      },
      buildPdf: async () => null,
      sendMail: async () => true,
      testMode: () => false,
      testInbox: () => null,
      log: { log: () => {}, warn: () => {}, error: () => {} },
    });
    await server.recordSignatureAtSubmit("inq-1", at);
    expect(rows.get("inq-1")).toMatchObject({ status: "uploaded", driveItemId: "drive-1" });
    expect(await server.sendSignatureReminders()).toEqual({ checked: 0, sent: 0 });
  });

  it("the internal mail says «manuell prüfen» with the AI note; the customer's mail does not", async () => {
    const list = await buildClosingMails(
      {
        data: unsignedPayload(OVERRIDE),
        lang: "de",
        caseNumber: CASE_NO,
        date: new Date(Date.UTC(2026, 9, 19, 10, 0)),
        inquiryId: "inq-1",
        returnUrl: RETURN_URL,
        linkDays: 30,
        salesforce: { caseId: "500CASE", url: null, failed: false, testMode: false, dropped: [] },
      },
      { authorizationPdf: async () => new Uint8Array([1]), authorizationName: () => "x.pdf", log: { log: () => {}, warn: () => {}, error: () => {} } }
    );
    const intern = list.find((m) => m.audience === "intern")!;
    const kunde = list.find((m) => m.audience === "kunde")!;
    expect(intern.html).toContain("Auskunftsermächtigung: manuell prüfen");
    expect(intern.html).toContain(NOTE);
    // Received for the closing: no «ausstehend» block, no bank note.
    expect(intern.html).not.toContain("Auskunftsermächtigung ausstehend");
    expect(kunde.html).not.toContain("AI-Hinweis");
  });

  it("the dossier names the AI note at the Auskunftsermächtigung", () => {
    const data = unsignedPayload(OVERRIDE);
    const m = buildDossierModel(dossierInputFor(data, normaliseFunnelState(data.v3)!, data.v3Completion.files, CASE_NO, new Date("2026-10-19T10:00:00Z")));
    const kv = m.sections[0].columns!.flat().find((x) => x.label === "Auskunftsermächtigung");
    expect(kv?.value).toBe(NOTE);
    expect(m.signature).toBe("received");
  });
});
