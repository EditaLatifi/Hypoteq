/**
 * Partner Fast Lead in Salesforce at the invitation (HYPOTEQ 23.11.2026, DECISIONS P40): the Case
 * is created the moment the partner invites the customer, so HYPOTEQ can call them right away.
 * The customer's submit later updates this very Case with the funnel's data
 * (syncFunnelStepsToSalesforce writeFunnelCase).
 *
 *   Person Account   the one with the customer's address, else a new one (name, e-mail, phone,
 *                    salutation) — the submit's sync finds it again by the same address
 *   Case             Client__c = that Account, Partner_Consultant__c + Sales Partner = the partner,
 *                    Stage «Needs Analysis», Korrespondenzsprache, queue «Web-Anfragen» and record
 *                    type «Standardfinanzierung» as every funnel Case, the Fast Lead note in Comments
 *                    and the contact in Description
 *
 * Throws when Salesforce refuses the Case; the caller keeps the invitation (the submit then
 * creates the Case as for any request).
 */

import { KORRESPONDENZSPRACHE } from "@/lib/funnel-v3/toInquiryPayload";
import {
  applyFunnelOwner,
  applyFunnelRecordType,
  applyLeadPartnerToCase,
  funnelCaseName,
  toSalesforceSalutation,
  type LeadPartnerOnCase,
} from "./syncFunnelStepsToSalesforce";

export type LeadCaseInput = {
  customer: { anrede: string | null; firstName: string; lastName: string; email: string; phone: string | null; locale: string };
  partner: LeadPartnerOnCase & { contactId: string };
  /** When the customer's link stops opening the funnel (Description). */
  expiresAt: Date;
};

export type LeadCaseResult = { caseId: string; accountId: string | null; dropped: string[] };

const swissDate = (d: Date) => d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Zurich" });

/** Description of the invitation's Case: who invited whom, the contact, the consent, what follows. */
export function leadCaseDescription(input: LeadCaseInput): string {
  const c = input.customer;
  const p = input.partner;
  const partner = [p.name, p.company && p.company !== p.name ? `(${p.company})` : ""].filter(Boolean).join(" ") || p.email || "Partner";
  return [
    `Partner Fast Lead: ${partner} hat den Kunden über das Partnerportal eingeladen.`,
    `Kunde: ${[c.anrede, c.firstName, c.lastName].filter(Boolean).join(" ")} · ${c.email}${c.phone ? ` · ${c.phone}` : ""} · Sprache ${c.locale.toUpperCase()}`,
    "Der Partner hat bestätigt, dass der Kunde einverstanden ist, von HYPOTEQ per E-Mail und Telefon kontaktiert zu werden.",
    `Der Kunde vervollständigt die Anfrage über seinen persönlichen Link (gültig bis ${swissDate(input.expiresAt)}, Erinnerungen nach 3 und 7 Tagen); der Case wird dann mit seinen Angaben aktualisiert.`,
    p.email ? `Partner: ${p.email}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function createLeadCase(input: LeadCaseInput, salesforceApi: any): Promise<LeadCaseResult> {
  const c = input.customer;
  let accountId: string | null = null;
  const existing = await salesforceApi.findAccountByEmail(c.email);
  if (existing?.Id) {
    accountId = existing.Id;
  } else {
    const data: Record<string, any> = { LastName: c.lastName, FirstName: c.firstName, PersonEmail: c.email };
    if (c.phone) data.Phone = c.phone;
    const salutation = toSalesforceSalutation(c.anrede);
    if (salutation) data.Salutation = salutation;
    let created: any;
    try {
      created = await salesforceApi.createAccount(data);
    } catch (err) {
      // As in the sync: the salutation must not cost the Account (or the Case after it).
      if (!data.Salutation) throw err;
      const { Salutation: _dropped, ...rest } = data;
      created = await salesforceApi.createAccount(rest);
    }
    accountId = created?.id || created?.Id || null;
  }

  const caseData: Record<string, any> = {
    Case_Name__c: funnelCaseName({ vorname: c.firstName, nachname: c.lastName, submitter: input.partner.email }),
    Stage__c: "Needs Analysis",
    Korrespondenzsprache__c: KORRESPONDENZSPRACHE[c.locale as keyof typeof KORRESPONDENZSPRACHE] ?? "Deutsch",
    Description: leadCaseDescription(input),
  };
  if (accountId) {
    caseData.Client__c = accountId;
    caseData.Wie_viele_Kunden__c = "1";
  }
  applyLeadPartnerToCase(caseData, input.partner, "invited");
  await applyFunnelOwner(caseData, salesforceApi);
  await applyFunnelRecordType(caseData, salesforceApi);

  const created = await salesforceApi.createOrUpdateCase(caseData);
  const caseId = created?.id || created?.Id;
  if (!caseId) throw new Error("Salesforce returned no Case Id");
  const dropped: string[] = typeof salesforceApi.takeDroppedFields === "function" ? salesforceApi.takeDroppedFields() : [];
  return { caseId, accountId, dropped };
}
