/**
 * Findings from the click-through of the preview on 19.10.2026:
 *  1. one document tally everywhere — erfüllt + zu prüfen + fehlen = total, the
 *     Auskunftsermächtigung counted like any requirement (DECISIONS V51);
 *  2./3. nothing is deleted (Handover 4.3), so files outside the list all get a stored name;
 *  4. «Aus Dokumenten übernommen» only once something was read from a document;
 *  5. an empty Objektwert is the Gesamtkosten, so a renovation counts as value (V20).
 */
import { describe, it, expect } from "@jest/globals";
import { finishSummary } from "@/lib/funnel-v3/finishSummary";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { documentTally } from "@/lib/funnel-v3/requirementStatus";
import { extraStoredName } from "@/lib/funnel-v3/storedName";
import { calcFinancing } from "@/lib/funnel-v3/calc";
import type { FileEntry } from "@/lib/funnel-v3/files";
import type { FunnelState } from "@/lib/funnel-v3/types";
import { mustermannFiles, mustermannState } from "./mustermannCase";

function summary(state: FunnelState, files: FileEntry[]) {
  const docs = documentsSummary({ ...state, files, skipped: [] });
  return { docs, s: finishSummary({ state, status: docs.status, files: docs.files, hints: docs.hints, submittedDocuments: docs.submittedDocuments(), lang: "de" }) };
}

describe("one document tally (V51)", () => {
  it("adds up before any upload: «0 von N erfüllt · N fehlen», never N − 1", () => {
    const { docs, s } = summary(mustermannState(), []);
    const t = documentTally(docs.status.counts);
    expect(t.fulfilled + t.review + t.missing).toBe(t.total);
    expect(t.missing).toBe(t.total);
    const docsLine = s.checks.find((c) => c.key === "docs")!.sub;
    expect(docsLine).toBe(`0 von ${t.total} Anforderungen erfüllt · ${t.total} fehlen`);
    expect(s.kpis.find((k) => k.key === "docs")!.value).toBe(`0 / ${t.total}`);
    expect(s.lead).toContain(`${t.total} Dokument(e) fehlen noch`);
  });

  it("the Auskunftsermächtigung is part of the total", () => {
    const { docs } = summary(mustermannState(), []);
    expect(docs.status.requirements.some((r) => r.instance.id === "vollmacht")).toBe(true);
    expect(documentTally(docs.status.counts).total).toBe(docs.status.requirements.length);
  });
});

describe("«Aus Dokumenten übernommen» in the Prüfliste", () => {
  it("is left out while nothing was read from a document", () => {
    const { s } = summary(mustermannState(), []);
    expect(s.checks.map((c) => c.key)).not.toContain("fromDocs");
  });

  it("appears once values were read", () => {
    const { s } = summary(mustermannState(), mustermannFiles());
    expect(s.checks.map((c) => c.key)).toContain("fromDocs");
  });
});

describe("stored names of kept files outside the list (Handover 4.3)", () => {
  it("not needed / unknown: _ZUSATZ_ with the cleaned original name", () => {
    expect(extraStoredName("HQ-26-01-000001", "Steuerrechnung 2025 (Kopie).PDF", "notneeded")).toBe("HQ-26-01-000001_ZUSATZ_Steuerrechnung-2025-Kopie.pdf");
  });

  it("duplicate: _DUPLIKAT_", () => {
    expect(extraStoredName("HQ-…", "03_Kopie_Grundbuch.pdf", "duplicate")).toBe("HQ-…_DUPLIKAT_03-Kopie-Grundbuch.pdf");
  });
});

describe("Objektwert left empty with a renovation (V20)", () => {
  it("the preview case: 1'200'000 + 80'000 renovation − 240'000 Eigenmittel → 81.3 %, not 86.7 %", () => {
    const r = calcFinancing({
      antrag: "Neue Hypothek",
      kn: "Natürliche Person",
      aufstockung: "Nein",
      kaufpreis: 1200000,
      reno: "Ja",
      renoBetrag: 80000,
      old: 0,
      up: 0,
      val: 0,
      inc: 0,
      inc2: 0,
      em: { spar: 150000, s3a: 30000, pkVor: 60000, pkVerp: 0, schenk: 0, erbe: 0, darl: 0 },
    } as any);
    expect(r.need).toBe(1040000);
    expect(r.basis).toBe(1280000);
    expect(r.ltv).toBeCloseTo(81.25, 6);
  });
});
