/**
 * «Du bist Max Beispiel von der Beispiel Agentur Bern?» (Konzept HYPO Kap. 4): a typed name and agency
 * against the sales-partner Contacts in Salesforce. Read-only.
 *
 * Deliberately narrow, because the endpoint is public: the last name must match exactly (after
 * case and accents), and the first name or the agency must match too; only a single best Contact
 * is answered, with its name and company — never an id, an e-mail or a list. The case is assigned
 * by the e-mail HYPO asks next (the funnel's Berater e-mail, components/partnerDirectory.ts), so a
 * name match only greets; it never decides who gets the case.
 */

import { sfQuery } from "@/components/salesforceApi";
import { partnerContactFilter } from "@/components/partnerDirectory";

export interface PartnerCandidate {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}

export type PartnerMatchResult = { status: "match"; name: string; company: string | null } | { status: "none" };

/** «Mélanie» → «melanie»; punctuation to spaces. */
export function fold(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(["ag", "gmbh", "sa", "sarl", "sagl", "ltd", "und", "and", "et", "e", "de", "di", "la", "le", "der", "die", "das", "the", "von", "p", "&"]);

function agencyTokens(s: string | null | undefined): string[] {
  return fold(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/** How well a Contact fits; 0 = not at all. Last name exact, plus first name and/or agency. */
export function scoreCandidate(c: PartnerCandidate, typed: { vor: string; nach: string; firma: string }): number {
  if (!fold(c.lastName) || fold(c.lastName) !== fold(typed.nach)) return 0;
  const first = fold(typed.vor);
  const cFirst = fold(c.firstName);
  const firstOk = Boolean(first && cFirst && (cFirst === first || cFirst.split(" ")[0] === first.split(" ")[0]));
  const typedAgency = agencyTokens(typed.firma);
  const cAgency = new Set(agencyTokens(c.company));
  const agencyOk = typedAgency.length > 0 && typedAgency.some((t) => cAgency.has(t));
  if (!firstOk && !agencyOk) return 0;
  return (firstOk ? 2 : 0) + (agencyOk ? 1 : 0);
}

/** The single best candidate, or none when nothing fits or two fit equally well. */
export function bestCandidate(cands: readonly PartnerCandidate[], typed: { vor: string; nach: string; firma: string }): PartnerMatchResult {
  const scored = cands.map((c) => ({ c, s: scoreCandidate(c, typed) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return { status: "none" };
  if (scored.length > 1 && scored[1].s === scored[0].s) {
    // The same person twice (one Contact per agency branch) is still one answer.
    const same = scored.filter((x) => x.s === scored[0].s);
    const names = new Set(same.map((x) => `${fold(x.c.firstName)}|${fold(x.c.lastName)}|${fold(x.c.company)}`));
    if (names.size > 1) return { status: "none" };
  }
  const best = scored[0].c;
  return { status: "match", name: [best.firstName, best.lastName].filter(Boolean).join(" "), company: best.company };
}

/** SOQL literal for a LIKE: quotes and backslashes escaped, wildcards taken literally. */
export function likeLiteral(term: string): string {
  const esc = term.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `'%${esc}%'`;
}

export function buildPartnerNameQuery(nach: string): string {
  const filter = partnerContactFilter();
  return (
    `SELECT FirstName, LastName, Account.Name FROM Contact WHERE LastName LIKE ${likeLiteral(nach.trim())}` +
    `${filter ? ` ${filter}` : ""} ORDER BY CreatedDate ASC LIMIT 25`
  );
}

export async function matchPartner(typed: { vor: string; nach: string; firma: string }): Promise<PartnerMatchResult> {
  const rows = await sfQuery<any>(buildPartnerNameQuery(typed.nach), "hypo:partnerMatch");
  const cands = (rows || []).map((r: any): PartnerCandidate => ({ firstName: r.FirstName ?? null, lastName: r.LastName ?? null, company: r.Account?.Name ?? null }));
  return bestCandidate(cands, typed);
}
