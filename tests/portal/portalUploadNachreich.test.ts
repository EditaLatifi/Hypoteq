import { describe, it, expect } from "@jest/globals";
import type { CompletionDocumentRow } from "@/lib/funnel-v3/completion";
import { nachreichV3View, placedByHand } from "@/lib/funnel-v3/nachreich";
import { existingRows, inquiryRow, v3StateFor, MAX, ANNA } from "../funnelV3/nachreichFixtures";

/**
 * A partner's portal upload on a Funnel v3 inquiry (app/api/portal/upload/finalize) counts on
 * the customer's Nachreich page. Retest 20.10.2026: after ten portal uploads the page still
 * listed every document as «Fehlt», because the row carried no placement.
 */

/** The Document row the finalize route writes for one requirement. */
function portalRow(id: string, instanceId: string | null): CompletionDocumentRow {
  return {
    id,
    fileName: `${id}.pdf`,
    fileUrl: `https://sp.example/case/${id}.pdf`,
    originalFileName: instanceId ? `${id}.pdf` : null,
    driveItemId: null,
    uploadedAt: new Date(Date.UTC(2026, 9, 20, 12, 0, 0)),
    aiAnalysis: instanceId ? placedByHand(instanceId, new Date(Date.UTC(2026, 9, 20, 12, 0, 0))) : null,
    storedName: null,
  } as CompletionDocumentRow;
}

const view = (rows: CompletionDocumentRow[]) => nachreichV3View(inquiryRow({ v3State: v3StateFor([MAX, ANNA]) }), rows)!;

describe("portal uploads on the Nachreich page", () => {
  it("a placed upload fulfils its requirement, per borrower too", () => {
    const before = view(existingRows()).missing.map((m) => m.instanceId);
    expect(before).toEqual(expect.arrayContaining(["fotos", "id#b2"]));

    const after = view([...existingRows(), portalRow("p-fotos", "fotos"), portalRow("p-id", "id#b2")]).missing.map((m) => m.instanceId);
    expect(after).not.toContain("fotos");
    expect(after).not.toContain("id#b2");
    expect(after).toEqual(before.filter((id) => id !== "fotos" && id !== "id#b2"));
  });

  it("an upload without a requirement («Weiteres Dokument») fulfils nothing", () => {
    expect(view([...existingRows(), portalRow("p-other", null)]).missing).toEqual(view(existingRows()).missing);
  });

  it("records the requirement, not the borrower suffix, as requirementId", () => {
    expect(placedByHand("id#b2", new Date(0)).v3Submitted).toEqual({ instanceId: "id#b2", requirementId: "id", assignedByUser: true, submittedAt: "1970-01-01T00:00:00.000Z" });
  });
});
