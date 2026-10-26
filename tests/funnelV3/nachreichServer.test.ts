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
import { SIGNATURE_BANK_NOTE_DE, type SignatureServerState } from "@/lib/funnel-v3/signature";
import { toInquiryPayload } from "@/lib/funnel-v3/toInquiryPayload";
import { ANNA, CASE, MAX, INQUIRY, analysis, existingRows, heldRow, inquiryRow, v3StateFor } from "./nachreichFixtures";
import { mustermannState, SUBMISSION } from "./mustermannCase";

/**
 * The v3 Nachreichung on the server (lib/funnel-v3/nachreich.ts) with an in-memory Document
 * table, SharePoint folder, Case and mailbox — nothing leaves the process.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
});

function world(rows: CompletionDocumentRow[], held: CompletionDocumentRow[], opts: { caseState?: string | null; signature?: SignatureServerState | null } = {}) {
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
    // InquirySignature in memory (signatureServer.ts is tested in signatureServer.test.ts).
    signature: {
      markReceived: async (inquiryId, file, at) => {
        received.push({ inquiryId, ...file, at });
        sigRow = { ...(sigRow ?? {}), status: sigRow?.status === "uploaded" ? "uploaded" : "received", receivedAt: sigRow?.receivedAt ?? at };
      },
      state: async () => sigRow,
    },
    now: () => new Date("2026-10-05T12:00:00Z"),
    log: { log: () => {}, warn: () => {}, error: () => {} } as any,
  };
  const received: { inquiryId: string; fileName: string; driveItemId?: string | null; at: Date }[] = [];
  let sigRow: SignatureServerState | null = opts.signature ?? null;
  const nameOf = (id: string) => docs.find((r) => r.id === id)?.fileName;
  return { deps, docs, inquiryUpdates, cases, mails, adoptCalls, nameOf, folder, received };
}

describe("v3InquiryColumns (/api/inquiry)", () => {
  it("stores the submitted v3 block with the language, and the «Habe ich nicht» marks", () => {
    const state = mustermannState({ borrowers: [MAX, ANNA] });
    const payload: any = toInquiryPayload(state, { locale: "fr", submissionId: SUBMISSION, documentCompleteness: { skipped: ["verkaufsdoku", 7] } });
    const cols = v3InquiryColumns(payload, "fr") as any;
    // Stored in the v5 shape (legacy.ts), so it says version 2.
    expect(cols.v3State).toMatchObject({ version: 2, role: "kunde", mode: "begleitet", lang: "fr", borrowers: [MAX, ANNA] });
    expect(cols.v3State.em.s3a).toBe(8760);
    expect(cols.v3State.ans.antrag).toBe("Ablösung");
    expect(cols.v3State.txt.vor).toBe("Max");
    expect(cols.v3State.fin.old).toBe(380000);
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
  const view = (lang = "de") => nachreichV3View(inquiryRow({ v3State: v3StateFor([MAX, ANNA], lang) }), existingRows())!;

  it("lists what is still open by the v5 rules, recomputed from the documents, grouped like step 5", () => {
    const v = view();
    expect(v).toMatchObject({ valid: true, v3: true, lang: "de", caseNumber: CASE, folderId: "FOLDER", submissionId: INQUIRY });
    const ids = v.missing.map((m) => m.instanceId);
    // A v3 inquiry (version 1) judged by v5 (legacy.ts): the Produktvereinbarung instead of the
    // Rahmenvertrag, one current Lohnausweis, Kreditnehmer 2 per P17, no Anstellungsvertrag.
    expect(ids).toEqual(["fotos", "produkt", "lohnausweise#b1", "id#b2", "lohnausweise#b2", "lohnabrechnungen#b2", "pk#b2"]);
    // The removed duplicate does not count for the photos; the overridden Grundbuch is fine;
    // the stored «Säule 3a = Ja» still asks for (and finds) the 3a documents.
    expect(ids).not.toContain("grundbuch");
    expect(ids).not.toContain("police");
    const lohn = v.missing.find((m) => m.instanceId === "lohnausweise#b1")!;
    expect(lohn).toMatchObject({ state: "missing", expect: 1, have: 0, slots: 1 });
    expect(v.missing.find((m) => m.instanceId === "fotos")).toMatchObject({ state: "missing", slots: 1, group: "objekt", groupLabel: "Zum Objekt" });
  });

  it("labels in the inquiry's language, with the person on per-borrower requirements", () => {
    const de = view("de").missing;
    expect(de.find((m) => m.instanceId === "fotos")!.label).toBe("Fotos der Immobilie (innen und aussen)");
    expect(de.find((m) => m.instanceId === "lohnausweise#b1")!.label).toBe("Aktueller Lohnausweis – Max Mustermann");
    expect(de.find((m) => m.instanceId === "produkt")!.label).toBe("Aktuelle Produktvereinbarung");
    expect(de.find((m) => m.instanceId === "id#b2")!.label).toBe("Pass / Identitätskarte – Anna Muster");
    expect(de.find((m) => m.instanceId === "id#b2")!.groupLabel).toBe("Zur Person · Anna Muster");

    const fr = view("fr");
    expect(fr.lang).toBe("fr");
    expect(fr.missing.find((m) => m.instanceId === "fotos")!.label).toBe("Photos du bien (intérieur et extérieur)");
    expect(fr.missing.find((m) => m.instanceId === "lohnausweise#b2")!.label).toBe("Certificat de salaire actuel – Anna Muster");
    expect(fr.missing.find((m) => m.instanceId === "id#b2")!.groupLabel).toBe("Personne · Anna Muster");

    const it = view("it").missing;
    expect(it.find((m) => m.instanceId === "id#b2")!.label).toBe("Passaporto / carta d’identità – Anna Muster");
    const en = view("en").missing;
    expect(en.find((m) => m.instanceId === "fotos")!.label).toBe("Photos of the property (interior and exterior)");
  });

  it("gives the page instances to place files on, sized to what is still to come", () => {
    const lohn = instanceFromMissing(view().missing.find((m) => m.instanceId === "lohnausweise#b1")!)!;
    expect(lohn).toMatchObject({ id: "lohnausweise", borrowerId: "b1", expect: 1, perBorrower: true });
    expect(lohn.person?.display).toBe("Max Mustermann");
  });

  it("is null for a legacy inquiry", () => {
    expect(nachreichV3View(inquiryRow({ v3State: null, documentsMissing: "funnel.passportIDAllBorrowers" }), [])).toBeNull();
  });
});

describe("submitV3Nachreichung (POST)", () => {
  const held = () => [
    heldRow("h-fotos", "IMG_2041 Wohnzimmer.pdf", analysis("fotos"), 1),
    heldRow("h-lohn", "Lohnausweis 2025 Max.pdf", analysis("lohnausweise", { docDate: "2025", personName: "Mustermann Max" }), 2),
    heldRow("h-gb", "Grundbuch neu.pdf", analysis("grundbuch", { docDate: "2026-09-30" }), 3),
    heldRow("h-prod", "Produktvereinbarung Musterbank.pdf", analysis("produkt", { bank: "Musterbank", docDate: "2026-02-01" }), 4),
  ];
  const body = {
    documents: [
      { documentId: "h-fotos", instanceId: "fotos", requirementId: "fotos" },
      { documentId: "h-lohn", instanceId: "lohnausweise#b1", requirementId: "lohnausweise", storedName: "selbst-gewaehlt.pdf" },
      { documentId: "h-prod", instanceId: "produkt", requirementId: "produkt" },
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
    expect(adopted.map((d: any) => d.documentId)).toEqual(["h-fotos", "h-lohn", "h-prod", "h-gb", "foreign-doc"]);
    expect(adopted.find((d: any) => d.documentId === "h-lohn")).not.toHaveProperty("storedName");
    expect(adopted.find((d: any) => d.documentId === "h-gb")).toMatchObject({ instanceId: null, extraKind: "surplus" });
    expect(w.docs.some((r) => r.id === "foreign-doc")).toBe(false);

    // Stored names (spec 5.1).
    expect(w.nameOf("h-fotos")).toBe(`${CASE}_03_Fotos_Zuerich_2026-10-05.pdf`);
    expect(w.nameOf("h-lohn")).toBe(`${CASE}_01_Lohnausweis_Mustermann-Max_2025-12-31.pdf`);
    expect(w.nameOf("h-prod")).toBe(`${CASE}_04_Produktvereinbarung_Musterbank_2026-02-01.pdf`);
    expect(w.nameOf("h-gb")).toBe(`${CASE}_03_ZUSATZ_Grundbuchauszug_Zuerich_2026-09-30.pdf`);
    // What v3 asked and v5 no longer does stays in the folder as «Überzählig», never deleted.
    expect(w.nameOf("doc-8")).toMatch(/_ZUSATZ_.*Rahmenvertrag/);
    expect(w.nameOf("doc-24")).toBe(`${CASE}_01_ZUSATZ_Anstellungsvertrag_Mustermann-Max_2026-10-01.pdf`);
    expect(w.docs.find((r) => r.id === "doc-26")!.driveItemId).toBe("item-doc-26");
    expect(w.docs.find((r) => r.id === "h-fotos")!.storedName).toBe(`${CASE}_03_Fotos_Zuerich_2026-10-05.pdf`);
    // The decision is stored beside the AI analysis, as at submit.
    expect((w.docs.find((r) => r.id === "h-lohn")!.aiAnalysis as any).v3Submitted.instanceId).toBe("lohnausweise#b1");

    // Recomputed over all documents: Max complete, Anna's documents still open.
    expect(res.complete).toBe(false);
    expect(res.remaining).toEqual(["id#b2", "lohnausweise#b2", "lohnabrechnungen#b2", "pk#b2"]);
    expect(res.remainingLabels[0]).toEqual({ instanceId: "id#b2", label: "Pass / Identitätskarte – Anna Muster" });
    expect(w.inquiryUpdates).toEqual([
      { id: INQUIRY, documentsMissing: "id#b2,lohnausweise#b2,lohnabrechnungen#b2,pk#b2", documentsComplete: false, nachreichCompletedAt: null },
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
    expect(fotos.files[0].storedName).toBe(`${CASE}_03_Fotos_Zuerich_2026-10-05.pdf`);
    expect(state.requirements.find((r: any) => r.id === "lohnausweise#b1").files).toHaveLength(1);
    // The stored v3 answers in the JSON: the Unterhalt chip from Kinder + Unterhalt, the 3a «Ja».
    expect(state.answers).toMatchObject({ unterhalt: "Ja", legacyEquity: { s3a: "Ja" } });
    expect(state.answers).not.toHaveProperty("kinder");
    expect(state.entry).toBe("begleitet");

    // Mail in the inquiry's language with the v3 labels.
    expect(w.mails).toEqual([
      expect.objectContaining({ to: "max.mustermann@example.ch", cc: null, name: "Max Mustermann", locale: "de", complete: false }),
    ]);
    expect(w.mails[0].remainingLabels).toContain("Aktueller Lohnausweis – Anna Muster");
  });

  it("completes the dossier: link closed, Documents_completed__c, «complete» mail", async () => {
    const w = world(existingRows(), held());
    const row = inquiryRow({ v3State: v3StateFor([MAX]), documentsMissing: "fotos,produkt,lohnausweise#b1" });
    const res = await submitV3Nachreichung(row, { documents: body.documents.slice(0, 3) }, w.deps);
    expect(res.ok && res.complete).toBe(true);
    expect(w.inquiryUpdates[0]).toEqual({ id: INQUIRY, documentsMissing: null, documentsComplete: true, nachreichCompletedAt: new Date("2026-10-05T12:00:00Z") });
    expect(w.cases[0].Documents_completed__c).toBe(true);
    expect(w.cases[0].Dok_Lohnausweis__c).toBe(true);
    expect(w.mails[0]).toMatchObject({ complete: true, remaining: [], remainingLabels: [] });
  });

  it("an up-to-date document replaces an outdated one («Aktuelles hochladen»)", async () => {
    const rows = existingRows({ leaveOut: new Set(), grundbuchOverride: false });
    const row = inquiryRow({ v3State: v3StateFor([MAX]), documentsMissing: "grundbuch" });
    const before = nachreichV3View(row, rows)!.missing;
    expect(before).toEqual([
      expect.objectContaining({ instanceId: "grundbuch", state: "outdated", slots: 1 }),
      expect.objectContaining({ instanceId: "produkt", state: "missing" }),
    ]);

    const w = world(rows, [heldRow("h-gb", "Grundbuch neu.pdf", analysis("grundbuch", { docDate: "2026-09-30" })), heldRow("h-prod", "Produkt.pdf", analysis("produkt", { bank: "Musterbank" }), 1)]);
    const res = await submitV3Nachreichung(row, { documents: [{ documentId: "h-gb", instanceId: "grundbuch", requirementId: "grundbuch" }, { documentId: "h-prod", instanceId: "produkt", requirementId: "produkt" }] }, w.deps);
    expect(res.ok && res.complete).toBe(true);
    expect(w.nameOf("h-gb")).toBe(`${CASE}_03_Grundbuchauszug_Zuerich_2026-09-30.pdf`);
    // The old extract stays in the folder as an extra.
    expect(w.nameOf("doc-4")).toBe(`${CASE}_03_ZUSATZ_Grundbuchauszug_Zuerich_2026-01-15.pdf`);
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
    const st = v3StateFor([MAX]);
    st.role = "berater";
    st.txt = { ...st.txt, bmail: "berater@partner.ch" };
    const w = world(existingRows(), held());
    await submitV3Nachreichung(inquiryRow({ v3State: st, client: { email: "berater@partner.ch", firstName: "", lastName: "" } }), body, w.deps);
    expect(w.mails[0]).toMatchObject({ to: "max.mustermann@example.ch", cc: "berater@partner.ch", name: "Max Mustermann" });
  });
});

describe("v5 inquiries: the Auskunftsermächtigung after the closing, no mail (Handover 6, 7.1; V37)", () => {
  const SIG_NAME = "01_Auskunftsermaechtigung_Max_Mustermann_unterzeichnet.pdf";
  const LATER = { choice: "later" as const, at: "2026-10-01T10:00:00.000Z", method: "upload" as const };
  const field = (value: string) => ({ value, confidence: 0.9 });
  const v5Row = (over: Record<string, any> = {}) => {
    const payload: any = toInquiryPayload(mustermannState({ borrowers: [MAX], sig: LATER }), { locale: "de", submissionId: SUBMISSION });
    const v3State = (v3InquiryColumns(payload, "de") as any).v3State;
    return inquiryRow({ v3State, ...over });
  };
  const withoutSig = () => existingRows({ leaveOut: new Set([SIG_NAME]) });
  const unsignedOnP0 = () =>
    existingRows({ leaveOut: new Set() }).map((r) =>
      r.originalFileName === SIG_NAME
        ? { ...r, aiAnalysis: { ...(r.aiAnalysis as any), v3: { ...(r.aiAnalysis as any).v3, fields: { Unterschrift: field("fehlt") } } } }
        : r
    );
  const signed = () => heldRow("h-sig", "Scan 0042.pdf", analysis("vollmacht", { fields: { Unterschrift: field("vorhanden"), Vollmachtgeber: field("Mustermann Max") } }), 7);
  const sigBody = { documents: [{ documentId: "h-sig", instanceId: "vollmacht", requirementId: "vollmacht", assignedByUser: true }] };

  it("the view offers the Auskunftsermächtigung while it is pending", () => {
    const v = nachreichV3View(v5Row(), withoutSig())!;
    expect(v.missing.find((m) => m.instanceId === "vollmacht")).toMatchObject({ id: "vollmacht", state: "missing", slots: 1 });
  });

  it("a signed copy: InquirySignature received, Case JSON «uploaded» with its time — and no mail", async () => {
    const w = world(withoutSig(), [signed()], { signature: { status: "pending", requestedAt: LATER.at, remindersSent: 1, lastReminderAt: "2026-10-03T06:00:00.000Z" } });
    const res = await submitV3Nachreichung(v5Row(), sigBody, w.deps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.remaining).not.toContain("vollmacht");
    expect(w.received).toEqual([{ inquiryId: INQUIRY, fileName: expect.stringMatching(/^HQ-26-10-000123_00_Auskunftsermaechtigung/), driveItemId: "item-h-sig", at: new Date("2026-10-05T12:00:00Z") }]);
    // Handover 7.1: documents sent later → no mail, the Case is updated.
    expect(w.mails).toEqual([]);
    expect(w.cases).toHaveLength(1);
    const sig = JSON.parse(w.cases[0].Dokumenten_Check_State__c).signature;
    expect(sig).toMatchObject({ status: "uploaded", method: "upload", receivedAt: "2026-10-05T12:00:00.000Z", reminders: 1, requestedAt: LATER.at });
    expect(sig).not.toHaveProperty("note");
  });

  it("an unsigned copy on P0 keeps it open; the new signed copy takes its place", async () => {
    const rows = unsignedOnP0();
    const v = nachreichV3View(v5Row(), rows)!;
    expect(v.missing.find((m) => m.instanceId === "vollmacht")).toMatchObject({ state: "missing", have: 1, slots: 1 });

    const w = world(rows, [signed()], { signature: { status: "pending", requestedAt: LATER.at, remindersSent: 0 } });
    const res = await submitV3Nachreichung(v5Row(), sigBody, w.deps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.remaining).not.toContain("vollmacht");
    expect(w.received).toHaveLength(1);
    expect(w.received[0].driveItemId).toBe("item-h-sig");
    // The unsigned one stays in the folder as an extra.
    const old = rows.find((r) => r.originalFileName === SIG_NAME)!;
    expect(w.nameOf(old.id)).toMatch(/_ZUSATZ_/);
  });

  // HYPOTEQ 19.10. E.4 on the Nachreich page: the AI never blocks.
  const doubted = () => heldRow("h-sig", "Scan 0042.pdf", analysis("vollmacht", { fields: { Unterschrift: field("fehlt"), Vollmachtgeber: field("Mustermann Max") } }), 7);

  it("a doubted copy without «Trotzdem einreichen» stays open and the reminders go on", async () => {
    const w = world(withoutSig(), [doubted()], { signature: { status: "pending", requestedAt: LATER.at, remindersSent: 0 } });
    const res = await submitV3Nachreichung(v5Row(), sigBody, w.deps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.remaining).toContain("vollmacht");
    expect(w.received).toEqual([]);
    expect(w.inquiryUpdates[0]).not.toHaveProperty("v3State");
  });

  it("a doubted copy submitted anyway: received, the choice stored, the Case flags it for the manual check", async () => {
    const w = world(withoutSig(), [doubted()], { signature: { status: "pending", requestedAt: LATER.at, remindersSent: 1 } });
    const res = await submitV3Nachreichung(v5Row(), { ...sigBody, signatureOverride: true }, w.deps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.remaining).not.toContain("vollmacht");
    expect(w.received).toEqual([{ inquiryId: INQUIRY, fileName: expect.stringMatching(/^HQ-26-10-000123_00_Auskunftsermaechtigung/), driveItemId: "item-h-sig", at: new Date("2026-10-05T12:00:00Z") }]);
    expect(w.inquiryUpdates[0].v3State.sig).toMatchObject({ choice: "uploaded", override: true, overrideAt: "2026-10-05T12:00:00.000Z" });
    // Read back, the page no longer asks for it.
    const after = nachreichV3View(v5Row({ v3State: w.inquiryUpdates[0].v3State }), w.docs)!;
    expect(after.missing.map((m) => m.instanceId)).not.toContain("vollmacht");
    const sig = JSON.parse(w.cases[0].Dokumenten_Check_State__c).signature;
    expect(sig).toMatchObject({ status: "uploaded", override: true, aiProblems: ["signature"], aiNote: expect.stringContaining("manuell prüfen") });
  });

  it("«Trotzdem einreichen» without a new copy on the Auskunftsermächtigung changes nothing", async () => {
    const w = world(withoutSig(), [heldRow("h-x", "Nebenkosten.pdf", analysis("nn_nebenkosten"))], { signature: { status: "pending", requestedAt: LATER.at, remindersSent: 0 } });
    const res = await submitV3Nachreichung(v5Row(), { documents: [{ documentId: "h-x", instanceId: null, requirementId: null, extraKind: "notneeded", keep: true }], signatureOverride: true }, w.deps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.remaining).toContain("vollmacht");
    expect(w.received).toEqual([]);
    expect(w.inquiryUpdates[0]).not.toHaveProperty("v3State");
  });

  it("while the signature is open the dossier is not complete, and the Case says why", async () => {
    const w = world(withoutSig(), [heldRow("h-x", "Nebenkosten.pdf", analysis("nn_nebenkosten"))], { signature: { status: "pending", requestedAt: LATER.at, remindersSent: 2 } });
    const res = await submitV3Nachreichung(v5Row(), { documents: [{ documentId: "h-x", instanceId: null, requirementId: null, extraKind: "notneeded", keep: true }] }, w.deps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.complete).toBe(false);
    expect(res.remaining).toContain("vollmacht");
    expect(w.inquiryUpdates[0]).toMatchObject({ documentsComplete: false, nachreichCompletedAt: null });
    expect(w.cases[0].Documents_completed__c).toBe(false);
    const sig = JSON.parse(w.cases[0].Dokumenten_Check_State__c).signature;
    expect(sig).toMatchObject({ status: "pending", reminders: 2, note: SIGNATURE_BANK_NOTE_DE });
    expect(w.received).toEqual([]);
    expect(w.mails).toEqual([]);
  });

  it("an inquiry stored before v5 keeps its confirmation mail", async () => {
    const w = world(existingRows(), [heldRow("h-fotos", "IMG.pdf", analysis("fotos"))]);
    await submitV3Nachreichung(inquiryRow(), { documents: [{ documentId: "h-fotos", instanceId: "fotos", requirementId: "fotos" }] }, w.deps);
    expect(w.mails).toHaveLength(1);
  });
});

describe("filesFromRows", () => {
  it("places rows without stored detail by the AI's verdict and ignores removed rows", () => {
    const rows = existingRows().map((r) => ({ ...r, aiAnalysis: { v3: (r.aiAnalysis as any).v3, ...((r.aiAnalysis as any).v3Completion ? { v3Completion: { removed: true } } : {}) } }));
    const files = filesFromRows(v3StateFor([MAX]) as any, rows);
    expect(files.find((f) => f.documentId === "doc-removed")).toBeUndefined();
    expect(files.find((f) => f.documentId === "doc-2")!.instanceId).toBe("verkaufsdoku");
  });
});
