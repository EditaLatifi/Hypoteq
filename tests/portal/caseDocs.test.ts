import { describe, it, expect } from "@jest/globals";
import { REVIEW_SLACK_MS, buildCaseDocs, type CaseDocsInput } from "@/lib/portal/caseDocs";
import { actionRequired } from "@/lib/portal/status";
import { docProgress } from "@/lib/portal/view";

/** The documents of one Case and the status each shows (handoff 5, DECISIONS P3, P24). */

const UPLOAD_AT = new Date("2026-10-10T09:00:00Z");

function input(p: Partial<CaseDocsInput>): CaseDocsInput {
  return {
    missing: [],
    open: [],
    rework: [],
    uploads: [],
    present: [],
    persons: new Map(),
    label: (key) => `L:${key}`,
    otherLabel: "Weiteres Dokument",
    pastReview: false,
    lastChange: "2026-10-10T09:01:00Z",
    ...p,
  };
}

const byName = (docs: ReturnType<typeof buildCaseDocs>) => Object.fromEntries(docs.map((d) => [d.name, d.status]));

describe("buildCaseDocs", () => {
  it("missing and expected documents are Fehlt; only the expected ones carry the note", () => {
    const docs = buildCaseDocs(input({ missing: ["grundbuch"], open: ["funnel.landRegistryNotOlder6Months"] }));
    expect(docs.map((d) => [d.name, d.status, d.state, !!d.expected])).toEqual([
      ["L:grundbuch", "fehlt", "fehlt", false],
      ["L:funnel.landRegistryNotOlder6Months", "fehlt", "offen", true],
    ]);
    expect(docs.every((d) => d.category === "objekt")).toBe(true);
  });

  it("asked-for-again documents come first, as Neu erforderlich / Ungültig, and stay outstanding", () => {
    const docs = buildCaseDocs(
      input({
        missing: ["fotos"],
        rework: [{ key: "pk#b1", state: "neu", label: "Pensionskassenausweis", person: "Sarah Brunner" }],
        label: (k) => (k === "pk#b1" ? k : `L:${k}`),
      })
    );
    expect(docs[0]).toMatchObject({ key: "pk#b1", name: "Pensionskassenausweis", status: "neu", state: "fehlt", person: "Sarah Brunner" });
    expect(docs[1]).toMatchObject({ key: "fotos", status: "fehlt" });
  });

  it("a portal upload of a listed document is In Prüfung, an extra one Hochgeladen", () => {
    const docs = buildCaseDocs(
      input({
        uploads: [
          { docKey: "id#b1", fileName: "pass.pdf", at: UPLOAD_AT },
          { docKey: null, fileName: "notiz.pdf", at: UPLOAD_AT },
        ],
      })
    );
    expect(byName(docs)).toEqual({ "L:id#b1": "pruefung", "Weiteres Dokument": "hochgeladen" });
    expect(docs.find((d) => d.extra)?.category).toBe("weitere");
    // Uploaded paper is no longer outstanding for the upload routes.
    expect(docs.every((d) => d.state === "vorhanden")).toBe(true);
  });

  it("uploads become Vorhanden once the Case is past review and HYPOTEQ changed it since", () => {
    const later = new Date(UPLOAD_AT.getTime() + REVIEW_SLACK_MS + 60_000).toISOString();
    const uploads = [{ docKey: "id#b1", fileName: "pass.pdf", at: UPLOAD_AT }];
    expect(byName(buildCaseDocs(input({ uploads, pastReview: true, lastChange: later })))).toEqual({ "L:id#b1": "vorhanden" });
    // The portal's own write right after the upload does not count as a review …
    expect(byName(buildCaseDocs(input({ uploads, pastReview: true })))).toEqual({ "L:id#b1": "pruefung" });
    // … and before the lender stage nothing counts as reviewed.
    expect(byName(buildCaseDocs(input({ uploads, pastReview: false, lastChange: later })))).toEqual({ "L:id#b1": "pruefung" });
  });

  it("lists the latest upload of a document once", () => {
    const docs = buildCaseDocs(
      input({
        uploads: [
          { docKey: "id#b1", fileName: "neu.pdf", at: new Date("2026-10-12T09:00:00Z") },
          { docKey: "id#b1", fileName: "alt.pdf", at: UPLOAD_AT },
        ],
      })
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].upload?.fileName).toBe("neu.pdf");
  });

  it("documents on file are listed once and hidden behind an upload of the same document", () => {
    const docs = buildCaseDocs(
      input({
        uploads: [{ docKey: "grundbuch", fileName: "gb.pdf", at: UPLOAD_AT }],
        present: [
          { name: "Grundbuchauszug", keys: ["funnel.landRegistryNotOlder6Months"] }, // the upload's legacy key
          { name: "Ausweiskopie", keys: ["funnel.idCopy"] },
          { name: "Aktueller Ausweis", keys: ["funnel.idCopy"] }, // same paper, other label
          { name: "Fotos der Immobilie", keys: [] },
          { name: "Fotos der Immobilie", keys: [] },
        ],
      })
    );
    expect(docs.map((d) => [d.name, d.status])).toEqual([
      ["L:grundbuch", "pruefung"],
      ["Ausweiskopie", "vorhanden"],
      ["Fotos der Immobilie", "vorhanden"],
    ]);
  });

  it("feeds «Aktion erforderlich» and the progress bar", () => {
    const docs = buildCaseDocs(
      input({
        missing: ["fotos"],
        uploads: [
          { docKey: "id#b1", fileName: "pass.pdf", at: UPLOAD_AT },
          { docKey: null, fileName: "x.pdf", at: UPLOAD_AT },
        ],
        present: [{ name: "Grundbuchauszug", keys: ["funnel.landRegistryNotOlder6Months"] }],
      })
    );
    expect(actionRequired("Unterlagen fehlen noch", docs)).toBe(true);
    expect(actionRequired("Abgeschlossen", docs)).toBe(false);
    expect(docProgress(docs)).toEqual({ ok: 2, total: 3, pct: 67 });
  });
});
