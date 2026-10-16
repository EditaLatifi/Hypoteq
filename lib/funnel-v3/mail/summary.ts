/**
 * The summary of a v5 request as the closing mails show it (Handover 7.2 blocks 3–9, 7.3).
 * Pure: the /api/inquiry body in, the blocks and rows out, in the funnel language.
 *
 *   3 Ergebnis       Gesamtfinanzierung, Belehnung, Tragbarkeit, Urteil (calc.ts, the funnel's numbers)
 *   4 Antrag         Kreditantrag, Kreditnehmer-Typ (Berater / intern: the entry)
 *   5 Kreditnehmer   one group per Kreditnehmer; a company: Firma, UID, Sitz, zeichnungsberechtigte Person, Kontakt
 *   6 Objekt         address, Art der Immobilie (+ Neubau-Art only at a Neubau), Liegenschaft, Nutzung,
 *                    Mietertrag (only Vermietet), what the object documents say, Baurecht
 *   7 Finanzierung   Kauf: Kaufpreis, Kaufdatum, Renovationsbetrag, Objektwert, Eigenmittel (entered rows) and total
 *                    Ablösung: bestehende Bank, Hypothek, Zins, Ablösedatum, Erhöhung + Zweck, Vorsorge
 *   8 Weitere        tapped chips with what their documents say, Laufzeit, Kommentar
 *   9 Unterlagen     fulfilled / total and every requirement with its state
 *
 * Rules (7.3): a row without a value is left out, never shown empty — so no Kreditnehmer 2 unless
 * one was added, no «Firma» for a natural person, no Neubau-Art for an existing property, no
 * Mietertrag unless rented. A yes/no answer appears when it is «Ja»: «Nein» is what an untapped
 * question means (types.ts). Every answer and every value read from the documents (`info`, and
 * prefilled answers in `src`) appears; the mark «aus Dokument» is on the row for the Berater and
 * the internal mail and absent for the customer. Numbers in the Swiss format (format.ts).
 */

import { calcForState, type CalcResult } from "../calc";
import { v3DocumentStatus, type V3DocumentStatus } from "../completion";
import { chf, date as fmtDate, pct } from "../format";
import { interpolate, optionLabel, translate, type Lang, type Params } from "../i18n";
import { normaliseFunnelState, FUNNEL_STATE_VERSION, type StoredFunnelState } from "../legacy";
import { GROUP_ORDER, SIGNATURE_REQUIREMENT_ID, type ReqGroup } from "../requirements";
import type { RequirementState, RequirementStatus } from "../requirementStatus";
import { signatureJson, signatureView, signatureWithServer, type SignatureJson } from "../signature";
import { CHIPS, EM_ROWS, type Chip, type DocInfo, type FieldPath } from "../types";
import { MAIL_TEXTS, type Audience, type MailTexts } from "./texts";

/** Where a value came from (Handover 3: «aus Dokument»); `doc` is the document when known. */
export interface FromDoc {
  doc: string | null;
  /** «aus Dokument · bitte prüfen». */
  unsure: boolean;
}

export interface SummaryRow {
  label: string;
  value: string;
  /** Set only in the Berater and the internal mail (Handover 7.3). */
  fromDoc?: FromDoc;
  strong?: boolean;
  /** A short line under the value (PK-Verpfändung: «zählt nicht zu den Eigenmitteln»). */
  note?: string;
}

export interface SummaryGroup {
  title?: string;
  rows: SummaryRow[];
}

export type SummaryBlockId = "result" | "request" | "borrowers" | "property" | "financing" | "more" | "docs";

export interface SummaryBlock {
  id: SummaryBlockId;
  title: string;
  groups: SummaryGroup[];
}

export interface DocLine {
  label: string;
  state: RequirementState;
  stateLabel: string;
  /** Missing, outdated or partial: shown as a warning. */
  warn: boolean;
}

export interface DocGroup {
  title: string;
  lines: DocLine[];
}

export interface CaseSummary {
  lang: Lang;
  audience: Audience;
  caseNumber: string | null;
  /** TT.MM.JJJJ of the closing. */
  date: string;
  /** «Erfasst von …» / «Eigene Anfrage» (7.2 block 1). */
  submitter: string;
  role: "berater" | "kunde" | null;
  /** `greetingName`: the first name the customer mail greets (a company: its signatory's). */
  customer: { name: string; email: string; isJur: boolean; greetingName: string };
  place: string;
  berater: { name: string; email: string; phone: string; firma: string } | null;
  /** 7.2 block 2. `missing`: the required documents still open, without the Auskunftsermächtigung. */
  next: { signature: boolean; missing: string[] };
  /** Blocks 3–8; block 9 is `docs`. Empty blocks are left out. */
  blocks: SummaryBlock[];
  docs: { title: string; fulfilled: number; total: number; line: string; groups: DocGroup[] };
  calc: CalcResult;
  signature: SignatureJson;
}

export interface SummaryInput {
  /** The /api/inquiry body of a v5 submission. */
  data: any;
  lang: Lang;
  caseNumber: string | null;
  date: Date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/**
 * A v5 submission (the funnel's state version 2, legacy.ts). Older funnel payloads — the legacy
 * funnel and a v3 browser session still open — keep their mails (Handover 7 applies to v5).
 */
export function isV5Payload(data: any): boolean {
  const v3 = data?.v3;
  return !!v3 && typeof v3 === "object" && typeof v3.version === "number" && v3.version >= FUNNEL_STATE_VERSION;
}

/** The customer's address: the step-1 contact (txt.mail); a Kunde's own submission falls back to client.email. */
export function customerEmailOf(data: any): string | null {
  const mail = str(data?.v3?.txt?.mail);
  if (EMAIL_RE.test(mail)) return mail;
  const client = str(data?.client?.email);
  return data?.v3?.role !== "berater" && EMAIL_RE.test(client) ? client : null;
}

/** The Berater's address (Berater entry only). */
export function beraterEmailOf(data: any): string | null {
  if (data?.v3?.role !== "berater") return null;
  const mail = str(data?.v3?.txt?.bmail || data?.partner?.email);
  return EMAIL_RE.test(mail) ? mail : null;
}

/**
 * The Auskunftsermächtigung at the closing, judged from the files on P0 like the Salesforce JSON
 * (completion.ts v3DocumentCaseFields): `uploaded`, `pending` («Später nachreichen»), `unsigned`
 * or `missing` — with signature.ts's bank note (SIGNATURE_BANK_NOTE_DE, DECISIONS V11) while it
 * is not uploaded. No server row yet at the closing (`signatureWithServer(…, null)`).
 */
export function closingSignature(computed: V3DocumentStatus): SignatureJson {
  const signer = computed.status.requirements.find((r) => r.instance.id === SIGNATURE_REQUIREMENT_ID)?.instance.person;
  const view = signatureView(
    computed.files.map((f) => ({ fileId: f.documentId, instanceId: f.instanceId, analysis: f.analysis, assignedByUser: f.assignedByUser })),
    computed.state.sig,
    signer
  );
  return signatureWithServer(signatureJson(view, computed.state.sig), null);
}

/** The required documents still open, labelled in the funnel language (P0 has its own block). */
export function missingDocuments(status: V3DocumentStatus["status"], lang: Lang): string[] {
  return status.requirements
    .filter((r) => !r.instance.optional && r.state !== "ok" && r.instance.id !== SIGNATURE_REQUIREMENT_ID)
    .map((r) => translate(lang, r.instance.labelKey) + (r.instance.person?.display ? ` – ${r.instance.person.display}` : ""));
}

/** The customer's name for the subject and the texts: «Vorname Nachname» or the Firma. */
export function customerNameOf(state: Pick<StoredFunnelState, "ans" | "txt" | "borrowers">): string {
  if (state.ans.kn === "Juristische Person") return state.txt.firma.trim();
  const b0 = state.borrowers[0];
  return [(state.txt.vor || b0?.vor || "").trim(), (state.txt.nach || b0?.nach || "").trim()].filter(Boolean).join(" ");
}

export function placeOf(state: Pick<StoredFunnelState, "txt">): string {
  return [state.txt.plz.trim(), state.txt.ort.trim()].filter(Boolean).join(" ");
}

/**
 * Handover 7.2 subject: `Deine Finanzierungsanfrage HQ-… – {Name}, {PLZ Ort}` for the customer
 * (mail.subject), the same without «Deine» for the Berater, «Neue …» internally. A missing case
 * number, name or place is left out rather than shown as a gap.
 */
export function closingSubject(audience: Audience, lang: Lang, caseNumber: string | null, name: string, place: string): string {
  const T = MAIL_TEXTS[lang] ?? MAIL_TEXTS.de;
  const template = audience === "kunde" ? translate(lang, "mail.subject") : audience === "berater" ? T.subjectNeutral : T.subjectIntern;
  const tail = [name.trim(), place.trim()].filter(Boolean).join(", ");
  const cut = template.indexOf(" – ");
  if (cut < 0) return interpolate(template, { id: caseNumber ?? "", name, place }).replace(/\s+/g, " ").trim();
  const head = template
    .slice(0, cut)
    .replace(/\s*\{id\}/, caseNumber ? ` ${caseNumber}` : "")
    .trim();
  return tail ? `${head} – ${tail}` : head;
}

/** The pieces of a v5 submission every closing mail reads. Null when the payload has no funnel state. */
export interface ClosingFacts {
  state: StoredFunnelState;
  computed: V3DocumentStatus;
  calc: CalcResult;
  signature: SignatureJson;
}

export function closingFacts(data: any): ClosingFacts | null {
  const state = normaliseFunnelState(data?.v3);
  const computed = state ? v3DocumentStatus(data) : null;
  if (!state || !computed) return null;
  return { state, computed, calc: calcForState(state), signature: closingSignature(computed) };
}

// ---- The summary -----------------------------------------------------------------------------

type Mark = FromDoc | undefined;

export function buildCaseSummary(input: SummaryInput, audience: Audience, facts?: ClosingFacts | null): CaseSummary | null {
  const f = facts ?? closingFacts(input.data);
  if (!f) return null;
  const { state, computed, calc, signature } = f;
  const { lang } = input;
  const T: MailTexts = MAIL_TEXTS[lang] ?? MAIL_TEXTS.de;
  const L = T.labels;
  const t = (key: string, params?: Params) => translate(lang, key, params);
  const opt = (group: string, value: string | null | undefined) => optionLabel(lang, group, value);
  const yes = t("common.yes");
  const { ans, txt, fin } = state;
  const em = state.em;
  const info: DocInfo = state.info ?? {};
  const src = state.src ?? {};
  const isJur = ans.kn === "Juristische Person";
  const isKauf = ans.antrag === "Neue Hypothek";
  const isAbl = ans.antrag === "Ablösung";
  const marks = audience !== "kunde";

  // «aus Dokument»: a prefilled answer (its document), a fact from the documents (no field).
  const fromSrc = (...paths: FieldPath[]): Mark => {
    if (!marks) return undefined;
    for (const p of paths) {
      const m = src[p];
      if (m) return { doc: m.doc || null, unsure: !!m.unsure };
    }
    return undefined;
  };
  const fromInfo: Mark = marks ? { doc: null, unsure: false } : undefined;

  const rows = (...list: (SummaryRow | null | false | undefined)[]): SummaryRow[] => list.filter((r): r is SummaryRow => !!r && !!r.value);
  const r = (label: string, value: string | null | undefined, fromDoc?: Mark, extra: Partial<SummaryRow> = {}): SummaryRow | null => {
    const v = str(value);
    return v ? { label, value: v, ...(fromDoc ? { fromDoc } : {}), ...extra } : null;
  };
  const money = (n: number) => (n > 0 ? chf(n) : "");
  const fact = (label: string, key: keyof DocInfo) => r(label, typeof info[key] === "string" ? (info[key] as string) : "", fromInfo);
  const groups = (...gs: SummaryGroup[]) => gs.filter((g) => g.rows.length);

  const blocks: SummaryBlock[] = [];
  const push = (id: SummaryBlockId, titleKey: string, gs: SummaryGroup[]) => {
    if (gs.length) blocks.push({ id, title: t(titleKey), groups: gs });
  };

  // ---- 3 Ergebnis
  const verdictKey = calc.verdict === "ok" ? "s4.verdict.ok" : calc.verdict === "review" ? "s4.verdict.check" : "s4.verdict.missing";
  push("result", "mail.section.result", groups({
    rows: rows(
      r(t("s4.total"), money(calc.need), undefined, { strong: true }),
      calc.ltv !== null ? r(t("s4.ltv"), pct(calc.ltv)) : null,
      !isJur && calc.affordability !== null ? r(t("s4.aff"), pct(calc.affordability)) : null,
      r(L.verdict, t(verdictKey), undefined, { strong: true })
    ),
  }));

  // ---- 4 Antrag
  push("request", "mail.section.request", groups({
    rows: rows(
      r(t("q.antrag"), opt("antrag", ans.antrag), fromSrc("ans.antrag")),
      r(t("q.kn"), opt("kn", ans.kn), fromSrc("ans.kn")),
      marks ? r(L.entry, t(state.mode === "schnell" ? "start.mode.fast.title" : "start.mode.guided.title")) : null
    ),
  }));

  // ---- 5 Kreditnehmer
  const borrowerGroups: SummaryGroup[] = [];
  if (isJur) {
    borrowerGroups.push({
      title: t("s1.company"),
      rows: rows(
        r(t("s3.companyName"), txt.firma, fromSrc("txt.firma")),
        fact(L.uid, "uid"),
        fact(L.seat, "sitz"),
        r(t("s3.signatory"), txt.zeichner, fromSrc("txt.zeichner")),
        r(t("s1.email"), txt.mail),
        r(t("s1.phone"), txt.tel)
      ),
    });
  } else {
    state.borrowers.forEach((b, i) => {
      const first = i === 0 ? txt.vor || b.vor : b.vor;
      const last = i === 0 ? txt.nach || b.nach : b.nach;
      const name = [first.trim(), last.trim()].filter(Boolean).join(" ");
      // Kreditnehmer 2 exists only once added and named (Handover 2 Schritt 3, Rosanna).
      if (i > 0 && !name) return;
      const income = i === 0 ? fin.inc : i === 1 ? fin.inc2 : 0;
      const first0 = i === 0;
      borrowerGroups.push({
        title: t("s3.borrower", { n: i + 1 }),
        rows: rows(
          first0 ? r(t("q.anrede"), opt("anrede", ans.anrede), fromSrc("ans.anrede")) : null,
          r(L.name, name, first0 ? fromSrc("txt.vor", "txt.nach", "borrower.0.vor", "borrower.0.nach") : fromSrc(`borrower.${i}.vor` as FieldPath)),
          // The ID and the tax return of Kreditnehmer 1 (Handover 3.1, toInquiryPayload).
          first0 ? fact(L.birthdate, "geb") : null,
          first0 ? fact(L.nationality, "nat") : null,
          first0 ? fact(L.civil, "zivil") : null,
          first0 ? fact(L.children, "kinder") : null,
          first0 ? r(t("s1.email"), txt.mail) : null,
          first0 ? r(t("s1.phone"), txt.tel) : null,
          r(t("q.job"), opt("job", b.job), fromSrc(`borrower.${i}.job` as FieldPath)),
          b.job === "Selbständig" ? r(t("q.pkSe"), opt("pkSe", b.pkSe), fromSrc(`borrower.${i}.pkSe` as FieldPath)) : null,
          first0 ? fact(L.employer, "ag") : null,
          r(t("s3.income"), money(income), fromSrc(first0 ? "fin.inc" : "fin.inc2"))
        ),
      });
    });
    if (borrowerGroups.length > 1 && calc.income > 0) {
      borrowerGroups.push({ rows: rows(r(t("s4.householdIncome"), chf(calc.income), undefined, { strong: true })) });
    }
  }
  push("borrowers", "mail.section.borrowers", groups(...borrowerGroups));

  // ---- 6 Objekt
  push("property", "mail.section.property", groups({
    rows: rows(
      r(L.plzOrt, placeOf(state), fromSrc("txt.plz", "txt.ort")),
      fact(L.address, "adresse"),
      r(t("q.immo"), opt("immo", ans.immo), fromSrc("ans.immo")),
      // «Neubau» is the finished new build (Handover 9: «Neubau» = bereits erstellt, «Bauprojekt» separat).
      ans.immo === "Neubau" ? r(L.neubauArt, L.neubauBuilt) : null,
      ans.immo === "Neubau" && ans.nbDocs === "Ja" ? r(L.nbDocs, yes, fromSrc("ans.nbDocs")) : null,
      r(t("q.lieg"), opt("lieg", ans.lieg), fromSrc("ans.lieg")),
      r(t("q.nutz"), opt("nutz", ans.nutz), fromSrc("ans.nutz")),
      ans.nutz === "Vermietet" ? r(t("s2.rentIncome"), money(fin.miete), fromSrc("fin.miete")) : null,
      fact(L.yearBuilt, "baujahr"),
      fact(L.rooms, "zimmer"),
      fact(L.livingArea, "wohnflaeche"),
      fact(L.heating, "heizung"),
      fact(L.cubature, "kubatur"),
      fact(L.insuredSum, "versSumme"),
      fact(L.valueQuota, "wertquote"),
      fact(L.liens, "grundpfand"),
      fact(L.renewalFund, "efSaldo"),
      ans.baurecht === "Ja" ? r(L.buildingRight, yes, fromSrc("ans.baurecht")) : null
    ),
  }));

  // ---- 7 Finanzierung
  const emRows = (ans.antrag ? EM_ROWS[ans.antrag] : []).map((k) =>
    em[k] > 0 ? r(t(`em.${k}`), chf(em[k]), fromSrc(`em.${k}` as FieldPath), k === "pkVerp" ? { note: t("em.pkVerp.hint") } : {}) : null
  );
  const vorsorgeFacts = [fact(L.pledge3a, "s3aPledge"), fact(L.pkAssets, "pk"), fact(L.pkWithdrawal, "pkVorbezug")];
  const financing: SummaryGroup[] = [];
  if (isKauf) {
    financing.push({
      rows: rows(
        r(t("s2.price"), money(fin.kaufpreis), fromSrc("fin.kaufpreis")),
        r(t("s2.purchaseDate"), txt.kaufdatum, fromSrc("txt.kaufdatum")),
        ans.reno === "Ja" ? r(t("s2.renoAmount"), money(fin.renoBetrag) || yes, fromSrc("fin.renoBetrag", "ans.reno")) : null,
        ans.reserviert === "Ja" ? r(L.reserved, yes, fromSrc("ans.reserviert")) : null,
        r(t("s4.value"), money(fin.val), fromSrc("fin.val"))
      ),
    });
    financing.push({
      title: t("em.title"),
      rows: rows(
        ...emRows,
        calc.emTotal > 0
          ? r(L.emTotal, [chf(calc.emTotal), calc.emPct !== null ? pct(calc.emPct) : "", `${L.emHard} ${chf(calc.hard)}`].filter(Boolean).join(" · "), undefined, { strong: true })
          : null,
        ...vorsorgeFacts
      ),
    });
  } else if (isAbl) {
    financing.push({
      rows: rows(
        fact(L.existingBank, "bank"),
        r(t("s2.existingMortgage"), money(fin.old), fromSrc("fin.old")),
        fact(L.rate, "zins"),
        fact(L.term, "laufzeit"),
        fact(L.redemptionDate, "abl"),
        ans.aufstockung === "Ja" ? r(t("s2.increase"), money(fin.up) || yes, fromSrc("fin.up", "ans.aufstockung")) : null,
        ans.aufstockung === "Ja" ? r(t("s2.purpose"), txt.zweck) : null,
        r(t("s4.value"), money(fin.val), fromSrc("fin.val"))
      ),
    });
    financing.push({ title: t("em.titleAbl"), rows: rows(...emRows, ...vorsorgeFacts) });
  }
  push("financing", "mail.section.financing", groups(...financing));

  // ---- 8 Weitere Angaben: tapped chips (Baurecht is in the Objekt block), Laufzeit, Kommentar
  const chipDetails: Partial<Record<Chip, [string, keyof DocInfo][]>> = {
    unterhalt: [[L.amount, "unterhaltBetrag"]],
    kredite: [[L.residualDebt, "kreditRest"], [L.instalment, "kreditRate"]],
    leasing: [[L.instalment, "leasingRate"], [L.residualValue, "leasingRest"]],
  };
  const chipRows: (SummaryRow | null)[] = [];
  for (const c of CHIPS) {
    if (c === "baurecht" || ans[c] !== "Ja") continue;
    if (isJur && c === "unterhalt") continue;
    const value = c === "buerge" ? txt.buergeName.trim() || yes : yes;
    chipRows.push(r(t(`chip.${c}`), value, fromSrc(`ans.${c}` as FieldPath, ...(c === "buerge" ? (["txt.buergeName"] as FieldPath[]) : []))));
    for (const [label, key] of chipDetails[c] ?? []) chipRows.push(fact(`${t(`chip.${c}`)} · ${label}`, key));
  }
  push("more", "mail.section.more", groups({
    rows: rows(...chipRows, r(t("q.laufzeit"), opt("laufzeit", ans.laufzeit), fromSrc("ans.laufzeit")), r(L.comment, txt.kommentar)),
  }));

  // ---- 9 Unterlagen
  const status = computed.status;
  const later = signature.status === "pending";
  const personNames = new Set(status.requirements.filter((x) => x.instance.group === "person").map((x) => x.instance.person?.display).filter(Boolean));
  const docLine = (x: RequirementStatus): DocLine => {
    const person = x.instance.person?.display && personNames.size > 1 ? ` · ${x.instance.person.display}` : "";
    const isP0 = x.instance.id === SIGNATURE_REQUIREMENT_ID;
    const st = x.state === "analysing" ? "missing" : x.state;
    const stateLabel =
      isP0 && st !== "ok" && later
        ? t("sig.laterState")
        : st === "partial"
          ? `${t("state.partial")} · ${t("s5.filesOf", { n: x.doneFiles, total: x.expect })}`
          : t(`state.${st}`);
    return { label: t(x.instance.labelKey) + person, state: st, stateLabel, warn: st === "missing" ? !x.instance.optional : st === "outdated" || st === "partial" };
  };
  const docGroups: DocGroup[] = [];
  for (const g of GROUP_ORDER as readonly ReqGroup[]) {
    const lines = status.requirements.filter((x) => x.instance.group === g).map(docLine);
    if (!lines.length) continue;
    docGroups.push({ title: isJur && g === "person" ? t("grp.company") : t(`grp.${g}`), lines });
  }

  const role = state.role;
  const partnerName = [txt.pvor.trim(), txt.pnach.trim()].filter(Boolean).join(" ");
  const submitter =
    role === "berater" ? t("side.submittedBy", { name: [partnerName, txt.bmail.trim()].filter(Boolean).join(" · ") || "HYPOTEQ" }) : t("side.ownRequest");

  return {
    lang,
    audience,
    caseNumber: input.caseNumber,
    date: fmtDate(input.date),
    submitter,
    role,
    customer: {
      name: customerNameOf(state),
      email: customerEmailOf(input.data) ?? "",
      isJur,
      greetingName: (isJur ? txt.zeichner : txt.vor || state.borrowers[0]?.vor || "").trim().split(/\s+/)[0] ?? "",
    },
    place: placeOf(state),
    berater: role === "berater" ? { name: partnerName, email: txt.bmail.trim(), phone: txt.ptel.trim(), firma: txt.pfirma.trim() } : null,
    next: { signature: signature.status !== "uploaded", missing: missingDocuments(status, lang) },
    blocks,
    docs: {
      title: t("mail.section.docs"),
      fulfilled: status.counts.fulfilled,
      total: status.counts.total,
      line: t("s5.fulfilled", { ok: status.counts.fulfilled, total: status.counts.total }),
      groups: docGroups,
    },
    calc,
    signature,
  };
}
