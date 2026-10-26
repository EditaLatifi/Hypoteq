/**
 * Funnel answers → the body /api/inquiry already reads (app/[locale]/funnel/page.tsx is the
 * reference), so the server, its mails, the Prisma create and the Salesforce sync keep working.
 * The full state rides along in `v3` (v5 shape, version 2 — legacy.ts) for the 6.11 `answers`
 * block, the Nachreichung and everything v5 reads from the documents (Handover 8).
 *
 * Values follow what the existing server code expects, not the funnel labels:
 *   projektArt kauf|abloesung · borrowerType nat|jur · artImmobilie bestehend|neubau ·
 *   neubauArt bereits_erstellt|bauprojekt · artLiegenschaft/nutzung as the German labels in
 *   components/propertyLabels.ts · erwerb angestellt|selbständig|rentner · modell
 *   saron|mix|"2"|"3"|"5"|"10" · amounts as strings (the Prisma columns are String).
 *
 * v5 fills the legacy fields the existing mapping already reads where v5 now asks the value
 * (DECISIONS V5: the existing mapping wins, the value is in the JSON as well): the Eigenmittel
 * table (eigenmittel_*, the Darlehen → Darlehen_Eigenmittel__c), Kaufdatum, Netto-Mietertrag,
 * Steueroptimierung, PK-Verpfändung, the household income, Kreditnehmer 2, the
 * Renovationsbetrag (→ Renovationsbetrag__c, HYPOTEQ 19.10. B4), and of Kreditnehmer 1 the
 * birth date and Zivilstand read from the documents.
 *
 * Two yes/no answers are sent as «Ja»/«Nein» on purpose, not the old funnel's lowercase
 * «ja»: /api/inquiry rejects `renovation === "ja"` without a Renovationsbetrag and
 * `finanzierungsangebote === "ja"` without bank offers, and the offers come from the
 * documents. Salesforce and the mail read both spellings.
 */

import { calcForState } from "./calc";
import { FUNNEL_STATE_VERSION } from "./legacy";
import type { SignatureJson } from "./signature";
import { EMPTY_EM, isRentedNutzung, type Anrede, type Borrower, type FunnelState, type Job, type Laufzeit, type Liegenschaft, type Nutzung, type YesNo } from "./types";

export type Locale = "de" | "en" | "fr" | "it";

export interface InquiryPayloadOptions {
  locale: Locale;
  submissionId: string;
  documents?: any[];
  documentCompleteness?: any;
  sharepointFolderId?: string | null;
  /** The Auskunftsermächtigung as signature.ts judged it (Handover 6, 8). */
  signature?: SignatureJson;
  /** The customer's choices on the Abgleich page (Spezifikation Datenabgleich 3, 6.2). */
  choices?: Record<string, unknown>;
}

/** Korrespondenzsprache = funnel language (spec 7). */
export const KORRESPONDENZSPRACHE: Record<Locale, string> = {
  de: "Deutsch",
  en: "Englisch",
  fr: "Französisch",
  it: "Italienisch",
};

/** Spec 6.5. (Ferienobjekt, which had no Salesforce value, is no longer offered — Handover 2.) */
export const ART_LIEGENSCHAFT: Record<Liegenschaft, string> = {
  Einfamilienhaus: "Einfamilienhaus",
  Stockwerkeigentum: "Wohnung",
  Mehrfamilienhaus: "Mehrfamilienhaus",
};

/** Spec 6.4: PersonAccount.Salutation. The sync turns this into Mr. / Mrs. on a new Account. */
export const ANREDE: Record<Anrede, string> = {
  Herr: "Herr",
  Frau: "Frau",
};

/**
 * Spec 6.5; Handover 8: Gewerbe → «Für eigenes Geschäft»; HYPOTEQ 19.10. B5: «Vermietet & teilweise
 * selbstbewohnt» is its own picklist value on Nutzung_der_Immobilie__c.
 */
export const NUTZUNG: Record<Nutzung, string> = {
  Selbstbewohnt: "Selbstbewohnt",
  Vermietet: "Rendite-Immobilie",
  Zweitwohnsitz: "Zweitwohnsitz",
  "Vermietet & teilweise selbstbewohnt": "Vermietet & teilweise selbstbewohnt",
  Gewerbe: "Für eigenes Geschäft",
};

export const ERWERB: Record<Job, string> = {
  Angestellt: "angestellt",
  Selbständig: "selbständig",
  Pensioniert: "rentner",
};

export const MODELL: Record<Laufzeit, string> = {
  SARON: "saron",
  "2 Jahre": "2",
  "3 Jahre": "3",
  "5 Jahre": "5",
  "10 Jahre": "10",
  Mix: "mix",
};

const jn = (v: YesNo) => (v === "Ja" ? "ja" : "nein");
const amount = (n: number) => (Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "");

/** Kommentar__c: the Verwendungszweck goes first (spec 6.5 / 6.7). */
export function buildKommentar(zweck: string, kommentar: string): string {
  const z = zweck.trim();
  const k = kommentar.trim();
  if (!z) return k;
  return k ? `Verwendungszweck: ${z}\n\n${k}` : `Verwendungszweck: ${z}`;
}

export function toInquiryPayload(state: FunnelState, opts: InquiryPayloadOptions) {
  const { ans, txt, fin, role } = state;
  // Defensive: a caller with an older state object has no Eigenmittel and no document facts.
  const em = state.em ?? EMPTY_EM;
  const info = state.info ?? {};
  const isPartner = role === "berater";
  const isJur = ans.kn === "Juristische Person";
  const isKauf = ans.antrag === "Neue Hypothek";
  const isAbl = ans.antrag === "Ablösung";
  const borrowerType = isJur ? "jur" : "nat";
  // v5: the customer's phone is asked in both roles (Handover 2 Schritt 1).
  const phone = txt.tel.trim();
  const mail = txt.mail.trim();
  // Anrede (spec 6.4) belongs to the contact, a natural person; a company has none.
  const anrede = !isJur && ans.anrede ? ANREDE[ans.anrede] : "";
  const calc = calcForState(state);
  // Kreditnehmer 2 exists only once added (Handover 2 Schritt 3: the mail showed one without).
  const borrowers = isJur ? [] : state.borrowers;

  const artImmobilie = ans.immo === "Bestehende Immobilie" ? "bestehend" : ans.immo ? "neubau" : "";
  const neubauArt = ans.immo === "Neubau" ? "bereits_erstellt" : ans.immo === "Bauprojekt" ? "bauprojekt" : "";

  // The client is whoever submits: the customer, or the partner (whose e-mail is all the
  // old server reads for a partner — it resolves Partner_Consultant__c from it).
  const client = isPartner
    ? { email: txt.bmail.trim() }
    : { firstName: txt.vor.trim(), lastName: txt.nach.trim(), email: mail, phone, anrede };

  const kreditnehmer = isJur
    ? [
        {
          vorname: txt.vor.trim(),
          name: txt.nach.trim(),
          firmenname: txt.firma.trim(),
          zeichnungsberechtigt: txt.zeichner.trim(),
          email: mail,
          telefon: phone,
        },
      ]
    : borrowers.map((b: Borrower, i: number) => ({
        id: b.id,
        // The first borrower is the step-1 contact; the UI keeps them in step, txt wins.
        vorname: (i === 0 ? txt.vor : b.vor).trim(),
        name: (i === 0 ? txt.nach : b.nach).trim(),
        // Only the contact is asked for an Anrede; Kreditnehmer 2 has none (Handover 2).
        anrede: i === 0 ? anrede : "",
        email: i === 0 ? mail : "",
        telefon: i === 0 ? phone : "",
        // Read from the ID / the tax return (Handover 3.1) — Kreditnehmer 1's documents.
        geburtsdatum: i === 0 ? info.geb ?? "" : "",
        zivilstand: i === 0 ? info.zivil ?? "" : "",
        erwerb: b.job ? ERWERB[b.job] : "",
        pkVorhanden: b.job === "Selbständig" ? jn(b.pkSe) : "",
        einkommen: amount(i === 0 ? fin.inc : i === 1 ? fin.inc2 : 0),
      }));

  return {
    customerType: isPartner ? ("partner" as const) : ("direct" as const),
    locale: opts.locale,
    korrespondenzsprache: KORRESPONDENZSPRACHE[opts.locale] ?? "Deutsch",
    email: client.email,
    client,
    // The partner as entered. The server does not read it yet.
    partner: isPartner
      ? {
          email: txt.bmail.trim(),
          vorname: txt.pvor.trim(),
          nachname: txt.pnach.trim(),
          telefon: txt.ptel.trim(),
          firma: txt.pfirma.trim(),
        }
      : null,
    project: {
      projektArt: isKauf ? "kauf" : isAbl ? "abloesung" : "",
      kreditnehmerTyp: borrowerType,
      borrowerType,
      liegenschaftZip: txt.plz.trim(),
      // Prisma keeps neubauArt on Project only.
      neubauArt,
    },
    property: {
      zip: txt.plz.trim(),
      ort: txt.ort.trim(),
      artImmobilie,
      neubauArt,
      artLiegenschaft: ans.lieg ? ART_LIEGENSCHAFT[ans.lieg] ?? "" : "",
      stockwerkeigentum: ans.lieg === "Stockwerkeigentum" ? "ja" : "",
      nutzung: ans.nutz ? NUTZUNG[ans.nutz] ?? "" : "",
      baurecht: jn(ans.baurecht),
      neubauGrundbuchGvVorhanden: ans.immo === "Neubau" ? jn(ans.nbDocs) : "",
      reserviert: isKauf ? jn(ans.reserviert) : "",
      renovation: isKauf ? ans.reno : "", // «Ja»/«Nein», see the header
      // Renovationsbetrag__c (HYPOTEQ 19.10. B4, DECISIONS V4), only with Renovation = Ja.
      renovationsBetrag: isKauf && ans.reno === "Ja" ? amount(fin.renoBetrag) : "",
      finanzierungsangebote: ans.angebote, // «Ja»/«Nein», see the header
      angebote: [] as { bank?: string; zins?: string; laufzeit?: string }[],
      angeboteListe: [] as string[],
      kreditnehmer,
      firmen: isJur ? [{ firmenname: txt.firma.trim() }] : [],
    },
    financing: {
      kaufpreis: isKauf ? amount(fin.kaufpreis) : "",
      kaufdatum: isKauf ? txt.kaufdatum.trim() : "",
      // Handover 8: at an Ablösung Kaufdatum__c takes the Ablösedatum of the Zinsabrechnung.
      abloesedatum: isAbl ? info.abl ?? "" : "",
      abloesung_betrag: isAbl ? amount(fin.old) : "",
      // The server and the sync accept «Ja» (Hypothekarvolumen__c compares === 'Ja').
      erhoehung: isAbl ? ans.aufstockung : "",
      erhoehung_betrag: isAbl && ans.aufstockung === "Ja" ? amount(fin.up) : "",
      // Bruttoeinkommen Haushalt: Kreditnehmer 1 + 2 (Handover 5).
      brutto: isJur ? "" : amount(calc.income),
      immobilienwert: amount(calc.value),
      // Also «Vermietet & teilweise selbstbewohnt» (DECISIONS V58).
      netto_mietertrag: isRentedNutzung(ans.nutz) ? amount(fin.miete) : "",
      // Gesamtfinanzierung as the funnel computed it; the mail shows it as Hypothekarbetrag.
      hypoBetrag: amount(calc.need),
      modell: ans.laufzeit ? MODELL[ans.laufzeit] : "",
      // The Eigenmittel table (Handover 2) in the existing fields; PK-Verpfändung is no
      // Eigenmittel — Verpf_ndung_PK__c says Ja, the amount is in the JSON (Handover 8).
      eigenmittel_bar: isKauf ? amount(em.spar) : "",
      eigenmittel_saeule3: amount(em.s3a),
      eigenmittel_pk: isKauf ? amount(em.pkVor) : "",
      eigenmittel_schenkung: isKauf ? amount(em.schenk) : "",
      eigenmittel_erbschaft: isKauf ? amount(em.erbe) : "",
      eigenmittel_darlehen: isKauf ? amount(em.darl) : "",
      pkVorbezug: em.pkVerp > 0 ? "Ja" : "Nein",
      steueroptimierung: ans.steuer,
      leasingVorhanden: jn(ans.leasing),
      kommentar: buildKommentar(txt.zweck, txt.kommentar),
    },
    borrowers: [isJur ? { type: borrowerType, firmaName: txt.firma.trim() } : { type: borrowerType }],
    submissionId: opts.submissionId,
    documents: opts.documents ?? [],
    documentCompleteness: opts.documentCompleteness ?? null,
    sharepointFolderId: opts.sharepointFolderId ?? null,
    v3: {
      version: FUNNEL_STATE_VERSION,
      role,
      /** Handover 8 `entry`. */
      mode: state.mode ?? "begleitet",
      ans,
      txt,
      fin,
      em,
      borrowers: isJur ? state.borrowers.slice(0, 1) : borrowers,
      info,
      src: state.src ?? {},
      sig: state.sig ?? null,
      ...(opts.signature ? { signature: opts.signature } : {}),
      ...(opts.choices && Object.keys(opts.choices).length ? { abgleich: { choices: opts.choices } } : {}),
      calc,
    },
  };
}

export type InquiryPayload = ReturnType<typeof toInquiryPayload>;
