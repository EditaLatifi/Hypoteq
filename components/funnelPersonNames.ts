// Shared borrower/company name helpers for a funnel submission.
// Used by both the notification email subject (app/api/inquiry) and the
// Salesforce Case name (syncFunnelStepsToSalesforce) so the two always agree.

// Collect the display names of every borrower on a submission:
// natural persons as "Vorname Name", companies (juristische Personen) as Firmenname.
// Falls back to the client's name when no borrower is present. Deduplicated,
// order preserved (persons first, then companies).
export function getBorrowerNames(data: any): string[] {
  const pr = data?.property || {};
  const names: string[] = [];
  const seen = new Set<string>();

  const push = (raw: any) => {
    const name = String(raw || "").trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  };

  const persons: any[] = [
    ...(Array.isArray(pr.kreditnehmer) ? pr.kreditnehmer : []),
    ...(Array.isArray(data?.borrowers) ? data.borrowers : []),
  ];

  // Natural persons: first + last name.
  for (const p of persons) {
    if (p?.firmenname) continue; // company entry — handled below
    push(`${p?.vorname || p?.firstName || ""} ${p?.name || p?.lastName || ""}`.trim());
  }

  // Companies: from property.firmen and from any kreditnehmer carrying a firmenname.
  for (const firma of Array.isArray(pr.firmen) ? pr.firmen : []) {
    push(firma?.firmenname || firma?.name);
  }
  for (const p of persons) {
    if (p?.firmenname) push(p.firmenname);
  }

  // Fallback: the client (used for direct submissions without a kreditnehmer array).
  if (names.length === 0) {
    const c = data?.client || {};
    push(`${c?.vorname || c?.firstName || ""} ${c?.name || c?.lastName || ""}`.trim());
  }

  return names;
}

// Single display string for all borrowers, e.g. "Max Muster & ACME GmbH".
// Returns "" when nothing usable is present.
export function getBorrowerDisplayName(data: any): string {
  return getBorrowerNames(data).join(" & ");
}
