/**
 * The screens of the two entries (Handover 1–3; lib/funnel-v3/steps.ts) and the
 * Auskunftsermächtigung block (Handover 6; lib/funnel-v3/signature.ts).
 */
import { describe, it, expect } from "@jest/globals";
import { RAIL_SCREENS, SCREENS, STEP_TIMES, mapVisited, recommendedMode, screenAt, screenLabelKey, screenWhyKey, stepCount, stepOf, switchTarget, timeLeft } from "@/lib/funnel-v3/steps";
import { signatureJson, signatureProblems, signatureView, type SignatureFile } from "@/lib/funnel-v3/signature";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { hasKey, translate } from "@/lib/funnel-v3/i18n";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import type { SignatureState } from "@/lib/funnel-v3/types";
import { gerberFiles, gerberState } from "./gerberCase";

describe("steps (Handover 2, 3)", () => {
  it("Begleitet: 4 steps, Schnell: 6 — the same screens, the upload in front", () => {
    expect(SCREENS.begleitet).toEqual(["anfrage", "objekt", "personen", "abschluss"]);
    expect(SCREENS.schnell).toEqual(["kontakt", "upload", "anfrage", "objekt", "personen", "abschluss"]);
    expect(stepCount("begleitet")).toBe(4);
    expect(stepCount("schnell")).toBe(6);
    expect(screenAt("begleitet", 2)).toBe("objekt");
    expect(screenAt("schnell", 2)).toBe("upload");
    expect(screenAt("schnell", 0)).toBeNull();
    expect(screenAt("begleitet", 5)).toBeNull();
    expect(stepOf("schnell", "personen")).toBe(5);
    expect(stepOf("begleitet", "upload")).toBe(0);
  });

  it("time left: 3:00 → 1:30 and 3:00 → 0:30", () => {
    expect(STEP_TIMES.begleitet).toEqual(["3:00", "2:30", "2:00", "1:30"]);
    expect([1, 2, 3, 4, 5, 6].map((n) => timeLeft("schnell", n))).toEqual(["3:00", "2:30", "2:00", "1:30", "1:00", "0:30"]);
    expect(timeLeft("begleitet", 0)).toBe("3:00");
    expect(translate("de", "common.timeLeft", { time: timeLeft("begleitet", 2) })).toBe("noch ca. 2:30 Min.");
  });

  it("recommends Schnell for a Berater, Begleitet for a Kunde (Handover 1)", () => {
    expect(recommendedMode("berater")).toBe("schnell");
    expect(recommendedMode("kunde")).toBe("begleitet");
  });

  it("switching lands on the same topic (Handover 1, 3)", () => {
    expect(switchTarget("schnell", 4, true)).toEqual({ mode: "begleitet", step: 2 });
    expect(switchTarget("schnell", 1, false)).toEqual({ mode: "begleitet", step: 1 });
    expect(switchTarget("schnell", 2, true)).toEqual({ mode: "begleitet", step: 1 });
    expect(switchTarget("schnell", 6, true)).toEqual({ mode: "begleitet", step: 4 });
    expect(switchTarget("begleitet", 3, true)).toEqual({ mode: "schnell", step: 5 });
    expect(switchTarget("begleitet", 3, false)).toEqual({ mode: "schnell", step: 1 });
    expect(switchTarget("begleitet", 0, false)).toEqual({ mode: "schnell", step: 0 });
    expect(mapVisited("begleitet", 3, "schnell")).toBe(5);
    expect(mapVisited("schnell", 2, "begleitet")).toBe(0);
  });

  it("every screen has its name and its «warum» line in all four languages", () => {
    for (const mode of ["begleitet", "schnell"] as const)
      for (const s of SCREENS[mode])
        for (const l of ["de", "en", "fr", "it"] as const) {
          expect([mode, s, l, hasKey(l, screenLabelKey(mode, s))]).toEqual([mode, s, l, true]);
          expect([mode, s, l, hasKey(l, screenWhyKey(mode, s))]).toEqual([mode, s, l, true]);
        }
    expect(translate("de", screenLabelKey("schnell", "abschluss"))).toBe("Fehlende Unterlagen & Abschluss");
    expect(translate("de", screenLabelKey("begleitet", "abschluss"))).toBe("Unterlagen & Abschluss");
    expect(RAIL_SCREENS.has("objekt")).toBe(true);
    expect(RAIL_SCREENS.has("abschluss")).toBe(false);
  });
});

describe("Auskunftsermächtigung (Handover 6)", () => {
  const SIGNER = { kind: "borrower" as const, first: "Gary", last: "Gerber", display: "Gary Gerber" };
  const an = (fields: Record<string, string>, over: Partial<V3Analysis> = {}): V3Analysis => ({
    status: "done",
    docTypeId: "vollmacht",
    docTypeLabel: "vollmacht",
    confidence: 0.95,
    requirementId: "vollmacht",
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, confidence: 0.9 }])),
    ...over,
  });
  const f = (a: V3Analysis | null, over: Partial<SignatureFile> = {}): SignatureFile => ({ fileId: "s1", instanceId: "vollmacht", analysis: a, ...over });
  const LATER: SignatureState = { choice: "later", at: "2026-10-15T08:00:00.000Z", method: "upload" };

  it("missing until a copy is there or «später» is chosen; only then can the request be closed", () => {
    // `override`: HYPOTEQ 19.10. E.4 «Trotzdem einreichen» (signatureOverride.test.ts).
    expect(signatureView([], null, SIGNER)).toEqual({ status: "missing", fileIds: [], problems: [], override: false, canFinish: false });
    expect(signatureView([], LATER, SIGNER)).toMatchObject({ status: "later", canFinish: true });
  });

  it("received: right form, signature present, the borrower's name — also found in the folder", () => {
    const v = signatureView([f(an({ Unterschrift: "vorhanden", Vollmachtgeber: "Gary Samuel Gerber" }))], null, SIGNER);
    expect(v).toEqual({ status: "received", fileIds: ["s1"], problems: [], override: false, canFinish: true });
  });

  it("«Unterschrift fehlt» when the AI finds no signature or another name", () => {
    expect(signatureView([f(an({ Unterschrift: "fehlt" }))], null, SIGNER)).toMatchObject({ status: "unsigned", problems: ["signature"], canFinish: false });
    expect(signatureView([f(an({ Unterschrift: "vorhanden", Vollmachtgeber: "Hans Muster" }))], null, SIGNER)).toMatchObject({ status: "unsigned", problems: ["name"] });
    // «Später nachreichen» still lets the case be closed.
    expect(signatureView([f(an({ Unterschrift: "fehlt" }))], LATER, SIGNER)).toMatchObject({ status: "unsigned", canFinish: true });
    expect(signatureProblems(an({}), SIGNER)).toEqual([]);
  });

  it("a copy being read; an unreadable copy uploaded with the block's own button is accepted", () => {
    expect(signatureView([f(null, { pending: true })], null, SIGNER).status).toBe("analysing");
    expect(signatureView([f(an({}, { status: "failed" }), { assignedByUser: true })], null, SIGNER).status).toBe("received");
    // A file elsewhere on the list does not count.
    expect(signatureView([f(an({ Unterschrift: "vorhanden" }), { instanceId: "id#b1" })], null, SIGNER).status).toBe("missing");
  });

  it("the Salesforce JSON: uploaded | pending, time, method (Handover 8)", () => {
    expect(signatureJson({ status: "received" }, null)).toEqual({ status: "uploaded", at: null, method: "upload" });
    expect(signatureJson({ status: "later" }, LATER)).toEqual({ status: "pending", at: "2026-10-15T08:00:00.000Z", method: "upload" });
    expect(signatureJson({ status: "unsigned" }, LATER).status).toBe("pending");
    expect(signatureJson({ status: "unsigned" }, null).status).toBe("unsigned");
    expect(signatureJson({ status: "missing" }, null).status).toBe("missing");
  });

  it("the documents summary carries the block; Gerber's signed copy is in the folder", () => {
    const s = documentsSummary({ ...gerberState(), files: gerberFiles() });
    expect(s.signature).toMatchObject({ status: "received", canFinish: true });
    const without = documentsSummary({ ...gerberState(), files: gerberFiles().filter((x) => x.instanceId !== "vollmacht") });
    expect(without.signature.status).toBe("missing");
    // The Schnellanmeldung makes no suggestions (it prefills); the Begleitete does.
    const off = gerberFiles().filter((x) => x.instanceId === "kredit");
    const guided = documentsSummary({ ...gerberState({ ans: { ...gerberState().ans, kredite: "Nein" } }), files: off });
    expect(guided.suggestions.map((x) => x.key)).toEqual(["loan"]);
    const fast = documentsSummary({ ...gerberState({ ans: { ...gerberState().ans, kredite: "Nein" } }), mode: "schnell", files: off });
    expect(fast.suggestions).toEqual([]);
  });
});
