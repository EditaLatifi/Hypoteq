"use client";

/**
 * HYPO's turns (docs/funnel-v5/HYPOTEQ_Konzept_HYPO_ChatFunnel.md, Kap. 4–8): a typed message or
 * a chip in, HYPO's answer and the next question out. The answers go into the funnel store
 * through its own actions, so every side effect of the form holds (an Ablösung empties the Kauf
 * block, a company has no Anrede …) and the documents, the closing and the submit see the same.
 *
 * Order of a typed message: an offer or «stimmt das?» on screen is answered first; then a plain
 * answer to the question is read without the model; anything else goes to the model
 * (/api/hypo) — and when the model is off or fails, HYPO reads what it can and carries on with
 * chips (Kap. 9 «Fallback»).
 */

import { newId, useFunnelV3 } from "@/lib/funnel-v3/store";
import { screenAt, stepCount } from "@/lib/funnel-v3/steps";
import { validateScreen } from "@/lib/funnel-v3/validate";
import { chipsFor, type FieldPath } from "@/lib/funnel-v3/types";
import { translate, type Lang } from "@/lib/funnel-v3/i18n";
import { fieldDef, type HypoKey, type HypoValue } from "@/lib/funnel-v3/hypo/fields";
import { nextQuestion, questionById, type FlowState, type Question } from "@/lib/funnel-v3/hypo/flow";
import {
  PENSION_KEYS,
  fieldLabel,
  formatParams,
  inStoreOrder,
  noteLine,
  questionKey,
  questionText,
  readConfirm,
  readPartnerName,
  readPlainAnswer,
  splitByAmpel,
  valueText,
  withNote,
} from "@/lib/funnel-v3/hypo/engine";
import { asksAboutBot, asksIfHuman, isPlainAnswer, readField, saysSkip, saysUnknown } from "@/lib/funnel-v3/hypo/parse";
import type { HypoMessage, HypoRole, HypoSession, Offer, RecognisedItem } from "@/lib/funnel-v3/hypo/session";
import { useFunnelUI } from "../uiStore";
import { loadHypoConfig, resetHypo, useHypo } from "./hypoStore";

const S = () => useFunnelV3.getState();
const H = () => useHypo.getState().session;
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

function patch(p: Partial<HypoSession>): void {
  useHypo.setState((s) => ({ session: { ...s.session, ...p } }));
}

type WithoutStamp<T> = T extends unknown ? Omit<T, "id" | "at"> : never;
type NewMessage = WithoutStamp<HypoMessage>;

function push(m: NewMessage): void {
  useHypo.setState((s) => ({ messages: [...s.messages, { ...m, id: newId(), at: new Date().toISOString() } as HypoMessage] }));
}

function say(key: string, params?: Record<string, string | number>): void {
  push({ from: "hypo", kind: "text", key, ...(params ? { params } : {}) });
}

function flowState(): FlowState {
  const s = S();
  return { role: s.role, ans: s.ans, txt: s.txt, fin: s.fin, em: s.em, borrowers: s.borrowers, src: s.src, touched: s.touched };
}

const answered = (...keys: HypoKey[]) => patch({ answered: uniq([...H().answered, ...keys]) });
const close = (...ids: string[]) => patch({ closed: uniq([...H().closed, ...ids]) });

/** Kap. 9 «Vorschlags-Klicks und Abbruchpunkte als Events»: names and ids only, never a value. */
export function hypoEvent(event: string, detail?: string): void {
  try {
    const body = JSON.stringify({ event, detail: detail ?? null });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon("/api/hypo/event", new Blob([body], { type: "application/json" }));
    else void fetch("/api/hypo/event", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    // an event is never worth an error
  }
}

function note(kind: Parameters<typeof noteLine>[0], text: string, lang: Lang): void {
  const s = S();
  const next = withNote(s.txt.kommentar, noteLine(kind, text, lang));
  if (next !== s.txt.kommentar) s.setTxt("kommentar", next);
}

/** One value into the funnel store through its actions; false when the state does not allow it. */
function write(key: HypoKey, value: HypoValue, lang: Lang): boolean {
  const [group, k, sub] = key.split(".");
  const s = S();
  switch (group) {
    case "ans": {
      s.setAns(k as never, value as never);
      const ok = (S().ans as unknown as Record<string, unknown>)[k] === value;
      if (ok) answered(key);
      return ok;
    }
    case "txt":
      s.setTxt(k as never, String(value));
      answered(key);
      return true;
    case "fin":
      s.setFin(k as never, Number(value));
      answered(key);
      return true;
    case "em":
      s.setEm(k as never, Number(value));
      answered(key);
      return true;
    case "borrower": {
      const i = Number(k);
      if (i === 1 && S().borrowers.length < 2) S().addBorrower();
      const b = S().borrowers[i];
      if (!b) return false;
      S().updateBorrower(b.id, { [sub]: value } as never);
      answered(key);
      return true;
    }
    case "chat":
      switch (k) {
        case "emTotal":
          patch({ emTotal: Number(value) });
          return true;
        case "bank":
          patch({ bank: String(value) });
          note("bank", String(value), lang);
          return true;
        case "ablauf":
          patch({ ablauf: String(value) });
          note("ablauf", String(value), lang);
          return true;
        case "adresse":
          patch({ adresse: String(value) });
          note("adresse", String(value), lang);
          return true;
        case "kn2":
          if (value === "Ja") S().addBorrower();
          answered(key);
          return value === "Nein" || S().borrowers.length > 1;
      }
  }
  return false;
}

/**
 * Values from a message (Kap. 5.2): green ones are taken, the others wait for one «stimmt das?»
 * each; the card «Aus deiner Nachricht erkannt» shows all of them with their Ampel.
 */
async function takeValues(items: RecognisedItem[], lang: Lang, opts: { card: boolean; notes?: string[] }): Promise<void> {
  const ordered = inStoreOrder(items);
  const { take, ask } = splitByAmpel(ordered);
  for (const it of take) write(it.key, it.value, lang);
  if (ask.length) patch({ confirm: [...H().confirm.filter((c) => !ask.some((a) => a.key === c.key)), ...ask] });
  if (opts.card && (ordered.length || opts.notes?.length)) push({ from: "hypo", kind: "recognised", items: ordered, ...(opts.notes?.length ? { notes: opts.notes } : {}) });
  if (!H().pensionNoted && take.some((i) => PENSION_KEYS.includes(i.key))) {
    say("hypo.pension");
    patch({ pensionNoted: true });
  }
  await afterWrites(take.map((i) => i.key), lang);
}

/** What a written value sets off: the partner search and the e-mail recognition (Kap. 4). */
async function afterWrites(keys: HypoKey[], lang: Lang): Promise<void> {
  const h = H();
  if (keys.includes("txt.pnach") && h.role === "partner" && !h.partnerSearched) await searchPartner();
  if (keys.includes("txt.pnach")) close("partnerName");
  if (keys.includes("txt.bmail")) await recognise(lang);
}

async function searchPartner(): Promise<void> {
  const t = S().txt;
  patch({ partnerSearched: true });
  if (!t.pnach.trim() || (!t.pvor.trim() && !t.pfirma.trim())) {
    say("hypo.partner.new");
    return;
  }
  try {
    const res = await fetch("/api/hypo/partner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vor: t.pvor.trim(), nach: t.pnach.trim(), firma: t.pfirma.trim() }),
    });
    const j = res.ok ? await res.json() : null;
    if (j?.status === "match" && typeof j.name === "string") {
      patch({ partnerMatch: { name: j.name, company: typeof j.company === "string" ? j.company : null } });
      return;
    }
  } catch {
    // no match is the safe answer: the e-mail decides anyway
  }
  say("hypo.partner.new");
}

async function recognise(lang: Lang): Promise<void> {
  const email = S().txt.bmail.trim();
  let status: HypoSession["partnerStatus"] = "unknown";
  let name = "";
  let company = "";
  try {
    const res = await fetch("/api/partner/recognize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const j = res.ok ? await res.json() : null;
    if (j?.status === "partner" || j?.status === "hypoteq") {
      status = j.status;
      name = String(j.name || "");
      company = String(j.company || "");
    }
  } catch {
    // unknown: HYPO asks what the new-partner form asks; the sync looks the address up again
  }
  patch({ partnerStatus: status });
  if (status === "hypoteq") say("hypo.partner.hypoteq", { name: name.split(" ")[0] || name });
  else if (status === "partner") say("hypo.partner.recognised", { name, company });
  else say(H().role === "partner" ? "hypo.partner.unknownMail" : "hypo.partner.unknownMail.berater");
  // Kap. 6: the Academy once, to a partner (not to a HYPOTEQ advisor), where a link is configured.
  const academy = useHypo.getState().config?.academy?.[lang];
  if (status !== "hypoteq" && (H().role === "partner" || status === "partner") && academy && !H().closed.includes("offer:academy")) patch({ offer: "academy" });
}

function offerOnce(offer: Offer): void {
  if (!H().closed.includes(`offer:${offer}`) && !H().offer) patch({ offer });
}

/** «Weiss ich nicht» at the value or the price (Kap. 6): the valuation is offered once, then an estimate is asked. */
function unknownValue(): void {
  if (!H().closed.includes("offer:bewertung")) {
    patch({ offer: "bewertung" });
    return;
  }
  say("hypo.estimate");
}

function answerOffer(offer: Offer, yes: boolean, lang: Lang): void {
  patch({ offer: null });
  close(`offer:${offer}`);
  hypoEvent(`offer_${offer}`, yes ? "yes" : "no");
  switch (offer) {
    case "broker":
      if (yes) {
        patch({ role: "partner" });
        S().setRole("berater");
        say("hypo.partner.switched");
      } else say("hypo.ok");
      return;
    case "academy": {
      patch({ academy: yes });
      const url = useHypo.getState().config?.academy?.[lang];
      if (yes && url) push({ from: "hypo", kind: "link", key: "hypo.academy.link", url });
      else say("hypo.ok");
      return;
    }
    case "bewertung":
      patch({ bewertung: yes });
      if (yes) {
        note("bewertung", "", lang);
        say("hypo.bewertung.yes");
      } else say("hypo.bewertung.no");
      return;
    case "language":
      return;
  }
}

function answerConfirm(yes: boolean, lang: Lang): Promise<void> | void {
  const [c, ...rest] = H().confirm;
  patch({ confirm: rest });
  if (!c) return;
  if (!yes) {
    say("hypo.confirm.no");
    return;
  }
  return takeValues([{ ...c, confidence: 1 }], lang, { card: false });
}

/** A value read from a document but not for sure (Ampel yellow): «stimmt das?» before it counts. */
function unsureDocValue(q: Question): FieldPath | null {
  const s = S();
  for (const k of q.writes) {
    if (k.startsWith("chat.")) continue;
    const mark = s.src[k as FieldPath];
    if (mark?.unsure && !H().closed.includes(`doc:${k}`)) return k as FieldPath;
  }
  return null;
}

function storeValue(path: FieldPath): HypoValue | null {
  const s = S();
  const [g, k, sub] = path.split(".");
  const v =
    g === "borrower"
      ? (s.borrowers[Number(k)] as unknown as Record<string, unknown> | undefined)?.[sub]
      : ((s as unknown as Record<string, Record<string, unknown>>)[g] ?? {})[k];
  return typeof v === "string" || typeof v === "number" ? v : null;
}

/** HYPO's next message: an offer, a «stimmt das?», the next question — or the summary. */
function askNext(lang: Lang): void {
  const h = H();
  if (h.offer) {
    patch({ current: `offer:${h.offer}` });
    say(`hypo.offer.${h.offer}`);
    return;
  }
  if (h.confirm.length) {
    const c = h.confirm[0];
    patch({ current: "confirm" });
    say("hypo.q.confirm", { field: fieldLabel(c.key, lang), value: valueText(c.key, c.value, lang) });
    return;
  }
  const q = nextQuestion(flowState(), h);
  if (!q) {
    patch({ current: "finish" });
    push({ from: "hypo", kind: "summary" });
    say("hypo.done");
    hypoEvent("complete");
    return;
  }
  const docPath = unsureDocValue(q);
  if (docPath) {
    const v = storeValue(docPath);
    const mark = S().src[docPath];
    if (v !== null && mark) {
      patch({ current: `doc:${docPath}` });
      say("hypo.q.confirmDoc", { doc: mark.doc, field: fieldLabel(docPath, lang), value: valueText(docPath, v, lang) });
      return;
    }
  }
  patch({ current: q.id });
  say(questionKey(q, h.role, lang), q.params ? formatParams(q.params, lang) : undefined);
}

function currentQuestion(): Question | null {
  const id = H().current;
  if (!id || id === "confirm" || id === "finish" || id.startsWith("offer:") || id.startsWith("doc:")) return null;
  return questionById(id, flowState(), H());
}

function miss(lang: Lang): void {
  const misses = H().misses + 1;
  patch({ misses });
  if (misses >= 2 && !H().closed.includes("offer:language")) {
    patch({ misses: 0 });
    offerOnce("language");
  } else say("hypo.miss");
  askNext(lang);
}

/** The answer to the question on screen, from a chip or a plain reading. */
async function takeAnswer(q: Question, items: RecognisedItem[], lang: Lang): Promise<void> {
  if (q.id === "partnerName") close("partnerName");
  await takeValues(items, lang, { card: false });
  // A refused option (Bauprojekt at an Ablösung) is no answer: the question comes again.
}

interface ModelResult {
  fields: RecognisedItem[];
  intents: string[];
  extras: string[];
  advisorQuestion: string | null;
}

async function extract(text: string, q: Question | null, lang: Lang): Promise<ModelResult | null> {
  try {
    const res = await fetch("/api/hypo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, role: H().role, question: q?.id ?? null, questionText: q ? questionText(q, H().role, lang) : null, message: text }),
    });
    const j = res.ok ? await res.json() : null;
    if (!j?.ok) return null;
    return {
      fields: Array.isArray(j.fields) ? j.fields : [],
      intents: Array.isArray(j.intents) ? j.intents : [],
      extras: Array.isArray(j.extras) ? j.extras : [],
      advisorQuestion: typeof j.advisorQuestion === "string" ? j.advisorQuestion : null,
    };
  } catch {
    return null;
  }
}

/** What the model found, applied; "left" when the person wants the form; false when nothing was usable. */
async function applyModel(res: ModelResult, q: Question | null, text: string, lang: Lang): Promise<boolean | "left"> {
  let handled = false;
  const intents = new Set(res.intents);
  const notes: string[] = [];
  for (const e of res.extras) {
    note("extra", e, lang);
    notes.push(e);
  }
  if (res.fields.length || notes.length) {
    if (q?.id === "partnerName" && res.fields.some((f) => f.key === "txt.pnach")) close("partnerName");
    await takeValues(res.fields, lang, { card: true, notes });
    handled = true;
  }
  if (intents.has("human")) {
    say("hypo.human");
    handled = true;
  }
  if (intents.has("about_bot")) {
    say("hypo.aboutBot");
    hypoEvent("about_bot");
    handled = true;
  }
  if (intents.has("advice")) {
    say("hypo.advice");
    note("advisor", res.advisorQuestion ?? text.slice(0, 200), lang);
    handled = true;
  }
  if (intents.has("off_topic") && !handled) {
    say("hypo.offTopic");
    handled = true;
  }
  if (intents.has("broker") && H().role === "kunde") {
    offerOnce("broker");
    handled = true;
  }
  if (intents.has("value_unknown")) {
    unknownValue();
    handled = true;
  }
  if (intents.has("pension") && !H().pensionNoted) {
    say("hypo.pension");
    patch({ pensionNoted: true });
    handled = true;
  }
  if (intents.has("wants_form")) {
    leaveToForm("asked");
    return "left";
  }
  return handled;
}

/** The chat's reading without the model: a typed answer, also within a longer message (then asked back). */
function readWithoutModel(q: Question, text: string, lang: Lang): RecognisedItem[] | null {
  if (q.id === "partnerName") return readPartnerName(text);
  const plain = readPlainAnswer(q, text, lang);
  if (plain) return plain;
  if (q.writes.length !== 1 || q.kind === "multi") return null;
  const def = fieldDef(q.writes[0]);
  if (!def || def.kind === "text" || def.kind === "name") return null;
  const v = readField(q.writes[0], def.kind, text, def.options ?? []);
  // Read out of a longer message: yellow, so it is asked back (Kap. 5.2).
  return v === null ? null : [{ key: q.writes[0], value: v, confidence: 0.7 }];
}

async function handleText(text: string, lang: Lang, first: boolean): Promise<void> {
  const h = H();
  // «Nur HYPOTEQ» (DECISIONS V92): a question about HYPO itself — who built it, which AI or model,
  // its prompt, an attempt to override it — gets one fixed answer and never goes to the model.
  if (asksAboutBot(text)) {
    say("hypo.aboutBot");
    hypoEvent("about_bot");
    return askNext(lang);
  }
  if (asksIfHuman(text) && isPlainAnswer(text)) {
    say("hypo.human");
    return askNext(lang);
  }
  // An offer or a «stimmt das?» on screen, answered in words.
  if (h.offer && h.offer !== "language") {
    const yes = readConfirm(text);
    if (yes !== null) {
      answerOffer(h.offer, yes, lang);
      return askNext(lang);
    }
  }
  if (h.current === "confirm" && h.confirm.length) {
    const yes = readConfirm(text);
    if (yes !== null) {
      await answerConfirm(yes, lang);
      return askNext(lang);
    }
  }
  if (h.current?.startsWith("doc:")) {
    const yes = readConfirm(text);
    if (yes !== null) {
      answerDocConfirm(h.current.slice(4) as FieldPath, yes);
      return askNext(lang);
    }
  }
  const q = currentQuestion();
  if (q?.optional && saysSkip(text)) {
    close(q.id);
    return askNext(lang);
  }
  if (q?.unknown && saysUnknown(text) && isPlainAnswer(text)) {
    unknownValue();
    return askNext(lang);
  }
  const plain = q ? (q.id === "partnerName" ? (isPlainAnswer(text) ? readPartnerName(text) : null) : readPlainAnswer(q, text, lang)) : null;
  if (q && plain) {
    await takeAnswer(q, plain, lang);
    patch({ misses: 0 });
    return askNext(lang);
  }

  const config = useHypo.getState().config ?? (await loadHypoConfig());
  const res = config.model ? await extract(text, q, lang) : null;
  if (res) {
    patch({ llm: true });
    const handled = await applyModel(res, q, text, lang);
    if (handled === "left") return;
    if (!handled) return miss(lang);
    patch({ misses: 0 });
    return askNext(lang);
  }
  if (config.model && H().llm !== false) {
    patch({ llm: false });
    hypoEvent("fallback");
  }

  const read = q ? readWithoutModel(q, text, lang) : null;
  if (q && read) {
    await takeAnswer(q, read, lang);
    patch({ misses: 0 });
    return askNext(lang);
  }
  if (first) {
    // The opening description needs the model; without it HYPO asks question by question.
    say("hypo.fallback");
    return askNext(lang);
  }
  miss(lang);
}

function answerDocConfirm(path: FieldPath, yes: boolean): void {
  if (yes) {
    S().confirmSource(path);
    answered(path as HypoKey);
  } else {
    close(`doc:${path}`);
  }
}

// ---- Public actions ------------------------------------------------------------------------

/** Opens HYPO from the start screen (Kap. 3): the funnel in its chat channel, HYPO's greeting. */
export function startHypo(lang: Lang): void {
  const s = S();
  const role: HypoRole = s.role === "berater" ? "berater" : "kunde";
  resetHypo(role);
  s.setChannel("chat");
  // Documents dropped in the chat fill what the chat has not asked yet (the Schnellanmeldung's prefill).
  s.setMode("schnell");
  if (!s.role) s.setRole("kunde");
  hypoEvent("start", role);
  void loadHypoConfig();
  if (role === "berater") {
    say("hypo.greet.berater");
    askNext(lang);
  } else say("hypo.greet");
}

/** Back to the start screen — only before the first message (afterwards the chat is the request). */
export function closeHypo(): void {
  S().setChannel(null);
  resetHypo();
}

async function runTurn(fn: () => Promise<void> | void): Promise<void> {
  if (useHypo.getState().busy) return;
  useHypo.setState({ busy: true });
  try {
    await fn();
  } finally {
    useHypo.setState({ busy: false });
  }
}

export function sendText(raw: string, lang: Lang): Promise<void> {
  const text = raw.trim();
  if (!text) return Promise.resolve();
  return runTurn(async () => {
    const first = !H().started;
    push({ from: "user", kind: "text", text });
    patch({ started: true });
    await handleText(text, lang, first);
  });
}

/** «Ich bin Vermittler / Vertriebspartner» (Kap. 4): the partner flow, before the first message. */
export function choosePartner(lang: Lang): Promise<void> {
  return runTurn(() => {
    push({ from: "user", kind: "text", text: translate(lang, "hypo.partnerChip") });
    patch({ role: "partner", started: true });
    S().setRole("berater");
    hypoEvent("partner_chip");
    say("hypo.partner.welcome");
    askNext(lang);
  });
}

export const UNKNOWN = "__unknown";
export const SKIP = "__skip";
export const FORM = "__form";

/** A chip of the question, offer or «stimmt das?» on screen; `values` for a multiple choice. */
export function pickChip(values: string[], labels: string[], lang: Lang): Promise<void> {
  return runTurn(async () => {
    const h = H();
    push({ from: "user", kind: "text", text: labels.join(", ") || translate(lang, "hypo.chip.none") });
    patch({ started: true, misses: 0 });
    const value = values[0];
    if (h.offer === "language") {
      patch({ offer: null });
      close("offer:language");
      if (value === FORM) return leaveToForm("language");
      return askNext(lang);
    }
    if (h.offer) {
      answerOffer(h.offer, value === "Ja", lang);
      return askNext(lang);
    }
    if (h.current === "confirm") {
      await answerConfirm(value === "Ja", lang);
      return askNext(lang);
    }
    if (h.current?.startsWith("doc:")) {
      answerDocConfirm(h.current.slice(4) as FieldPath, value === "Ja");
      return askNext(lang);
    }
    const q = currentQuestion();
    if (!q) return askNext(lang);
    if (value === UNKNOWN) {
      unknownValue();
      return askNext(lang);
    }
    if (value === SKIP) {
      close(q.id);
      return askNext(lang);
    }
    switch (q.id) {
      case "emSources": {
        close("emSources");
        if (values.length === 1 && h.emTotal > 0) await takeValues([{ key: `em.${values[0]}` as HypoKey, value: h.emTotal, confidence: 1 }], lang, { card: false });
        else patch({ emSources: values });
        if (!H().pensionNoted && values.some((v) => PENSION_KEYS.includes(`em.${v}` as HypoKey))) {
          say("hypo.pension");
          patch({ pensionNoted: true });
        }
        return askNext(lang);
      }
      case "chips": {
        for (const c of chipsFor(S().ans.kn)) S().setChip(c, values.includes(c));
        answered(...chipsFor(S().ans.kn).map((c) => `ans.${c}` as HypoKey));
        close("chips");
        return askNext(lang);
      }
      case "partnerConfirm": {
        const yes = value === "Ja";
        patch({ partnerConfirmed: yes });
        say(yes ? "hypo.partner.confirmed" : "hypo.partner.notConfirmed");
        return askNext(lang);
      }
    }
    await takeAnswer(q, [{ key: q.writes[0], value, confidence: 1 }], lang);
    return askNext(lang);
  });
}

/** The first screen of the form that is not complete; the closing when all are. */
function firstOpenStep(): number {
  const s = S();
  const total = stepCount(s.mode);
  for (let n = 1; n < total; n++) {
    const screen = screenAt(s.mode, n);
    if (Object.keys(validateScreen(screen, s)).length) return n;
  }
  return total;
}

/**
 * «Weiter im Formular» (Kap. 5.6): every value is already in the funnel store; the form opens
 * on its first incomplete screen. With documents the Schnellanmeldung keeps them in front; without,
 * the Begleitete Anmeldung is the classic path.
 */
export function leaveToForm(reason: string): void {
  const s = S();
  hypoEvent("leave_form", `${reason}:${H().current ?? "start"}`);
  if (!s.files.length) s.setMode("begleitet");
  S().openAt(firstOpenStep() as never);
}

/**
 * Kap. 8: to the funnel's own summary and check page. The closing does not check the screens
 * before it, so a screen still incomplete opens first, with its errors shown.
 */
export function handOver(): void {
  const s = S();
  const n = firstOpenStep();
  const total = stepCount(s.mode);
  hypoEvent("handover", n === total ? "summary" : `form:${screenAt(s.mode, n)}`);
  if (n < total) {
    const screen = screenAt(s.mode, n);
    if (screen) useFunnelUI.getState().markAttempted(screen);
  }
  s.openAt(n as never);
}

/** The card of a document read in the chat (Kap. 7), once per file. */
export function announceFile(fileId: string): void {
  const st = useHypo.getState();
  if (st.shownFiles.includes(fileId)) return;
  useHypo.setState({ shownFiles: [...st.shownFiles, fileId] });
  push({ from: "hypo", kind: "document", fileId });
}

/** A chat value against a document (Kap. 7, Spezifikation Datenabgleich 4): the card, once per field. */
export function announceConflict(fieldId: string): void {
  const st = useHypo.getState();
  if (st.shownConflicts.includes(fieldId)) return;
  useHypo.setState({ shownConflicts: [...st.shownConflicts, fieldId] });
  push({ from: "hypo", kind: "conflict", fieldId });
}

export { flowState as hypoFlowState };
