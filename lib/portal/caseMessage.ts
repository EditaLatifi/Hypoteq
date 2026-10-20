import { teamAddress } from "@/lib/portal/config";
import { defaultConnection, type SfConnection } from "@/lib/portal/changeRequests";
import { sendTeamMail } from "@/lib/portal/mail";
import { createPortalMeldung, type MeldungInput } from "@/lib/portal/meldung";
import { addCaseComment, isSalesforceId } from "@/lib/portal/salesforce";

/**
 * «Nachricht oder Information senden» on a Case (HYPOTEQ 19.10.2026 B22, DECISIONS P25).
 *
 * Two things at once:
 *  1. an e-mail to info@hypoteq.ch, subject «Portal-Nachricht · {Case-Nr} · {Kundenname}»,
 *     Reply-To the partner, the Case owner in copy;
 *  2. a Portal_Meldung__c of type Case-Nachricht with Case__c (HYPOTEQ 20.10.2026,
 *     lib/portal/meldung.ts): HYPOTEQ's Flow makes the completed Task on the Case from it (owner
 *     = Case owner, «Portal-Nachricht: {erste Worte}», the full text), so it is in the Case's
 *     activity timeline. The integration user's licence cannot create the Task itself.
 * A CaseComment is written only when Salesforce refuses the Meldung, so the message is in
 * Salesforce once, not twice. The portal's own copy (PortalMessage) is what «Letzte Updates» lists.
 */

export const SUBJECT_WORDS_MAX = 80;

/** The first words of the message, at most `max` characters, cut at a word: «Bitte noch …». */
export function firstWords(body: string, max = SUBJECT_WORDS_MAX): string {
  const line = body.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max / 2 ? cut.slice(0, atWord) : cut).replace(/[\s,;:.–-]+$/, "")} …`;
}

export function caseMessageSubject(nr: string, kunde: string): string {
  return `Portal-Nachricht · ${nr} · ${kunde}`.slice(0, 250);
}

export type MessageAuthor = { name: string | null; email: string; company: string | null; accountId?: string | null };

export function authorLabel(u: MessageAuthor): string {
  return `${u.name || u.email}${u.company ? ` (${u.company})` : ""}`;
}

/** The Meldung on the Case. Beschreibung: the full message, then who sent it. */
export function caseMessageMeldung(p: { caseId: string; body: string; author: MessageAuthor }): MeldungInput {
  return {
    typ: "case_nachricht",
    betreff: `Portal-Nachricht: ${firstWords(p.body)}`,
    beschreibung: `${p.body}\n\n— ${authorLabel(p.author)}, ${p.author.email} (Partnerportal)`,
    partnerEmail: p.author.email,
    partnerAccountId: p.author.accountId ?? null,
    caseId: p.caseId,
  };
}

export function caseMessageMail(p: { nr: string; kunde: string; body: string; author: MessageAuthor }): { subject: string; lines: string[] } {
  return {
    subject: caseMessageSubject(p.nr, p.kunde),
    lines: [
      `${authorLabel(p.author)} schreibt zu Case ${p.nr} · ${p.kunde}:`,
      p.body,
      `«Antworten» geht direkt an ${p.author.email}. Die Nachricht ist als erledigte Aufgabe am Case erfasst.`,
    ],
  };
}

export type CaseMessageDeps = {
  sf: SfConnection;
  mail: typeof sendTeamMail;
  comment: (caseId: string, body: string) => Promise<void>;
};

/** `meldungId`: the Portal_Meldung__c; `comment`: the CaseComment written when it was refused. */
export type CaseMessageResult = { meldungId: string | null; comment: boolean; mailed: boolean };

function errorText(err: any): string {
  if (Array.isArray(err?.errors) && err.errors.length) return err.errors.map((e: any) => e?.message || String(e)).join("; ");
  return err?.data?.message || err?.message || String(err);
}

/**
 * Deliver a partner's message: the mail and the Meldung in parallel; neither waits for or
 * stops the other. Never throws — the caller says «sent» when anything got through.
 */
export async function deliverCaseMessage(
  p: { caseId: string; nr: string; kunde: string; ownerEmail: string | null; body: string; author: MessageAuthor; origin: string },
  deps: Partial<CaseMessageDeps> = {}
): Promise<CaseMessageResult> {
  const sf = deps.sf ?? defaultConnection();
  const mail = deps.mail ?? sendTeamMail;
  const comment = deps.comment ?? addCaseComment;

  const inSalesforce = (async (): Promise<{ meldungId: string | null; comment: boolean }> => {
    if (!isSalesforceId(p.caseId)) return { meldungId: null, comment: false };
    const meldung = await createPortalMeldung(sf, caseMessageMeldung(p));
    if (meldung.id) return { meldungId: meldung.id, comment: false };
    console.error("[portal] Portal_Meldung for the Case message refused; writing a CaseComment instead", meldung.error);
    try {
      await comment(p.caseId, `[Partnerportal] ${authorLabel(p.author)}:\n\n${p.body}`);
      return { meldungId: null, comment: true };
    } catch (err) {
      console.error("[portal] CaseComment for the Case message failed too (the mail still goes out)", errorText(err));
      return { meldungId: null, comment: false };
    }
  })();

  const m = caseMessageMail(p);
  const mailed = mail({ to: teamAddress(), cc: p.ownerEmail ? [p.ownerEmail] : [], replyTo: p.author.email, subject: m.subject, lines: m.lines, origin: p.origin }).then(
    () => true,
    (err) => {
      console.error("[portal] Case message mail failed", errorText(err));
      return false;
    }
  );

  const [sfResult, mailResult] = await Promise.all([inSalesforce, mailed]);
  return { ...sfResult, mailed: mailResult };
}
