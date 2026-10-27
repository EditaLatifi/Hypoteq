/**
 * HYPO's question path (Konzept Kap. 5.3): the funnel's own fields in the funnel's order —
 * Anfrage, Objekt & Finanzierung, Personen (lib/funnel-v3/validate.ts, components/funnel-v3/
 * logic.ts visibleFields) — one question per message, each asked only while its field is open.
 * Deterministic and pure: the model never decides what comes next (Kap. 1.1).
 *
 * Differences to the form, all from the Konzept:
 *  - the partner block comes first in the partner and Berater flows (Kap. 4);
 *  - an Ablösung asks Ablaufdatum, Bank and Restschuld right after the Antrag (Kap. 6);
 *  - a value from a message whose Ampel is not green is confirmed before anything else (Kap. 5.2);
 *  - the Eigenmittel are asked as «woher?» first, then an amount per source.
 * Answers with a default in the form (Kreditnehmer, the Ja/Nein questions) are asked anyway:
 * in a chat nobody sees the preselected «Nein».
 */

import { EMAIL_RE } from "../validate";
import { CHIPS, NUTZUNG_OPTIONS, chipsFor, isRentedNutzung, type Chip, type FieldPath, type FunnelState } from "../types";
import type { HypoKey } from "./fields";
import type { HypoSession } from "./session";

export type QuestionKind = "choice" | "multi" | "yesno" | "amount" | "text" | "name" | "email" | "phone" | "place" | "date" | "month";

export interface Question {
  /** Stable id: the message key is `hypo.q.<id>`. */
  id: string;
  kind: QuestionKind;
  /** The fields an answer fills; the first is the one a plain answer is read into. */
  writes: HypoKey[];
  /** Chip values (funnel values) of a choice or multiple choice. */
  options?: readonly string[];
  /** `opt.<group>` of the chip labels. */
  optGroup?: string;
  /** Options shown but not allowed (Bauprojekt at an Ablösung). */
  disabled?: readonly string[];
  /** May be skipped (the form does not require it). */
  optional?: boolean;
  /** Offers «Weiss ich nicht» (a value HYPOTEQ can also estimate, Kap. 6). */
  unknown?: boolean;
  /** Variant of the text (`hypo.q.<id>.<variant>`). */
  variant?: string;
  params?: Record<string, string | number>;
}

export type FlowState = Pick<FunnelState, "role" | "ans" | "txt" | "fin" | "em" | "borrowers" | "src" | "touched">;

/** Keys whose form value is a default (Natürliche Person, the «Nein» answers): only an answer counts. */
const DEFAULTED: ReadonlySet<string> = new Set<string>([
  "ans.kn",
  "ans.nbDocs",
  "ans.aufstockung",
  "ans.reno",
  "ans.reserviert",
  "borrower.0.pkSe",
  ...CHIPS.map((c) => `ans.${c}`),
]);

const blank = (s: string | undefined | null) => !s || !s.trim();

/** Whether a field has its answer: typed or picked in the chat, given in the form, or read from a sure document. */
export function isFilled(key: HypoKey, s: FlowState, h: HypoSession): boolean {
  if (h.answered.includes(key)) return true;
  if (key.startsWith("chat.")) {
    if (key === "chat.bank") return !blank(h.bank);
    if (key === "chat.ablauf") return !blank(h.ablauf);
    if (key === "chat.adresse") return !blank(h.adresse);
    if (key === "chat.kn2") return s.borrowers.length > 1;
    if (key === "chat.emTotal") return h.emTotal > 0;
    return false;
  }
  const path = key as FieldPath;
  const mark = s.src[path];
  if (mark && !mark.unsure) return true;
  if (DEFAULTED.has(key)) {
    // Given in the form: the form shows it, so a touched default is an answer.
    if (s.touched[path]) return true;
    if (key === "ans.kn") return !blank(s.txt.firma) || s.ans.kn === "Juristische Person";
    return false;
  }
  const [group, k, sub] = key.split(".");
  switch (group) {
    case "ans":
      return (s.ans as unknown as Record<string, unknown>)[k] !== undefined;
    case "txt":
      return !blank((s.txt as unknown as Record<string, string>)[k]);
    case "fin":
      return ((s.fin as unknown as Record<string, number>)[k] ?? 0) > 0;
    case "em":
      return ((s.em as unknown as Record<string, number>)[k] ?? 0) > 0;
    case "borrower": {
      const b = s.borrowers[Number(k)] as unknown as Record<string, unknown> | undefined;
      if (!b) return false;
      return sub === "vor" || sub === "nach" ? !blank(b[sub] as string) : b[sub] !== undefined;
    }
  }
  return false;
}

const EM_SOURCES = ["spar", "s3a", "pkVor", "pkVerp", "schenk", "erbe", "darl"] as const;

/** The questions that apply to the state, in order (some already answered — nextQuestion skips them). */
export function questionPath(s: FlowState, h: HypoSession): Question[] {
  const q: Question[] = [];
  const a = s.ans;
  const jur = a.kn === "Juristische Person";
  const isAbl = a.antrag === "Ablösung";
  const isKauf = a.antrag === "Neue Hypothek";

  // ---- Partner / Berater (Kap. 4).
  if (h.role === "partner") {
    // Name and agency first; the e-mail is what the case is assigned by (it is the funnel's Berater e-mail).
    q.push({ id: "partnerName", kind: "text", writes: ["txt.pnach", "txt.pvor", "txt.pfirma"] });
    if (h.partnerMatch && h.partnerConfirmed === null) {
      const { name, company } = h.partnerMatch;
      q.push({ id: "partnerConfirm", kind: "yesno", writes: [], params: { name, company: company ?? "" }, ...(company ? {} : { variant: "solo" }) });
    }
    q.push({ id: "bmail", kind: "email", writes: ["txt.bmail"] });
    if (h.partnerStatus === "unknown") q.push({ id: "ptel", kind: "phone", writes: ["txt.ptel"], optional: true });
  } else if (h.role === "berater") {
    q.push({ id: "bmail", kind: "email", writes: ["txt.bmail"] });
    if (h.partnerStatus === "unknown") {
      q.push({ id: "partnerName", kind: "text", writes: ["txt.pnach", "txt.pvor", "txt.pfirma"] });
      q.push({ id: "ptel", kind: "phone", writes: ["txt.ptel"], optional: true });
    }
  }

  // ---- Anfrage.
  q.push({ id: "antrag", kind: "choice", writes: ["ans.antrag"], options: ["Neue Hypothek", "Ablösung"], optGroup: "antrag" });
  if (isAbl) {
    // Kap. 6: expiry first — it says how urgent the case is.
    q.push({ id: "ablauf", kind: "month", writes: ["chat.ablauf"], optional: true });
    q.push({ id: "bank", kind: "text", writes: ["chat.bank"], optional: true });
    q.push({ id: "old", kind: "amount", writes: ["fin.old"] });
  }
  q.push({ id: "kn", kind: "choice", writes: ["ans.kn"], options: ["Natürliche Person", "Juristische Person"], optGroup: "kn" });
  if (jur) {
    q.push({ id: "firma", kind: "text", writes: ["txt.firma"] });
    q.push({ id: "zeichner", kind: "name", writes: ["txt.zeichner"] });
  } else {
    const vor = !blank(s.txt.vor);
    const nach = !blank(s.txt.nach);
    q.push({
      id: "name",
      kind: "name",
      writes: ["txt.vor", "txt.nach"],
      ...(vor && !nach ? { variant: "last", params: { vor: s.txt.vor.trim() } } : nach && !vor ? { variant: "first", params: { nach: s.txt.nach.trim() } } : {}),
    });
    q.push({ id: "anrede", kind: "choice", writes: ["ans.anrede"], options: ["Herr", "Frau"], optGroup: "anrede" });
  }
  q.push({ id: "mail", kind: "email", writes: ["txt.mail"] });
  q.push({ id: "tel", kind: "phone", writes: ["txt.tel"] });

  // ---- Objekt & Finanzierung.
  const plz = !blank(s.txt.plz);
  const ort = !blank(s.txt.ort);
  q.push({
    id: "place",
    kind: "place",
    writes: ["txt.plz", "txt.ort"],
    ...(ort && !plz ? { variant: "plz", params: { ort: s.txt.ort.trim() } } : plz && !ort ? { variant: "ort", params: { plz: s.txt.plz.trim() } } : {}),
  });
  q.push({ id: "immo", kind: "choice", writes: ["ans.immo"], options: ["Bestehende Immobilie", "Neubau", "Bauprojekt"], optGroup: "immo", ...(isAbl ? { disabled: ["Bauprojekt"] } : {}) });
  if (a.immo === "Neubau") q.push({ id: "nbDocs", kind: "yesno", writes: ["ans.nbDocs"] });
  q.push({ id: "lieg", kind: "choice", writes: ["ans.lieg"], options: ["Einfamilienhaus", "Stockwerkeigentum", "Mehrfamilienhaus"], optGroup: "lieg" });
  q.push({ id: "nutz", kind: "choice", writes: ["ans.nutz"], options: NUTZUNG_OPTIONS[a.kn], optGroup: "nutz" });
  if (isRentedNutzung(a.nutz)) q.push({ id: "miete", kind: "amount", writes: ["fin.miete"], optional: true });
  if (isAbl) {
    q.push({ id: "aufstockung", kind: "yesno", writes: ["ans.aufstockung"] });
    if (a.aufstockung === "Ja") {
      q.push({ id: "up", kind: "amount", writes: ["fin.up"] });
      q.push({ id: "zweck", kind: "text", writes: ["txt.zweck"], optional: true });
    }
    q.push({ id: "val", kind: "amount", writes: ["fin.val"], unknown: true, ...(h.closed.includes("offer:bewertung") ? { variant: "estimate" } : {}) });
  }
  if (isKauf) {
    q.push({
      id: "kaufpreis",
      kind: "amount",
      writes: ["fin.kaufpreis"],
      unknown: true,
      ...(a.immo === "Bauprojekt" ? { variant: "bau" } : h.closed.includes("offer:bewertung") ? { variant: "estimate" } : {}),
    });
    q.push({ id: "kaufdatum", kind: "date", writes: ["txt.kaufdatum"], optional: true });
    q.push({ id: "reno", kind: "yesno", writes: ["ans.reno"] });
    if (a.reno === "Ja") q.push({ id: "renoBetrag", kind: "amount", writes: ["fin.renoBetrag"] });
    q.push({ id: "reserviert", kind: "yesno", writes: ["ans.reserviert"] });
    // «Woher stammen die Eigenmittel?», then one amount per source still empty.
    q.push({
      id: "emSources",
      kind: "multi",
      writes: [],
      options: EM_SOURCES,
      optGroup: "em",
      optional: true,
      ...(h.emTotal > 0 ? { variant: "total", params: { total: h.emTotal } } : {}),
    });
    for (const k of h.emSources) q.push({ id: `em.${k}`, kind: "amount", writes: [`em.${k}` as HypoKey], optional: true });
  }
  if (h.bewertung) q.push({ id: "adresse", kind: "text", writes: ["chat.adresse"], optional: true });

  // ---- Personen.
  if (!jur) {
    q.push({ id: "inc", kind: "amount", writes: ["fin.inc"] });
    q.push({ id: "job", kind: "choice", writes: ["borrower.0.job"], options: ["Angestellt", "Selbständig", "Pensioniert"], optGroup: "job" });
    if (s.borrowers[0]?.job === "Selbständig") q.push({ id: "pkSe", kind: "yesno", writes: ["borrower.0.pkSe"] });
    q.push({ id: "kn2", kind: "yesno", writes: ["chat.kn2"] });
    if (s.borrowers.length > 1) {
      q.push({ id: "name2", kind: "name", writes: ["borrower.1.vor", "borrower.1.nach"] });
      q.push({ id: "inc2", kind: "amount", writes: ["fin.inc2"], optional: true });
    }
  }
  q.push({ id: "chips", kind: "multi", writes: [], options: chipsFor(a.kn), optGroup: "chip" });
  if (a.buerge === "Ja") q.push({ id: "buergeName", kind: "name", writes: ["txt.buergeName"] });
  return q;
}

/** Whether a question still waits for its answer. */
export function isOpen(q: Question, s: FlowState, h: HypoSession): boolean {
  if (h.closed.includes(q.id)) return false;
  switch (q.id) {
    case "partnerName":
      // Asked once: the answer is searched (partner) or kept as typed (new partner).
      return blank(s.txt.pnach) && !h.partnerSearched;
    case "partnerConfirm":
      return h.partnerConfirmed === null;
    case "bmail":
      return !EMAIL_RE.test(s.txt.bmail.trim());
    case "kn2":
      return s.borrowers.length < 2 && !h.answered.includes("chat.kn2");
    case "emSources":
      return !(Object.values(s.em) as number[]).some((v) => v > 0);
    case "chips":
      return !chipsFor(s.ans.kn).some((c: Chip) => h.answered.includes(`ans.${c}`) || s.touched[`ans.${c}`]);
  }
  return q.writes.some((k) => !isFilled(k, s, h));
}

/** The next question; null when the path is complete. */
export function nextQuestion(s: FlowState, h: HypoSession): Question | null {
  for (const q of questionPath(s, h)) if (isOpen(q, s, h)) return q;
  return null;
}

/** A question by id in the current path (to read an answer against it). */
export function questionById(id: string | null, s: FlowState, h: HypoSession): Question | null {
  if (!id) return null;
  return questionPath(s, h).find((q) => q.id === id) ?? null;
}

/** Share of the path answered, for the Dossier panel's bar (0–1). */
export function progress(s: FlowState, h: HypoSession): number {
  const path = questionPath(s, h).filter((q) => !q.optional);
  if (!path.length) return 0;
  return path.filter((q) => !isOpen(q, s, h)).length / path.length;
}
