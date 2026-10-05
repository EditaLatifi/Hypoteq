import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { LANGS, MESSAGES, translate, optionLabel, interpolate, langFromPath, hasKey } from "@/lib/funnel-v3/i18n";

const placeholders = (s: string) => new Set(Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1]));

const allKeys = (lang: (typeof LANGS)[number]) =>
  Object.entries(MESSAGES[lang]).flatMap(([ns, o]) => Object.keys(o).map((k) => `${ns}.${k}`));

describe("funnel-v3 messages", () => {
  it("keep every text of the delivered i18n file unchanged (keys may be added)", () => {
    const delivered = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "docs", "funnel-v3", "HYPOTEQ_Funnel_i18n.json"), "utf8")
    );
    for (const l of LANGS) {
      const changed: string[] = [];
      for (const [ns, o] of Object.entries(delivered[l] as Record<string, Record<string, string>>)) {
        for (const [k, v] of Object.entries(o)) if (MESSAGES[l][ns]?.[k] !== v) changed.push(`${l} ${ns}.${k}`);
      }
      expect(changed).toEqual([]);
    }
  });

  it("every German key exists in en, fr and it", () => {
    const de = allKeys("de");
    expect(de.length).toBeGreaterThan(250);
    for (const l of ["en", "fr", "it"] as const) {
      const missing = de.filter((k) => !hasKey(l, k));
      expect({ l, missing }).toEqual({ l, missing: [] });
    }
  });

  it("every placeholder of the German text exists in each translation", () => {
    const problems: string[] = [];
    for (const k of allKeys("de")) {
      const want = placeholders(translate("de", k));
      for (const l of ["en", "fr", "it"] as const) {
        const got = placeholders(translate(l, k));
        for (const p of want) if (!got.has(p)) problems.push(`${l} ${k} lacks {${p}}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("translate", () => {
  it("splits only on the first dot", () => {
    expect(translate("de", "opt.lieg.Stockwerkeigentum")).toBe("Stockwerkeigentum");
    expect(translate("de", "opt.laufzeit.2 Jahre")).toBe("2 Jahre");
    expect(translate("de", "start.advisor.eyebrow")).toBe("Für Berater und Partner");
    expect(translate("en", "start.advisor.eyebrow")).toBe(MESSAGES.en.start["advisor.eyebrow"]);
    expect(translate("fr", "opt.laufzeit.2 Jahre")).toBe(MESSAGES.fr.opt["laufzeit.2 Jahre"]);
  });

  it("interpolates placeholders", () => {
    expect(translate("de", "common.stepOf", { n: 2, total: 6 })).toBe("Thema 2 von 6");
    expect(translate("de", "side.submittedBy", { name: "Anna Muster" })).toBe("Erfasst von Anna Muster");
    expect(interpolate("{a} und {b}", { a: 1 })).toBe("1 und {b}");
  });

  it("falls back to German, then to the key", () => {
    expect(translate("xx", "common.next")).toBe("Weiter");
    expect(translate("de", "nope.missing")).toBe("nope.missing");
    expect(translate("fr", "nokey")).toBe("nokey");
  });

  it("option labels", () => {
    expect(optionLabel("de", "lieg", "Stockwerkeigentum")).toBe("Stockwerkeigentum");
    expect(optionLabel("fr", "lieg", "Stockwerkeigentum")).toBe(MESSAGES.fr.opt["lieg.Stockwerkeigentum"]);
    expect(optionLabel("en", "yn", "Ja")).toBe("Yes");
    expect(optionLabel("de", "heizung", "Unbekannt")).toBe("Unbekannt");
    expect(optionLabel("de", "x", "Free text")).toBe("Free text");
    expect(optionLabel("de", "lieg", undefined)).toBe("");
  });

  it("language from the path", () => {
    expect(langFromPath("/fr/funnel")).toBe("fr");
    expect(langFromPath("/it")).toBe("it");
    expect(langFromPath("/funnel")).toBe("de");
    expect(langFromPath("/es/funnel")).toBe("de");
    expect(langFromPath(null)).toBe("de");
  });
});
