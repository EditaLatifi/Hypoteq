/**
 * Funnel v3 UI logic that does not need React: which questions a state shows, the «+N
 * Unterlagen» badges, the question-path summaries, the header lines, the rail groups, and the
 * small rules of navigation. Pure, so it is tested in node (tests/funnelV3/ui*.test.ts).
 *
 * Texts come in through `t` / `opt` (lib/funnel-v3/useFunnelT.ts), so nothing here is German
 * unless the message file is.
 */

import type { Answers, Borrower, FunnelState, Role, Texts } from "@/lib/funnel-v3/types";
import { LANGS, isLang, type Lang, type Params } from "@/lib/funnel-v3/i18n";
import {
  GROUP_ORDER,
  effectiveBorrowers,
  reqDelta,
  type QuestionKey,
  type ReqGroup,
  type ReqReason,
  type ReqState,
  type RequirementInstance,
} from "@/lib/funnel-v3/requirements";
import { calcFinancing, type CalcInput, type CalcResult } from "@/lib/funnel-v3/calc";
import { chf, pct } from "@/lib/funnel-v3/format";
import { EMAIL_RE, type StepErrors } from "@/lib/funnel-v3/validate";

export type T = (key: string, params?: Params) => string;
export type Opt = (group: string, value: string | null | undefined) => string;

export const TOTAL_STEPS = 6;
/** The six topics of the question path (step 0 is the start screen). */
export const PATH_STEPS = [1, 2, 3, 4, 5, 6] as const;
/** The rail «Deine Unterlagen» is shown while the answers still change the list. */
export const RAIL_STEPS: readonly number[] = [1, 2, 3, 4];

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
  lieg: ["Einfamilienhaus", "Stockwerkeigentum", "Mehrfamilienhaus", "Ferienobjekt"],
  nutz: ["Selbstbewohnt", "Vermietet", "Zweitwohnsitz"],
  heizung: ["Wärmepumpe", "Fernwärme", "Holz / Pellets", "Gas", "Öl", "Unbekannt"],
  baurecht: YN,
  aufstockung: YN,
  reno: YN,
  reserviert: YN,
  angebote: YN,
  job: ["Angestellt", "Selbständig", "Pensioniert"],
  pkSe: YN,
  ab50: YN,
  kinder: YN,
  unterhalt: YN,
  kredite: YN,
  leasing: YN,
  buerge: YN,
  laufzeit: ["SARON", "2 Jahre", "3 Jahre", "5 Jahre", "10 Jahre", "Mix"],
  s3a: YN,
  schenkung: YN,
  erbe: YN,
  darlehen: YN,
  pk: YN,
};

/** Shown as large cards with an icon on desktop (chips on a phone), as in the prototype. */
export const CARD_KEYS: ReadonlySet<ChoiceKey> = new Set<ChoiceKey>(["antrag", "kn", "immo", "lieg"]);

/** The hint line under a question, where the message file has one. */
export const HINT_KEYS: Partial<Record<ChoiceKey, string>> = {
  nbDocs: "q.nbDocs.hint",
  heizung: "q.heizung.hint",
  job: "q.job.hint",
  ab50: "q.ab50.hint",
  kredite: "q.kredite.hint",
  s3a: "q.s3a.hint",
};

type VisibleState = Pick<FunnelState, "role" | "ans" | "borrowers">;

/**
 * The fields a step shows for a state, in screen order. Names are the validation's
 * (validate.ts): answer / text / amount keys, and `borrower.<i>.<key>` per borrower.
 * The step components render from this list, so conditions live in one place.
 */
export function visibleFields(step: number, state: VisibleState): string[] {
  const a = state.ans;
  const f: string[] = [];
  const jp = a.kn === "Juristische Person";
  switch (step) {
    case 1:
      if (state.role === "berater") f.push("bmail");
      f.push("antrag", "kn", "anrede", "vor", "nach", "mail");
      if (state.role === "kunde") f.push("tel");
      break;
    case 2:
      f.push("plz", "ort", "immo", "lieg", "nutz");
      if (a.immo === "Neubau") f.push("nbDocs");
      f.push("heizung", "baurecht");
      if (a.antrag === "Ablösung") {
        f.push("old", "aufstockung");
        if (a.aufstockung === "Ja") f.push("up", "zweck");
      }
      if (a.antrag === "Neue Hypothek") f.push("kaufpreis", "reno", "reserviert");
      f.push("angebote");
      break;
    case 3:
      if (jp) f.push("firma", "zeichner");
      else {
        const list = state.borrowers.length ? state.borrowers : [null];
        list.forEach((b, i) => {
          f.push(`borrower.${i}.vor`, `borrower.${i}.nach`);
          if (i === 0 && list.length === 1) f.push("inc");
          f.push(`borrower.${i}.job`);
          if (b?.job === "Selbständig") f.push(`borrower.${i}.pkSe`);
          if (i === 0 && list.length === 1) f.push("ab50");
        });
        if (list.length > 1) f.push("inc", "ab50");
        f.push("kinder");
        if (a.kinder === "Ja") f.push("unterhalt");
      }
      f.push("kredite", "leasing", "buerge");
      if (a.buerge === "Ja") f.push("buergeName");
      break;
    case 4:
      f.push("val");
      if (!jp) f.push("inc");
      f.push("laufzeit", "s3a", "schenkung", "erbe", "darlehen", "pk", "kommentar");
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

/** DOM id of a field (inputs and radio groups), shared by the steps and the focus logic. */
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

// ---- Calculation ----------------------------------------------------------------------------

export function calcInputOf(state: Pick<FunnelState, "ans" | "fin">): CalcInput {
  return {
    antrag: state.ans.antrag,
    aufstockung: state.ans.aufstockung,
    old: state.fin.old,
    up: state.fin.up,
    val: state.fin.val,
    inc: state.fin.inc,
    kn: state.ans.kn,
  };
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

/** «CHF 900'000 Ablösung + CHF 100'000 Erhöhung» / «Bei 80 % Belehnung». */
export function needSubline(state: Pick<FunnelState, "ans" | "fin">, t: T): string {
  if (state.ans.antrag === "Ablösung") {
    const parts = [t("s4.subRefinance", { amount: chf(state.fin.old) })];
    if (state.ans.aufstockung === "Ja") parts.push(t("s4.subIncrease", { amount: chf(state.fin.up) }));
    return parts.join(" + ");
  }
  return t("s4.subPurchase");
}

// ---- Header lines and question path ---------------------------------------------------------

export function customerName(txt: Pick<Texts, "vor" | "nach">): string {
  return [txt.vor, txt.nach].map((s) => (s || "").trim()).filter(Boolean).join(" ");
}

export function placeLine(txt: Pick<Texts, "plz" | "ort">): string {
  return [txt.plz, txt.ort].map((s) => (s || "").trim()).filter(Boolean).join(" ");
}

/** «Gary Gerber · 8820 Wädenswil», or «Neue Anfrage». */
export function caseLine(txt: Texts, t: T): string {
  return [customerName(txt), placeLine(txt)].filter(Boolean).join(" · ") || t("side.newRequest");
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

/** What the path shows under a finished topic (prototype DONE). Empty → «Erledigt». */
export function stepSummary(
  n: number,
  state: Pick<FunnelState, "ans" | "txt" | "fin" | "borrowers">,
  t: T,
  opt: Opt,
  docs?: { fulfilled: number; total: number }
): string {
  const a = state.ans;
  switch (n) {
    case 1:
      return [opt("antrag", a.antrag), opt("kn", a.kn)].filter(Boolean).join(" · ");
    case 2:
      return [opt("lieg", a.lieg), placeLine(state.txt)].filter(Boolean).join(" · ");
    case 3: {
      if (a.kn === "Juristische Person") return [(state.txt.firma || "").trim(), opt("kn", a.kn)].filter(Boolean).join(" · ");
      const jobs = Array.from(new Set(state.borrowers.map((b) => b.job).filter(Boolean))) as string[];
      return [customerName(state.txt), ...jobs.map((j) => opt("job", j))].filter(Boolean).join(" · ");
    }
    case 4: {
      if (!(state.fin.val > 0)) return "";
      const c = calcFinancing(calcInputOf(state));
      return `${chf(c.need)} · ${pct(c.ltv)}`;
    }
    case 5:
      return docs ? t("side.fulfilled", { ok: docs.fulfilled, total: docs.total }) : "";
    default:
      return "";
  }
}

/** The line under a topic: its summary once done, «Jetzt · …» when current, else why we ask. */
export function pathSubtitle(n: number, current: number, summary: string, t: T): string {
  if (current > n) return summary || t("side.done");
  const why = t(`step.why.${n}`);
  return current === n ? t("side.now", { why }) : why;
}

/** «6 Themen · ca. 4 Minuten · {done} erledigt». */
export function doneCount(current: number): number {
  return Math.max(0, Math.min(current - 1, TOTAL_STEPS));
}

/** The label of «Weiter»; null on the last step, which has its own actions. */
export function nextLabelKey(step: number): string | null {
  if (step >= TOTAL_STEPS) return null;
  if (step === 4) return "common.toDocs";
  if (step === 5) return "common.toFinish";
  return "common.next";
}

/** D6: a topic in the path can be opened when it is behind or already visited. */
export function canOpenStep(n: number, visited: number): boolean {
  return n >= 0 && n <= TOTAL_STEPS && n <= visited;
}

// ---- Rail ---------------------------------------------------------------------------------

/** «weil: Baurecht = Ja» in the funnel language (reasonTextDe is the German one for Salesforce). */
export function reasonLine(reason: ReqReason, t: T, opt: Opt): string {
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

/** ← / → move between topics — not while typing, not on the start screen (prototype onKey). */
export function arrowAction(c: KeyContext): "next" | "prev" | null {
  if (c.key !== "ArrowRight" && c.key !== "ArrowLeft") return null;
  if (c.defaultPrevented || c.modifier || c.editable || c.inRadioGroup || c.dialogOpen) return null;
  if (c.tag === "input" || c.tag === "textarea" || c.tag === "select") return null;
  if (c.step <= 0) return null;
  return c.key === "ArrowRight" ? "next" : "prev";
}
