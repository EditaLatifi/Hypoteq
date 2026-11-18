/**
 * HYPO findings of HYPOTEQ's Komplett-Test, second round (18.11.2026; DECISIONS V118): a question
 * typed instead of an answer, a span of months at «Wann läuft deine Hypothek aus?» (C01), typing
 * on after the language offer (C02), a valuation asked for in words (C05).
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useHypo } from "@/components/funnel-v3/hypo/hypoStore";
import { pickChip, sendText, startHypo } from "@/components/funnel-v3/hypo/controller";
import { asksAboutDocuments, isQuestionOnly, readDate, readName, wantsValuation } from "@/lib/funnel-v3/hypo/parse";
import { validateHypoResult } from "@/components/hypo/extract";
import type { HypoMessage } from "@/lib/funnel-v3/hypo/session";

type Route = (body: any) => any;
let routes: Record<string, Route> = {};
let modelCalls: string[] = [];
let config: { enabled: boolean; model: boolean; academy: Record<string, string> } = { enabled: true, model: true, academy: {} };

const fetchMock = jest.fn(async (url: any, init?: any) => {
  const path = String(url);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  if (path === "/api/hypo" && (!init || init.method !== "POST")) return new Response(JSON.stringify(config));
  if (path === "/api/hypo") modelCalls.push(body.message);
  const route = routes[path];
  const out = route ? route(body) : {};
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
});

const S = () => useFunnelV3.getState();
const H = () => useHypo.getState();
const lastKey = () => {
  const m = [...H().messages].reverse().find((x) => x.from === "hypo" && x.kind === "text");
  return m && m.from === "hypo" && m.kind === "text" ? m.key : null;
};
const said = (key: string) => H().messages.some((m) => m.from === "hypo" && m.kind === "text" && m.key === key);
const chip = (v: string) => pickChip([v], [v], "de");

beforeEach(() => {
  (globalThis as any).fetch = fetchMock;
  fetchMock.mockClear();
  modelCalls = [];
  routes = { "/api/hypo/event": () => ({}) };
  config = { enabled: true, model: false, academy: {} };
  S().reset();
  useHypo.setState({ config });
});

/** To «Wie heisst du?» without the model. */
async function toNameQuestion() {
  S().setRole("kunde");
  startHypo("de");
  await sendText("Wir kaufen eine Wohnung", "de");
  await chip("Neue Hypothek");
  await chip("Natürliche Person");
  expect(lastKey()).toBe("hypo.q.name");
}

describe("a question is never an answer (Komplett-Test 18.11.2026, «Brauche ich einen Arbeitsvertrag?»)", () => {
  it("reads questions in four languages and leaves names, numbers and chips alone", () => {
    for (const q of [
      "Brauche ich einen Arbeitsvertrag?",
      "brauche ich einen arbeitsvertrag",
      "Welche Unterlagen braucht ihr",
      "Wie lange dauert das?",
      "Do I need an employment contract?",
      "what documents do you need",
      "Dois-je fournir un contrat de travail ?",
      "Devo mandare il contratto di lavoro?",
      "Ist das wirklich kostenlos?",
    ]) {
      expect([q, isQuestionOnly(q)]).toEqual([q, true]);
    }
    for (const a of ["Max Muster", "Anna Maria Beispiel", "Ja", "Kauf", "8001 Zürich", "ca. 1.1 Mio", "Sono Mario Rossi", "Ich heisse Lea Muster", "max@example.ch", "Muster?", "Wir kaufen in Bern. Was kostet das?"]) {
      expect([a, isQuestionOnly(a)]).toEqual([a, false]);
    }
    expect(readName("Brauche ich einen Arbeitsvertrag")).toBeNull();
    expect(readName("Lea Muster")).toEqual({ vor: "Lea", nach: "Muster" });
    expect(asksAboutDocuments("Brauche ich einen Arbeitsvertrag?")).toBe(true);
    expect(asksAboutDocuments("Wie lange dauert das?")).toBe(false);
  });

  it("without the model: HYPO answers the documents question, stores no name and asks again", async () => {
    await toNameQuestion();
    await sendText("Brauche ich einen Arbeitsvertrag?", "de");
    expect(S().txt.vor).toBe("");
    expect(S().txt.nach).toBe("");
    expect(said("hypo.docsQuestion")).toBe(true);
    expect(lastKey()).toBe("hypo.q.name");
    await sendText("Lea Muster", "de");
    expect(S().txt.vor).toBe("Lea");
    expect(S().txt.nach).toBe("Muster");
  });

  it("with the model: its values for a question are dropped, its intent is used", async () => {
    config.model = true;
    useHypo.setState({ config });
    await toNameQuestion();
    routes["/api/hypo"] = () => ({
      ok: true,
      fields: [
        { key: "txt.vor", value: "Wie lange", confidence: 0.95 },
        { key: "txt.nach", value: "dauert", confidence: 0.95 },
      ],
      intents: ["off_topic"],
      extras: [],
      advisorQuestion: null,
    });
    await sendText("Wie lange dauert das?", "de");
    expect(modelCalls[modelCalls.length - 1]).toBe("Wie lange dauert das?");
    expect(S().txt.vor).toBe("");
    expect(S().txt.nach).toBe("");
    expect(said("hypo.offTopic")).toBe(true);
    expect(lastKey()).toBe("hypo.q.name");
  });

  it("the server drops the model's values for a question as well", () => {
    const raw = { fields: [{ key: "txt.vor", value: "brauche ich einen", confidence: 0.9 }, { key: "txt.nach", value: "arbeitsvertrag", confidence: 0.9 }], intents: [], extras: [], advisorQuestion: null };
    expect(validateHypoResult(raw, "brauche ich einen arbeitsvertrag").fields).toEqual([]);
    const ok = { fields: [{ key: "txt.vor", value: "Lea", confidence: 0.95 }, { key: "txt.nach", value: "Muster", confidence: 0.95 }], intents: [], extras: [], advisorQuestion: null };
    expect(validateHypoResult(ok, "Lea Muster").fields).toHaveLength(2);
  });
});

describe("C01: a span of months at «Wann läuft deine aktuelle Hypothek aus?»", () => {
  it("reads «20 Monate», «in 2 Jahren», «Ende 2027» as a month from today", () => {
    const now = new Date(Date.UTC(2026, 10, 18));
    expect(readDate("20 Monat", true, now)).toBe("07.2028");
    expect(readDate("in 20 Monaten", true, now)).toBe("07.2028");
    expect(readDate("in 2 Jahren", true, now)).toBe("11.2028");
    expect(readDate("in 6 months", true, now)).toBe("05.2027");
    expect(readDate("dans 3 mois", true, now)).toBe("02.2027");
    expect(readDate("tra 1 anno", true, now)).toBe("11.2027");
    expect(readDate("Ende 2027", true, now)).toBe("12.2027");
    expect(readDate("Mitte 2028", true, now)).toBe("06.2028");
    expect(readDate("März 2027", true, now)).toBe("03.2027");
    // A full date stays a date; without `month` a span is no date.
    expect(readDate("20 Monate", false, now)).toBeNull();
  });

  it("goes on after «20 Monate» without the model", async () => {
    S().setRole("kunde");
    startHypo("de");
    await sendText("Ablösung", "de");
    expect(lastKey()).toBe("hypo.q.antrag");
    await chip("Ablösung");
    expect(lastKey()).toBe("hypo.q.ablauf");
    await sendText("20 Monate", "de");
    expect(H().session.ablauf).toMatch(/^\d{2}\.\d{4}$/);
    expect(lastKey()).toBe("hypo.q.bank");
  });
});

describe("C02: typing on after the language offer", () => {
  it("reads «8400 Winterthur» as the place instead of repeating the offer", async () => {
    S().setRole("kunde");
    startHypo("de");
    await sendText("Wir kaufen eine Wohnung", "de");
    await chip("Neue Hypothek");
    await chip("Natürliche Person");
    await sendText("Lea Muster", "de");
    await chip("Frau");
    await sendText("lea@example.ch", "de");
    await sendText("+41 79 222 33 44", "de");
    expect(lastKey()).toBe("hypo.q.place");
    await sendText("qwertz", "de");
    await sendText("asdf", "de");
    expect(lastKey()).toBe("hypo.offer.language");
    await sendText("8400 Winterthur", "de");
    expect(S().txt.plz).toBe("8400");
    expect(S().txt.ort).toBe("Winterthur");
    expect(H().session.offer).toBeNull();
    expect(lastKey()).toBe("hypo.q.immo");
    await sendText("4653 Obergösgen", "de");
    // Not the place question any more: nothing overwritten, no loop.
    expect(S().txt.plz).toBe("8400");
  });
});

describe("C05: a valuation asked for in words", () => {
  it("knows the question in four languages, not a value in a sentence", () => {
    for (const q of ["Can you estimate the market value of my property?", "Was ist meine Wohnung wert?", "Ich möchte eine Bewertung meiner Immobilie", "Pouvez-vous estimer la valeur de ma maison ?", "Potete fare una valutazione della casa?"]) {
      expect([q, wantsValuation(q)]).toEqual([q, true]);
    }
    expect(wantsValuation("Wir kaufen ein Haus für 1.2 Mio, Marktwert ca. 1.3 Mio")).toBe(false);
  });

  it("gives the valuation's link and asks on", async () => {
    S().setRole("kunde");
    startHypo("en");
    await sendText("Can you estimate the market value of my property?", "en");
    expect(said("hypo.bewertung.asked")).toBe(true);
    expect(H().session.bewertung).toBe(true);
    expect(H().messages.some((m) => m.kind === "link" && m.label === "hypo.card.bewertung")).toBe(true);
    expect(S().txt.kommentar).toContain("HYPO:");
    expect(lastKey()).toBe("hypo.q.antrag");
  });
});
