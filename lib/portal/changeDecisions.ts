import { prisma } from "@/lib/prisma";
import { changeRequestNr, defaultConnection, queryTolerant, type ChangeStatus, type SfConnection } from "@/lib/portal/changeRequests";
import { sendChangeDecisionMail } from "@/lib/portal/mail";
import { isSalesforceId } from "@/lib/portal/salesforce";

/**
 * HYPOTEQ decides a partner's change request in Salesforce, on the request's Portal_Meldung__c
 * (HYPOTEQ 21.10.2026): Entscheid__c (Offen / Angenommen / Abgelehnt) and Entscheid_Begruendung__c.
 * The portal shows both with the request, takes a decision over as its status and mails the
 * partner once (M14). The status on /portal/admin/aenderungen stays as the way to decide without
 * Salesforce; a decision in Salesforce wins, «Offen» there leaves the portal's status alone.
 */

export type MeldungDecision = { status: Extract<ChangeStatus, "uebernommen" | "abgelehnt"> | null; reason: string | null };

/** Entscheid__c → the portal's status; the Begründung as written. Tolerant of case and «Übernommen». */
export function decisionFromMeldung(rec: any): MeldungDecision {
  const raw = String(rec?.Entscheid__c ?? "").trim().toLowerCase();
  const status = raw === "angenommen" || raw === "übernommen" ? "uebernommen" : raw === "abgelehnt" ? "abgelehnt" : null;
  const text = typeof rec?.Entscheid_Begruendung__c === "string" ? rec.Entscheid_Begruendung__c.trim() : "";
  return { status, reason: text || null };
}

/** The decisions of these Portal_Meldung__c, by their Id. An org without the two fields yields «no decision». */
export async function loadMeldungDecisions(ids: string[], sf: SfConnection = defaultConnection()): Promise<Map<string, MeldungDecision>> {
  const valid = Array.from(new Set(ids.filter(isSalesforceId)));
  const out = new Map<string, MeldungDecision>();
  for (let i = 0; i < valid.length; i += 200) {
    const list = valid.slice(i, i + 200).map((id) => `'${id}'`).join(",");
    const rows = await queryTolerant(sf, ["Id", "Entscheid__c", "Entscheid_Begruendung__c"], (select) => `SELECT ${select} FROM Portal_Meldung__c WHERE Id IN (${list})`);
    for (const r of rows) out.set(r.Id, decisionFromMeldung(r));
  }
  return out;
}

type RequestRow = { id: string; userId: string; field: string; status: string; sfTaskId: string | null };

/**
 * M14 to the partner who filed the request, in their portal language. Not to a deactivated
 * access (like the Case mails); a failed mail is logged, the decision stands.
 */
export async function mailChangeDecision(row: Pick<RequestRow, "id" | "userId" | "field">, approved: boolean, origin: string, send = sendChangeDecisionMail): Promise<void> {
  const nr = changeRequestNr(row.id);
  try {
    const partner = await prisma.portalUser.findUnique({ where: { id: row.userId }, select: { email: true, name: true, locale: true, status: true } });
    if (!partner || partner.status === "disabled") return;
    await send({ to: partner.email, name: partner.name, origin, locale: partner.locale, nr, field: row.field, approved });
  } catch (err) {
    console.error(`[portal] change request ${nr}: decision mail failed`, err);
  }
}

/**
 * Takes HYPOTEQ's decisions from Salesforce over and mails each newly decided request once.
 * Updates the rows in place (status) and returns the decisions by request id for display.
 * Salesforce unreachable: nothing changes and the page shows what the portal has.
 */
export async function syncChangeDecisions(
  rows: RequestRow[],
  opts: { origin: string; sf?: SfConnection; send?: typeof sendChangeDecisionMail }
): Promise<Map<string, MeldungDecision>> {
  const byRequest = new Map<string, MeldungDecision>();
  const linked = rows.filter((r) => r.sfTaskId);
  if (!linked.length) return byRequest;
  let decisions: Map<string, MeldungDecision>;
  try {
    decisions = await loadMeldungDecisions(linked.map((r) => r.sfTaskId!), opts.sf);
  } catch (err) {
    console.error("[portal] reading change request decisions from Salesforce failed", err);
    return byRequest;
  }
  for (const r of linked) {
    const d = decisions.get(r.sfTaskId!);
    if (!d) continue;
    byRequest.set(r.id, d);
    if (!d.status || d.status === r.status) continue;
    // Only the caller that changes the status mails: two page loads at once send one M14.
    const { count } = await prisma.portalChangeRequest.updateMany({
      where: { id: r.id, status: { not: d.status } },
      data: { status: d.status, decidedAt: new Date(), decidedBy: "Salesforce" },
    });
    r.status = d.status;
    if (count) await mailChangeDecision(r, d.status === "uebernommen", opts.origin, opts.send);
  }
  return byRequest;
}

/** The daily cron: every request still open in the portal that has a Portal_Meldung__c. */
export async function syncOpenChangeDecisions(origin: string): Promise<number> {
  const open = await prisma.portalChangeRequest.findMany({
    where: { status: "in_pruefung", sfTaskId: { not: null } },
    select: { id: true, userId: true, field: true, status: true, sfTaskId: true },
  });
  const decided = await syncChangeDecisions(open, { origin });
  return Array.from(decided.values()).filter((d) => d.status).length;
}
