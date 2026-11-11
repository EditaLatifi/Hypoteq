/**
 * HYPOTEQ Komplett-Test 06.11.2026 B02 (DECISIONS V111): two Lohnausweise of one borrower for one
 * year — a Nebenjob of CHF 616 beside the Hauptjob of CHF 117'000. Both belong on «Aktueller
 * Lohnausweis», and the income they show is their sum: no false conflict against CHF 117'655.
 */
import { describe, it, expect } from "@jest/globals";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import { placeAll } from "@/lib/funnel-v3/placeFile";
import { reqList } from "@/lib/funnel-v3/requirements";
import { crossChecks } from "@/components/funnel-v3/documents/view";
import { prefillFromDocuments } from "@/lib/funnel-v3/prefill";
import { docFacts, type AnalysedFile } from "@/lib/funnel-v3/facts";
import { evaluateAbgleich } from "@/lib/funnel-v3/abgleich/evaluate";
import { employerGroups, otherEmployer, sideJob } from "@/lib/funnel-v3/salary";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_TEXTS } from "@/lib/funnel-v3/types";
import { kaufState } from "./v5Fixtures";
import { mkState } from "./helpers";

const NOW = new Date("2026-11-06T10:00:00Z");
let n = 0;

const lohn = (employer: string, gross: string, year = "2025", over: Partial<V3Analysis> = {}): V3Analysis => ({
  status: "done",
  docTypeId: "lohnausweise",
  docTypeLabel: "Lohnausweis",
  confidence: 0.95,
  requirementId: "lohnausweise",
  docDate: year,
  fields: { Arbeitgeber: { value: employer, confidence: 0.95 }, Jahr: { value: year, confidence: 0.95 }, Bruttolohn: { value: gross, confidence: 0.95 } },
  contentHash: `hash-${++n}`,
  ...over,
});
const file = (a: V3Analysis): FileEntry => ({ id: `f${++n}`, name: "lohn.pdf", size: 1, uploadState: "uploaded", analysisState: "done", analysis: a });

const HAUPT = () => lohn("Muster Treuhand AG, Bahnhofstrasse 1, 8001 Zürich", "CHF 117'039");
const NEBEN = () => lohn("Bäckerei Beispiel GmbH", "CHF 616");

describe("which Lohnausweise are another employer's", () => {
  it("compares the employer's name, not its legal form or address", () => {
    expect(otherEmployer(HAUPT(), NEBEN())).toBe(true);
    expect(otherEmployer(HAUPT(), lohn("Muster Treuhand AG", "CHF 1"))).toBe(false);
    expect(otherEmployer(HAUPT(), lohn("MUSTER TREUHAND", "CHF 1"))).toBe(false);
    // Without a readable employer on both, they count as one (never twice the income).
    expect(otherEmployer(HAUPT(), lohn("", "CHF 1"))).toBe(false);
  });

  it("a further Lohnausweis joins only for the same year and a new employer", () => {
    expect(sideJob(NEBEN(), [HAUPT()])).toBe(true);
    expect(sideJob(lohn("Bäckerei Beispiel GmbH", "CHF 600", "2024"), [HAUPT()])).toBe(false);
    expect(sideJob(lohn("Muster Treuhand AG", "CHF 117'039"), [HAUPT()])).toBe(false);
    expect(sideJob(NEBEN(), [])).toBe(false);
  });

  it("groups the newest year's by employer", () => {
    const groups = employerGroups([HAUPT(), NEBEN(), lohn("Muster Treuhand AG", "CHF 110'000", "2024")], (a) => a);
    expect(groups.map((g) => g.map((a) => a.fields.Bruttolohn.value))).toEqual([["CHF 117'039"], ["CHF 616"]]);
  });
});

describe("placement: both on «Aktueller Lohnausweis»", () => {
  const state = mkState();
  const list = reqList(state);

  it("Hauptjob and Nebenjob of 2025 are both placed, whichever comes first", () => {
    for (const order of [[HAUPT(), NEBEN()], [NEBEN(), HAUPT()]]) {
      const files = order.map(file);
      const map = placeAll(files, state, { now: NOW, instances: list });
      expect(files.map((f) => map.get(f.id)?.instanceId)).toEqual(["lohnausweise#b1", "lohnausweise#b1"]);
    }
  });

  it("a second Lohnausweis of the same employer stays «überzählig»", () => {
    const files = [HAUPT(), lohn("Muster Treuhand AG", "CHF 117'039")].map(file);
    const map = placeAll(files, state, { now: NOW, instances: list });
    expect(files.map((f) => map.get(f.id)?.extraKind ?? "placed")).toEqual(["placed", "surplus"]);
  });
});

describe("the income they show is the sum", () => {
  it("the funnel's check against CHF 117'655: ok, no false conflict", () => {
    const inst = reqList(mkState()).find((i) => i.id === "lohnausweise")!;
    const files = [NEBEN(), HAUPT()].map(file);
    expect(crossChecks(inst, files, { ...EMPTY_AMOUNTS, inc: 117655 }, 1)).toEqual([{ kind: "funnel", field: "Bruttoeinkommen", funnel: 117655, doc: 117655, ok: true }]);
  });

  it("the Schnellanmeldung prefills the sum, the Hauptjob as source and Arbeitgeber", () => {
    const files: AnalysedFile[] = [NEBEN(), HAUPT()].map((analysis) => ({ fileId: `f${++n}`, analysis }));
    const r = prefillFromDocuments(files, { ans: { ...DEFAULT_ANSWERS }, txt: { ...EMPTY_TEXTS }, borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" }], touched: {} }, { now: NOW });
    expect(r.values["fin.inc"]).toBe(117655);
    expect(r.info.ag).toBe("Muster Treuhand AG, Bahnhofstrasse 1, 8001 Zürich");
  });

  it("the Pre-Check JSON adds them up: jahreseinkommen ok", () => {
    const s = kaufState({ fin: { ...kaufState().fin, inc: 117655 } });
    const inst = reqList(s).find((i) => i.id === "lohnausweise" && i.borrowerId === "b1")!.instanceId;
    const docs = [NEBEN(), HAUPT()].map((analysis) => ({ id: `d${++n}`, instanceId: inst, analysis }));
    const f = evaluateAbgleich({ state: s, docs }).fields.find((x) => x.id === "jahreseinkommen:b1")!;
    expect(f.result).toBe("ok");
    expect(f.extracted.map((e) => e.value)).toEqual([616, 117039, 117655]);
  });

  it("the bonus check holds the payslips against their own employer's Lohnausweis", () => {
    const slip: V3Analysis = { ...lohn("Muster Treuhand AG", "-"), docTypeId: "lohnabrechnungen", docDate: "2026-05", fields: { Arbeitgeber: { value: "Muster Treuhand AG", confidence: 0.95 }, "Monatslohn brutto": { value: "CHF 9'003", confidence: 0.95 }, "13. Monatslohn": { value: "ja", confidence: 0.95 } } };
    const facts = docFacts([NEBEN(), HAUPT(), slip].map((analysis) => ({ fileId: `f${++n}`, analysis })), { others: [] }, NOW);
    expect(facts.salary?.annual).toBe(117039);
    expect(facts.raise).toBe(false);
  });
});
