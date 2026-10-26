/**
 * Funnel against documents (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 1 and 4): what the
 * customer entered is compared with what the recognition read, rule by rule (rules.ts), with no
 * model involved — «KI extrahiert, Code vergleicht». Pure: the funnel evaluates it before the
 * closing (the Abgleich page), the server again for Salesforce (state.ts).
 *
 *   primary source, green (≥ Schwelle_Gruen)  equal within the tolerance → ok, else the rule's
 *                                             severity (conflict / identity_conflict / hint)
 *   primary source, yellow                    «zu prüfen» — never a conflict
 *   primary source, red or none               not used → unverified
 *   secondary sources                         a deviation is a hint for the analyst only
 *   a document without a funnel answer        (Verpflichtungen) a hint for the analyst only
 *
 * Funnel answers lead (principle 2): nothing here changes an answer. A customer's choice on the
 * Abgleich page is applied by the store (`choiceFor` / `applyChoice`), and a clarified conflict
 * then reads «ok» with the choice as its evidence (6.2).
 *
 * Which document belongs to whom comes from its placement (lib/funnel-v3/placeFile.ts places by
 * the printed name); a Pass/ID that names nobody on the request is the identity conflict. Files
 * outside the list count for the case (a Leasingvertrag the answers did not mention is exactly
 * what the analyst should hear about), never for a Kreditnehmer; duplicates never.
 */

import { calcForState } from "../calc";
import { amountOf, dateOf, fieldText, yesNoOf } from "../facts";
import type { V3Analysis } from "../files";
import { personScore } from "../placeFile";
import { effectiveBorrowers, reqList, type PersonRef, type RequirementInstance } from "../requirements";
import type { Borrower, FunnelState } from "../types";
import { ampelOf, FALLBACK_RULES, SECONDARY_TOLERANCE_PCT, sourceKeyOf, sourceTypes, type Ampel, type PruefRegel } from "./rules";

export type FieldResult = "ok" | "hint" | "conflict" | "identity_conflict" | "unverified" | "to_check";
export type ValueKind = "amount" | "date" | "text" | "name" | "address" | "presence";

/** One file as the comparison sees it (client: FileEntry; server: the submitted document row). */
export interface AbgleichDoc {
  id: string;
  /** The requirement instance it is placed on; null for «Weitere Dateien». */
  instanceId: string | null;
  analysis: V3Analysis | null | undefined;
  /** Kind of a file outside the list; a duplicate is never counted (it would add up twice). */
  extraKind?: string | null;
  /** Values a person corrected in the document detail: they win, as read for sure. */
  humanEdits?: Record<string, string> | null;
}

export type AbgleichState = Pick<FunnelState, "ans" | "txt" | "fin" | "borrowers"> & Partial<Pick<FunnelState, "em" | "info">>;

/** What the customer picked on the Abgleich page (6.2 `customerChoice`). */
export interface CustomerChoice {
  value: number | string;
  chosenSource: "funnel" | "document";
  at: string;
  /** The funnel's value before a document value replaced it («der Originalwert bleibt protokolliert»). */
  original?: number | string;
}

export interface ExtractedValue {
  /** HYPOTEQ's source key («lohnausweis»). */
  docType: string;
  /** The catalogue type / requirement id («lohnausweise»). */
  typeId: string;
  instanceId: string | null;
  docId: string;
  /** The catalogue field read («Bruttolohn»); several joined for a computed value. */
  field: string;
  value: number | string;
  /** As shown («CHF 110'310», «8000 Zürich»). */
  display: string;
  confidence: number;
  ampel: Ampel;
  /** Where on the document (4.1 `sourceRef`), as the recognition gave it. */
  sourceRef: string | null;
  role: "primary" | "secondary";
}

export interface AbgleichField {
  /** Unique within the request: the rule key, with the borrower or the part («jahreseinkommen:b1»). */
  id: string;
  key: string;
  /** Schenkung / Darlehen / Erbe, Leasing / Kredit / Unterhalt, Baujahr / Kubatur. */
  part?: string;
  borrowerId?: string;
  /** «Max Mustermann». */
  person?: string;
  kind: ValueKind;
  funnelValue: number | string | null;
  funnelDisplay: string;
  extracted: ExtractedValue[];
  result: FieldResult;
  /** The primary value the funnel answer disagrees with (conflict, to_check). */
  against?: ExtractedValue;
  /** messages abg.hint.* — the customer's explanation box (10.5). */
  explanationKey?: string;
  /** The printed name of an identity conflict («nameDok»). */
  nameOnDocument?: string;
  /** Where a chosen document value goes; absent where none can be chosen (identity, a total). */
  choosable: boolean;
  customerChoice?: CustomerChoice;
}

export interface AbgleichResult {
  fields: AbgleichField[];
  /** What the Abgleich page shows: conflicts and identity conflicts (Spezifikation 3). */
  conflicts: AbgleichField[];
  /** Identity conflicts not resolved — the only hard stop (principle 4). */
  blocking: AbgleichField[];
  summary: { ok: number; hint: number; conflict: number; identityConflict: number; toCheck: number; unverified: number };
}

export interface AbgleichInput {
  state: AbgleichState;
  docs: readonly AbgleichDoc[];
  rules?: readonly PruefRegel[];
  choices?: Readonly<Record<string, CustomerChoice>>;
}

// ---- normalisation (Spezifikation 4: trim, case, accents, separators, ISO dates) ----------

/** «Zürich», «ZURICH», «Zuerich» → «zurich». */
export function normText(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** «05.03.1985» / «1985-03-05» → «1985-03-05»; "" when unreadable. */
export function isoDate(v: string | number | null | undefined): string {
  const d = dateOf(v).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return d ? `${d[3]}-${d[2]}-${d[1]}` : "";
}

const chfText = (n: number) => "CHF " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");

/** Equal within `pct` % of the larger value (0: equal to the franc). */
export function withinTolerance(funnel: number, doc: number, pct: number): boolean {
  if (pct <= 0) return Math.round(funnel) === Math.round(doc);
  return Math.abs(funnel - doc) <= (Math.max(Math.abs(funnel), Math.abs(doc)) * pct) / 100;
}

/** `Nur_Unterschreitung`: only a document value below the funnel's (less the tolerance) deviates. */
export function deviates(funnel: number, doc: number, pct: number, onlyBelow: boolean): boolean {
  if (onlyBelow) return doc < funnel * (1 - pct / 100) - 0.5;
  return !withinTolerance(funnel, doc, pct);
}

// ---- reading the documents -------------------------------------------------------------

interface Placed {
  doc: AbgleichDoc;
  analysis: V3Analysis;
  /** The requirement it is placed on (borrower documents carry the borrower). */
  inst: RequirementInstance | null;
  typeId: string;
}

type Reader = (p: Placed) => { value: number | string; display: string; field: string; confidence: number; sourceRef: string | null } | null;

const conf = (a: V3Analysis, keys: string[]) => {
  const cs = keys.map((k) => a.fields?.[k]?.confidence).filter((c): c is number => typeof c === "number");
  return cs.length ? Math.min(...cs) : 0;
};
const refOf = (a: V3Analysis, keys: string[]) => {
  const refs = keys.map((k) => (a.fields?.[k] as { sourceRef?: string | null } | undefined)?.sourceRef).filter((r): r is string => !!r);
  return refs.length ? refs.join(" · ") : null;
};

/** An amount field. `times` turns a monthly figure into a yearly one. */
const amount = (key: string, times = 1): Reader => (p) => {
  const n = amountOf(fieldText(p.analysis, key));
  if (!n) return null;
  return { value: n * times, display: chfText(n * times), field: key, confidence: conf(p.analysis, [key]), sourceRef: refOf(p.analysis, [key]) };
};

/** The yearly salary of a payslip: Monatslohn × 13 when a 13th salary is paid, else × 12. */
const payslipYear: Reader = (p) => {
  const monthly = amountOf(fieldText(p.analysis, "Monatslohn brutto"));
  if (!monthly) return null;
  const t = fieldText(p.analysis, "13. Monatslohn");
  const thirteenth = amountOf(t) > 0 || yesNoOf(t) === true;
  const keys = ["Monatslohn brutto", ...(t ? ["13. Monatslohn"] : [])];
  const year = monthly * (thirteenth ? 13 : 12);
  return { value: year, display: chfText(year), field: keys.join(" · "), confidence: conf(p.analysis, keys), sourceRef: refOf(p.analysis, keys) };
};

const text = (key: string): Reader => (p) => {
  const v = fieldText(p.analysis, key);
  return v ? { value: v, display: v, field: key, confidence: conf(p.analysis, [key]), sourceRef: refOf(p.analysis, [key]) } : null;
};

const date = (key: string): Reader => (p) => {
  const iso = isoDate(fieldText(p.analysis, key));
  return iso ? { value: iso, display: dateOf(iso), field: key, confidence: conf(p.analysis, [key]), sourceRef: refOf(p.analysis, [key]) } : null;
};

/** The printed name: the ID's «Vornamen Name», else the person the document belongs to. */
const printedName: Reader = (p) => {
  const first = fieldText(p.analysis, "Vornamen");
  const last = fieldText(p.analysis, "Name");
  if (last) {
    const keys = first ? ["Vornamen", "Name"] : ["Name"];
    return { value: [first, last].filter(Boolean).join(" "), display: [first, last].filter(Boolean).join(" "), field: keys.join(" · "), confidence: conf(p.analysis, keys), sourceRef: refOf(p.analysis, keys) };
  }
  const name = (p.analysis.personName || "").trim();
  return name ? { value: name, display: name, field: "personName", confidence: p.analysis.confidence ?? 0, sourceRef: null } : null;
};

/** PLZ and Ort of the object (Grundbuchauszug), with the street for display. */
const placeOf: Reader = (p) => {
  const plz = fieldText(p.analysis, "PLZ");
  const ort = fieldText(p.analysis, "Ort");
  const adresse = fieldText(p.analysis, "Adresse");
  const fromAddress = adresse.match(/\b(\d{4})\s+([^\d,]+)$/);
  const zip = plz || fromAddress?.[1] || "";
  const city = ort || fromAddress?.[2]?.trim() || "";
  if (!zip && !city) return null;
  const keys = [plz ? "PLZ" : "", ort ? "Ort" : "", !plz || !ort ? "Adresse" : ""].filter(Boolean);
  const display = [adresse && !fromAddress ? adresse : "", [zip, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { value: [zip, city].filter(Boolean).join(" "), display: display || [zip, city].join(" "), field: keys.join(" · "), confidence: conf(p.analysis, keys), sourceRef: refOf(p.analysis, keys) };
};

/** Free text that should name the object's PLZ (Kaufvertrag «Objekt», Verkaufsdokumentation). */
const objectText = (key: string): Reader => text(key);

/** A building volume in m³ (Kubatur). */
const volume = (key: string): Reader => (p) => {
  const n = amountOf(fieldText(p.analysis, key));
  if (!n) return null;
  return { value: n, display: `${n.toLocaleString("de-CH").replace(/’/g, "'")} m³`, field: key, confidence: conf(p.analysis, [key]), sourceRef: refOf(p.analysis, [key]) };
};

/** The Kubatur of the same rule (baujahr_kubatur): Gebäudeversicherung «Volumen» against the Verkaufsdokumentation. */
const KUBATUR: Record<string, Reader> = { gvz: volume("Volumen"), verkaufsdoku: volume("Kubatur") };

/** What each rule reads from each catalogue type. */
const READERS: Record<string, Record<string, Reader>> = {
  name_kreditnehmer: { id: printedName, lohnausweise: printedName, steuer: printedName, betreibung: printedName },
  geburtsdatum: { id: date("Geburtsdatum"), pk: date("Geburtsdatum") },
  nationalitaet_bewilligung: { id: text("Nationalität") },
  jahreseinkommen: { lohnausweise: amount("Bruttolohn"), lohnabrechnungen: payslipYear, steuer: amount("Einkünfte unselbständig") },
  einkommen_selbstaendig: { abschluss_se: amount("Reingewinn"), steuer: amount("Einkünfte selbständig") },
  renteneinkommen: { rente: amount("Rente pro Monat", 12), steuer: amount("Renteneinkünfte") },
  eigenmittel_total: { vermoegen: amount("Saldo total"), s3a: amount("Guthaben"), police: amount("Rückkaufswert"), pkvorbezug: amount("Betrag"), pk: amount("Vorbezug für Wohneigentum möglich"), steuer: amount("Vermögen") },
  eigenmittel_3a: { s3a: amount("Guthaben"), police: amount("Rückkaufswert") },
  eigenmittel_pk_vorbezug: { pkvorbezug: amount("Betrag"), pk: amount("Vorbezug für Wohneigentum möglich") },
  eigenmittel_schenkung_darlehen_erbe: { schenkung: amount("Betrag"), darlehen: amount("Betrag"), erbe: amount("Betrag") },
  kaufpreis: { kaufvertrag: amount("Kaufpreis"), reservation: amount("Kaufpreis"), verkaufsdoku: amount("Verkaufspreis") },
  objekt_adresse: { grundbuch: placeOf, kaufvertrag: objectText("Objekt"), gvz: placeOf, verkaufsdoku: objectText("Objekt") },
  bestehende_hypothek_betrag: { produkt: amount("Betrag"), hyp_zins: amount("Kapital"), steuer: amount("Hypothekarschuld") },
  mietzins_rendite: { mieterspiegel: amount("Mietzinseinnahmen pro Jahr") },
  verpflichtungen: { leasing: amount("Leasingrate"), kredit: amount("Monatsrate"), unterhalt: amount("Unterhaltsbeitrag"), steuer: amount("Unterhaltsbeiträge"), betreibung: text("Betreibungen") },
  baujahr_kubatur: { gvz: text("Erstellungsjahr"), verkaufsdoku: text("Baujahr") },
};

// ---- the fields ---------------------------------------------------------------------------

interface Ctx {
  state: AbgleichState;
  placed: Placed[];
  borrowers: Borrower[];
  people: Map<string, PersonRef>;
  rules: Map<string, PruefRegel>;
  choices: Readonly<Record<string, CustomerChoice>>;
}

function extract(ctx: Ctx, rule: PruefRegel, role: "primary" | "secondary", filter: (p: Placed) => boolean, only?: readonly string[], readersOf?: Record<string, Reader>): ExtractedValue[] {
  const sources = role === "primary" ? rule.primary : rule.secondary;
  const types = sourceTypes(rule.key, sources).filter((t) => !only || only.includes(t));
  const readers = readersOf ?? READERS[rule.key] ?? {};
  const out: ExtractedValue[] = [];
  for (const p of ctx.placed) {
    if (!types.includes(p.typeId) || !filter(p)) continue;
    const read = readers[p.typeId]?.(p);
    if (!read) continue;
    out.push({
      docType: sourceKeyOf(rule.key, p.typeId, sources),
      typeId: p.typeId,
      instanceId: p.inst?.instanceId ?? p.doc.instanceId,
      docId: p.doc.id,
      field: read.field,
      value: read.value,
      display: read.display,
      confidence: read.confidence,
      ampel: ampelOf(read.confidence, rule),
      sourceRef: read.sourceRef,
      role,
    });
  }
  return out;
}

const ofBorrower = (b: Borrower | undefined) => (p: Placed) => !!b && p.inst?.borrowerId === b.id;
const caseLevel = () => true;

/** Several documents adding up to one value (the Eigenmittel, several mortgage tranches, PK + AHV). */
function total(values: ExtractedValue[], as: Omit<ExtractedValue, "value" | "display" | "confidence" | "ampel" | "sourceRef" | "field" | "docId" | "instanceId">, rule: PruefRegel): ExtractedValue | null {
  if (!values.length) return null;
  if (values.length === 1) return values[0];
  const sum = values.reduce((n, v) => n + Number(v.value), 0);
  const c = Math.min(...values.map((v) => v.confidence));
  return { ...as, docId: values.map((v) => v.docId).join(","), instanceId: values[0].instanceId, field: [...new Set(values.map((v) => v.field))].join(" + "), value: sum, display: chfText(sum), confidence: c, ampel: ampelOf(c, rule), sourceRef: null };
}

/** The average over the business years (Spezifikation 4: «Ø letzte 3 Jahre»). */
function average(values: ExtractedValue[], rule: PruefRegel): ExtractedValue | null {
  if (values.length <= 1) return values[0] ?? null;
  const avg = values.reduce((n, v) => n + Number(v.value), 0) / values.length;
  const c = Math.min(...values.map((v) => v.confidence));
  return { ...values[0], docId: values.map((v) => v.docId).join(","), field: `Ø ${values[0].field}`, value: avg, display: chfText(avg), confidence: c, ampel: ampelOf(c, rule), sourceRef: null };
}

interface Spec {
  id: string;
  key: string;
  part?: string;
  borrower?: Borrower;
  kind: ValueKind;
  funnel: number | string | null;
  funnelDisplay: string;
  primary: ExtractedValue[];
  /** The one primary value compared (a total or an average of `primary`). */
  compared: ExtractedValue | null;
  secondary: ExtractedValue[];
  explanationKey?: string;
  choosable: boolean;
}

function same(kind: ValueKind, funnel: number | string, doc: number | string, pct: number, onlyBelow: boolean, person?: PersonRef): boolean {
  switch (kind) {
    case "amount":
      return !deviates(Number(funnel), Number(doc), pct, onlyBelow);
    case "date":
      return isoDate(String(funnel)) === isoDate(String(doc));
    case "name":
      return person ? personScore(String(doc), person) > 0 : normText(String(funnel)) === normText(String(doc));
    case "address": {
      const f = normText(String(funnel));
      const d = normText(String(doc));
      const zipF = f.match(/\b\d{4}\b/)?.[0];
      const zipD = d.match(/\b\d{4}\b/)?.[0];
      if (zipF && zipD && zipF !== zipD) return false;
      const cityF = f.replace(/\b\d{4}\b/, "").trim();
      const cityD = d.replace(/\b\d{4}\b/, "").trim();
      return !cityF || !cityD || cityD.includes(cityF) || cityF.includes(cityD);
    }
    case "text":
    case "presence":
      return normText(String(funnel)) === normText(String(doc));
  }
}

function judge(ctx: Ctx, rule: PruefRegel, s: Spec): AbgleichField {
  const person = s.borrower ? ctx.people.get(s.borrower.id) : undefined;
  const choice = ctx.choices[s.id];
  const base: AbgleichField = {
    id: s.id,
    key: s.key,
    ...(s.part ? { part: s.part } : {}),
    ...(s.borrower ? { borrowerId: s.borrower.id, person: person?.display } : {}),
    kind: s.kind,
    funnelValue: s.funnel,
    funnelDisplay: s.funnelDisplay,
    extracted: [...s.primary, ...(s.compared && !s.primary.includes(s.compared) ? [s.compared] : []), ...s.secondary],
    result: "unverified",
    ...(s.explanationKey ? { explanationKey: s.explanationKey } : {}),
    choosable: s.choosable,
  };
  const c = s.compared;
  const secondaryPct = Math.max(rule.tolerancePct, SECONDARY_TOLERANCE_PCT[rule.key] ?? 0);
  const secondaryOff = (ref: number | string | null) =>
    ref !== null && s.secondary.some((v) => v.ampel === "green" && !same(s.kind, ref, v.value, secondaryPct, rule.onlyBelow, person));

  if (s.funnel === null) {
    // No answer to hold the document against (Geburtsdatum, Baujahr …): the documents among themselves.
    if (c && c.ampel !== "red") base.result = secondaryOff(c.value) ? "hint" : "unverified";
    return base;
  }
  if (!c || c.ampel === "red") {
    base.result = secondaryOff(s.funnel) ? "hint" : "unverified";
    return base;
  }
  if (c.ampel === "yellow") return { ...base, result: "to_check", against: c };
  // A conflict the customer clarified reads «ok», the choice its evidence (6.2) — also when the
  // document's value was taken over and the two now agree; an identity conflict has no choice.
  if (choice && rule.severity === "conflict" && s.choosable) {
    return { ...base, result: "ok", against: c, customerChoice: choice };
  }
  if (same(s.kind, s.funnel, c.value, rule.tolerancePct, rule.onlyBelow, person)) {
    base.result = secondaryOff(s.funnel) ? "hint" : "ok";
    return base;
  }
  const out: AbgleichField = { ...base, result: rule.severity, against: c };
  if (rule.severity === "identity_conflict") out.nameOnDocument = String(c.value);
  return out;
}

const pick = (key: string, ctx: Ctx) => ctx.rules.get(key);
const name = (b: Borrower, i: number, txt: AbgleichState["txt"]) => [(i === 0 ? txt.vor || b.vor : b.vor).trim(), (i === 0 ? txt.nach || b.nach : b.nach).trim()].filter(Boolean).join(" ");
const sid = (key: string, ...parts: (string | undefined)[]) => [key, ...parts.filter(Boolean)].join(":");

function specs(ctx: Ctx): { rule: PruefRegel; spec: Spec }[] {
  const out: { rule: PruefRegel; spec: Spec }[] = [];
  const { state } = ctx;
  const { ans, txt, fin } = state;
  const em = state.em;
  const isJur = ans.kn === "Juristische Person";
  const add = (rule: PruefRegel | undefined, spec: Omit<Spec, "compared"> & { compared?: ExtractedValue | null }) => {
    if (!rule) return;
    if (spec.funnel === null && !spec.primary.length && !spec.secondary.length) return;
    out.push({ rule, spec: { ...spec, compared: spec.compared === undefined ? spec.primary[0] ?? null : spec.compared } });
  };
  const amountSpec = (key: string, rule: PruefRegel, funnel: number, filter: (p: Placed) => boolean, extra: Partial<Spec> & { combine?: "total" | "average"; only?: readonly string[] } = {}) => {
    const primary = extract(ctx, rule, "primary", filter, extra.only);
    const secondary = extract(ctx, rule, "secondary", filter);
    const compared = extra.combine === "average" ? average(primary, rule) : extra.combine === "total" ? total(primary, { docType: primary[0]?.docType ?? "", typeId: primary[0]?.typeId ?? "", role: "primary" }, rule) : undefined;
    if (funnel <= 0 && !primary.length) return;
    add(rule, {
      id: extra.id ?? key,
      key: rule.key,
      kind: "amount",
      funnel: funnel > 0 ? funnel : null,
      funnelDisplay: funnel > 0 ? chfText(funnel) : "",
      primary,
      secondary,
      choosable: extra.choosable ?? true,
      ...(compared !== undefined ? { compared } : {}),
      ...(extra.part ? { part: extra.part } : {}),
      ...(extra.borrower ? { borrower: extra.borrower } : {}),
      ...(extra.explanationKey ? { explanationKey: extra.explanationKey } : {}),
    });
  };

  // ---- per Kreditnehmer: name, birth date, nationality, income
  if (!isJur) {
    ctx.borrowers.forEach((b, i) => {
      const display = name(b, i, txt);
      const mine = ofBorrower(b);
      const r = pick("name_kreditnehmer", ctx);
      if (r && display) {
        add(r, { id: sid(r.key, b.id), key: r.key, borrower: b, kind: "name", funnel: display, funnelDisplay: display, primary: extract(ctx, r, "primary", mine), secondary: extract(ctx, r, "secondary", mine), explanationKey: "abg.hint.identity", choosable: false });
      }
      for (const key of ["geburtsdatum", "nationalitaet_bewilligung"]) {
        const rr = pick(key, ctx);
        if (!rr) continue;
        add(rr, { id: sid(key, b.id), key, borrower: b, kind: key === "geburtsdatum" ? "date" : "text", funnel: null, funnelDisplay: "", primary: extract(ctx, rr, "primary", mine), secondary: extract(ctx, rr, "secondary", mine), choosable: false });
      }
      const income = i === 0 ? fin.inc : i === 1 ? fin.inc2 || 0 : 0;
      const job = b.job;
      const key = job === "Selbständig" ? "einkommen_selbstaendig" : job === "Pensioniert" ? "renteneinkommen" : "jahreseinkommen";
      const ir = pick(key, ctx);
      if (ir) {
        amountSpec(sid(key, b.id), ir, i < 2 ? income : 0, mine, {
          id: sid(key, b.id),
          borrower: b,
          choosable: i < 2,
          combine: key === "einkommen_selbstaendig" ? "average" : "total",
          explanationKey: key === "jahreseinkommen" ? "abg.hint.income" : key === "einkommen_selbstaendig" ? "abg.hint.selfEmployed" : undefined,
        });
      }
    });
  }

  // ---- Eigenmittel
  if (em) {
    const calc = calcForState(state);
    const r = pick("eigenmittel_total", ctx);
    if (r && ans.antrag === "Neue Hypothek") {
      // The PK-Vorbezug counts with what was entered — the PK-Ausweis states what would be possible.
      const primary = extract(ctx, r, "primary", caseLevel);
      const confirmed = primary.filter((v) => v.typeId === "pkvorbezug");
      const usable = primary.filter((v) => v.typeId !== "pk" || !confirmed.length).map((v) => (v.typeId === "pk" && Number(v.value) > em.pkVor ? { ...v, value: em.pkVor, display: chfText(em.pkVor) } : v));
      const compared = total(usable.filter((v) => Number(v.value) > 0), { docType: "kontoauszug", typeId: "vermoegen", role: "primary" }, r);
      if (calc.emTotal > 0 || primary.length) {
        add(r, { id: r.key, key: r.key, kind: "amount", funnel: calc.emTotal > 0 ? calc.emTotal : null, funnelDisplay: calc.emTotal > 0 ? chfText(calc.emTotal) : "", primary, compared, secondary: extract(ctx, r, "secondary", caseLevel), explanationKey: "abg.hint.equity", choosable: true });
      }
    }
    const r3 = pick("eigenmittel_3a", ctx);
    if (r3) amountSpec(r3.key, r3, em.s3a, caseLevel, { combine: "total" });
    const rpk = pick("eigenmittel_pk_vorbezug", ctx);
    if (rpk) {
      // The confirmation of the withdrawal wins over what the PK-Ausweis says is possible.
      const confirmed = extract(ctx, rpk, "primary", caseLevel, ["pkvorbezug"]);
      amountSpec(rpk.key, rpk, em.pkVor, caseLevel, { only: confirmed.length ? ["pkvorbezug"] : ["pk"], explanationKey: "abg.hint.pk" });
    }
    const rs = pick("eigenmittel_schenkung_darlehen_erbe", ctx);
    if (rs) {
      for (const [part, type, value] of [["schenkung", "schenkung", em.schenk], ["darlehen", "darlehen", em.darl], ["erbe", "erbe", em.erbe]] as const) {
        amountSpec(sid(rs.key, part), rs, value, caseLevel, { id: sid(rs.key, part), part, only: [type], combine: "total" });
      }
    }
  }

  // ---- Objekt and Finanzierung
  const rk = pick("kaufpreis", ctx);
  if (rk && ans.antrag === "Neue Hypothek") amountSpec(rk.key, rk, fin.kaufpreis, caseLevel, { explanationKey: "abg.hint.price" });
  const ra = pick("objekt_adresse", ctx);
  if (ra) {
    const place = [txt.plz.trim(), txt.ort.trim()].filter(Boolean).join(" ");
    add(ra, { id: ra.key, key: ra.key, kind: "address", funnel: place || null, funnelDisplay: place, primary: extract(ctx, ra, "primary", caseLevel), secondary: extract(ctx, ra, "secondary", caseLevel), explanationKey: "abg.hint.address", choosable: true });
  }
  const rh = pick("bestehende_hypothek_betrag", ctx);
  if (rh && ans.antrag === "Ablösung") {
    const products = extract(ctx, rh, "primary", caseLevel, ["produkt"]);
    amountSpec(rh.key, rh, fin.old, caseLevel, { only: products.length ? ["produkt"] : ["hyp_zins"], combine: "total" });
  }
  const rm = pick("mietzins_rendite", ctx);
  if (rm) amountSpec(rm.key, rm, fin.miete, caseLevel, {});

  // ---- Verpflichtungen: a document the answers do not mention is a hint (4 «Richtung des Abgleichs»)
  const rv = pick("verpflichtungen", ctx);
  if (rv) {
    for (const [part, type, answer] of [["leasing", "leasing", ans.leasing], ["kredit", "kredit", ans.kredite], ["unterhalt", "unterhalt", ans.unterhalt]] as const) {
      const primary = extract(ctx, rv, "primary", caseLevel, [type]);
      if (answer !== "Ja" && !primary.length) continue;
      add(rv, { id: sid(rv.key, part), key: rv.key, part, kind: "presence", funnel: answer === "Ja" ? "Ja" : "Nein", funnelDisplay: answer === "Ja" ? "Ja" : "Nein", primary, compared: primary[0] ? { ...primary[0], value: "Ja", display: primary[0].display } : null, secondary: [], choosable: false });
    }
    // The tax return's Unterhaltsbeiträge and the Betreibungsauszug's entries, without an answer.
    const tax = extract(ctx, rv, "secondary", caseLevel, ["steuer"]).filter((v) => Number(v.value) > 0);
    if (tax.length && ans.unterhalt !== "Ja") {
      add(rv, { id: sid(rv.key, "unterhalt", "steuer"), key: rv.key, part: "unterhalt", kind: "presence", funnel: "Nein", funnelDisplay: "Nein", primary: [], compared: null, secondary: tax, choosable: false });
    }
    const pursuits = extract(ctx, rv, "secondary", caseLevel, ["betreibung"]).filter((v) => !/^(keine?|0|nein|none|aucune?|nessuna?)\b/i.test(String(v.value).trim()));
    if (pursuits.length) {
      add(rv, { id: sid(rv.key, "betreibung"), key: rv.key, part: "betreibung", kind: "presence", funnel: "Nein", funnelDisplay: "", primary: [], compared: null, secondary: pursuits, choosable: false });
    }
  }

  // ---- Baujahr: the Gebäudeversicherung against the Verkaufsdokumentation (no funnel answer)
  const rb = pick("baujahr_kubatur", ctx);
  if (rb) {
    const primary = extract(ctx, rb, "primary", caseLevel).map((v) => ({ ...v, value: String(v.value).match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1] ?? v.value }));
    const secondary = extract(ctx, rb, "secondary", caseLevel).map((v) => ({ ...v, value: String(v.value).match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1] ?? v.value }));
    add(rb, { id: sid(rb.key, "baujahr"), key: rb.key, part: "baujahr", kind: "text", funnel: null, funnelDisplay: "", primary, secondary, choosable: false });
    // HYPOTEQ 26.10. (Abnahme Feldschlüssel): the Kubatur too, within the rule's tolerance.
    const kp = extract(ctx, rb, "primary", caseLevel, undefined, KUBATUR);
    const ks = extract(ctx, rb, "secondary", caseLevel, undefined, KUBATUR);
    add(rb, { id: sid(rb.key, "kubatur"), key: rb.key, part: "kubatur", kind: "amount", funnel: null, funnelDisplay: "", primary: kp, secondary: ks, choosable: false });
  }

  return out;
}

/** The identity conflict of a Pass/ID nobody on the request is named on, placed nowhere (two borrowers). */
function strayIds(ctx: Ctx): { rule: PruefRegel; spec: Spec }[] {
  const r = pick("name_kreditnehmer", ctx);
  const kn1 = ctx.borrowers[0];
  if (!r || !kn1 || ctx.state.ans.kn === "Juristische Person") return [];
  const display = name(kn1, 0, ctx.state.txt);
  const people = [...ctx.people.values()];
  const out: { rule: PruefRegel; spec: Spec }[] = [];
  for (const p of ctx.placed) {
    if (p.inst || p.analysis.docTypeId !== "id") continue;
    const printed = printedName(p);
    if (!printed || people.some((person) => personScore(String(printed.value), person) > 0)) continue;
    const v: ExtractedValue = { docType: "pass_id", typeId: "id", instanceId: null, docId: p.doc.id, field: printed.field, value: printed.value, display: printed.display, confidence: printed.confidence, ampel: ampelOf(printed.confidence, r), sourceRef: printed.sourceRef, role: "primary" };
    out.push({ rule: r, spec: { id: sid(r.key, "doc", p.doc.id), key: r.key, borrower: kn1, kind: "name", funnel: display, funnelDisplay: display, primary: [v], compared: v, secondary: [], explanationKey: "abg.hint.identity", choosable: false } });
  }
  return out;
}

export function evaluateAbgleich(input: AbgleichInput): AbgleichResult {
  const rules = new Map((input.rules ?? FALLBACK_RULES).filter((r) => r.active).map((r) => [r.key, r]));
  const instances = reqList(input.state as Parameters<typeof reqList>[0]);
  const byInstance = new Map(instances.map((i) => [i.instanceId, i]));
  const borrowers = input.state.ans.kn === "Juristische Person" ? [] : effectiveBorrowers(input.state as Parameters<typeof effectiveBorrowers>[0]);
  const people = new Map<string, PersonRef>();
  for (const i of instances) if (i.borrowerId && i.person && !people.has(i.borrowerId)) people.set(i.borrowerId, i.person);
  borrowers.forEach((b, idx) => {
    if (!people.has(b.id)) {
      const n = name(b, idx, input.state.txt);
      const parts = n.split(/\s+/);
      people.set(b.id, { kind: "borrower", borrowerId: b.id, first: parts.slice(0, -1).join(" "), last: parts.at(-1) ?? "", display: n });
    }
  });
  const placed: Placed[] = [];
  for (const doc of input.docs) {
    const a = doc.analysis;
    if (!a || a.status !== "done" || !a.docTypeId) continue;
    if ((doc.extraKind ?? a.extraKind) === "duplicate") continue;
    const edits = Object.entries(doc.humanEdits ?? {}).filter(([, v]) => typeof v === "string");
    const analysis = edits.length ? { ...a, fields: { ...a.fields, ...Object.fromEntries(edits.map(([k, v]) => [k, { value: v, confidence: 1 }])) } } : a;
    const inst = doc.instanceId ? byInstance.get(doc.instanceId) ?? null : null;
    // On the list: the requirement's type (a guarantor's ID is «b_id», never a borrower's «id»).
    placed.push({ doc, analysis, inst, typeId: inst?.id ?? a.docTypeId });
  }
  const ctx: Ctx = { state: input.state, placed, borrowers, people, rules, choices: input.choices ?? {} };
  const fields = [...specs(ctx), ...strayIds(ctx)].map(({ rule, spec }) => judge(ctx, rule, spec));
  const conflicts = fields.filter((f) => f.result === "conflict" || f.result === "identity_conflict" || !!f.customerChoice);
  const blocking = fields.filter((f) => f.result === "identity_conflict");
  const count = (r: FieldResult) => fields.filter((f) => f.result === r).length;
  return {
    fields,
    conflicts,
    blocking,
    summary: { ok: count("ok"), hint: count("hint"), conflict: count("conflict"), identityConflict: count("identity_conflict"), toCheck: count("to_check"), unverified: count("unverified") },
  };
}

// ---- the customer's choice ------------------------------------------------------------------

/** The answers a chosen document value changes: path → new value. Empty where nothing can be chosen. */
export function choicePatch(field: AbgleichField, value: number | string, state: AbgleichState): { fin?: Partial<FunnelState["fin"]>; em?: Partial<FunnelState["em"]>; txt?: Partial<FunnelState["txt"]> } {
  if (!field.choosable) return {};
  const n = Number(value);
  const idx = field.borrowerId ? state.borrowers.findIndex((b) => b.id === field.borrowerId) : -1;
  switch (field.key) {
    case "jahreseinkommen":
    case "einkommen_selbstaendig":
    case "renteneinkommen":
      return idx === 0 ? { fin: { inc: Math.round(n) } } : idx === 1 ? { fin: { inc2: Math.round(n) } } : {};
    case "eigenmittel_total": {
      // The Ersparnisse are what is left over: the other rows stay as entered.
      const em = state.em;
      if (!em) return {};
      const others = em.s3a + em.pkVor + em.schenk + em.erbe + em.darl;
      return { em: { spar: Math.max(0, Math.round(n - others)) } };
    }
    case "eigenmittel_3a":
      return { em: { s3a: Math.round(n) } };
    case "eigenmittel_pk_vorbezug":
      return { em: { pkVor: Math.round(n) } };
    case "eigenmittel_schenkung_darlehen_erbe":
      return field.part === "schenkung" ? { em: { schenk: Math.round(n) } } : field.part === "darlehen" ? { em: { darl: Math.round(n) } } : field.part === "erbe" ? { em: { erbe: Math.round(n) } } : {};
    case "kaufpreis":
      return { fin: { kaufpreis: Math.round(n) } };
    case "bestehende_hypothek_betrag":
      return { fin: { old: Math.round(n) } };
    case "mietzins_rendite":
      return { fin: { miete: Math.round(n) } };
    case "objekt_adresse": {
      const m = String(value).match(/^(\d{4})\s+(.+)$/);
      return m ? { txt: { plz: m[1], ort: m[2].trim() } } : {};
    }
    default:
      return {};
  }
}
