import { describe, it, expect } from "@jest/globals";
import { docCategory, personsByKey, reworkDocs } from "@/lib/portal/requiredDocs";

/** Document statuses the Funnel v3 checklist can deliver (DECISIONS P3). */

const CHECKLIST = {
  checked: {},
  requirements: [
    { id: "grundbuch", label: "Aktueller Grundbuchauszug (max. 6 Monate)", status: "outdated" },
    { id: "lohnabrechnungen#b2", label: "Letzte 3 Monatslohnabrechnungen", status: "invalid", person: "Marco Brunner" },
    { id: "pk#b1", label: "Pensionskassenausweis", status: "ok", person: "Sarah Brunner" },
    { id: "fotos", label: "Fotos", status: "missing" },
    { label: "kein id" },
  ],
};

describe("reworkDocs", () => {
  it("outdated is Neu erforderlich, invalid is Ungültig; other states are not rework", () => {
    expect(reworkDocs(CHECKLIST)).toEqual([
      { key: "grundbuch", state: "neu", label: "Aktueller Grundbuchauszug (max. 6 Monate)", person: null },
      { key: "lohnabrechnungen#b2", state: "ungueltig", label: "Letzte 3 Monatslohnabrechnungen", person: "Marco Brunner" },
    ]);
  });
  it("a document uploaded again through the portal is no longer asked for", () => {
    expect(reworkDocs(CHECKLIST, ["grundbuch"]).map((r) => r.key)).toEqual(["lohnabrechnungen#b2"]);
  });
  it("nothing without a v3 checklist", () => {
    expect(reworkDocs(null)).toEqual([]);
    expect(reworkDocs({ checked: { "Grundlegende Unterlagen|Fotos": true } })).toEqual([]);
  });
  it("knows whose per-person document it is", () => {
    expect(personsByKey(CHECKLIST).get("pk#b1")).toBe("Sarah Brunner");
  });
});

describe("docCategory", () => {
  it("files v3 requirement ids and old funnel keys under the funnel's groups", () => {
    expect(docCategory("grundbuch")).toBe("objekt");
    expect(docCategory("pk#b1")).toBe("person");
    expect(docCategory("hyp_zins")).toBe("hypothek");
    expect(docCategory("funnel.landRegistryNotOlder6Months")).toBe("objekt");
    expect(docCategory("funnel.inheritanceConfirmation")).toBe("eigenmittel");
  });
  it("everything else is «Weitere Dokumente»", () => {
    expect(docCategory(null)).toBe("weitere");
    expect(docCategory("funnel.somethingNew")).toBe("weitere");
  });
});
