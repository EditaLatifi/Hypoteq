/**
 * Funnel v3 answers → the body /api/inquiry already reads (app/[locale]/funnel/page.tsx is
 * the reference), so the server, its mails, the Prisma create and the Salesforce sync keep
 * working unchanged. The full v3 state rides along in `v3` for the 6.11 `answers` block.
 *
 * Values follow what the existing server code expects, not the v3 labels:
 *   projektArt kauf|abloesung · borrowerType nat|jur · artImmobilie bestehend|neubau ·
 *   neubauArt bereits_erstellt|bauprojekt · artLiegenschaft/nutzung as the German labels in
 *   components/propertyLabels.ts · erwerb angestellt|selbständig|rentner · modell
 *   saron|mix|"2"|"3"|"5"|"10" · amounts as strings (the Prisma columns are String).
 *
 * Two yes/no answers are sent as «Ja»/«Nein» on purpose, not the old funnel's lowercase
 * «ja»: /api/inquiry rejects `renovation === "ja"` without a Renovationsbetrag and
 * `finanzierungsangebote === "ja"` without bank offers, and v3 asks for neither (the amounts
 * and offers come from the documents). Salesforce and the mail read both spellings.
 */

import { calcFinancing } from "./calc";
import type { Anrede, Borrower, FunnelState, Job, Laufzeit, Liegenschaft, Nutzung, YesNo } from "./types";

export type Locale = "de" | "en" | "fr" | "it";

export interface InquiryPayloadOptions {
  locale: Locale;
  submissionId: string;
  documents?: any[];
  documentCompleteness?: any;
  sharepointFolderId?: string | null;
}

/** Korrespondenzsprache = funnel language (spec 7). */
export const KORRESPONDENZSPRACHE: Record<Locale, string> = {
  de: "Deutsch",
  en: "Englisch",
  fr: "Französisch",
  it: "Italienisch",
};

/**
 * Spec 6.5. Ferienobjekt has no Salesforce picklist value (DECISIONS D8, S9): it is sent empty
 * on purpose, so Art_der_Liegenschaft__c stays unset instead of relying on Salesforce rejecting
 * an unknown value. The raw answer is still in `v3.ans.lieg` (and in the Dokumenten-Check JSON).
 */
export const ART_LIEGENSCHAFT: Record<Liegenschaft, string> = {
  Einfamilienhaus: "Einfamilienhaus",
  Stockwerkeigentum: "Wohnung",
  Mehrfamilienhaus: "Mehrfamilienhaus",
  Ferienobjekt: "",
};

/** Spec 6.4: PersonAccount.Salutation. The sync turns this into Mr. / Mrs. on a new Account. */
export const ANREDE: Record<Anrede, string> = {
  Herr: "Herr",
  Frau: "Frau",
};

export const NUTZUNG: Record<Nutzung, string> = {
  Selbstbewohnt: "Selbstbewohnt",
  Vermietet: "Rendite-Immobilie",
  Zweitwohnsitz: "Zweitwohnsitz",
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
  const isPartner = role === "berater";
  const isJur = ans.kn === "Juristische Person";
  const isKauf = ans.antrag === "Neue Hypothek";
  const isAbl = ans.antrag === "Ablösung";
  const borrowerType = isJur ? "jur" : "nat";
  const phone = isPartner ? "" : txt.tel.trim();
  const mail = txt.mail.trim();
  // Anrede (spec 6.4) belongs to the step-1 contact, a natural person; a company has none.
  const anrede = !isJur && ans.anrede ? ANREDE[ans.anrede] : "";

  const calc = calcFinancing({
    antrag: ans.antrag,
    aufstockung: ans.aufstockung,
    old: fin.old,
    up: fin.up,
    val: fin.val,
    inc: fin.inc,
    kn: ans.kn,
  });

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
          email: mail,
          telefon: phone,
        },
      ]
    : state.borrowers.map((b: Borrower, i: number) => ({
        id: b.id,
        // The first borrower is the step-1 contact; the UI keeps them in step, txt wins.
        vorname: (i === 0 ? txt.vor : b.vor).trim(),
        name: (i === 0 ? txt.nach : b.nach).trim(),
        // Only the step-1 contact is asked for an Anrede; co-borrowers have none (spec 3).
        anrede: i === 0 ? anrede : "",
        email: i === 0 ? mail : "",
        telefon: i === 0 ? phone : "",
        geburtsdatum: "",
        erwerb: b.job ? ERWERB[b.job] : "",
        zivilstand: "",
        pkVorhanden: b.job === "Selbständig" ? jn(b.pkSe) : "",
      }));

  return {
    customerType: isPartner ? ("partner" as const) : ("direct" as const),
    locale: opts.locale,
    korrespondenzsprache: KORRESPONDENZSPRACHE[opts.locale] ?? "Deutsch",
    email: client.email,
    client,
    // New: the partner as entered. The server does not read it yet (see the report).
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
      artLiegenschaft: ans.lieg ? ART_LIEGENSCHAFT[ans.lieg] : "",
      stockwerkeigentum: ans.lieg === "Stockwerkeigentum" ? "ja" : "",
      nutzung: ans.nutz ? NUTZUNG[ans.nutz] : "",
      baurecht: jn(ans.baurecht),
      neubauGrundbuchGvVorhanden: ans.immo === "Neubau" ? jn(ans.nbDocs) : "",
      reserviert: isKauf ? jn(ans.reserviert) : "",
      renovation: isKauf ? ans.reno : "", // «Ja»/«Nein», see the header
      renovationsBetrag: "",
      finanzierungsangebote: ans.angebote, // «Ja»/«Nein», see the header
      angebote: [] as { bank?: string; zins?: string; laufzeit?: string }[],
      angeboteListe: [] as string[],
      kreditnehmer,
      firmen: isJur ? [{ firmenname: txt.firma.trim() }] : [],
    },
    financing: {
      kaufpreis: isKauf ? amount(fin.kaufpreis) : "",
      abloesung_betrag: isAbl ? amount(fin.old) : "",
      // The server and the sync accept «Ja» (Hypothekarvolumen__c compares === 'Ja').
      erhoehung: isAbl ? ans.aufstockung : "",
      erhoehung_betrag: isAbl && ans.aufstockung === "Ja" ? amount(fin.up) : "",
      brutto: isJur ? "" : amount(fin.inc),
      immobilienwert: amount(fin.val),
      // Gesamtfinanzierung as the funnel computed it; the mail shows it as Hypothekarbetrag.
      hypoBetrag: amount(calc.need),
      modell: ans.laufzeit ? MODELL[ans.laufzeit] : "",
      // Spec 6.7: Verpf_ndung_PK__c. «Ja»/«Nein» as the sync's picklist sanitiser expects.
      pkVorbezug: ans.pk,
      leasingVorhanden: jn(ans.leasing),
      kommentar: buildKommentar(txt.zweck, txt.kommentar),
    },
    borrowers: [isJur ? { type: borrowerType, firmaName: txt.firma.trim() } : { type: borrowerType }],
    submissionId: opts.submissionId,
    documents: opts.documents ?? [],
    documentCompleteness: opts.documentCompleteness ?? null,
    sharepointFolderId: opts.sharepointFolderId ?? null,
    v3: {
      version: 1,
      role,
      ans,
      txt,
      fin,
      borrowers: state.borrowers,
      calc,
    },
  };
}

export type InquiryPayload = ReturnType<typeof toInquiryPayload>;
