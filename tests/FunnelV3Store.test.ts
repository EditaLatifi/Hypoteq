import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { useFunnelV3, FUNNEL_V3_STORAGE_KEY, FUNNEL_V3_STORAGE_VERSION, applyAnswer, newId } from "@/lib/funnel-v3/store";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_EM, EMPTY_TEXTS, MAX_BORROWERS } from "@/lib/funnel-v3/types";
import type { PrefillResult } from "@/lib/funnel-v3/prefill";

const S = () => useFunnelV3.getState();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(() => S().reset());

describe("useFunnelV3", () => {
  it("starts empty with defaults and a submission id", () => {
    expect(S().role).toBeNull();
    expect(S().mode).toBe("begleitet");
    expect(S().ans).toEqual(DEFAULT_ANSWERS);
    expect(S().em).toEqual(EMPTY_EM);
    expect(S().src).toEqual({});
    expect(S().touched).toEqual({});
    expect(S().sig).toBeNull();
    expect(S().step).toBe(0);
    expect(S().borrowers).toHaveLength(1);
    expect(S().submissionId).toMatch(UUID_RE);
    expect(newId()).toMatch(UUID_RE);
  });

  it("switching Antrag clears what no longer applies (Handover 2)", () => {
    S().setAns("antrag", "Ablösung");
    S().setFin("old", 380000);
    S().setAns("aufstockung", "Ja");
    S().setFin("up", 170000);
    S().setTxt("zweck", "Renovation");
    S().setAns("antrag", "Neue Hypothek");
    expect(S().fin.old).toBe(0);
    expect(S().fin.up).toBe(0);
    expect(S().ans.aufstockung).toBe("Nein");
    expect(S().txt.zweck).toBe("");

    S().setFin("kaufpreis", 900000);
    S().setTxt("kaufdatum", "01.03.2027");
    S().setAns("reno", "Ja");
    S().setFin("renoBetrag", 50000);
    S().setAns("reserviert", "Ja");
    S().setEm("spar", 100000);
    S().setEm("s3a", 20000);
    S().setEm("pkVerp", 30000);
    S().setEm("darl", 10000);
    S().setAns("immo", "Bauprojekt");
    S().setAns("antrag", "Ablösung");
    expect(S().fin.kaufpreis).toBe(0);
    expect(S().fin.renoBetrag).toBe(0);
    expect(S().txt.kaufdatum).toBe("");
    expect(S().ans.reno).toBe("Nein");
    expect(S().ans.reserviert).toBe("Nein");
    // Bauprojekt is not possible at an Ablösung.
    expect(S().ans.immo).toBeUndefined();
    // Ablösung keeps only the «Vorsorge» rows.
    expect(S().em).toEqual({ ...EMPTY_EM, s3a: 20000, pkVerp: 30000 });
  });

  it("refuses Bauprojekt at an Ablösung, Gewerbe for a natürliche Person, Unterhalt for a juristische", () => {
    S().setAns("antrag", "Ablösung");
    S().setAns("immo", "Bauprojekt");
    expect(S().ans.immo).toBeUndefined();
    expect(S().touched["ans.immo"]).toBeUndefined();
    S().setAns("nutz", "Gewerbe");
    expect(S().ans.nutz).toBeUndefined();
    S().setAns("kn", "Juristische Person");
    S().setAns("nutz", "Selbstbewohnt");
    expect(S().ans.nutz).toBeUndefined();
    S().setAns("nutz", "Gewerbe");
    expect(S().ans.nutz).toBe("Gewerbe");
    S().setChip("unterhalt", true);
    expect(S().ans.unterhalt).toBe("Nein");
  });

  it("changing the Kreditnehmer resets the Nutzung (Handover 2, prototype setAns)", () => {
    S().setAns("nutz", "Vermietet");
    S().setFin("miete", 24000);
    S().setAns("kn", "Natürliche Person");
    expect(S().ans.nutz).toBe("Vermietet");
    S().setAns("kn", "Juristische Person");
    expect(S().ans.nutz).toBeUndefined();
    expect(S().fin.miete).toBe(0);
  });

  it("dependent resets", () => {
    S().setChip("buerge", true);
    S().setTxt("buergeName", "Hans Mustermann");
    S().setChip("buerge", false);
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

    S().setAns("nutz", "Vermietet");
    S().setFin("miete", 12000);
    S().setAns("nutz", "Selbstbewohnt");
    expect(S().fin.miete).toBe(0);

    S().setAns("antrag", "Neue Hypothek");
    S().setAns("reno", "Ja");
    S().setFin("renoBetrag", 80000);
    S().setAns("reno", "Nein");
    expect(S().fin.renoBetrag).toBe(0);
  });

  it("chips: nothing tapped = Nein", () => {
    expect(S().ans.steuer).toBe("Nein");
    S().setChip("steuer", true);
    S().setChip("kredite", true);
    expect(S().ans).toMatchObject({ steuer: "Ja", kredite: "Ja", leasing: "Nein" });
    S().setChip("kredite", false);
    expect(S().ans.kredite).toBe("Nein");
  });

  it("Kreditnehmer switch", () => {
    S().setTxt("vor", "Max");
    S().setAns("anrede", "Herr");
    S().addBorrower();
    S().setFin("inc", 110000);
    S().setFin("inc2", 60000);
    S().setChip("unterhalt", true);
    S().setAns("kn", "Juristische Person");
    expect(S().borrowers).toHaveLength(1);
    expect(S().borrowers[0].vor).toBe("Max");
    expect(S().fin.inc).toBe(0);
    expect(S().fin.inc2).toBe(0);
    expect(S().ans.anrede).toBeUndefined();
    expect(S().ans.unterhalt).toBe("Nein");
    S().addBorrower();
    expect(S().borrowers).toHaveLength(1);
    S().setTxt("firma", "Muster AG");
    S().setAns("kn", "Natürliche Person");
    expect(S().txt.firma).toBe("");
  });

  it("Kreditnehmer 2 only after «+ Kreditnehmer hinzufügen» (V8); the first one synced with the contact", () => {
    S().setTxt("vor", "Max");
    S().setTxt("nach", "Mustermann");
    expect(S().borrowers[0]).toMatchObject({ vor: "Max", nach: "Mustermann" });
    const first = S().borrowers[0].id;
    S().updateBorrower(first, { vor: "Max Simon" });
    expect(S().txt.vor).toBe("Max Simon");

    for (let i = 0; i < 5; i++) S().addBorrower();
    expect(S().borrowers).toHaveLength(MAX_BORROWERS);
    expect(MAX_BORROWERS).toBe(2);
    const second = S().borrowers[1].id;
    S().updateBorrower(second, { vor: "Anna", job: "Selbständig", pkSe: "Ja" });
    expect(S().borrowers[1]).toMatchObject({ vor: "Anna", job: "Selbständig", pkSe: "Ja" });
    expect(S().touched["borrower.1.vor"]).toBe(true);
    S().updateBorrower(second, { job: "Angestellt" });
    expect(S().borrowers[1].pkSe).toBe("Nein");
    S().setFin("inc2", 70000);

    S().removeBorrower(first);
    expect(S().borrowers).toHaveLength(2);
    S().removeBorrower(second);
    expect(S().borrowers).toHaveLength(1);
    // Kreditnehmer 2's income goes with them.
    expect(S().fin.inc2).toBe(0);
    expect(S().touched["borrower.1.vor"]).toBeUndefined();
  });

  it("setRole keeps the customer's phone (asked in both roles since v5) and clears the Berater block", () => {
    S().setRole("berater");
    S().setTxt("bmail", "a@vzch.ch");
    S().setTxt("pfirma", "VZ");
    S().setTxt("tel", "079");
    S().setRole("kunde");
    expect(S().txt.bmail).toBe("");
    expect(S().txt.pfirma).toBe("");
    expect(S().txt.tel).toBe("079");
    S().setRole("berater");
    expect(S().txt.tel).toBe("079");
    expect(S().role).toBe("berater");
  });

  it("every edit marks its field touched and drops its «aus Dokument» mark", () => {
    useFunnelV3.setState({ src: { "txt.plz": { doc: "Grundbuchauszug", unsure: false }, "fin.old": { doc: "Zinsabrechnung", unsure: true } } });
    S().setTxt("plz", "8000");
    S().setFin("old", 450000);
    S().setEm("s3a", 1);
    S().setAns("antrag", "Ablösung");
    expect(S().src).toEqual({});
    expect(S().touched).toMatchObject({ "txt.plz": true, "fin.old": true, "em.s3a": true, "ans.antrag": true });
  });

  it("confirmSource keeps the mark, drops «bitte prüfen»", () => {
    useFunnelV3.setState({ src: { "fin.val": { doc: "Verkaufsdokumentation 2024", unsure: true } } });
    S().confirmSource("fin.val");
    expect(S().src["fin.val"]).toEqual({ doc: "Verkaufsdokumentation 2024", unsure: false });
  });

  it("the signature choice carries its time and method", () => {
    S().setSignature("later");
    expect(S().sig).toMatchObject({ choice: "later", method: "upload" });
    expect(Date.parse(S().sig!.at)).not.toBeNaN();
    S().setSignature(null);
    expect(S().sig).toBeNull();
  });

  it("applyCorrection sets chips and amounts as if clicked and typed", () => {
    S().applyCorrection({ ans: { kredite: "Ja", leasing: "Ja" }, em: { s3a: 8760 } });
    expect(S().ans).toMatchObject({ kredite: "Ja", leasing: "Ja" });
    expect(S().em.s3a).toBe(8760);
    expect(S().touched).toMatchObject({ "ans.kredite": true, "em.s3a": true });
  });
});

describe("navigation (Handover 2, 3; DECISIONS D6)", () => {
  it("Begleitet has 4 steps: back always, forward only to visited ones", () => {
    expect(S().goto(2)).toBe(false);
    S().next();
    S().next();
    S().next();
    expect(S().step).toBe(3);
    expect(S().visited).toBe(3);
    expect(S().goto(1)).toBe(true);
    expect(S().goto(3)).toBe(true);
    expect(S().goto(4)).toBe(false);
    S().back();
    expect(S().step).toBe(2);
    for (let i = 0; i < 10; i++) S().next();
    expect(S().step).toBe(4);
  });

  it("Schnell has 6 steps", () => {
    S().setMode("schnell");
    for (let i = 0; i < 10; i++) S().next();
    expect(S().step).toBe(6);
    expect(S().goto(6)).toBe(true);
  });

  it("switching the mode keeps every answer and lands on the same topic", () => {
    S().setMode("schnell");
    S().setTxt("mail", "max@example.ch");
    S().next(); // 1 Kontakt
    S().next(); // 2 Unterlagen
    S().next(); // 3 Anfrage
    S().next(); // 4 Objekt & Finanzierung
    S().setFin("old", 380000);
    S().switchMode();
    expect(S().mode).toBe("begleitet");
    expect(S().step).toBe(2); // Objekt & Finanzierung
    expect(S().txt.mail).toBe("max@example.ch");
    expect(S().fin.old).toBe(380000);
    // Without files, the Schnellanmeldung starts at Kontakt …
    S().switchMode();
    expect(S().mode).toBe("schnell");
    expect(S().step).toBe(1);
    // … with files, at the same topic.
    S().switchMode();
    S().setFiles([{ id: "f1", name: "a.pdf" } as any]);
    S().goto(2);
    S().switchMode();
    expect(S().step).toBe(4);
  });

  it("Kontakt and Unterlagen land on Anfrage in the Begleitete Anmeldung", () => {
    S().setMode("schnell");
    S().next();
    S().next();
    expect(S().step).toBe(2);
    S().switchMode();
    expect(S().step).toBe(1);
  });
});

describe("applyDocuments (Handover 3)", () => {
  const result = (over: Partial<PrefillResult> = {}): PrefillResult => ({
    values: { "ans.antrag": "Ablösung", "fin.old": 380000, "txt.vor": "Max Simon", "txt.nach": "Mustermann", "borrower.0.job": "Angestellt", "em.s3a": 8760 },
    src: {
      "ans.antrag": { doc: "Zinsabrechnung", unsure: false },
      "fin.old": { doc: "Zinsabrechnung", unsure: false },
      "txt.vor": { doc: "ID", unsure: false },
      "txt.nach": { doc: "ID", unsure: false },
      "borrower.0.job": { doc: "Lohnausweis 2025", unsure: false },
      "em.s3a": { doc: "3a-Police", unsure: true },
    },
    info: { bank: "Musterbank", bonus: false, raise: false, ab50: false },
    facts: { bonus: false, raise: false, ab50: false },
    ...over,
  });

  it("Schnellanmeldung: fills the answers in with their marks", () => {
    S().setMode("schnell");
    S().applyDocuments(result());
    expect(S().ans.antrag).toBe("Ablösung");
    expect(S().fin.old).toBe(380000);
    expect(S().txt.vor).toBe("Max Simon");
    expect(S().borrowers[0]).toMatchObject({ vor: "Max Simon", nach: "Mustermann", job: "Angestellt" });
    expect(S().em.s3a).toBe(8760);
    expect(S().src["em.s3a"]).toEqual({ doc: "3a-Police", unsure: true });
    expect(S().info.bank).toBe("Musterbank");
    expect(S().touched).toEqual({});
  });

  it("never overwrites a touched field", () => {
    S().setMode("schnell");
    S().setFin("old", 500000);
    S().applyDocuments(result());
    expect(S().fin.old).toBe(500000);
    expect(S().src["fin.old"]).toBeUndefined();
    expect(S().ans.antrag).toBe("Ablösung");
  });

  it("Begleitete Anmeldung: only the facts, never an answer", () => {
    S().applyDocuments(result());
    expect(S().ans.antrag).toBeUndefined();
    expect(S().fin.old).toBe(0);
    expect(S().src).toEqual({});
    expect(S().info.bank).toBe("Musterbank");
  });

  it("is idempotent, and drops a mark whose document is gone (the value stays)", () => {
    S().setMode("schnell");
    S().applyDocuments(result());
    const after = S();
    S().applyDocuments(result());
    expect(S().src).toBe(after.src);
    S().applyDocuments(result({ values: {}, src: {} }));
    expect(S().fin.old).toBe(380000);
    expect(S().src).toEqual({});
  });

  it("applies the answer's side effects, unmarking what they clear", () => {
    S().setMode("schnell");
    S().applyDocuments(
      result({ values: { "fin.kaufpreis": 900000, "ans.antrag": "Neue Hypothek" }, src: { "fin.kaufpreis": { doc: "Kaufvertrag", unsure: false }, "ans.antrag": { doc: "Kaufvertrag", unsure: false } } })
    );
    expect(S().fin.kaufpreis).toBe(900000);
    S().applyDocuments(result());
    expect(S().ans.antrag).toBe("Ablösung");
    expect(S().fin.kaufpreis).toBe(0);
    expect(S().src["fin.kaufpreis"]).toBeUndefined();
  });
});

describe("applyAnswer (pure)", () => {
  it("reports what it cleared", () => {
    const r = applyAnswer({ ans: { ...DEFAULT_ANSWERS, antrag: "Neue Hypothek" }, txt: { ...EMPTY_TEXTS, kaufdatum: "1.1.2027" }, fin: { ...EMPTY_AMOUNTS, kaufpreis: 1 }, em: { ...EMPTY_EM, spar: 5 }, borrowers: [] }, "antrag", "Ablösung");
    expect(r.accepted).toBe(true);
    expect(r.cleared.sort()).toEqual(["em.spar", "fin.kaufpreis", "txt.kaufdatum"]);
  });
});

describe("reset", () => {
  it("empties the funnel and mints a new submission", () => {
    S().setRole("kunde");
    S().setMode("schnell");
    S().setTxt("vor", "Max");
    S().setSharepointFolderId("folder-1");
    S().setFiles([{ name: "a.pdf" } as any]);
    S().next();
    const before = S().submissionId;
    S().reset();
    expect(S().submissionId).not.toBe(before);
    expect(S().txt.vor).toBe("");
    expect(S().role).toBeNull();
    expect(S().mode).toBe("begleitet");
    expect(S().sharepointFolderId).toBeNull();
    expect(S().files).toEqual([]);
    expect(S().step).toBe(0);
    expect(S().visited).toBe(0);
  });
});

describe("persistence", () => {
  function fakeWindow() {
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
    return data;
  }
  const freshStore = () => {
    let mod: typeof import("@/lib/funnel-v3/store") | undefined;
    jest.isolateModules(() => {
      mod = require("@/lib/funnel-v3/store");
    });
    return mod!.useFunnelV3;
  };

  it("writes to sessionStorage without File objects and restores from it", async () => {
    const data = fakeWindow();
    try {
      const store = freshStore();
      store.getState().setMode("schnell");
      store.getState().setTxt("vor", "Max");
      store.getState().setEm("s3a", 8760);
      store.getState().setFiles([{ name: "a.pdf", file: new Blob(["x"]) } as any]);
      const saved = JSON.parse(data[FUNNEL_V3_STORAGE_KEY]);
      expect(saved.version).toBe(FUNNEL_V3_STORAGE_VERSION);
      expect(saved.state.txt.vor).toBe("Max");
      expect(saved.state.files).toEqual([{ name: "a.pdf" }]);
      const id = saved.state.submissionId;

      // A reload: a fresh module, hydrated from the same storage.
      const store2 = freshStore();
      expect(store2.getState().txt.vor).toBe("");
      await store2.persist.rehydrate();
      expect(store2.getState().txt.vor).toBe("Max");
      expect(store2.getState().mode).toBe("schnell");
      expect(store2.getState().em.s3a).toBe(8760);
      expect(store2.getState().submissionId).toBe(id);
      expect(typeof store2.getState().setTxt).toBe("function");
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("does not hydrate a v3 session (version 1) into the v5 shape", async () => {
    const data = fakeWindow();
    try {
      data[FUNNEL_V3_STORAGE_KEY] = JSON.stringify({
        version: 1,
        state: { role: "kunde", ans: { ...DEFAULT_ANSWERS, kinder: "Ja", s3a: "Ja" }, txt: { ...EMPTY_TEXTS, vor: "Old" }, fin: { old: 0, up: 0, kaufpreis: 0, inc: 1, val: 0 }, borrowers: [], step: 4, visited: 4 },
      });
      const store = freshStore();
      await store.persist.rehydrate();
      expect(store.getState().txt.vor).toBe("");
      expect(store.getState().step).toBe(0);
      expect((store.getState().ans as any).kinder).toBeUndefined();
    } finally {
      delete (globalThis as any).window;
    }
  });
});
