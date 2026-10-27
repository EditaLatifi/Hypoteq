/**
 * Reading a stored funnel state, whatever version wrote it (Handover 9; DECISIONS V9).
 *
 * The submit sends the answers as `v3` (toInquiryPayload.ts) and /api/inquiry stores them as
 * `Inquiry.v3State` for the Nachreichung (nachreich.ts). Inquiries stored before v5 hold the v3
 * shape (version 1): the yes/no questions v5 no longer asks, no Eigenmittel amounts, no entry
 * mode. This module turns either into the v5 shape the rules, the calculation, the dossier and
 * the Salesforce JSON read — so a v3 inquiry still opens its Nachreich page and is asked for
 * what it was asked for then:
 *
 *   v3 answer                         v5 state
 *   Kinder = Ja + Unterhalt = Ja      chip «Unterhaltszahlungen» (P11 needed both)
 *   ab 50 = Ja                        info.ab50 (P10, E2/E3 — v5 reads it from the ID)
 *   Heizungsart                       info.heizung (v5 reads it from the documents); «Unbekannt» dropped
 *   Säule 3a / PK / Schenkung /       legacyEquity: a «Ja» asks for its document like an amount
 *   Erbschaft / Darlehen = Ja         (requirements.ts); no amount is invented
 *   Liegenschaft = Ferienobjekt       no Liegenschaft (it never had a Salesforce value, D8); kept in `legacy`
 *
 * Pure. Unknown or malformed parts fall back to the defaults, never throw.
 */

import {
  DEFAULT_ANSWERS,
  EMPTY_AMOUNTS,
  EMPTY_EM,
  EMPTY_TEXTS,
  type Amounts,
  type Answers,
  type Borrower,
  type DocInfo,
  type Eigenmittel,
  type FunnelState,
  type Liegenschaft,
  type Mode,
  type Role,
  type SignatureState,
  type Sources,
  type Texts,
  type YesNo,
} from "./types";
import type { LegacyEquity } from "./requirements";

/** The shape version the v5 submit writes (`v3.version`). Version 1 = before v5. */
export const FUNNEL_STATE_VERSION = 2;

/** The answers a stored inquiry needs, in the v5 shape. */
export interface StoredFunnelState extends Pick<FunnelState, "role" | "mode" | "ans" | "txt" | "fin" | "em" | "info" | "src" | "sig" | "borrowers"> {
  /** v3 Eigenmittel yes/no answers (version 1 only). */
  legacyEquity?: LegacyEquity;
  /** v3 answers v5 has no field for, as stored — for display only. */
  legacy?: { lieg?: string; heizung?: string; kinder?: YesNo; ab50?: YesNo };
  /** Started in HYPO, the chat (DECISIONS V92): `entry_channel: "chat"` in the Salesforce JSON. */
  channel?: "chat";
  /** HYPO's Immobilienbewertung (Konzept Kap. 6): ordered, with the address given in the chat. */
  hypo?: { bewertung: boolean; adresse?: string };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const yn = (v: unknown): YesNo | undefined => (v === "Ja" || v === "Nein" ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const ANSWER_VALUES: { [K in keyof Answers]?: readonly string[] } = {
  antrag: ["Neue Hypothek", "Ablösung"],
  kn: ["Natürliche Person", "Juristische Person"],
  anrede: ["Herr", "Frau"],
  immo: ["Bestehende Immobilie", "Neubau", "Bauprojekt"],
  lieg: ["Einfamilienhaus", "Stockwerkeigentum", "Mehrfamilienhaus"] as readonly Liegenschaft[],
  nutz: ["Selbstbewohnt", "Vermietet", "Zweitwohnsitz", "Vermietet & teilweise selbstbewohnt", "Gewerbe"],
  laufzeit: ["SARON", "2 Jahre", "3 Jahre", "5 Jahre", "10 Jahre", "Mix"],
};

/** The v5 answers out of whatever `ans` holds; only known keys and values survive. */
function answersOf(raw: Record<string, unknown>): Answers {
  const ans: Answers = { ...DEFAULT_ANSWERS };
  for (const k of Object.keys(DEFAULT_ANSWERS) as (keyof Answers)[]) {
    const v = yn(raw[k]);
    if (v && (DEFAULT_ANSWERS[k] === "Ja" || DEFAULT_ANSWERS[k] === "Nein")) (ans as unknown as Record<string, unknown>)[k] = v;
  }
  for (const [k, values] of Object.entries(ANSWER_VALUES) as [keyof Answers, readonly string[]][]) {
    const v = raw[k];
    if (typeof v === "string" && values.includes(v)) (ans as unknown as Record<string, unknown>)[k] = v;
    else if (k !== "kn") delete (ans as unknown as Record<string, unknown>)[k];
  }
  return ans;
}

function textsOf(raw: unknown): Texts {
  const t = isObj(raw) ? raw : {};
  const out: Texts = { ...EMPTY_TEXTS };
  for (const k of Object.keys(EMPTY_TEXTS) as (keyof Texts)[]) out[k] = str(t[k]);
  return out;
}

function amountsOf(raw: unknown): Amounts {
  const f = isObj(raw) ? raw : {};
  const out: Amounts = { ...EMPTY_AMOUNTS };
  for (const k of Object.keys(EMPTY_AMOUNTS) as (keyof Amounts)[]) out[k] = num(f[k]);
  return out;
}

function equityOf(raw: unknown): Eigenmittel {
  const e = isObj(raw) ? raw : {};
  const out: Eigenmittel = { ...EMPTY_EM };
  for (const k of Object.keys(EMPTY_EM) as (keyof Eigenmittel)[]) out[k] = num(e[k]);
  return out;
}

function borrowersOf(raw: unknown): Borrower[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObj)
    .map((b, i) => ({
      id: str(b.id) || `b${i + 1}`,
      vor: str(b.vor),
      nach: str(b.nach),
      ...(b.job === "Angestellt" || b.job === "Selbständig" || b.job === "Pensioniert" ? { job: b.job } : {}),
      pkSe: yn(b.pkSe) ?? "Nein",
    }));
}

/**
 * Any stored or submitted funnel state (`Inquiry.v3State`, the payload's `v3`) in the v5 shape;
 * null when it is not a funnel state at all (a legacy funnel inquiry).
 */
export function normaliseFunnelState(raw: unknown): StoredFunnelState | null {
  if (!isObj(raw) || !isObj(raw.ans) || !isObj(raw.txt)) return null;
  const a = raw.ans;
  const version = typeof raw.version === "number" ? raw.version : 1;
  const v3 = version < FUNNEL_STATE_VERSION && !isObj(raw.em);
  const ans = answersOf(a);
  const role: Role | null = raw.role === "berater" || raw.role === "kunde" ? raw.role : null;
  const mode: Mode = raw.mode === "schnell" ? "schnell" : "begleitet";
  const info: DocInfo = isObj(raw.info) ? ({ ...raw.info } as DocInfo) : {};
  const out: StoredFunnelState = {
    role,
    mode,
    ans,
    txt: textsOf(raw.txt),
    fin: amountsOf(raw.fin),
    em: equityOf(raw.em),
    info,
    src: isObj(raw.src) ? (raw.src as Sources) : {},
    sig: isObj(raw.sig) && (raw.sig.choice === "uploaded" || raw.sig.choice === "later") ? (raw.sig as unknown as SignatureState) : null,
    borrowers: borrowersOf(raw.borrowers),
  };
  if (raw.channel === "chat") out.channel = "chat";
  if (isObj(raw.hypo)) {
    const adresse = str(raw.hypo.adresse).trim();
    out.hypo = { bewertung: raw.hypo.bewertung === true, ...(adresse ? { adresse } : {}) };
  }
  if (!v3) {
    // A state stored by v3InquiryColumns keeps what normalising a v3 one produced.
    if (isObj(raw.legacyEquity)) out.legacyEquity = raw.legacyEquity as LegacyEquity;
    if (isObj(raw.legacy)) out.legacy = raw.legacy as StoredFunnelState["legacy"];
    return out;
  }

  // ---- v3 (version 1): the questions v5 no longer asks.
  const legacy: NonNullable<StoredFunnelState["legacy"]> = {};
  // Unterhalt: v3 asked it only after «Kinder = Ja», and P11 needed both.
  out.ans.unterhalt = a.kinder === "Ja" && a.unterhalt === "Ja" ? "Ja" : "Nein";
  if (yn(a.kinder)) legacy.kinder = yn(a.kinder);
  if (a.ab50 === "Ja") out.info.ab50 = true;
  if (yn(a.ab50)) legacy.ab50 = yn(a.ab50);
  if (typeof a.heizung === "string" && a.heizung) {
    legacy.heizung = a.heizung;
    if (a.heizung !== "Unbekannt" && !out.info.heizung) out.info.heizung = a.heizung;
  }
  if (a.lieg === "Ferienobjekt") legacy.lieg = "Ferienobjekt";
  const equity: LegacyEquity = {};
  for (const k of ["s3a", "pk", "schenkung", "erbe", "darlehen"] as const) {
    const v = yn(a[k]);
    if (v) equity[k] = v;
  }
  if (Object.values(equity).includes("Ja")) out.legacyEquity = equity;
  if (Object.keys(legacy).length) out.legacy = legacy;
  return out;
}
