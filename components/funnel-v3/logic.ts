/**
 * Funnel UI logic that does not need React: which questions a screen shows, the «+N
 * Unterlagen» badges, the question-path summaries, the header lines, the rails («Deine
 * Unterlagen», «Deine Anfrage füllt sich»), the closing gate and the small rules of
 * navigation. Pure, so it is tested in node (tests/funnelV3/ui*.test.ts).
 *
 * v5 (docs/funnel-v5/HYPOTEQ_Handover_Edita.md, chapters 1–4, 6): the funnel is a sequence of
 * screens (lib/funnel-v3/steps.ts) — Begleitet 4, Schnell 6 — so everything here is keyed by
 * the screen, never by a fixed step number.
 *
 * Texts come in through `t` / `opt` (lib/funnel-v3/useFunnelT.ts), so nothing here is German
 * unless the message file is.
 */

import {
  CHIPS,
  EMPTY_EM,
  EM_ROWS,
  chipsFor,
  type Answers,
  type Borrower,
  type DocInfo,
  type DocInfoText,
  type Eigenmittel,
  type FieldPath,
  type FunnelState,
  type Mode,
  type Role,
  type SourceMark,
  type Texts,
} from "@/lib/funnel-v3/types";
import { LANGS, isLang, type Lang, type Params } from "@/lib/funnel-v3/i18n";
import {
  GROUP_ORDER,
  effectiveBorrowers,
  getRequirement,
  reqDelta,
  reqList,
  type QuestionKey,
  type ReqGroup,
  type ReqReason,
  type ReqState,
  type RequirementInstance,
} from "@/lib/funnel-v3/requirements";
import { calcFinancing, calcInputOf as libCalcInputOf, type CalcInput, type CalcResult } from "@/lib/funnel-v3/calc";
import { chf, pct } from "@/lib/funnel-v3/format";
import { screenAt, stepCount, type Screen } from "@/lib/funnel-v3/steps";
import type { SignatureView } from "@/lib/funnel-v3/signature";
import { EMAIL_RE, type StepErrors } from "@/lib/funnel-v3/validate";

export type T = (key: string, params?: Params) => string;
export type Opt = (group: string, value: string | null | undefined) => string;

// ---- Questions ----------------------------------------------------------------------------

/** A choice question: an answer key, or a per-borrower one. Same names as the reason keys. */
export type ChoiceKey = QuestionKey;

const YN = ["Ja", "Nein"] as const;

/** Options in prototype order. Values are the German keys (spec 7); only the label is translated. */
export const OPTIONS: Record<ChoiceKey, readonly string[]> = {
  antrag: ["Neue Hypothek", "Ablösung"],
  kn: ["Natürliche Person", "Juristische Person"],
  anrede: ["Herr", "Frau"],
  immo: ["Bestehende Immobilie", "Neubau", "Bauprojekt"],
  nbDocs: YN,
  lieg: ["Einfamilienhaus", "Stockwerkeigentum", "Mehrfamilienhaus"],
  // All four values; which a borrower type is offered: NUTZUNG_OPTIONS (types.ts).
  nutz: ["Selbstbewohnt", "Vermietet", "Zweitwohnsitz", "Gewerbe"],
  baurecht: YN,
  aufstockung: YN,
  reno: YN,
  reserviert: YN,
  angebote: YN,
  job: ["Angestellt", "Selbständig", "Pensioniert"],
  pkSe: YN,
  unterhalt: YN,
  kredite: YN,
  leasing: YN,
  buerge: YN,
  steuer: YN,
  laufzeit: ["SARON", "2 Jahre", "3 Jahre", "5 Jahre", "10 Jahre", "Mix"],
};

/**
 * Shown as large cards with an icon on desktop (chips on a phone), as in the prototype. Picking
 * a card scrolls on to the next question (Handover 2 Schritt 1 «springt automatisch»).
 */
export const CARD_KEYS: ReadonlySet<ChoiceKey> = new Set<ChoiceKey>(["antrag", "kn", "immo", "lieg"]);

/** The hint line under a question, where the message file has one. */
export const HINT_KEYS: Partial<Record<ChoiceKey, string>> = {
  nbDocs: "q.nbDocs.hint",
  job: "q.job.hint",
};

/**
 * Options a state offers but does not allow (Handover 2: «Bei Ablösung ist «Bauprojekt»
 * deaktiviert», with the hint shown). The store refuses them too (store.ts answerAllowed).
 */
export function disabledOptions(ans: Pick<Answers, "antrag">, key: ChoiceKey): readonly string[] {
  if (key === "immo" && ans.antrag === "Ablösung") return ["Bauprojekt"];
  return [];
}

type VisibleState = Pick<FunnelState, "role" | "ans" | "borrowers">;

/**
 * The fields a screen shows for a state, in screen order (Handover 2, 3). Names are the
 * validation's (validate.ts): answer / text / amount keys, `em.<key>` for the Eigenmittel rows,
 * `borrower.<i>.<key>` per borrower. The screens render from this list, so the conditions live
 * in one place; it also orders the focus after a failed «Weiter».
 */
export function visibleFields(screen: Screen | null, state: VisibleState): string[] {
  const a = state.ans;
  const f: string[] = [];
  const jp = a.kn === "Juristische Person";
  switch (screen) {
    case "kontakt":
      // Handover 3: the e-mail addresses only; name, Anrede and birth date come from the ID.
      if (state.role === "berater") f.push("bmail");
      f.push("mail", "tel");
      break;
    case "anfrage":
      // Handover 2 Schritt 1: a company gives Firma and signatory here; the phone in both roles.
      if (state.role === "berater") f.push("bmail");
      f.push("antrag", "kn");
      if (jp) f.push("firma", "zeichner");
      else f.push("anrede", "vor", "nach");
      f.push("mail", "tel");
      break;
    case "objekt":
      f.push("plz", "ort", "immo");
      if (a.immo === "Neubau") f.push("nbDocs");
      f.push("lieg", "nutz");
      if (a.nutz === "Vermietet") f.push("miete");
      if (a.antrag === "Ablösung") {
        f.push("old", "aufstockung");
        if (a.aufstockung === "Ja") f.push("up", "zweck");
      }
      if (a.antrag === "Neue Hypothek") {
        f.push("kaufpreis", "kaufdatum", "reno");
        if (a.reno === "Ja") f.push("renoBetrag");
        f.push("reserviert");
      }
      if (a.antrag) {
        f.push("val");
        for (const k of EM_ROWS[a.antrag]) f.push(`em.${k}`);
      }
      f.push("laufzeit", "kommentar");
      break;
    case "personen":
      if (jp) f.push("firma", "zeichner");
      else {
        const list = state.borrowers.length ? state.borrowers : [null];
        list.forEach((b, i) => {
          f.push(`borrower.${i}.vor`, `borrower.${i}.nach`);
          if (i === 0) {
            f.push("inc", `borrower.${i}.job`);
            if (b?.job === "Selbständig") f.push(`borrower.${i}.pkSe`);
          }
          if (i === 1) f.push("inc2");
        });
      }
      f.push(...chipsFor(a.kn));
      if (a.buerge === "Ja") f.push("buergeName");
      break;
  }
  return f;
}

/** The first field with an error, in screen order — where focus goes after «Weiter». */
export function firstErrorField(errors: StepErrors, order: string[]): string | null {
  for (const f of order) if (errors[f]) return f;
  const keys = Object.keys(errors);
  return keys.length ? keys[0] : null;
}

/** DOM id of a field (inputs and radio groups), shared by the screens and the focus logic. */
export const fieldId = (field: string) => `v3-f-${field}`;

// ---- «+N Unterlagen» ----------------------------------------------------------------------

/**
 * How many documents an option adds, measured against the question's neutral answer («Nein»,
 * or unanswered) — so a selected «Ja» keeps its badge, as in the prototype. Negative or zero
 * means no badge. Per-borrower questions (job, pkSe) need the borrower's id.
 */
export function optionDelta(state: ReqState, key: ChoiceKey, value: string, borrowerId?: string): number {
  const neutral = OPTIONS[key].includes("Nein") ? "Nein" : undefined;
  if (key === "job" || key === "pkSe") {
    const borrowers = effectiveBorrowers(state);
    const id = borrowerId ?? borrowers[0]?.id;
    if (!id) return 0;
    const base: ReqState = {
      ...state,
      borrowers: borrowers.map((b) => (b.id === id ? ({ ...b, [key]: neutral } as Borrower) : b)),
    };
    return reqDelta(base, { borrower: { id, [key]: value } as { id: string } & Partial<Borrower> }).net;
  }
  const k = key as keyof Answers;
  const base: ReqState = { ...state, ans: { ...state.ans, [k]: neutral } as Answers };
  return reqDelta(base, { ans: { [k]: value } as Partial<Answers> }).net;
}

export interface DeltaLabel {
  /** «+2» — on a chip. */
  short: string;
  /** «+2 Unterlagen» / «+1 Unterlage» — on a card. */
  long: string;
}

export function deltaLabel(n: number, t: T): DeltaLabel | null {
  if (!(n > 0)) return null;
  return { short: `+${n}`, long: n === 1 ? t("rail.plusDoc") : t("rail.plusDocs", { n }) };
}

/**
 * The document hint under an Eigenmittel row (Handover 2 «jeder Betrag fordert sein
 * Dokument an»): «→ Schenkungsvertrag», the documents an amount puts on the list. At a Kauf the
 * PK-Verpfändung row says it is a security, not Eigenmittel (Handover 5). Empty when the row
 * adds nothing (Ersparnisse; Säule 3a when «ab 50» already asks for it).
 */
export function emRowHint(state: ReqState, key: keyof Eigenmittel, t: T): string {
  if (key === "pkVerp" && state.ans.antrag === "Neue Hypothek") return t("em.pkVerp.hint");
  const em: Eigenmittel = { ...EMPTY_EM, ...(state.em ?? {}), [key]: 0 };
  const before = new Set(reqList({ ...state, em }).map((r) => r.instanceId));
  const added = reqList({ ...state, em: { ...em, [key]: 1 } }).filter((r) => !before.has(r.instanceId));
  return added.length ? `→ ${added.map((r) => t(r.labelKey)).join(" · ")}` : "";
}

// ---- Calculation ----------------------------------------------------------------------------

/** lib/funnel-v3/calc.ts calcInputOf — kept here for the screens. */
export function calcInputOf(state: Pick<FunnelState, "ans" | "fin"> & Partial<Pick<FunnelState, "em" | "borrowers">>): CalcInput {
  return libCalcInputOf(state);
}

export const VERDICT_KEY: Record<CalcResult["verdict"], string> = {
  ok: "s4.verdict.ok",
  review: "s4.verdict.check",
  incomplete: "s4.verdict.missing",
};

/** Bar widths of the calculation card: the prototype scales Belehnung ×1.25, Tragbarkeit ×2.5. */
export function barWidth(value: number | null, scale: number): number {
  if (value === null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value * scale, 100);
}

/**
 * The line under the amount (prototype needSub): «CHF 900'000 Ablösung + CHF 100'000 Erhöhung»;
 * at a Kauf «Kaufpreis minus CHF 120'000 Eigenmittel» once Eigenmittel are entered, «Bei 80 %
 * Belehnung» before.
 */
export function needSubline(state: Pick<FunnelState, "ans" | "fin"> & Partial<Pick<FunnelState, "em">>, t: T): string {
  if (state.ans.antrag === "Ablösung") {
    const parts = [t("s4.subRefinance", { amount: chf(state.fin.old) })];
    if (state.ans.aufstockung === "Ja") parts.push(t("s4.subIncrease", { amount: chf(state.fin.up) }));
    return parts.join(" + ");
  }
  const c = calcFinancing(calcInputOf(state));
  if (c.emTotal > 0) return t(state.ans.reno === "Ja" ? "calc.subEquityReno" : "calc.subEquity", { amount: chf(c.emTotal) });
  return t("s4.subPurchase");
}

/**
 * Under the Eigenmittel table (Handover 2): «Eigenmittel total CHF … · x % · davon hart CHF …»,
 * and whether the 10 % warning shows (harte Eigenmittel below 10 % of the Kaufpreis).
 */
export function equityLine(c: CalcResult, t: T): { text: string; warn: string | null } {
  return {
    text: t("em.totalPct", { amount: chf(c.emTotal), pct: pct(c.emPct), hard: chf(c.hard) }),
    warn: c.hardOk ? null : t("em.hardMin"),
  };
}

// ---- Header lines and question path ---------------------------------------------------------

export function customerName(txt: Pick<Texts, "vor" | "nach">): string {
  return [txt.vor, txt.nach].map((s) => (s || "").trim()).filter(Boolean).join(" ");
}

export function placeLine(txt: Pick<Texts, "plz" | "ort">): string {
  return [txt.plz, txt.ort].map((s) => (s || "").trim()).filter(Boolean).join(" ");
}

/** «Gary Gerber · 8820 Wädenswil» (a company: its Firma), or «Neue Anfrage». */
export function caseLine(txt: Texts, t: T, kn?: Answers["kn"]): string {
  const who = kn === "Juristische Person" ? (txt.firma || "").trim() : customerName(txt);
  return [who, placeLine(txt)].filter(Boolean).join(" · ") || t("side.newRequest");
}

export interface PartnerInfo {
  status: "partner" | "hypoteq" | "unknown";
  name?: string;
  company?: string;
  initials?: string;
  degraded?: boolean;
}

/** «Eigene Anfrage» / «Erfasst von {Name}» (spec 2.1). */
export function roleLine(role: Role | null, txt: Texts, partner: PartnerInfo | null, t: T): string {
  if (role === "kunde") return t("side.ownRequest");
  if (partner && partner.status !== "unknown" && partner.name) return t("side.submittedBy", { name: partner.name });
  const own = [txt.pvor, txt.pnach].map((s) => (s || "").trim()).filter(Boolean).join(" ");
  if (own) {
    const firm = (txt.pfirma || "").trim() || t("side.newPartner");
    return t("side.submittedBy", { name: `${own} · ${firm}` });
  }
  return t("side.submittedBy", { name: t("start.advisor.title") });
}

/** The API answer, defensively: anything unexpected is «unknown» and never blocks. */
export function normalisePartner(json: unknown): PartnerInfo {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const status = j.status === "partner" || j.status === "hypoteq" ? j.status : "unknown";
  const name = typeof j.name === "string" && j.name.trim() ? j.name.trim() : undefined;
  if (status !== "unknown" && !name) return { status: "unknown", degraded: Boolean(j.degraded) };
  const company = typeof j.company === "string" && j.company.trim() ? j.company.trim() : undefined;
  const initials =
    typeof j.initials === "string" && j.initials.trim()
      ? j.initials.trim().slice(0, 2).toUpperCase()
      : name
        ? initialsOf(name)
        : undefined;
  return status === "unknown"
    ? { status, degraded: Boolean(j.degraded) }
    : { status, name, company, initials, degraded: Boolean(j.degraded) };
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** A partner lookup is worth making for this address. */
export function isLookupEmail(email: string): boolean {
  const e = (email || "").trim();
  return e.length > 0 && e.length <= 254 && EMAIL_RE.test(e);
}

/** What the path shows under a finished screen (prototype DONE). Empty → «Erledigt». */
export function screenSummary(
  screen: Screen | null,
  state: Pick<FunnelState, "ans" | "txt" | "fin" | "borrowers">,
  t: T,
  opt: Opt,
  docs?: { fulfilled: number; total: number }
): string {
  const a = state.ans;
  switch (screen) {
    case "kontakt":
      return (state.txt.mail || "").trim();
    case "upload":
      return docs ? t("side.fulfilled", { ok: docs.fulfilled, total: docs.total }) : "";
    case "anfrage":
      return [opt("antrag", a.antrag), opt("kn", a.kn)].filter(Boolean).join(" · ");
    case "objekt":
      return [opt("lieg", a.lieg), placeLine(state.txt)].filter(Boolean).join(" · ");
    case "personen": {
      if (a.kn === "Juristische Person") return [(state.txt.firma || "").trim(), opt("kn", a.kn)].filter(Boolean).join(" · ");
      const jobs = Array.from(new Set(state.borrowers.map((b) => b.job).filter(Boolean))) as string[];
      return [customerName(state.txt), ...jobs.map((j) => opt("job", j))].filter(Boolean).join(" · ");
    }
    default:
      return "";
  }
}

/** The line under a screen in the path: its summary once done, «Jetzt · …» when current, else why we ask. */
export function pathSubtitle(n: number, current: number, summary: string, why: string, t: T): string {
  if (current > n) return summary || t("side.done");
  return current === n ? t("side.now", { why }) : why;
}

/**
 * «Weiter» on step n (prototype nextLabel): «Weiter zur Anfrage» after the upload, «Zu den
 * Unterlagen» / «Zu den fehlenden Unterlagen» after the Personen; null on the last step, which
 * has its own action («Finanzierungsanfrage abschliessen»).
 */
export function nextLabelKey(mode: Mode, step: number): string | null {
  if (step >= stepCount(mode)) return null;
  const screen = screenAt(mode, step);
  if (screen === "upload") return "fast.toRequest";
  if (screen === "personen") return mode === "schnell" ? "fast.toMissing" : "common.toDocs";
  return "common.next";
}

/** D6: a screen in the path can be opened when it is behind or already visited. */
export function canOpenStep(n: number, visited: number, total: number): boolean {
  return n >= 0 && n <= total && n <= visited;
}

/**
 * The head of a screen (prototype HD): title and lead, by entry. The Schnellanmeldung's
 * prefilled screens say so; its closing is «Fehlende Unterlagen».
 */
export function screenHead(mode: Mode, screen: Screen): { titleKey: string; leadKey: string } {
  const fast = mode === "schnell";
  switch (screen) {
    case "kontakt":
      return { titleKey: "fast.s1.title", leadKey: "fast.s1.lead" };
    case "upload":
      return { titleKey: "s5.title", leadKey: "fast.s2.lead" };
    case "anfrage":
      return fast ? { titleKey: "head.fast.anfrage.title", leadKey: "head.fast.anfrage.lead" } : { titleKey: "s1.title", leadKey: "s1.lead" };
    case "objekt":
      return { titleKey: "s2.title", leadKey: fast ? "head.fast.objekt.lead" : "head.guided.objekt.lead" };
    case "personen":
      return { titleKey: "s3.title", leadKey: fast ? "head.fast.personen.lead" : "head.guided.personen.lead" };
    case "abschluss":
      return fast ? { titleKey: "fast.missingTitle", leadKey: "head.fast.abschluss.lead" } : { titleKey: "s5.title", leadKey: "head.guided.abschluss.lead" };
  }
}

/** «Begleitete Anmeldung · noch ca. 2:30 Min.» under «Fragepfad». */
export function pathLine(mode: Mode, time: string, t: T): string {
  return `${t(mode === "schnell" ? "start.mode.fast.title" : "start.mode.guided.title")} · ${t("common.timeLeft", { time })}`;
}

// ---- Rail «Deine Unterlagen» ---------------------------------------------------------------

/** «weil: Baurecht = Ja» in the funnel language (reasonTextDe is the German one for Salesforce). */
export function reasonLine(reason: ReqReason, t: T, opt: Opt): string {
  if (reason.key === "why.amount") return t("why.amount", { field: t(`em.${reason.field}`) });
  if (reason.key !== "why.because") return t(reason.key);
  const text = reason.conditions.map((c) => `${t(`qs.${c.question}`)} = ${opt(c.question, c.value)}`).join(" · ");
  return t("why.because", { reason: text });
}

export interface RailItem {
  id: string;
  label: string;
  why: string;
  ok: boolean;
}

export interface RailGroup {
  group: ReqGroup;
  name: string;
  count: number;
  items: RailItem[];
}

/**
 * The rail «Deine Unterlagen»: the requirement list grouped in GROUP_ORDER, empty groups
 * left out. With several borrowers, a per-borrower document carries the person's name.
 */
export function railGroups(
  instances: RequirementInstance[],
  state: Pick<FunnelState, "ans" | "txt" | "borrowers">,
  okIds: ReadonlySet<string>,
  t: T,
  opt: Opt
): RailGroup[] {
  const jp = state.ans.kn === "Juristische Person";
  const borrowers = state.borrowers;
  const several = !jp && borrowers.length > 1;
  const name = customerName(state.txt);
  const personOf = (inst: RequirementInstance): string => {
    if (!several || !inst.borrowerId) return "";
    const i = borrowers.findIndex((b) => b.id === inst.borrowerId);
    const display = (inst.person?.display || "").trim();
    return display || (i >= 0 ? t("s3.borrower", { n: i + 1 }) : "");
  };
  return GROUP_ORDER.map((group) => {
    const items = instances
      .filter((r) => r.group === group)
      .map((r) => {
        const who = personOf(r);
        return {
          id: r.instanceId,
          label: who ? `${t(r.labelKey)} · ${who}` : t(r.labelKey),
          why: reasonLine(r.reason, t, opt),
          ok: okIds.has(r.instanceId),
        };
      });
    let groupName = t(`grp.${group}`);
    if (group === "person") groupName = jp ? t("grp.company") : name && !several ? t("grp.personOf", { name }) : t("grp.person");
    return { group, name: groupName, count: items.length, items };
  }).filter((g) => g.items.length > 0);
}

/**
 * Handover 4.2 «Die Liste wächst nach dem Upload; der Nutzer sieht eine kurze Meldung»: the
 * requirements the documents' facts (bonus, Lohnerhöhung, ab 50) added between two lists.
 */
export function factAdditions(prev: readonly RequirementInstance[], next: readonly RequirementInstance[]): RequirementInstance[] {
  const before = new Set(prev.map((r) => r.instanceId));
  const fact = new Set(["why.bonus", "why.raise", "why.age50"]);
  return next.filter((r) => !before.has(r.instanceId) && fact.has(r.reason.key));
}

// ---- Rail «Deine Anfrage füllt sich» (Schnellanmeldung, Handover 3) -------------------------

/** The label of each prefillable field (FieldPath → i18n key). */
export const PATH_LABEL: Partial<Record<string, string>> = {
  "ans.antrag": "q.antrag",
  "ans.kn": "q.kn",
  "ans.anrede": "q.anrede",
  "ans.immo": "q.immo",
  "ans.lieg": "q.lieg",
  "ans.nutz": "q.nutz",
  "txt.vor": "s1.firstName",
  "txt.nach": "s1.lastName",
  "txt.plz": "s2.zip",
  "txt.ort": "s2.city",
  "txt.kaufdatum": "s2.purchaseDate",
  "txt.firma": "s1.company",
  "txt.zeichner": "s3.signatory",
  "fin.old": "s2.existingMortgage",
  "fin.kaufpreis": "s2.price",
  "fin.val": "s4.value",
  "fin.inc": "s3.income",
  "fin.inc2": "s3.income",
  "em.s3a": "em.s3a",
  "borrower.0.job": "q.job",
  ...Object.fromEntries(CHIPS.map((c) => [`ans.${c}`, `chip.${c}`])),
};

/** The DocInfo facts the rail lists, in reading order (Handover 3.1 «Zusätzlich»). */
export const INFO_KEYS: readonly DocInfoText[] = [
  "geb",
  "nat",
  "zivil",
  "kinder",
  "adresse",
  "wertquote",
  "grundpfand",
  "efSaldo",
  "baujahr",
  "zimmer",
  "wohnflaeche",
  "heizung",
  "kubatur",
  "versSumme",
  "bank",
  "zins",
  "laufzeit",
  "abl",
  "ag",
  "unterhaltBetrag",
  "kreditRest",
  "kreditRate",
  "leasingRate",
  "leasingRest",
  "s3aPledge",
  "pk",
  "pkVorbezug",
  "uid",
  "sitz",
];

export interface FillItem {
  path: FieldPath;
  label: string;
  value: string;
  /** «aus Lohnausweis 2025» / «… · bitte bestätigen». */
  why: string;
  unsure: boolean;
}

export interface FactItem {
  key: DocInfoText;
  label: string;
  value: string;
}

/**
 * The source document in the funnel language: the German mark carries the year («Lohnausweis
 * 2025»); other languages name the requirement.
 */
export function sourceDocLabel(mark: SourceMark, lang: Lang, t: T): string {
  if (lang === "de" || !mark.docType) return mark.doc;
  const req = getRequirement(mark.docType);
  return req ? t(req.labelKey) : mark.doc;
}

type FillState = Pick<FunnelState, "ans" | "txt" | "fin" | "em" | "borrowers" | "src" | "info">;

/** The value a prefilled field holds now, as shown. */
export function fieldValueText(state: Pick<FunnelState, "ans" | "txt" | "fin" | "em" | "borrowers">, path: FieldPath, t: T, opt: Opt): string {
  const [group, key, sub] = path.split(".");
  // Chips hold Ja / Nein: opt() names them «Ja» in the funnel language.
  if (group === "ans") return opt(key, state.ans[key as keyof Answers] as string | undefined);
  if (group === "txt") return (state.txt[key as keyof Texts] || "").trim();
  if (group === "fin") return chf(state.fin[key as keyof FunnelState["fin"]]);
  if (group === "em") return chf(state.em[key as keyof Eigenmittel]);
  if (group === "borrower" && sub === "job") return opt("job", state.borrowers[Number(key)]?.job);
  if (group === "borrower") return String((state.borrowers[Number(key)] as unknown as Record<string, string> | undefined)?.[sub] ?? "");
  return "";
}

/**
 * Handover 3 Schritt 2 «Rechte Spalte live: Deine Anfrage füllt sich mit jeder übernommenen
 * Angabe und Quelle»: the prefilled answers (with their document), then the facts read for the
 * mail and Salesforce.
 */
export function fillRailItems(state: FillState, t: T, opt: Opt, lang: Lang): { items: FillItem[]; facts: FactItem[] } {
  const items: FillItem[] = [];
  for (const [path, mark] of Object.entries(state.src) as [FieldPath, SourceMark][]) {
    if (!mark) continue;
    const value = fieldValueText(state, path, t, opt);
    if (!value) continue;
    const labelKey = PATH_LABEL[path];
    const label = labelKey ? t(labelKey) : path;
    const doc = sourceDocLabel(mark, lang, t);
    items.push({ path, label, value, unsure: mark.unsure, why: t(mark.unsure ? "fast.fromUnsure" : "fast.from", { doc }) });
  }
  const info: DocInfo = state.info || {};
  const facts: FactItem[] = INFO_KEYS.filter((k) => typeof info[k] === "string" && (info[k] as string).trim()).map((k) => ({
    key: k,
    label: t(`info.${k}`),
    value: (info[k] as string).trim(),
  }));
  return { items, facts };
}

// ---- Closing gate (Handover 6) --------------------------------------------------------------

/**
 * «Finanzierungsanfrage abschliessen» is locked until the signed Auskunftsermächtigung is
 * there or «Später nachreichen» is chosen (Handover 6): exactly `signatureView(…).canFinish`
 * (documentsSummary `.signature`), which the Auskunftsermächtigung block feeds. A copy without
 * signature, with another name or another form keeps it locked with «Erst
 * Auskunftsermächtigung unterzeichnen»; none (or one still being read) with «… hochladen».
 */
export function finishGate(view: Pick<SignatureView, "status" | "canFinish">): { enabled: boolean; labelKey: string } {
  if (view.canFinish) return { enabled: true, labelKey: "s6.submitTitle" };
  return { enabled: false, labelKey: view.status === "unsigned" ? "s6.finishBlocked" : "s6.finishBlockedUpload" };
}

// ---- Entry, language, keyboard --------------------------------------------------------------

/** `?customer=partner|direct` (also the old `?customerType=`) → the role it preselects. */
export function roleFromParams(search: string | URLSearchParams | null | undefined): Role | null {
  const p = typeof search === "string" || !search ? new URLSearchParams(search || "") : search;
  const v = (p.get("customer") || p.get("customerType") || "").trim().toLowerCase();
  if (v === "partner" || v === "berater") return "berater";
  if (v === "direct" || v === "kunde") return "kunde";
  return null;
}

/**
 * The closing's portal button for a Berater (spec 3 Schritt 6 names only «Abschliessen»;
 * partners want the way back): logged in → the dashboard, not logged in → the login, not
 * known (lookup still running or failed) → the portal root, which redirects by session.
 */
export function portalAction(session: "in" | "out" | "unknown"): { href: string; labelKey: string } {
  if (session === "in") return { href: "/portal/dashboard", labelKey: "s6.toDashboard" };
  if (session === "out") return { href: "/portal/login", labelKey: "s6.toPortalLogin" };
  return { href: "/portal", labelKey: "s6.toPortal" };
}

/**
 * How the funnel was opened. The Partnerportal links to
 * `/{lang}/funnel?customer=partner&bmail=<e-mail>&from=portal`: the Berater entry is chosen,
 * the address is filled in (so the partner is recognised at once) and the closing offers the
 * way back to the portal. A bmail that is not an address is ignored.
 */
export function entryFromParams(search: string | URLSearchParams | null | undefined): { role: Role | null; bmail: string; fromPortal: boolean } {
  const p = typeof search === "string" || !search ? new URLSearchParams(search || "") : search;
  const raw = (p.get("bmail") || "").trim();
  const bmail = isLookupEmail(raw) ? raw : "";
  const fromPortal = (p.get("from") || "").trim().toLowerCase() === "portal";
  // A portal link always means the Berater entry, even without `customer=`.
  const role = roleFromParams(p) ?? (fromPortal || bmail ? "berater" : null);
  return { role, bmail, fromPortal };
}

/**
 * The role the start screen's switch shows (DECISIONS V41): the one chosen or preset by the
 * link; without one «Kunde selbst» — the website's own links carry no role, Berater come
 * through the Partnerportal or `?customer=partner`.
 */
export function startRole(role: Role | null): Role {
  return role ?? "kunde";
}

/** The same page in another language: `/fr/funnel` → `/it/funnel`; a path without one gets it. */
export function localePath(pathname: string | null | undefined, lang: Lang): string {
  const path = pathname && pathname.startsWith("/") ? pathname : `/${pathname || ""}`;
  const parts = path.split("/");
  if (isLang(parts[1])) parts[1] = lang;
  else parts.splice(1, 0, lang);
  const out = parts.join("/").replace(/\/+$/, "");
  return out || `/${lang}`;
}

export const LANGUAGES: readonly Lang[] = LANGS;

export interface KeyContext {
  key: string;
  step: number;
  /** Lower-case tag of the event target. */
  tag: string;
  editable: boolean;
  /** The target is inside a radio group, whose arrows move the selection. */
  inRadioGroup: boolean;
  modifier: boolean;
  defaultPrevented: boolean;
  /** A dialog (e.g. the document detail) is open. */
  dialogOpen?: boolean;
}

/** ← / → move between screens — not while typing, not on the start screen (prototype onKey). */
export function arrowAction(c: KeyContext): "next" | "prev" | null {
  if (c.key !== "ArrowRight" && c.key !== "ArrowLeft") return null;
  if (c.defaultPrevented || c.modifier || c.editable || c.inRadioGroup || c.dialogOpen) return null;
  if (c.tag === "input" || c.tag === "textarea" || c.tag === "select") return null;
  if (c.step <= 0) return null;
  return c.key === "ArrowRight" ? "next" : "prev";
}
