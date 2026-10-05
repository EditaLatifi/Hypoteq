import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  filesFromRows,
  nachreichV3View,
  storedV3State,
  submitV3Nachreichung,
  v3InquiryColumns,
  type NachreichV3Deps,
} from "@/lib/funnel-v3/nachreich";
import { instanceFromMissing } from "@/lib/funnel-v3/nachreichView";
import type { CompletionDocumentRow, DriveItemRef } from "@/lib/funnel-v3/completion";
import { toInquiryPayload } from "@/lib/funnel-v3/toInquiryPayload";
import { ANNA, CASE, GARY, INQUIRY, analysis, existingRows, heldRow, inquiryRow, v3StateFor } from "./nachreichFixtures";
import { gerberState, SUBMISSION } from "./gerberCase";

/**
 * The v3 Nachreichung on the server (lib/funnel-v3/nachreich.ts) with an in-memory Document
 * table, SharePoint folder, Case and mailbox — nothing leaves the process.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
});

function world(rows: CompletionDocumentRow[], held: CompletionDocumentRow[], opts: { caseState?: string | null } = {}) {
  const docs = rows.map((r) => ({ ...r }));
  const folder = new Map<string, string>();
  const items = new Map<string, DriveItemRef>();
  const track = (r: CompletionDocumentRow) => {
    if (!r.driveItemId) return;
    items.set(r.driveItemId, { id: r.driveItemId, name: r.fileName, webUrl: r.fileUrl, parentId: "FOLDER" });
    folder.set(r.fileName.toLowerCase(), r.driveItemId);
  };
  docs.forEach(track);
  held.forEach(track);
  const inquiryUpdates: any[] = [];
  const cases: Record<string, any>[] = [];
  const mails: any[] = [];
  const adoptCalls: any[] = [];
  const deps: Partial<NachreichV3Deps> = {
    db: {
      findDocuments: async () => docs.map((r) => ({ ...r })),
      adoptHeld: async (inquiryId, documents) => {
        adoptCalls.push({ inquiryId, documents });
        const listed = new Set(documents.map((d) => d.documentId));
        const take = held.filter((h) => listed.has(h.id));
        docs.push(...take.map((h) => ({ ...h })));
        return take.length;
      },
      updateDocument: async (id, data) => {
        const r = docs.find((x) => x.id === id);
        if (r) Object.assign(r, data);
      },
      setInquiryFolder: async () => {},
      updateInquiry: async (id, data) => void inquiryUpdates.push({ id, ...data }),
    },
    completion: {
      graph: {
        token: async () => "TOKEN",
        getItem: async (id: string) => (id === "FOLDER" ? { id, name: "folder", webUrl: "https://sp.example/case" } : items.get(id) ?? null),
        rename: async (id: string, name: string) => {
          const holder = folder.get(name.toLowerCase());
          if (holder && holder !== id) return { ok: false as const, conflict: true as const };
          const item = items.get(id)!;
          folder.delete(item.name.toLowerCase());
          folder.set(name.toLowerCase(), id);
          const next = { ...item, name, webUrl: `https://sp.example/case/${encodeURIComponent(name)}` };
          items.set(id, next);
          return { ok: true as const, item: next };
        },
        remove: async (id: string) => {
          const item = items.get(id);
          if (item) folder.delete(item.name.toLowerCase());
        },
        upload: async (_f: string, name: string) => ({ id: "dossier-item", name, webUrl: `https://sp.example/case/${name}` }),
        ensureFolder: async () => "FOLDER",
      },
      renderDossier: async () => new Uint8Array([1, 2, 3]),
      now: () => new Date("2026-10-05T12:00:00Z"),
      log: { log: () => {}, warn: () => {}, error: () => {} } as any,
    },
    updateCase: async (caseId, build) => {
      const fields = build(opts.caseState ?? null);
      cases.push({ caseId, ...fields });
      return fields;
    },
    sendMail: async (p) => void mails.push(p),
    now: () => new Date("2026-10-05T12:00:00Z"),
    log: { log: () => {}, warn: () => {}, error: () => {} } as any,
  };
  const nameOf = (id: string) => docs.find((r) => r.id === id)?.fileName;
  return { deps, docs, inquiryUpdates, cases, mails, adoptCalls, nameOf, folder };
}

describe("v3InquiryColumns (/api/inquiry)", () => {
  it("stores the submitted v3 block with the language, and the «Habe ich nicht» marks", () => {
    const state = gerberState({ borrowers: [GARY, ANNA] });
    const payload: any = toInquiryPayload(state, { locale: "fr", submissionId: SUBMISSION, documentCompleteness: { skipped: ["verkaufsdoku", 7] } });
    const cols = v3InquiryColumns(payload, "fr") as any;
    expect(cols.v3State).toMatchObject({ version: 1, role: "kunde", lang: "fr", borrowers: [GARY, ANNA] });
    expect(cols.v3State.ans.antrag).toBe("Ablösung");
    expect(cols.v3State.txt.vor).toBe("Gary");
    expect(cols.v3State.fin.old).toBe(449000);
    expect(cols.v3State).not.toHaveProperty("calc");
    expect(cols.v3Skipped).toEqual(["verkaufsdoku"]);
    expect(storedV3State({ v3State: cols.v3State })!.lang).toBe("fr");
  });

  it("is empty for a legacy payload", () => {
    expect(v3InquiryColumns({ client: { email: "a@b.ch" } }, "de")).toEqual({});
    expect(storedV3State({ v3State: null })).toBeNull();
  });
});

describe("nachreichV3View (GET)", () => {
  const view = (lang = "de") => nachreichV3View(inquiryRow({ v3State: v3StateFor([GARY, ANNA], lang) }), existingRows())!;

  it("lists what is still open, recomputed from the documents, grouped like step 5", () => {
    const v = view();
    expect(v).toMatchObject({ valid: true, v3: true, lang: "de", caseNumber: CASE, folderId: "FOLDER", submissionId: INQUIRY });
    const ids = v.missing.map((m) => m.instanceId);
    expect(ids).toEqual(["fotos", "lohnausweise#b1", "id#b2", "lohnausweise#b2", "lohnabrechnungen#b2", "anstellung#b2", "pk#b2", "steuer#b2"]);
    // The removed duplicate does not count for the photos; the overridden Grundbuch is fine.
    expect(ids).not.toContain("grundbuch");
    const lohn = v.missing.find((m) => m.instanceId === "lohnausweise#b1")!;
    expect(lohn).toMatchObject({ state: "partial", expect: 3, have: 2, slots: 1 });
    expect(v.missing.find((m) => m.instanceId === "fotos")).toMatchObject({ state: "missing", slots: 1, group: "objekt", groupLabel: "Zum Objekt" });
  });

  it("labels in the inquiry's language, with the person on per-borrower requirements", () => {
    const de = view("de").missing;
    expect(de.find((m) => m.instanceId === "fotos")!.label).toBe("Fotos der Immobilie (innen und aussen)");
    expect(de.find((m) => m.instanceId === "lohnausweise#b1")!.label).toBe("Lohnausweise der letzten 3 Jahre – Gary Gerber");
    expect(de.find((m) => m.instanceId === "id#b2")!.label).toBe("Pass / Identitätskarte – Anna Muster");
    expect(de.find((m) => m.instanceId === "id#b2")!.groupLabel).toBe("Zur Person · Anna Muster");

    const fr = view("fr");
    expect(fr.lang).toBe("fr");
    expect(fr.missing.find((m) => m.instanceId === "fotos")!.label).toBe("Photos du bien (intérieur et extérieur)");
    expect(fr.missing.find((m) => m.instanceId === "lohnausweise#b2")!.label).toBe("Certificats de salaire des 3 dernières années – Anna Muster");
    expect(fr.missing.find((m) => m.instanceId === "id#b2")!.groupLabel).toBe("Personne · Anna Muster");

    const it = view("it").missing;
    expect(it.find((m) => m.instanceId === "id#b2")!.label).toBe("Passaporto / carta d’identità – Anna Muster");
    const en = view("en").missing;
    expect(en.find((m) => m.instanceId === "fotos")!.label).toBe("Photos of the property (interior and exterior)");
  });

  it("gives the page instances to place files on, sized to what is still to come", () => {
    const lohn = instanceFromMissing(view().missing.find((m) => m.instanceId === "lohnausweise#b1")!)!;
    expect(lohn).toMatchObject({ id: "lohnausweise", borrowerId: "b1", expect: 1, perBorrower: true });
    expect(lohn.person?.display).toBe("Gary Gerber");
  });

  it("is null for a legacy inquiry", () => {
    expect(nachreichV3View(inquiryRow({ v3State: null, documentsMissing: "funnel.passportIDAllBorrowers" }), [])).toBeNull();
  });
});

describe("submitV3Nachreichung (POST)", () => {
  const held = () => [
    heldRow("h-fotos", "IMG_2041 Wohnzimmer.pdf", analysis("fotos"), 1),
    heldRow("h-lohn", "Lohnausweis 2023 Gary.pdf", analysis("lohnausweise", { docDate: "2023", personName: "Gerber Gary" }), 2),
    heldRow("h-gb", "Grundbuch neu.pdf", analysis("grundbuch", { docDate: "2026-09-30" }), 3),
  ];
  const body = {
    documents: [
      { documentId: "h-fotos", instanceId: "fotos", requirementId: "fotos" },
      { documentId: "h-lohn", instanceId: "lohnausweise#b1", requirementId: "lohnausweise", storedName: "selbst-gewaehlt.pdf" },
      // Not open any more (the Grundbuch was accepted): kept as an extra, never counted.
      { documentId: "h-gb", instanceId: "grundbuch", requirementId: "grundbuch" },
      // Someone else's row id: never adopted.
      { documentId: "foreign-doc", instanceId: "id#b2", requirementId: "id" },
    ],
  };

  it("adopts the uploads, renames old and new files, recomputes, updates the inquiry, the Case and mails", async () => {
    const w = world(existingRows(), held(), { caseState: JSON.stringify({ checked: { "Ausweis Kopie": true }, filters: { a: 1 }, savedAt: "x" }) });
    const res = await submitV3Nachreichung(inquiryRow(), body, w.deps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Adoption: exactly the new files, the customer's stored-name wish dropped, the off-list claim made an extra.
    expect(w.adoptCalls).toHaveLength(1);
    const adopted = w.adoptCalls[0].documents;
    expect(adopted.map((d: any) => d.documentId)).toEqual(["h-fotos", "h-lohn", "h-gb", "foreign-doc"]);
    expect(adopted.find((d: any) => d.documentId === "h-lohn")).not.toHaveProperty("storedName");
    expect(adopted.find((d: any) => d.documentId === "h-gb")).toMatchObject({ instanceId: null, extraKind: "surplus" });
    expect(w.docs.some((r) => r.id === "foreign-doc")).toBe(false);

    // Stored names (spec 5.1), numbered across the earlier and the new Lohnausweise.
    expect(w.nameOf("h-fotos")).toBe(`${CASE}_03_Fotos.pdf`);
    expect(w.nameOf("h-lohn")).toBe(`${CASE}_01_Lohnausweis_Gerber-Gary_2023_1.pdf`);
    expect(w.nameOf("doc-15")).toBe(`${CASE}_01_Lohnausweis_Gerber-Gary_2024_2.pdf`);
    expect(w.nameOf("doc-13")).toBe(`${CASE}_01_Lohnausweis_Gerber-Gary_2025_3.pdf`);
    expect(w.nameOf("h-gb")).toBe(`${CASE}_03_ZUSATZ_Grundbuchauszug_2026-09-30.pdf`);
    expect(w.docs.find((r) => r.id === "h-fotos")!.storedName).toBe(`${CASE}_03_Fotos.pdf`);
    // The decision is stored beside the AI analysis, as at submit.
    expect((w.docs.find((r) => r.id === "h-lohn")!.aiAnalysis as any).v3Submitted.instanceId).toBe("lohnausweise#b1");

    // Recomputed over all documents: Gary complete, Anna's documents still open.
    expect(res.complete).toBe(false);
    expect(res.remaining).toEqual(["id#b2", "lohnausweise#b2", "lohnabrechnungen#b2", "anstellung#b2", "pk#b2", "steuer#b2"]);
    expect(res.remainingLabels[0]).toEqual({ instanceId: "id#b2", label: "Pass / Identitätskarte – Anna Muster" });
    expect(w.inquiryUpdates).toEqual([
      { id: INQUIRY, documentsMissing: "id#b2,lohnausweise#b2,lohnabrechnungen#b2,anstellung#b2,pk#b2,steuer#b2", documentsComplete: false, nachreichCompletedAt: null },
    ]);

    // Salesforce, v3 path: Dok_* flags, completeness, folder, 6.11 state merged onto the Case's.
    expect(w.cases).toHaveLength(1);
    const c = w.cases[0];
    expect(c.caseId).toBe("500CASE");
    expect(c.Dok_Fotos_der_Immobilie__c).toBe(true);
    expect(c.Dok_Lohnausweis__c).toBe(false); // Anna's are missing
    expect(c.Dok_Identitaetsdokument__c).toBe(false);
    expect(c.Documents_completed__c).toBe(false);
    expect(c.SharePoint_Doc__c).toBe("https://sp.example/case");
    const state = JSON.parse(c.Dokumenten_Check_State__c);
    expect(state.version).toBe(1);
    expect(state.checked["Ausweis Kopie"]).toBe(true);
    expect(state.filters).toEqual({ a: 1 });
    const fotos = state.requirements.find((r: any) => r.id === "fotos");
    expect(fotos.status).toBe("ok");
    expect(fotos.files[0].storedName).toBe(`${CASE}_03_Fotos.pdf`);
    expect(state.requirements.find((r: any) => r.id === "lohnausweise#b1").files).toHaveLength(3);

    // Mail in the inquiry's language with the v3 labels.
    expect(w.mails).toEqual([
      expect.objectContaining({ to: "gary.gerber@example.ch", cc: null, name: "Gary Gerber", locale: "de", complete: false }),
    ]);
    expect(w.mails[0].remainingLabels).toContain("Lohnausweise der letzten 3 Jahre – Anna Muster");
  });

  it("completes the dossier: link closed, Documents_completed__c, «complete» mail", async () => {
    const w = world(existingRows(), held());
    const row = inquiryRow({ v3State: v3StateFor([GARY]), documentsMissing: "fotos,lohnausweise#b1" });
    const res = await submitV3Nachreichung(row, { documents: body.documents.slice(0, 2) }, w.deps);
    expect(res.ok && res.complete).toBe(true);
    expect(w.inquiryUpdates[0]).toEqual({ id: INQUIRY, documentsMissing: null, documentsComplete: true, nachreichCompletedAt: new Date("2026-10-05T12:00:00Z") });
    expect(w.cases[0].Documents_completed__c).toBe(true);
    expect(w.cases[0].Dok_Lohnausweis__c).toBe(true);
    expect(w.mails[0]).toMatchObject({ complete: true, remaining: [], remainingLabels: [] });
  });

  it("an up-to-date document replaces an outdated one («Aktuelles hochladen»)", async () => {
    const rows = existingRows({ leaveOut: new Set(), grundbuchOverride: false });
    const row = inquiryRow({ v3State: v3StateFor([GARY]), documentsMissing: "grundbuch" });
    const before = nachreichV3View(row, rows)!.missing;
    expect(before).toEqual([expect.objectContaining({ instanceId: "grundbuch", state: "outdated", slots: 1 })]);

    const w = world(rows, [heldRow("h-gb", "Grundbuch neu.pdf", analysis("grundbuch", { docDate: "2026-09-30" }))]);
    const res = await submitV3Nachreichung(row, { documents: [{ documentId: "h-gb", instanceId: "grundbuch", requirementId: "grundbuch" }] }, w.deps);
    expect(res.ok && res.complete).toBe(true);
    expect(w.nameOf("h-gb")).toBe(`${CASE}_03_Grundbuchauszug_2026-09-30.pdf`);
    // The old extract stays in the folder as an extra.
    expect(w.nameOf("doc-4")).toBe(`${CASE}_03_ZUSATZ_Grundbuchauszug_2026-01-15.pdf`);
    expect(w.cases[0].Dok_Grundbuchauszug__c).toBe(true);
  });

  it("refuses a POST without new files of this inquiry", async () => {
    const w = world(existingRows(), []);
    expect(await submitV3Nachreichung(inquiryRow(), { documents: [] }, w.deps)).toEqual({ ok: false, status: 400, error: "No documents" });
    const res = await submitV3Nachreichung(inquiryRow(), { documents: [{ documentId: "nope", instanceId: "fotos" }] }, w.deps);
    expect(res.ok).toBe(false);
    expect(w.inquiryUpdates).toEqual([]);
    expect(w.cases).toEqual([]);
    expect(w.mails).toEqual([]);
  });

  it("keeps going when SharePoint, Salesforce and mail fail — the files are on the inquiry", async () => {
    const w = world(existingRows(), held());
    const deps = {
      ...w.deps,
      completion: { ...w.deps.completion, graph: { ...w.deps.completion!.graph!, token: async () => { throw new Error("Graph down"); } } },
      updateCase: async () => { throw new Error("SF down"); },
      sendMail: async () => { throw new Error("mail down"); },
    };
    const res = await submitV3Nachreichung(inquiryRow(), body, deps as any);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.remaining).not.toContain("fotos");
    expect(res.errors.join(" ")).toMatch(/SF down/);
    expect(res.errors.join(" ")).toMatch(/mail down/);
    expect(w.inquiryUpdates).toHaveLength(1);
  });

  it("Berater inquiry: the customer gets the confirmation, the Berater a copy (D17)", async () => {
    const st = v3StateFor([GARY]);
    st.role = "berater";
    st.txt = { ...st.txt, bmail: "berater@partner.ch" };
    const w = world(existingRows(), held());
    await submitV3Nachreichung(inquiryRow({ v3State: st, client: { email: "berater@partner.ch", firstName: "", lastName: "" } }), body, w.deps);
    expect(w.mails[0]).toMatchObject({ to: "gary.gerber@example.ch", cc: "berater@partner.ch", name: "Gary Gerber" });
  });
});

describe("filesFromRows", () => {
  it("places rows without stored detail by the AI's verdict and ignores removed rows", () => {
    const rows = existingRows().map((r) => ({ ...r, aiAnalysis: { v3: (r.aiAnalysis as any).v3, ...((r.aiAnalysis as any).v3Completion ? { v3Completion: { removed: true } } : {}) } }));
    const files = filesFromRows(v3StateFor([GARY]) as any, rows);
    expect(files.find((f) => f.documentId === "doc-removed")).toBeUndefined();
    expect(files.find((f) => f.documentId === "doc-2")!.instanceId).toBe("verkaufsdoku");
  });
});
