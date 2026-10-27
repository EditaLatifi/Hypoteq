/**
 * HYPO's rules for one turn that need no network and no React (Konzept Kap. 1, 5, 6). Pure, so
 * the conversation is testable in node; the client controller (components/funnel-v3/hypo/
 * controller.ts) calls the model and the stores around them.
 */

import { ampelOf, type Ampel } from "../abgleich/rules";
import { chf } from "../format";
import { hasKey, optionLabel, translate, type Lang } from "../i18n";
import type { FieldPath } from "../types";
import { fieldDef, isAmountKey, HYPO_FIELDS, type HypoKey, type HypoValue } from "./fields";
import type { Question } from "./flow";
import { isPlainAnswer, readField, readName, readPlace, readYesNo } from "./parse";
import type { HypoRole, RecognisedItem } from "./session";

/** Kap. 1.2: green ≥ 0.90 is taken (shown, confirmed by carrying on); yellow / red is asked back. */
export const GREEN = 0.9;

export function ampel(confidence: number): Ampel {
  return ampelOf(confidence);
}

/** The message key of a question: the partner perspective (`.p`) and the variant where they exist. */
export function questionKey(q: Pick<Question, "id" | "variant">, role: HypoRole, lang: Lang): string {
  const base = `hypo.q.${q.id}${q.variant ? `.${q.variant}` : ""}`;
  if (role !== "kunde" && hasKey(lang, `${base}.p`)) return `${base}.p`;
  if (role !== "kunde" && hasKey("de", `${base}.p`)) return `${base}.p`;
  return base;
}

export function questionText(q: Question, role: HypoRole, lang: Lang): string {
  return translate(lang, questionKey(q, role, lang), q.params ? formatParams(q.params, lang) : undefined);
}

/** Amount parameters as CHF. */
export function formatParams(params: Record<string, string | number>, _lang: Lang): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) out[k] = typeof v === "number" && k === "total" ? chf(v) : v;
  return out;
}

/** The chip label of an option value. */
export function optionText(q: Pick<Question, "optGroup">, value: string, lang: Lang): string {
  if (q.optGroup === "chip") return translate(lang, `chip.${value}`);
  if (q.optGroup === "em") return translate(lang, `em.${value}`);
  if (q.optGroup === "kn") return translate(lang, `hypo.kn.${value === "Juristische Person" ? "jur" : "nat"}`);
  return optionLabel(lang, q.optGroup ?? "", value);
}

/** A value as the cards show it: CHF for amounts, the option label for options. */
export function valueText(key: HypoKey, value: HypoValue, lang: Lang): string {
  if (isAmountKey(key) && typeof value === "number") return chf(value);
  const def = fieldDef(key);
  if (def?.kind === "yesno") return translate(lang, value === "Ja" ? "common.yes" : "common.no");
  if (def?.kind === "enum") {
    const group = key === "borrower.0.job" ? "job" : key.split(".")[1];
    return optionLabel(lang, group, String(value));
  }
  return String(value);
}

/** The form's own label of a field, where the form has one; else `hypo.f.<key>`. */
const FORM_LABELS: Partial<Record<HypoKey, string>> = {
  "ans.antrag": "q.antrag",
  "ans.kn": "q.kn",
  "ans.anrede": "q.anrede",
  "txt.vor": "s1.firstName",
  "txt.nach": "s1.lastName",
  "borrower.0.vor": "s1.firstName",
  "borrower.0.nach": "s1.lastName",
  "txt.firma": "s1.companyHr",
  "txt.zeichner": "s3.signatory",
  "txt.mail": "s1.email",
  "txt.tel": "s1.phone",
  "txt.plz": "s2.zip",
  "txt.ort": "s2.city",
  "ans.immo": "q.immo",
  "ans.lieg": "q.lieg",
  "ans.nutz": "q.nutz",
  "fin.miete": "s2.rentIncome",
  "fin.old": "s2.existingMortgage",
  "fin.up": "s2.increase",
  "txt.zweck": "s2.purpose",
  "fin.kaufpreis": "s2.price",
  "txt.kaufdatum": "s2.purchaseDate",
  "fin.renoBetrag": "s2.renoAmount",
  "em.spar": "em.spar",
  "em.s3a": "em.s3a",
  "em.pkVor": "em.pkVor",
  "em.pkVerp": "em.pkVerp",
  "em.schenk": "em.schenk",
  "em.erbe": "em.erbe",
  "em.darl": "em.darl",
  "ans.laufzeit": "q.laufzeit",
  "fin.inc": "s3.income",
  "borrower.0.job": "q.job",
  "borrower.0.pkSe": "q.pkSe",
  "txt.buergeName": "s3.guarantorName",
  "txt.pfirma": "s1.company",
  "txt.ptel": "s1.phoneCallback",
  "ans.unterhalt": "chip.unterhalt",
  "ans.kredite": "chip.kredite",
  "ans.leasing": "chip.leasing",
  "ans.buerge": "chip.buerge",
  "ans.baurecht": "chip.baurecht",
  "ans.angebote": "chip.angebote",
  "ans.steuer": "chip.steuer",
};

/** The label of a field on the cards and in the Dossier panel. */
export function fieldLabel(key: HypoKey | FieldPath, lang: Lang): string {
  const own = FORM_LABELS[key as HypoKey];
  return translate(lang, own ?? `hypo.f.${key}`);
}

/**
 * A typed answer read against the question on screen, without the model — only when it is plainly
 * just the answer (parse.ts isPlainAnswer). Null = ask the model (or ask again).
 */
export function readPlainAnswer(q: Question, text: string, lang: Lang): RecognisedItem[] | null {
  if (!isPlainAnswer(text)) return null;
  const sure = (key: HypoKey, value: HypoValue | null | undefined): RecognisedItem[] | null =>
    value === null || value === undefined || value === "" ? null : [{ key, value, confidence: 1 }];
  switch (q.kind) {
    case "name": {
      if (q.writes.length === 1) return sure(q.writes[0], readField(q.writes[0], "name", text));
      if (q.variant === "last") return sure(q.writes[1], readField(q.writes[1], "name", text));
      if (q.variant === "first") return sure(q.writes[0], readField(q.writes[0], "name", text));
      const n = readName(text);
      return n ? [{ key: q.writes[0], value: n.vor, confidence: 1 }, { key: q.writes[1], value: n.nach, confidence: 1 }] : null;
    }
    case "place": {
      const p = readPlace(text);
      if (q.variant === "plz") return sure("txt.plz", p.plz);
      if (q.variant === "ort") return sure("txt.ort", p.ort);
      if (!p.plz || !p.ort) return null;
      return [{ key: "txt.plz", value: p.plz, confidence: 1 }, { key: "txt.ort", value: p.ort, confidence: 1 }];
    }
    case "yesno": {
      const yn = readYesNo(text);
      if (!yn) return null;
      return q.writes[0] ? [{ key: q.writes[0], value: yn, confidence: 1 }] : null;
    }
    case "choice": {
      const labels = (q.options ?? []).map((o) => optionText(q, o, lang));
      const v = readField(q.writes[0], "enum", text, (q.options ?? []).filter((o) => !q.disabled?.includes(o)), labels);
      return sure(q.writes[0], v);
    }
    case "multi":
      return null;
    case "text":
      if (q.id === "partnerName") return null;
      return sure(q.writes[0], readField(q.writes[0], "text", text));
    default: {
      const def = fieldDef(q.writes[0]);
      return def ? sure(q.writes[0], readField(q.writes[0], def.kind, text, def.options ?? [])) : null;
    }
  }
}

/**
 * «Max Beispiel, Beispiel Agentur Bern» / «Anna Muster von der Agentur Muster» → name and agency,
 * without the model. Null when no first and last name can be told apart.
 */
export function readPartnerName(text: string): RecognisedItem[] | null {
  const [namePart, ...rest] = text.split(/,|;|\s+(?:von|bei|vom|from|at|with|de|chez|di|da|per)\s+/i);
  const n = readName(namePart.trim());
  if (!n) return null;
  const firma = rest.join(" ").replace(/^(der|die|dem|the|la|le|l')\s+/i, "").trim();
  const out: RecognisedItem[] = [
    { key: "txt.pvor", value: n.vor, confidence: 1 },
    { key: "txt.pnach", value: n.nach, confidence: 1 },
  ];
  if (firma && firma.length <= 120) out.push({ key: "txt.pfirma", value: firma, confidence: 1 });
  return out;
}

/** Values in the order the store must take them (Antrag and Kreditnehmer reset others). */
export function inStoreOrder<T extends { key: HypoKey }>(items: readonly T[]): T[] {
  const idx = (k: HypoKey) => {
    const i = HYPO_FIELDS.findIndex((f) => f.key === k);
    return i < 0 ? 999 : i;
  };
  return [...items].sort((a, b) => idx(a.key) - idx(b.key));
}

/** Green values are taken; the others wait for one question each (Kap. 5.2). */
export function splitByAmpel(items: readonly RecognisedItem[]): { take: RecognisedItem[]; ask: RecognisedItem[] } {
  return {
    take: items.filter((i) => i.confidence >= GREEN),
    ask: items.filter((i) => i.confidence < GREEN),
  };
}

/** Kap. 6 «Säule 3a / PK als Eigenmittel»: a value for one of these says the sentence once. */
export const PENSION_KEYS: readonly HypoKey[] = ["em.s3a", "em.pkVor", "em.pkVerp"];

/** The «Weitere Angaben» line HYPO adds (Kap. 5.4, 6), in the funnel language. */
export function noteLine(kind: "advisor" | "extra" | "bank" | "ablauf" | "bewertung" | "adresse", text: string, lang: Lang): string {
  return translate(lang, `hypo.note.${kind}`, { text: text.trim() });
}

/** Appends a line to the Kommentar, once (the same line twice is not added). */
export function withNote(kommentar: string, line: string): string {
  const k = kommentar.trim();
  if (!line.trim()) return kommentar;
  if (k.split("\n").some((l) => l.trim() === line.trim())) return kommentar;
  return k ? `${k}\n${line}` : line;
}

/** Ja / Nein for an offer or a «stimmt das?» typed as text. */
export function readConfirm(text: string): boolean | null {
  const yn = readYesNo(text);
  return yn === "Ja" ? true : yn === "Nein" ? false : null;
}

/** The transcript attached to the case (Kap. 9): one line per message, HYPO's in the chat language. */
export function transcriptText(
  lines: readonly { from: "user" | "hypo"; text: string; at: string }[],
  meta: { lang: Lang; caseNumber?: string | null; role: HypoRole }
): string {
  const head = [
    `HYPO – Chatverlauf${meta.caseNumber ? ` ${meta.caseNumber}` : ""}`,
    `Sprache: ${meta.lang.toUpperCase()} · Rolle: ${meta.role === "kunde" ? "Kunde" : meta.role === "partner" ? "Vermittler / Vertriebspartner" : "HYPOTEQ-Berater"}`,
    "",
  ];
  const body = lines.map((l) => {
    const d = new Date(l.at);
    const p = (n: number) => String(n).padStart(2, "0");
    const ts = Number.isFinite(d.getTime()) ? `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}` : "";
    return `[${ts}] ${l.from === "user" ? (meta.role === "kunde" ? "Kunde" : "Partner") : "HYPO"}: ${l.text}`;
  });
  return [...head, ...body].join("\n");
}
