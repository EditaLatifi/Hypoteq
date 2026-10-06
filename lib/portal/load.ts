import { cache } from "react";
import type { Locale } from "@/lib/portal/i18n/dict";
import { syncNotifications } from "@/lib/portal/notifications";
import { listPartnerCases, type PortalCaseSummary } from "@/lib/portal/salesforce";
import { scopeFor } from "@/lib/portal/scope";
import { requestOrigin, type SessionUser } from "@/lib/portal/session";

/**
 * The Cases this session shows, or whether loading failed. For a partner the load also
 * records changes as notifications; an admin viewing as a partner changes nothing.
 * Cached per request: the layout (sidebar counts) and the page share one Salesforce query.
 */
export const loadMyCases = cache(async (user: SessionUser, locale: Locale): Promise<{ cases: PortalCaseSummary[]; failed: boolean }> => {
  if (!user.contactId) return { cases: [], failed: false };
  let cases: PortalCaseSummary[];
  try {
    const scope = await scopeFor(user);
    if (!scope) return { cases: [], failed: false };
    cases = await listPartnerCases(scope, locale);
  } catch (err) {
    console.error("[portal] loading cases from Salesforce failed", err);
    return { cases: [], failed: true };
  }
  if (!user.viewingAs) {
    try {
      await syncNotifications(user, user.contactId, cases, { origin: requestOrigin() });
    } catch (err) {
      console.error("[portal] notification sync failed", err);
    }
  }
  return { cases, failed: false };
});
