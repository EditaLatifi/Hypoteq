import { NextResponse } from "next/server";
import { newFinancingHref } from "@/lib/portal/funnelLink";
import { getLocale } from "@/lib/portal/i18n/server";
import { getContact } from "@/lib/portal/salesforce";
import { requireUser } from "@/lib/portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * «Neue Finanzierung starten» → the funnel as Berater. The funnel recognises a partner by the
 * e-mail on their Salesforce Contact, so that address goes along; the login only when the
 * Contact has none or Salesforce cannot be reached (the partner then fills in the rest).
 */
export async function GET(req: Request) {
  const user = await requireUser();
  let email = user.email;
  if (user.contactId && !user.viewingAs) {
    try {
      email = (await getContact(user.contactId))?.Email?.trim() || email;
    } catch (err) {
      console.error("[portal] Contact lookup for the funnel link failed", err);
    }
  }
  return NextResponse.redirect(new URL(newFinancingHref(await getLocale(), email), req.url), 302);
}
