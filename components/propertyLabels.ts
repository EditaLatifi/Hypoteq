/**
 * Canonical values behind the property answers the funnel stores as display labels.
 *
 * PropertyStep stores "Art der Liegenschaft" and "Nutzung" as the label the customer
 * clicked, in whatever language the funnel was in — "Immeuble de rendement", not
 * "Rendite-Immobilie". Anything that branches on those answers has to go through these maps,
 * otherwise it only ever works in German: the Renditeobjekt documents were never asked for
 * on a French, Italian or English submission.
 *
 * The values on the right are the Salesforce picklist values, which is why the Salesforce
 * sync uses the same tables.
 */

/** SF picklist: Einfamilienhaus, Wohnung, Mehrfamilienhaus, Landwirschaftszone. */
export const ART_LIEGENSCHAFT_MAP: Record<string, string> = {
  // DE
  "Einfamilienhaus": "Einfamilienhaus",
  "Wohnung": "Wohnung",
  "Mehrfamilienhaus": "Mehrfamilienhaus",
  "Landwirschaftszone": "Landwirschaftszone",
  "Landwirtschaftszone": "Landwirschaftszone",
  // EN
  "Single-family home": "Einfamilienhaus",
  "Apartment": "Wohnung",
  "Multi-family building": "Mehrfamilienhaus",
  "Multi-family home": "Mehrfamilienhaus",
  "Agricultural zone": "Landwirschaftszone",
  // FR
  "Maison unifamiliale": "Einfamilienhaus",
  "Appartement": "Wohnung",
  "Immeuble collectif": "Mehrfamilienhaus",
  "Zone agricole": "Landwirschaftszone",
  // IT
  "Casa unifamiliare": "Einfamilienhaus",
  "Appartamento": "Wohnung",
  "Edificio plurifamiliare": "Mehrfamilienhaus",
  "Zona agricola": "Landwirschaftszone",
};

/**
 * SF picklist: Selbstbewohnt, Zweitwohnsitz, Vermietet & teilweise selbstbewohnt,
 * Rendite-Immobilie, Für eigenes Geschäft. Maps every locale label users see.
 */
export const NUTZUNG_MAP: Record<string, string> = {
  // DE
  "Selbstbewohnt": "Selbstbewohnt",
  "Zweitwohnsitz": "Zweitwohnsitz",
  "Zweitwohnsitz / Ferienliegenschaft": "Zweitwohnsitz",
  "Vermietet & teilweise selbstbewohnt": "Vermietet & teilweise selbstbewohnt",
  "Rendite-Immobilie": "Rendite-Immobilie",
  "Für eigenes Geschäft": "Für eigenes Geschäft",
  // EN
  "Owner-occupied": "Selbstbewohnt",
  "Second home": "Zweitwohnsitz",
  "Second home / Vacation property": "Zweitwohnsitz",
  "Rented & partially owner-occupied": "Vermietet & teilweise selbstbewohnt",
  "Investment property": "Rendite-Immobilie",
  "For own business": "Für eigenes Geschäft",
  // FR
  "Occupé par le propriétaire": "Selbstbewohnt",
  "Résidence secondaire": "Zweitwohnsitz",
  "Résidence secondaire / Propriété de vacances": "Zweitwohnsitz",
  "Loué et partiellement occupé par le propriétaire": "Vermietet & teilweise selbstbewohnt",
  "Immeuble de rendement": "Rendite-Immobilie",
  "Pour sa propre entreprise": "Für eigenes Geschäft",
  "Pour ma propre entreprise": "Für eigenes Geschäft",
  // IT
  "Abitazione principale": "Selbstbewohnt",
  "Occupato dal proprietario": "Selbstbewohnt",
  "Seconda casa": "Zweitwohnsitz",
  "Seconda casa / Proprietà per vacanze": "Zweitwohnsitz",
  "Affittato e parzialmente occupato dal proprietario": "Vermietet & teilweise selbstbewohnt",
  "Immobile da reddito": "Rendite-Immobilie",
  "Per la propria attività": "Für eigenes Geschäft",
};

/** The canonical (German, Salesforce) Nutzung for a stored label, or null when unknown. */
export function normalizeNutzung(label: unknown): string | null {
  if (typeof label !== "string" || !label) return null;
  return NUTZUNG_MAP[label] ?? NUTZUNG_MAP[label.trim()] ?? null;
}

/** The canonical (German, Salesforce) Art der Liegenschaft for a stored label, or null. */
export function normalizeArtLiegenschaft(label: unknown): string | null {
  if (typeof label !== "string" || !label) return null;
  return ART_LIEGENSCHAFT_MAP[label] ?? ART_LIEGENSCHAFT_MAP[label.trim()] ?? null;
}

/**
 * Whether the property is a Renditeobjekt, in any locale.
 *
 * The substring checks are kept for labels that predate the map (or any free-text value),
 * exactly as the call sites had them before.
 */
export function isRenditeNutzung(label: unknown): boolean {
  if (normalizeNutzung(label) === "Rendite-Immobilie") return true;
  const lower = typeof label === "string" ? label.toLowerCase() : "";
  return lower.includes("rendite") || lower.includes("investment");
}

/**
 * Whether the property is a second or holiday home, in any locale.
 *
 * The substring checks used before matched German and "secondary" only, so "Second home",
 * "Résidence secondaire" and "Seconda casa" were all calculated as a primary residence —
 * with amortisation and the primary-residence affordability rules.
 */
export function isZweitwohnsitzNutzung(label: unknown): boolean {
  if (normalizeNutzung(label) === "Zweitwohnsitz") return true;
  const lower = typeof label === "string" ? label.toLowerCase() : "";
  return ["zweit", "ferien", "secondary", "second home", "secondaire", "seconda casa", "vacan"].some((k) =>
    lower.includes(k)
  );
}
