/**
 * Where the portal's «Neue Finanzierung starten» goes: the Funnel v3 as Berater with the
 * partner's address filled in (recognised at once) and the way back to the portal in the
 * closing (components/funnel-v3/logic.ts entryFromParams).
 *
 * The buttons link to NEW_FINANCING_PATH, not to the funnel: that route puts in the address
 * Salesforce has on the partner's Contact, which the funnel recognises them by. The login
 * can differ from it (a second login on the same Contact).
 *
 * A plain module on purpose: it is called from server components (the dashboard page) and
 * from the client shell. Exporting it from a "use client" file turned the server import into
 * a client reference, and calling that on the server threw at request time — the build
 * cannot see it, the deployment showed «a server-side exception has occurred».
 */
export const NEW_FINANCING_PATH = "/portal/neue-finanzierung";

export function newFinancingHref(locale: string, email: string): string {
  const q = new URLSearchParams({ customer: "partner", bmail: email, from: "portal" });
  return `/${locale}/funnel?${q.toString()}`;
}
