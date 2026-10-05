import { describe, it, expect } from "@jest/globals";
import { toUploadedFiles, type FileEntry } from "@/lib/funnel-v3/files";

/** A recognised Grundbuchauszug (spec O4: max. 6 months) as the store holds it. */
const grundbuch = (docDate: string, outdated = false): FileEntry =>
  ({
    id: "f1",
    name: "Grundbuchauszug.pdf",
    size: 1,
    type: "application/pdf",
    uploadState: "uploaded",
    analysisState: "done",
    instanceId: "grundbuch",
    analysis: { docTypeId: "grundbuch", requirementId: "grundbuch", docDate, outdated, fields: {} },
  }) as unknown as FileEntry;

describe("toUploadedFiles — «Veraltet» judged at status time (spec 4.2)", () => {
  it("keeps a fresh extract fresh", () => {
    const [u] = toUploadedFiles([grundbuch("2026-08-01")], new Date("2026-10-05"));
    expect(u.outdated).toBe(false);
  });

  it("flags an extract that passed its six months after the analysis said it was fresh", () => {
    // Analysed in February (fresh), looked at again in October (Nachreichung, long session).
    const [u] = toUploadedFiles([grundbuch("2026-01-15", false)], new Date("2026-10-05"));
    expect(u.outdated).toBe(true);
  });

  it("keeps the analysis verdict when it already said outdated", () => {
    const [u] = toUploadedFiles([grundbuch("2025-01-15", true)], new Date("2026-10-05"));
    expect(u.outdated).toBe(true);
  });

  it("never judges a file that is still being read", () => {
    const f = { ...grundbuch("2025-01-15"), analysisState: "analysing" } as FileEntry;
    const [u] = toUploadedFiles([f], new Date("2026-10-05"));
    expect(u.outdated).toBe(false);
    expect(u.status).toBe("analysing");
  });
});
