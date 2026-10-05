import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { useFunnelV3, FUNNEL_V3_STORAGE_KEY, newId } from "@/lib/funnel-v3/store";
import { DEFAULT_ANSWERS, MAX_BORROWERS } from "@/lib/funnel-v3/types";

const S = () => useFunnelV3.getState();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(() => S().reset());

describe("useFunnelV3", () => {
  it("starts empty with defaults and a submission id", () => {
    expect(S().role).toBeNull();
    expect(S().ans).toEqual(DEFAULT_ANSWERS);
    expect(S().step).toBe(0);
    expect(S().borrowers).toHaveLength(1);
    expect(S().submissionId).toMatch(UUID_RE);
    expect(newId()).toMatch(UUID_RE);
  });

  it("switching Antrag clears what no longer applies", () => {
    S().setAns("antrag", "Ablösung");
    S().setFin("old", 449000);
    S().setAns("aufstockung", "Ja");
    S().setFin("up", 201000);
    S().setTxt("zweck", "Renovation");
    S().setAns("antrag", "Neue Hypothek");
    expect(S().fin.old).toBe(0);
    expect(S().fin.up).toBe(0);
    expect(S().ans.aufstockung).toBe("Nein");
    expect(S().txt.zweck).toBe("");

    S().setFin("kaufpreis", 900000);
    S().setAns("reno", "Ja");
    S().setAns("reserviert", "Ja");
    S().setAns("antrag", "Ablösung");
    expect(S().fin.kaufpreis).toBe(0);
    expect(S().ans.reno).toBe("Nein");
    expect(S().ans.reserviert).toBe("Nein");
  });

  it("dependent resets", () => {
    S().setAns("kinder", "Ja");
    S().setAns("unterhalt", "Ja");
    S().setAns("kinder", "Nein");
    expect(S().ans.unterhalt).toBe("Nein");

    S().setAns("buerge", "Ja");
    S().setTxt("buergeName", "Hans Gerber");
    S().setAns("buerge", "Nein");
    expect(S().txt.buergeName).toBe("");

    S().setAns("immo", "Neubau");
    S().setAns("nbDocs", "Ja");
    S().setAns("immo", "Bauprojekt");
    expect(S().ans.nbDocs).toBe("Nein");

    S().setAns("aufstockung", "Ja");
    S().setFin("up", 1000);
    S().setTxt("zweck", "x");
    S().setAns("aufstockung", "Nein");
    expect(S().fin.up).toBe(0);
    expect(S().txt.zweck).toBe("");
  });

  it("Kreditnehmer switch", () => {
    S().setTxt("vor", "Gary");
    S().addBorrower();
    S().setFin("inc", 125000);
    S().setAns("ab50", "Ja");
    S().setAns("kn", "Juristische Person");
    expect(S().borrowers).toHaveLength(1);
    expect(S().borrowers[0].vor).toBe("Gary");
    expect(S().fin.inc).toBe(0);
    expect(S().ans.ab50).toBe("Nein");
    S().addBorrower();
    expect(S().borrowers).toHaveLength(1);
    S().setTxt("firma", "Etzel AG");
    S().setAns("kn", "Natürliche Person");
    expect(S().txt.firma).toBe("");
  });

  it("borrowers: max 3, first one synced with the contact both ways", () => {
    S().setTxt("vor", "Gary");
    S().setTxt("nach", "Gerber");
    expect(S().borrowers[0]).toMatchObject({ vor: "Gary", nach: "Gerber" });
    const first = S().borrowers[0].id;
    S().updateBorrower(first, { vor: "Gary Samuel" });
    expect(S().txt.vor).toBe("Gary Samuel");
    expect(S().txt.nach).toBe("Gerber");

    for (let i = 0; i < 5; i++) S().addBorrower();
    expect(S().borrowers).toHaveLength(MAX_BORROWERS);
    const second = S().borrowers[1].id;
    S().updateBorrower(second, { vor: "Anna", job: "Selbständig", pkSe: "Ja" });
    expect(S().borrowers[1]).toMatchObject({ vor: "Anna", job: "Selbständig", pkSe: "Ja" });
    expect(S().txt.vor).toBe("Gary Samuel");
    S().updateBorrower(second, { job: "Angestellt" });
    expect(S().borrowers[1].pkSe).toBe("Nein");

    S().removeBorrower(first);
    expect(S().borrowers).toHaveLength(3);
    S().removeBorrower(second);
    expect(S().borrowers.map((b) => b.id)).not.toContain(second);
    expect(S().borrowers).toHaveLength(2);
  });

  it("setRole clears the other entry's fields", () => {
    S().setRole("berater");
    S().setTxt("bmail", "a@vzch.ch");
    S().setTxt("pfirma", "VZ");
    S().setRole("kunde");
    expect(S().txt.bmail).toBe("");
    expect(S().txt.pfirma).toBe("");
    S().setTxt("tel", "079");
    S().setRole("berater");
    expect(S().txt.tel).toBe("");
    expect(S().role).toBe("berater");
  });

  it("navigation: back always, forward only to visited steps (D6)", () => {
    expect(S().goto(2)).toBe(false);
    S().next();
    S().next();
    S().next();
    expect(S().step).toBe(3);
    expect(S().visited).toBe(3);
    expect(S().goto(1)).toBe(true);
    expect(S().step).toBe(1);
    expect(S().goto(3)).toBe(true);
    expect(S().goto(4)).toBe(false);
    expect(S().step).toBe(3);
    S().back();
    expect(S().step).toBe(2);
    for (let i = 0; i < 10; i++) S().next();
    expect(S().step).toBe(6);
    S().back();
    S().back();
    expect(S().goto(6)).toBe(true);
  });

  it("reset empties the funnel and mints a new submission", () => {
    S().setRole("kunde");
    S().setTxt("vor", "Gary");
    S().setSharepointFolderId("folder-1");
    S().setFiles([{ name: "a.pdf" } as any]);
    S().next();
    const before = S().submissionId;
    S().reset();
    expect(S().submissionId).not.toBe(before);
    expect(S().txt.vor).toBe("");
    expect(S().role).toBeNull();
    expect(S().sharepointFolderId).toBeNull();
    expect(S().files).toEqual([]);
    expect(S().step).toBe(0);
    expect(S().visited).toBe(0);
  });
});

describe("persistence", () => {
  it("writes to sessionStorage without File objects and restores from it", async () => {
    const data: Record<string, string> = {};
    const fake = {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: (k: string) => {
        delete data[k];
      },
    };
    (globalThis as any).window = { sessionStorage: fake };
    (globalThis as any).Blob = (globalThis as any).Blob ?? class {};
    try {
      let mod: typeof import("@/lib/funnel-v3/store") | undefined;
      jest.isolateModules(() => {
        mod = require("@/lib/funnel-v3/store");
      });
      const store = mod!.useFunnelV3;
      store.getState().setTxt("vor", "Gary");
      store.getState().setFiles([{ name: "a.pdf", file: new Blob(["x"]) } as any]);
      const saved = JSON.parse(data[FUNNEL_V3_STORAGE_KEY]);
      expect(saved.state.txt.vor).toBe("Gary");
      expect(saved.state.files).toEqual([{ name: "a.pdf" }]);
      const id = saved.state.submissionId;

      // A reload: a fresh module, hydrated from the same storage.
      let mod2: typeof import("@/lib/funnel-v3/store") | undefined;
      jest.isolateModules(() => {
        mod2 = require("@/lib/funnel-v3/store");
      });
      const store2 = mod2!.useFunnelV3;
      expect(store2.getState().txt.vor).toBe("");
      await store2.persist.rehydrate();
      expect(store2.getState().txt.vor).toBe("Gary");
      expect(store2.getState().submissionId).toBe(id);
      expect(typeof store2.getState().setTxt).toBe("function");
    } finally {
      delete (globalThis as any).window;
    }
  });
});
