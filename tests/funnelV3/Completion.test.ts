import { describe, it, expect, jest } from "@jest/globals";
import {
  completeV3Inquiry,
  confirmationRecipients,
  planFiles,
  v3DocumentCaseFields,
  withSuffix,
  type CompletionDeps,
  type CompletionDocumentRow,
  type DriveItemRef,
} from "@/lib/funnel-v3/completion";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { toInquiryPayload } from "@/lib/funnel-v3/toInquiryPayload";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { gerberFiles, gerberState, SUBMISSION } from "./gerberCase";

const CASE = "HQ-26-06-156283";

/** Document rows as /api/inquiry adopts them: the AI analysis under aiAnalysis.v3. */
function rowsFor(files: FileEntry[]): CompletionDocumentRow[] {
  return files.map((f, i) => ({
    id: f.documentId!,
    fileName: f.name,
    fileUrl: `https://sp.example/case/${encodeURIComponent(f.name)}`,
    originalFileName: f.name,
    driveItemId: `item-${f.documentId}`,
    uploadedAt: new Date(Date.UTC(2026, 5, 2, 10, 0, i)),
    aiAnalysis: { classification: { type: "x" }, v3: f.analysis },
    storedName: null,
  }));
}

function payload(files: FileEntry[], over: any = {}) {
  const state = gerberState(over.state);
  const docs = documentsSummary({ ...state, files });
  return {
    ...toInquiryPayload(state, { locale: "de", submissionId: SUBMISSION, sharepointFolderId: "FOLDER", documents: docs.submittedDocuments(), documentCompleteness: { complete: true, missing: [], skipped: [] } }),
    ...over.data,
  };
}

/** In-memory SharePoint folder + Document table. */
function fakes(rows: CompletionDocumentRow[], opts: { existing?: string[]; failRename?: string } = {}) {
  const folder = new Map<string, string>(); // lower-case name → item id
  const items = new Map<string, DriveItemRef>();
  for (const r of rows) {
    items.set(r.driveItemId!, { id: r.driveItemId!, name: r.fileName, webUrl: r.fileUrl, parentId: "FOLDER" });
    folder.set(r.fileName.toLowerCase(), r.driveItemId!);
  }
  for (const n of opts.existing || []) folder.set(n.toLowerCase(), `foreign-${n}`);
  const updates: Record<string, any[]> = {};
  const removed: string[] = [];
  const uploads: { folderId: string; name: string; bytes: Uint8Array; contentType: string }[] = [];
  const renameCalls: string[] = [];
  const deps: Partial<CompletionDeps> = {
    db: {
      findDocuments: jest.fn(async () => rows.map((r) => ({ ...r }))),
      updateDocument: jest.fn(async (id: string, data: any) => void (updates[id] = [...(updates[id] || []), data])),
      setInquiryFolder: jest.fn(async () => {}),
    },
    graph: {
      token: async () => "TOKEN",
      getItem: async (id: string) => (id === "FOLDER" ? { id, name: "folder", webUrl: "https://sp.example/case" } : items.get(id) ?? null),
      rename: jest.fn(async (id: string, name: string) => {
        renameCalls.push(name);
        if (opts.failRename && name.includes(opts.failRename)) throw new Error("Graph rename failed (500)");
        const holder = folder.get(name.toLowerCase());
        if (holder && holder !== id) return { ok: false as const, conflict: true as const };
        const item = items.get(id)!;
        folder.delete(item.name.toLowerCase());
        folder.set(name.toLowerCase(), id);
        const next = { ...item, name, webUrl: `https://sp.example/case/${encodeURIComponent(name)}` };
        items.set(id, next);
        return { ok: true as const, item: next };
      }),
      remove: jest.fn(async (id: string) => {
        removed.push(id);
        const item = items.get(id);
        if (item) folder.delete(item.name.toLowerCase());
      }),
      upload: jest.fn(async (folderId: string, name: string, bytes: Uint8Array, contentType: string) => {
        uploads.push({ folderId, name, bytes, contentType });
        return { id: "dossier-item", name, webUrl: `https://sp.example/case/${name}` };
      }),
      ensureFolder: jest.fn(async () => "NEWFOLDER"),
    },
    now: () => new Date("2026-06-02T12:00:00Z"),
    log: { log: () => {}, warn: () => {}, error: () => {} } as any,
  };
  return { deps, updates, removed, uploads, renameCalls, folder };
}

const storedOf = (updates: Record<string, any[]>, id: string) => updates[id]?.find((u) => "storedName" in u)?.storedName;

describe("planFiles — stored names (spec 5.1)", () => {
  const files = gerberFiles();
  const rows = rowsFor(files);
  const p = payload(files);
  const plans = planFiles(p.v3 as any, rows, p.documents as any, CASE);
  const byName = (orig: string) => plans.find((x) => x.row.originalFileName === orig)!;

  it("matches the spec examples", () => {
    expect(byName("03_Grundbuchauszug_Etzelstrasse_52_Waedenswil_2026_01_15.pdf").target).toBe("HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf");
    expect(byName("01_Lohnausweis_Gary_Gerber_2024_Etzel_Liegenschaften_AG.pdf").target).toBe("HQ-26-06-156283_01_Lohnausweis_Gerber-Gary_2024_2.pdf");
    expect(byName("03_Hypothek_Zinsabrechnung_ZKB_Gary_Gerber.pdf").target).toBe("HQ-26-06-156283_02_Zinsabrechnung_ZKB_2026-03-30.pdf");
    expect(byName("01_ID_Gary_Gerber.pdf").target).toBe("HQ-26-06-156283_01_ID_Gerber-Gary.pdf");
  });

  it("numbers several files of one requirement by document date", () => {
    expect(byName("01_Lohnausweis_Gary_Gerber_2023.pdf").target).toBe("HQ-26-06-156283_01_Lohnausweis_Gerber-Gary_2023_1.pdf");
    expect(byName("01_Lohnausweis_Gary_Gerber_2025.pdf").target).toBe("HQ-26-06-156283_01_Lohnausweis_Gerber-Gary_2025_3.pdf");
  });

  it("extras: _ZUSATZ_ for surplus and kept not-needed files; duplicates and not-needed are removed", () => {
    expect(byName("01_Lohnausweis_Gary_Gerber_2022.pdf").target).toBe("HQ-26-06-156283_01_ZUSATZ_Lohnausweis_Gerber-Gary_2022.pdf");
    const kept = byName("03_Nebenkostenabrechnung_Etzelstrasse_52_Waedenswil_2025.PDF");
    expect(kept.remove).toBe(false);
    expect(kept.target).toBe("HQ-26-06-156283_ZUSATZ_03-Nebenkostenabrechnung-Etzelstrasse-52-Waedenswil-2025.pdf");
    expect(byName("01_Leasingvertrag_Cembra_Gary_Gerbe.pdf").remove).toBe(true);
    expect(byName("01_Steuerrechnung_Gary_Gerber_2023_Schlussrechnung.pdf").remove).toBe(true);
  });

  it("a kept duplicate gets _DUPLIKAT_", () => {
    const subs = (p.documents as any[]).map((d) => (d.extraKind === "duplicate" ? { ...d, keep: true } : d));
    const pl = planFiles(p.v3 as any, rows, subs, CASE).find((x) => x.row.originalFileName === "01_Leasingvertrag_Cembra_Gary_Gerbe.pdf")!;
    expect(pl.remove).toBe(false);
    expect(pl.target).toBe("HQ-26-06-156283_01_DUPLIKAT_Leasingvertrag_Gerber-Gary.pdf");
  });

  it("names within the batch are unique, deterministically, whatever the row order", () => {
    const two = gerberFiles().filter((f) => f.analysis?.extraKind === "surplus");
    const twin = { ...two[0], id: "fx", documentId: "doc-twin", name: "01_Lohnausweis_Gary_Gerber_2022 (1).pdf" };
    const r = rowsFor([two[0], twin]);
    r[1].uploadedAt = new Date(Date.UTC(2026, 5, 2, 11));
    const subs = [{ documentId: two[0].documentId!, instanceId: null, requirementId: "lohnausweise", extraKind: "surplus" as const }, { documentId: "doc-twin", instanceId: null, requirementId: "lohnausweise", extraKind: "surplus" as const }];
    const a = planFiles(p.v3 as any, r, subs, CASE).map((x) => [x.row.id, x.target]);
    const b = planFiles(p.v3 as any, [...r].reverse(), subs, CASE).map((x) => [x.row.id, x.target]);
    expect(Object.fromEntries(a)).toEqual(Object.fromEntries(b));
    expect(Object.fromEntries(a)["doc-twin"]).toBe("HQ-26-06-156283_01_ZUSATZ_Lohnausweis_Gerber-Gary_2022_2.pdf");
  });

  it("no case number: nothing is renamed", () => {
    expect(planFiles(p.v3 as any, rows, p.documents as any, null).every((x) => x.target === null)).toBe(true);
  });

  it("withSuffix", () => {
    expect(withSuffix("a_b.pdf", 2)).toBe("a_b_2.pdf");
    expect(withSuffix("noext", 3)).toBe("noext_3");
  });
});

describe("completeV3Inquiry", () => {
  it("stores the submitted detail, renames, deletes, persists storedName and uploads the dossier", async () => {
    const files = gerberFiles();
    const rows = rowsFor(files);
    const f = fakes(rows);
    const res = (await completeV3Inquiry({ inquiryId: SUBMISSION, submissionId: SUBMISSION, caseNumber: CASE, data: payload(files) }, f.deps))!;

    expect(res.errors).toEqual([]);
    expect(res.folderWebUrl).toBe("https://sp.example/case");

    // a. detail beside the analysis
    const first = f.updates["doc-1"][0].aiAnalysis;
    expect(first.v3).toBeDefined();
    expect(first.classification).toEqual({ type: "x" });
    expect(first.v3Submitted).toMatchObject({ instanceId: "fotos", requirementId: "fotos", submittedAt: "2026-06-02T12:00:00.000Z" });

    // b. renames and persisted names
    expect(storedOf(f.updates, "doc-4")).toBe("HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf");
    expect(f.updates["doc-4"].find((u) => "storedName" in u)).toMatchObject({ fileName: "HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf", fileUrl: expect.stringContaining("Grundbuchauszug_2026-01-15") });
    expect(f.folder.has("hq-26-06-156283_01_id_gerber-gary.pdf")).toBe(true);
    expect(res.files.filter((x) => x.storedName).length).toBe(28);

    // deletes: duplicate and the not-needed Steuerrechnung; the row stays with an audit note
    expect(f.removed.sort()).toEqual(["item-doc-28", "item-doc-29"]);
    const del = f.updates["doc-28"].find((u) => "driveItemId" in u);
    expect(del.driveItemId).toBeNull();
    expect(del.aiAnalysis.v3Completion).toEqual({ removed: true, reason: "duplicate", removedAt: "2026-06-02T12:00:00.000Z", driveItemId: "item-doc-28" });
    expect(res.files.find((x) => x.documentId === "doc-28")).toMatchObject({ removed: true, storedName: null, url: null });

    // c. dossier
    expect(f.uploads).toHaveLength(1);
    expect(f.uploads[0]).toMatchObject({ folderId: "FOLDER", name: "HQ-26-06-156283_00_Fall-Dossier.pdf", contentType: "application/pdf" });
    expect(Buffer.from(f.uploads[0].bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(res.dossier).toEqual({ name: "HQ-26-06-156283_00_Fall-Dossier.pdf", webUrl: "https://sp.example/case/HQ-26-06-156283_00_Fall-Dossier.pdf", driveItemId: "dossier-item" });
  });

  it("a name taken in the folder by another file gets the next free suffix", async () => {
    const files = gerberFiles();
    const rows = rowsFor(files);
    const f = fakes(rows, { existing: ["HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf", "HQ-26-06-156283_03_Grundbuchauszug_2026-01-15_2.pdf"] });
    const res = (await completeV3Inquiry({ inquiryId: SUBMISSION, submissionId: SUBMISSION, caseNumber: CASE, data: payload(files) }, f.deps))!;
    expect(res.errors).toEqual([]);
    expect(storedOf(f.updates, "doc-4")).toBe("HQ-26-06-156283_03_Grundbuchauszug_2026-01-15_3.pdf");
  });

  it("a conflict with a batch file that is renamed away resolves to the planned name", async () => {
    const files = gerberFiles();
    const rows = rowsFor(files);
    // doc-4 currently carries the name doc-1 (Fotos) is meant to get.
    rows[3].fileName = "HQ-26-06-156283_03_Fotos.pdf";
    const f = fakes(rows);
    await completeV3Inquiry({ inquiryId: SUBMISSION, submissionId: SUBMISSION, caseNumber: CASE, data: payload(files) }, f.deps);
    expect(storedOf(f.updates, "doc-1")).toBe("HQ-26-06-156283_03_Fotos.pdf");
    expect(storedOf(f.updates, "doc-4")).toBe("HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf");
  });

  it("one failing rename is logged and does not stop the others or the dossier", async () => {
    const files = gerberFiles();
    const f = fakes(rowsFor(files), { failRename: "Grundbuchauszug" });
    const res = (await completeV3Inquiry({ inquiryId: SUBMISSION, submissionId: SUBMISSION, caseNumber: CASE, data: payload(files) }, f.deps))!;
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toMatch(/^rename doc-4/);
    expect(storedOf(f.updates, "doc-4")).toBeUndefined();
    expect(res.files.find((x) => x.documentId === "doc-4")!.storedName).toBeNull();
    expect(storedOf(f.updates, "doc-1")).toBe("HQ-26-06-156283_03_Fotos.pdf");
    expect(f.uploads).toHaveLength(1);
  });

  it("no SharePoint: nothing renamed, the dossier is still rendered, errors reported", async () => {
    const files = gerberFiles();
    const f = fakes(rowsFor(files));
    (f.deps.graph as any).token = async () => {
      throw new Error("Could not get SharePoint token");
    };
    const render = jest.fn(async () => new Uint8Array([1]));
    const res = (await completeV3Inquiry({ inquiryId: SUBMISSION, submissionId: SUBMISSION, caseNumber: CASE, data: payload(files) }, { ...f.deps, renderDossier: render }))!;
    expect(render).toHaveBeenCalled();
    expect(res.dossier).toBeNull();
    expect(res.errors.join(" | ")).toMatch(/case folder: Could not get SharePoint token/);
  });

  it("no folder in the payload and no uploads: creates the submission folder", async () => {
    const f = fakes([]);
    const data = payload([], { data: { sharepointFolderId: null } });
    const res = (await completeV3Inquiry({ inquiryId: SUBMISSION, submissionId: SUBMISSION, caseNumber: CASE, data }, f.deps))!;
    expect(res.folderId).toBe("NEWFOLDER");
    expect((f.deps.db as any).setInquiryFolder).toHaveBeenCalledWith(SUBMISSION, "NEWFOLDER");
    expect(f.uploads[0].folderId).toBe("NEWFOLDER");
  });

  it("not a v3 payload: does nothing", async () => {
    const f = fakes([]);
    expect(await completeV3Inquiry({ inquiryId: "x", submissionId: "x", caseNumber: CASE, data: { client: { email: "a@b.ch" } } }, f.deps)).toBeNull();
    expect((f.deps.db as any).findDocuments).not.toHaveBeenCalled();
  });
});

describe("v3DocumentCaseFields", () => {
  it("Dok flags, Documents_completed__c, the 6.11 state with stored names and the folder URL", async () => {
    const files = gerberFiles();
    const f = fakes(rowsFor(files));
    const data: any = payload(files);
    data.v3Completion = await completeV3Inquiry({ inquiryId: SUBMISSION, submissionId: SUBMISSION, caseNumber: CASE, data }, f.deps);
    const previous = JSON.stringify({ checked: { "Manuell abgehakt": true }, filters: { a: 1 }, savedAt: "x" });
    const out = v3DocumentCaseFields(data, previous, new Date("2026-06-02T12:00:00Z"))!;
    expect(out.Documents_completed__c).toBe(true);
    expect(out.Dok_Lohnausweis__c).toBe(true);
    expect(out.Dok_Grundbuchauszug__c).toBe(false); // outdated, used anyway (spec 6.9)
    expect(out.Dok_Kaufvertrag__c).toBeUndefined();
    expect(out.SharePoint_Doc__c).toBe("https://sp.example/case");
    const state = JSON.parse(out.Dokumenten_Check_State__c as string);
    expect(state.version).toBe(1);
    expect(state.checked["Manuell abgehakt"]).toBe(true);
    expect(state.filters).toEqual({ a: 1 });
    const gb = state.requirements.find((r: any) => r.id === "grundbuch");
    expect(gb.status).toBe("ok");
    expect(gb.files[0]).toMatchObject({ originalName: "03_Grundbuchauszug_Etzelstrasse_52_Waedenswil_2026_01_15.pdf", storedName: "HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf", confidence: 0.95 });
    expect(gb.fields).toContainEqual({ key: "Eigentümer", value: "Gary Samuel Gerber", confidence: 0.97 });
    expect(state.extras.map((e: any) => e.kind)).toEqual(["surplus", "duplicate", "notneeded", "notneeded"]);
    expect(state.hints).toHaveLength(4);
  });

  it("without the closing result: from the submitted detail, no folder URL", () => {
    const data: any = payload(gerberFiles().filter((f) => f.instanceId !== "id#b1"));
    const out = v3DocumentCaseFields(data)!;
    expect(out.Documents_completed__c).toBe(false);
    expect(out.Dok_Identitaetsdokument__c).toBe(false);
    expect(out.SharePoint_Doc__c).toBeUndefined();
  });

  it("null for a legacy payload", () => {
    expect(v3DocumentCaseFields({ client: {} })).toBeNull();
  });
});

describe("confirmationRecipients (D17)", () => {
  it("Berater: to the customer, copy to the Berater", () => {
    const data = payload([], { state: { role: "berater", txt: { ...gerberState().txt, bmail: "petra@partner.ch" } } });
    expect(data.client.email).toBe("petra@partner.ch");
    expect(confirmationRecipients(data)).toEqual({ to: "gary.gerber@example.ch", cc: "petra@partner.ch", firstName: "Gary" });
  });
  it("Kunde and legacy payloads: unchanged", () => {
    expect(confirmationRecipients(payload([]))).toEqual({ to: "gary.gerber@example.ch", cc: null, firstName: "Gary" });
    expect(confirmationRecipients({ client: { email: "p@x.ch", firstName: "" } })).toEqual({ to: "p@x.ch", cc: null, firstName: "" });
  });
});
