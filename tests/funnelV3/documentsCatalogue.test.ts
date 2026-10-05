import { describe, it, expect } from "@jest/globals";
import { REQ } from "@/lib/funnel-v3/requirements";
import {
  V3_DOC_TYPES,
  classifiableTypes,
  familyMembers,
  freshnessProblem,
  requestedYears,
  v3DocType,
} from "@/components/documentIntelligence/v3/catalogue";
import { buildV3Instructions, buildV3Schema, allFieldKeys } from "@/components/documentIntelligence/v3/prompt";
import { applyV3Rules, MIN_CLASSIFICATION_CONFIDENCE } from "@/components/documentIntelligence/v3/analyse";
import { parseV3ProviderJson } from "@/components/documentIntelligence/v3/openaiProvider";

const NOW = new Date("2026-10-05T10:00:00Z");

describe("v3 recognition catalogue", () => {
  it("has one type per REQ id (all 47) and unique ids", () => {
    expect(REQ).toHaveLength(47);
    for (const r of REQ) {
      const t = v3DocType(r.id);
      expect({ id: r.id, kind: t?.kind }).toEqual({ id: r.id, kind: "requirement" });
      expect(t!.labelDe).toBe(r.labelDe);
    }
    const ids = V3_DOC_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has the not-needed types of spec 4.3", () => {
    const nn = V3_DOC_TYPES.filter((t) => t.kind === "notneeded").map((t) => t.id);
    for (const id of ["nn_steuerrechnung", "nn_nebenkosten", "nn_betriebskosten", "nn_entwurf", "nn_verpfaendung", "nn_kontoauszug"]) {
      expect(nn).toContain(id);
    }
    for (const t of V3_DOC_TYPES.filter((x) => x.kind === "notneeded")) {
      expect(t.notNeededReason).toBeTruthy();
      expect(t.fields).toEqual([]);
    }
  });

  it("names every type in all four languages", () => {
    for (const t of V3_DOC_TYPES) {
      for (const l of ["de", "fr", "it", "en"] as const) {
        expect({ id: t.id, l, n: t.aliases[l].filter((s) => s.trim()).length > 0 }).toEqual({ id: t.id, l, n: true });
      }
    }
  });

  it("knows the usual French and Italian names", () => {
    const all = (id: string) => [...v3DocType(id)!.aliases.fr, ...v3DocType(id)!.aliases.it].join(" | ");
    expect(all("grundbuch")).toContain("Extrait du registre foncier");
    expect(all("grundbuch")).toContain("Estratto del registro fondiario");
    expect(all("stwe_regl")).toMatch(/PPE/);
    expect(all("stwe_regl")).toMatch(/PPP/);
    expect(all("pk")).toMatch(/LPP/);
    expect(all("rente")).toMatch(/AVS/);
    expect(all("baurecht")).toContain("droit de superficie");
    expect(all("baurecht")).toContain("diritto di superficie");
  });

  it("uses exactly REQ[].fields as the field keys where REQ defines them", () => {
    for (const r of REQ) {
      const keys = v3DocType(r.id)!.fields.map((f) => f.key);
      if (r.fields.length) expect({ id: r.id, keys }).toEqual({ id: r.id, keys: [...r.fields] });
      else expect({ id: r.id, some: keys.length > 0 }).toEqual({ id: r.id, some: true });
    }
  });

  it("groups documents that differ only by whose they are", () => {
    expect(familyMembers("id").sort()).toEqual(["b_id", "id", "wb"]);
    expect(familyMembers("steuer").sort()).toEqual(["b_steuer", "steuer"]);
    expect(familyMembers("lohnausweise").sort()).toEqual(["b_lohn", "lohnausweise"]);
    const heads = classifiableTypes().map((t) => t.id);
    expect(heads).not.toContain("b_id");
    expect(heads).not.toContain("wb");
    expect(heads).toContain("steuer_jp");
  });
});

describe("freshness and periods", () => {
  it("Grundbuchauszug: max. 6 months", () => {
    expect(freshnessProblem("grundbuch", "2026-01-15", {}, NOW)).toEqual({ code: "maxAge", months: 6, date: "2026-01-15" });
    expect(freshnessProblem("grundbuch", "2026-06-01", {}, NOW)).toBeNull();
    // A year alone proves nothing either way.
    expect(freshnessProblem("grundbuch", "2026", {}, NOW)).toBeNull();
  });

  it("Steuererklärung: not older than two years", () => {
    expect(freshnessProblem("steuer", "2025", {}, NOW)).toBeNull();
    expect(freshnessProblem("steuer", "2024", {}, NOW)).toBeNull();
    expect(freshnessProblem("steuer", "2023", {}, NOW)).toEqual({ code: "year", year: 2023 });
  });

  it("ID: expired", () => {
    expect(freshnessProblem("id", null, { "Gültig bis": { value: "01.02.2026" } }, NOW)).toEqual({ code: "expired", date: "2026-02-01" });
    expect(freshnessProblem("id", null, { "Gültig bis": { value: "01.02.2030" } }, NOW)).toBeNull();
    expect(freshnessProblem("id", null, { "Gültig bis": { value: "erkannt · gültig" } }, NOW)).toBeNull();
  });

  it("Lohnausweise: the last three complete years", () => {
    expect(requestedYears("lohnausweise", NOW)).toEqual([2025, 2024, 2023]);
    expect(requestedYears("grundbuch", NOW)).toBeNull();
  });
});

describe("prompt and schema", () => {
  it("offers every classifiable type and unknown, with strict field keys", () => {
    const schema: any = buildV3Schema();
    expect(schema.properties.docType.enum).toEqual([...classifiableTypes().map((t) => t.id), "unknown"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
    const item = schema.properties.fields.items;
    expect(item.required.sort()).toEqual(Object.keys(item.properties).sort());
    expect(item.properties.key.enum).toEqual(allFieldKeys());
    expect(allFieldKeys()).toContain("Bruttolohn 2024");
  });

  it("states the rules the model must follow", () => {
    const text = buildV3Instructions();
    expect(text).toContain("grundbuch");
    expect(text).toContain("Extrait du registre foncier");
    expect(text).toContain("nn_steuerrechnung");
    expect(text).toMatch(/unknown/);
  });
});

describe("applyV3Rules", () => {
  const base = { personName: null, bank: null, docDate: null, note: null, fields: [], durationMs: 1 };

  it("keeps only the type's own fields and the more confident reading", () => {
    const a = applyV3Rules(
      {
        ...base,
        docType: "grundbuch",
        confidence: 0.97,
        docDate: "15.01.2026",
        fields: [
          { key: "Eigentümer", value: "Gerber Gary", confidence: 0.8 },
          { key: "Eigentümer", value: "Gerber Gary Samuel", confidence: 0.95 },
          { key: "Bruttolohn 2024", value: "1", confidence: 1 },
          { key: "Objekt", value: null, confidence: 0.9 },
        ],
      },
      { now: NOW, contentHash: "abc" }
    );
    expect(a.docTypeId).toBe("grundbuch");
    expect(a.requirementId).toBe("grundbuch");
    expect(Object.keys(a.fields)).toEqual(["Eigentümer"]);
    expect(a.fields["Eigentümer"]).toEqual({ value: "Gerber Gary Samuel", confidence: 0.95 });
    expect(a.docDate).toBe("2026-01-15");
    expect(a.outdated).toBe(true);
    expect(a.outdatedReason).toContain("6 Monate");
    expect(a.contentHash).toBe("abc");
  });

  it("makes a not-needed document an extra with its reason", () => {
    const a = applyV3Rules({ ...base, docType: "nn_steuerrechnung", confidence: 0.9 }, { now: NOW });
    expect(a).toMatchObject({ docTypeId: "nn_steuerrechnung", requirementId: null, extraKind: "notneeded" });
    expect(a.extraReason).toMatch(/Steuerrechnungen/);
  });

  it("does not trust an unknown id or a weak classification", () => {
    expect(applyV3Rules({ ...base, docType: "electricity_bill", confidence: 0.99 }, { now: NOW })).toMatchObject({ docTypeId: null, extraKind: "unknown" });
    expect(applyV3Rules({ ...base, docType: "b_id", confidence: 0.99 }, { now: NOW }).docTypeId).toBeNull();
    expect(applyV3Rules({ ...base, docType: "kredit", confidence: MIN_CLASSIFICATION_CONFIDENCE - 0.01 }, { now: NOW }).docTypeId).toBeNull();
  });

  it("reads the year for period documents, no date for IDs, the bank for mortgage documents", () => {
    expect(applyV3Rules({ ...base, docType: "lohnausweise", confidence: 0.95, docDate: "2024-12-31", personName: "Gerber Gary" }, { now: NOW })).toMatchObject({ docDate: "2024", personName: "Gerber Gary" });
    expect(applyV3Rules({ ...base, docType: "id", confidence: 0.95, docDate: "04.01.1988" }, { now: NOW }).docDate).toBeNull();
    expect(applyV3Rules({ ...base, docType: "hyp_zins", confidence: 0.95, bank: "ZKB", personName: "x" }, { now: NOW })).toMatchObject({ bank: "ZKB", personName: null });
  });

  it("keeps a note only where the type asks for one", () => {
    expect(applyV3Rules({ ...base, docType: "police", confidence: 0.95, note: "Police ist an die ZKB verpfändet." }, { now: NOW }).note).toBe("Police ist an die ZKB verpfändet.");
    expect(applyV3Rules({ ...base, docType: "fotos", confidence: 0.95, note: "Schönes Haus." }, { now: NOW }).note).toBeNull();
  });

  it("parses the provider JSON defensively", () => {
    const r = parseV3ProviderJson({ docType: "kredit", confidence: "0.9", fields: [{ key: "Restschuld", value: 24360, confidence: 0.9 }, { nope: 1 }], note: "  " }, 5);
    expect(r).toMatchObject({ docType: "kredit", confidence: 0.9, note: null, durationMs: 5 });
    expect(r.fields).toEqual([{ key: "Restschuld", value: "24360", confidence: 0.9 }]);
    expect(parseV3ProviderJson(null, 1).docType).toBe("unknown");
  });
});
