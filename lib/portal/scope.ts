import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getContact, type PartnerScope } from "@/lib/portal/salesforce";
import type { SessionUser } from "@/lib/portal/session";

type PartnerRecord = { sfContactId: string | null; sfAccountId: string | null; companyScope: boolean };

/** Scope of a partner's own portal account. */
export function scopeOfPartner(p: PartnerRecord): PartnerScope | null {
  return p.sfContactId ? { contactId: p.sfContactId, accountId: p.sfAccountId, companyWide: p.companyScope } : null;
}

/**
 * Whose Cases this session shows. An admin viewing as a partner gets exactly that
 * partner's scope: their portal settings if they have an account, otherwise what an
 * invite would give them (company-wide for the company's primary contact).
 */
export const scopeFor = cache(async (user: SessionUser): Promise<PartnerScope | null> => {
  if (!user.contactId) return null;
  if (!user.viewingAs) return scopeOfPartner(user);

  const contactId = user.viewingAs.contactId;
  const account = await prisma.portalUser.findFirst({
    where: { sfContactId: contactId },
    select: { sfContactId: true, sfAccountId: true, companyScope: true },
  });
  if (account) return scopeOfPartner(account);
  const contact = await getContact(contactId);
  return { contactId, accountId: contact?.AccountId ?? null, companyWide: contact?.Primary__c === true };
});
