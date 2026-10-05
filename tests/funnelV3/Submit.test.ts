import { describe, it, expect, jest } from "@jest/globals";
import { submitFunnel, SubmitError, buildSubmitPayload, type SubmitState } from "@/lib/funnel-v3/submit";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { gerberFiles, gerberState, SUBMISSION } from "./gerberCase";

function stateWith(files: FileEntry[], over: Partial<SubmitState> = {}): SubmitState {
  return { ...gerberState(), submissionId: SUBMISSION, sharepointFolderId: "FOLDER1", files, ...over };
}

function okFetch(body: any = { success: true, inquiryId: SUBMISSION, caseNumber: "HQ-26-10-000123" }, status = 200) {
  return jest.fn(async (_url: any, _init?: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as any);
}

/** A virtual clock: sleep advances it, so waits run instantly. */
function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

describe("submitFunnel", () => {
  it("posts the v3 payload with the documents and the completeness verdict", async () => {
    const fetchImpl = okFetch();
    const phases: string[] = [];
    const res = await submitFunnel({ getState: () => stateWith(gerberFiles()), lang: "fr", fetchImpl: fetchImpl as any, onPhase: (p) => phases.push(p) });
    expect(res).toEqual({ inquiryId: SUBMISSION, caseNumber: "HQ-26-10-000123", alreadySubmitted: false });
    expect(phases).toEqual(["sending"]);
    const [url, init] = fetchImpl.mock.calls[0] as [string, any];
    expect(url).toBe("/api/inquiry");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.submissionId).toBe(SUBMISSION);
    expect(body.locale).toBe("fr");
    expect(body.sharepointFolderId).toBe("FOLDER1");
    expect(body.v3.ans.antrag).toBe("Ablösung");
    expect(body.documentCompleteness).toEqual({ complete: true, missing: [], missingLabels: [], missingLabelsLocale: [], skipped: [] });
    expect(body.documents).toHaveLength(30);
    expect(body.documents[0]).toEqual({ documentId: "doc-1", instanceId: "fotos", requirementId: "fotos" });
    const extra = body.documents.find((d: any) => d.documentId === "doc-30");
    expect(extra).toEqual({ documentId: "doc-30", instanceId: null, requirementId: null, extraKind: "notneeded", keep: true });
    const gb = body.documents.find((d: any) => d.instanceId === "grundbuch");
    expect(gb.outdatedOverride).toBe(true);
  });

  it("missing required requirements: instance ids, German and localized labels", () => {
    const files = gerberFiles().filter((f) => f.instanceId !== "id#b1" && f.instanceId !== "fotos");
    const body = buildSubmitPayload(stateWith(files), "en");
    expect(body.documentCompleteness).toMatchObject({
      complete: false,
      missing: ["fotos", "id#b1"],
      missingLabels: ["Fotos der Immobilie (innen und aussen)", "Pass / Identitätskarte – Gary Gerber"],
    });
    expect((body.documentCompleteness as any).missingLabelsLocale[1]).toMatch(/– Gary Gerber$/);
  });

  it("waits for running uploads and analyses, then sends", async () => {
    const c = clock();
    let calls = 0;
    const base = gerberFiles();
    const getState = () => {
      calls++;
      const files = base.map((f, i) =>
        i === 0 && calls < 3 ? { ...f, uploadState: "uploading" as const, analysisState: "pending" as const } : i === 1 && calls < 5 ? { ...f, analysisState: "analysing" as const } : f
      );
      return stateWith(files);
    };
    const phases: string[] = [];
    await submitFunnel({ getState, lang: "de", fetchImpl: okFetch() as any, onPhase: (p) => phases.push(p), ...c });
    expect(phases).toEqual(["uploading", "uploading", "analysing", "analysing", "sending"]);
  });

  it("caps the analysis wait at 20 s and submits anyway", async () => {
    const c = clock();
    const files = gerberFiles().map((f, i) => (i === 0 ? { ...f, analysisState: "analysing" as const } : f));
    const fetchImpl = okFetch();
    await submitFunnel({ getState: () => stateWith(files), lang: "de", fetchImpl: fetchImpl as any, ...c });
    expect(c.now()).toBeGreaterThanOrEqual(20_000);
    expect(c.now()).toBeLessThan(21_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a failed upload stops the submit with the file name, nothing is sent", async () => {
    const files = gerberFiles().map((f, i) => (i === 3 ? { ...f, uploadState: "failed" as const } : f));
    const fetchImpl = okFetch();
    const err = await submitFunnel({ getState: () => stateWith(files), lang: "de", fetchImpl: fetchImpl as any }).catch((e) => e);
    expect(err).toBeInstanceOf(SubmitError);
    expect(err.code).toBe("upload");
    expect(err.message).toBe("«03_Grundbuchauszug_Etzelstrasse_52_Waedenswil_2026_01_15.pdf» konnte nicht hochgeladen werden. Bitte lade die Datei unter «Unterlagen» erneut hoch oder entferne sie.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("an upload that never finishes gives up after the upload cap", async () => {
    const c = clock();
    const files = gerberFiles().map((f, i) => (i === 0 ? { ...f, uploadState: "uploading" as const } : f));
    const err = await submitFunnel({ getState: () => stateWith(files), lang: "it", fetchImpl: okFetch() as any, uploadWaitMs: 5000, ...c }).catch((e) => e);
    expect(err.code).toBe("uploadPending");
    expect(err.message).toContain("in caricamento");
  });

  it("translated errors: network, 400, 500 and success:false", async () => {
    const st = () => stateWith(gerberFiles());
    const net = await submitFunnel({ getState: st, lang: "de", fetchImpl: (async () => { throw new TypeError("Failed to fetch"); }) as any }).catch((e) => e);
    expect([net.code, net.message]).toEqual(["network", expect.stringContaining("Keine Verbindung")]);
    const bad = await submitFunnel({ getState: st, lang: "en", fetchImpl: okFetch({ success: false, error: "Valid email is required." }, 400) as any }).catch((e) => e);
    expect([bad.code, bad.detail]).toEqual(["invalid", "Valid email is required."]);
    expect(bad.message).toBe("The request was not accepted. Please check the details in the previous steps.");
    const boom = await submitFunnel({ getState: st, lang: "de", fetchImpl: okFetch({ success: false, error: "db down" }, 500) as any }).catch((e) => e);
    expect([boom.code, boom.message]).toEqual(["server", "Die Anfrage konnte nicht übermittelt werden. Bitte versuche es noch einmal."]);
    const html = await submitFunnel({ getState: st, lang: "de", fetchImpl: (async () => ({ ok: false, status: 504, json: async () => { throw new SyntaxError("x"); } })) as any }).catch((e) => e);
    expect(html.code).toBe("server");
  });

  it("a retry sends the same submissionId and accepts «alreadySubmitted»", async () => {
    const st = () => stateWith(gerberFiles());
    const first = okFetch({ success: false }, 500);
    await submitFunnel({ getState: st, lang: "de", fetchImpl: first as any }).catch(() => null);
    const second = okFetch({ success: true, inquiryId: SUBMISSION, alreadySubmitted: true, caseNumber: "HQ-26-10-000123" });
    const res = await submitFunnel({ getState: st, lang: "de", fetchImpl: second as any });
    expect(JSON.parse((first.mock.calls[0] as any)[1].body).submissionId).toBe(JSON.parse((second.mock.calls[0] as any)[1].body).submissionId);
    expect(res).toEqual({ inquiryId: SUBMISSION, caseNumber: "HQ-26-10-000123", alreadySubmitted: true });
  });

  it("no case number in the answer → null", async () => {
    const res = await submitFunnel({ getState: () => stateWith([]), lang: "de", fetchImpl: okFetch({ success: true, inquiryId: SUBMISSION }) as any });
    expect(res.caseNumber).toBeNull();
  });
});
