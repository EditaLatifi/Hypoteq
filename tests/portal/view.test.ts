import { describe, it, expect } from "@jest/globals";
import { docChips, docProgress, summaryFile } from "@/lib/portal/view";

describe("docChips — «Aktion erforderlich» row", () => {
  it("shows at most two chips and counts the rest", () => {
    expect(docChips(["Lohnausweis", "Steuererklärung", "Grundbuchauszug", "Pensionskassenausweis"])).toEqual({
      chips: ["Lohnausweis", "Steuererklärung"],
      more: 2,
    });
  });
  it("no «+ N weitere» for two or fewer", () => {
    expect(docChips(["Lohnausweis", "Steuererklärung"])).toEqual({ chips: ["Lohnausweis", "Steuererklärung"], more: 0 });
    expect(docChips(["Lohnausweis"])).toEqual({ chips: ["Lohnausweis"], more: 0 });
    expect(docChips([])).toEqual({ chips: [], more: 0 });
  });
  it("names a document asked for twice (two borrowers) once", () => {
    expect(docChips(["Lohnausweis", "Lohnausweis", "Steuererklärung"])).toEqual({ chips: ["Lohnausweis", "Steuererklärung"], more: 0 });
  });
});

describe("docProgress — «x von y vorhanden»", () => {
  it("counts Vorhanden, In Prüfung and Hochgeladen as on file", () => {
    expect(docProgress([{ status: "vorhanden" }, { status: "pruefung" }, { status: "hochgeladen" }, { status: "fehlt" }, { status: "neu" }])).toEqual({ ok: 3, total: 5, pct: 60 });
  });
  it("leaves uploads outside the list out", () => {
    expect(docProgress([{ status: "fehlt" }, { status: "hochgeladen", extra: true }])).toEqual({ ok: 0, total: 1, pct: 0 });
    expect(docProgress([])).toEqual({ ok: 0, total: 0, pct: 0 });
  });
});

describe("summaryFile — «Case Zusammenfassung»", () => {
  const f = (id: string, name: string) => ({ id, name });
  it("is the Fall-Dossier of the case folder", () => {
    expect(summaryFile([f("a", "HQ-26-06-156283_01_Person_Ausweis.pdf"), f("b", "HQ-26-06-156283_00_Fall-Dossier.pdf")], [])?.id).toBe("b");
    expect(summaryFile([f("c", "00_Fall-Dossier.pdf")], [])?.id).toBe("c");
  });
  it("else a released PDF named Case Zusammenfassung", () => {
    expect(summaryFile([], [f("r1", "Finanzierungsübersicht.pdf"), f("r2", "Case Zusammenfassung HQ-26-06-156283.pdf")])?.id).toBe("r2");
  });
  it("else nothing, and the button is hidden", () => {
    expect(summaryFile([f("a", "Fall-Dossier-Entwurf.docx")], [f("r", "Zusammenfassung.docx")])).toBeNull();
  });
});
