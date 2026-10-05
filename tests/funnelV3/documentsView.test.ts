import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { hasKey, LANGS } from "@/lib/funnel-v3/i18n";
import { reqList } from "@/lib/funnel-v3/requirements";
import { requirementStatus } from "@/lib/funnel-v3/requirementStatus";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { V3_DOC_TYPES } from "@/components/documentIntelligence/v3/catalogue";
import {
  band,
  chip,
  crossChecks,
  groupRows,
  mergedFields,
  outdatedText,
  parseChf,
  reasonText,
  storedNameFor,
  storedNameForExtra,
} from "@/components/funnel-v3/documents/view";
import { EMPTY_AMOUNTS } from "@/lib/funnel-v3/types";
import { GARY, GERBER_ANSWERS, mkState } from "./helpers";

const t = (k: string) => k;

const f = (extra: Partial<FileEntry>): FileEntry => ({ id: "f", name: "a.pdf", size: 1, uploadState: "uploaded", analysisState: "done", ...extra });

describe("confidence chips", () => {
  it("bands at 0.9 and 0.7; percentages only for the internal role", () => {
    expect([0.95, 0.9, 0.89, 0.7, 0.69, null].map(band)).toEqual(["ok", "ok", "check", "check", "unsure", "none"]);
    expect(chip(0.93, false, t)).toEqual({ label: "state.ok", tone: "success" });
    expect(chip(0.93, true, t).label).toBe("state.ok · 93 %");
    expect(chip(0.75, false, t)).toEqual({ label: "state.check", tone: "warning" });
    expect(chip(0.5, true, t)).toEqual({ label: "docs.chipUnsure · 50 %", tone: "danger" });
    expect(chip(0.5, false, t, true).tone).toBe("success");
  });
});

describe("reason lines and groups", () => {
  it("«weil: Baurecht = Ja» in the funnel language", () => {
    const inst = reqList(mkState({ baurecht: "Ja" })).find((i) => i.id === "baurecht")!;
    expect(reasonText(inst.reason, "de")).toBe("weil: Baurecht = Ja");
    expect(reasonText(reqList(mkState())[0].reason, "de")).toBe("Pflicht");
  });

  it("Objekt · Hypothek · Person per borrower · Eigenmittel", () => {
    const anna = { id: "b2", vor: "Anna", nach: "Muster", job: "Angestellt" as const, pkSe: "Nein" as const };
    const state = mkState(GERBER_ANSWERS, {}, {}, [GARY, anna]);
    const st = requirementStatus(reqList(state), []);
    const groups = groupRows(st.requirements, state, "de");
    expect(groups.map((g) => g.title)).toEqual([
      "Zum Objekt",
      "Bestehende Hypothek",
      "Zur Person · Gary Gerber",
      "Zur Person · Anna Muster",
      "Eigenmittel & Vorsorge",
    ]);
    // case-level person documents sit with the first borrower; every row appears once
    expect(groups[2].rows.map((r) => r.instance.id)).toContain("vollmacht");
    expect(groups.flatMap((g) => g.rows).length).toBe(st.requirements.length);

    const jp = mkState({ kn: "Juristische Person" }, {}, { firma: "Muster AG" });
    expect(groupRows(requirementStatus(reqList(jp), []).requirements, jp, "de").map((g) => g.title)).toContain("Zur Gesellschaft · Muster AG");
  });
});

describe("fields, names, checks", () => {
  it("merges the files' values, most confident first, the customer's edit above all", () => {
    const a = f({ id: "a", analysis: { status: "done", docTypeId: "lohnausweise", docTypeLabel: "", confidence: 1, requirementId: null, fields: { Arbeitgeber: { value: "Etzel AG", confidence: 0.8 }, "Bruttolohn 2024": { value: "CHF 118'900", confidence: 0.95 } } } });
    const b = f({ id: "b", humanEdits: { "Bruttolohn 2025": "CHF 125'385" }, analysis: { status: "done", docTypeId: "lohnausweise", docTypeLabel: "", confidence: 1, requirementId: null, fields: { Arbeitgeber: { value: "Etzel Liegenschaften AG", confidence: 0.99 } } } });
    const m = mergedFields([a, b]);
    expect(m.map((x) => [x.key, x.value, x.edited])).toEqual([
      ["Arbeitgeber", "Etzel Liegenschaften AG", false],
      ["Bruttolohn 2025", "CHF 125'385", true],
      ["Bruttolohn 2024", "CHF 118'900", false],
    ]);
    const inst = reqList(mkState())!.find((i) => i.id === "lohnausweise")!;
    expect(crossChecks(inst, [a, b], { ...EMPTY_AMOUNTS, inc: 125000 }, 1)).toEqual([{ field: "Bruttoeinkommen", funnel: 125000, doc: 125385, ok: true }]);
    expect(crossChecks(inst, [a, b], { ...EMPTY_AMOUNTS, inc: 125000 }, 2)).toEqual([]);
    expect(parseChf("CHF 449'000.00")).toBe(449000);
    expect(parseChf("–")).toBeNull();
  });

  it("previews the stored name with the case number placeholder", () => {
    const inst = reqList(mkState())!.find((i) => i.id === "lohnausweise")!;
    const file = f({ name: "Lohnausweis.PDF", analysis: { status: "done", docTypeId: "lohnausweise", docTypeLabel: "", confidence: 1, requirementId: null, docDate: "2024", fields: {} } });
    expect(storedNameFor(file, inst, 2, 3)).toBe("HQ-…_01_Lohnausweis_Gerber-Gary_2024_2.pdf");
    expect(storedNameFor({ ...file, nameOverride: "X.pdf" }, inst, 2, 3)).toBe("X.pdf");
    const extra = storedNameForExtra(
      { ...file, analysis: { ...file.analysis!, docDate: "2022", personName: "Gerber Gary" } },
      { instanceId: null, requirementId: "lohnausweise", extraKind: "surplus", reason: "period" }
    );
    expect(extra).toBe("HQ-…_01_ZUSATZ_Lohnausweis_Gerber-Gary_2022.pdf");
  });

  it("explains an outdated document", () => {
    expect(outdatedText({ code: "maxAge", months: 6, date: "2026-01-15" }, "de")).toContain("15.01.2026");
    expect(outdatedText(null, "fr")).toBeTruthy();
  });
});

describe("texts", () => {
  it("every key the documents step uses exists in all four languages", () => {
    const dir = path.join(__dirname, "..", "..", "components", "funnel-v3");
    const files = [
      ...fs.readdirSync(path.join(dir, "documents")).map((x) => path.join(dir, "documents", x)),
      path.join(dir, "steps", "Step5Documents.tsx"),
      path.join(__dirname, "..", "..", "lib", "funnel-v3", "upload.ts"),
    ].filter((p) => /\.tsx?$/.test(p));
    const keys = new Set<string>();
    for (const p of files) {
      const src = fs.readFileSync(p, "utf8");
      for (const m of src.matchAll(/["'`]((?:docs|s5|act|state|toast|sug|grp|why|common|step)\.[A-Za-z0-9_.]+)["'`]/g)) keys.add(m[1]);
    }
    for (const id of V3_DOC_TYPES.filter((x) => x.kind === "notneeded").map((x) => x.id)) keys.add(`docs.nn.${id}`);
    expect(keys.size).toBeGreaterThan(60);
    const missing = LANGS.flatMap((l) => [...keys].filter((k) => !hasKey(l, k)).map((k) => `${l} ${k}`));
    expect(missing).toEqual([]);
  });
});
