import { DOCUMENT_CATALOG } from "@/components/funnelDocumentCatalog";
import { visibleDocumentKeys, type DocumentFlags } from "@/components/funnelDocumentSections";
import { DOKUMENTEN_CHECK_MAP } from "@/components/dokumentenCheckState";

/**
 * Which documents a Case still needs, for Cases the funnel did not create.
 *
 * The funnel records its own verdict (Inquiry.documentsMissing); a Case created directly in
 * Salesforce has none. For those, the requirement comes from the same place the funnel's
 * does — HYPOTEQ's "Dokumenten-Anforderungen" (components/funnelDocumentSections.ts) —
 * fed with the Case's own fields, or with the filters a caseworker saved in the
 * Dokumenten-Check tab, which describe the Case more precisely when present. What HYPOTEQ
 * already holds (ticks in that tab, Dok_*__c checkboxes, portal uploads) is subtracted.
 */

// Only asked for when they exist ("falls vorhanden", or a funding source the Case fields
// cannot tell us about). Listing them as outstanding would ask partners for paper that
// usually does not exist.
const IF_EXISTING = new Set([
  "funnel.baurechtsvertrag",
  "funnel.leasingContract",
  "funnel.giftContract",
  "funnel.loanContractGift",
  "funnel.inheritanceConfirmation",
  "funnel.inheritanceContract",
  "funnel.buildingInsuranceIfAvailable",
  "funnel.landRegistryIfAvailable",
  "funnel.interimBalanceIfAvailable",
]);

// Dokumenten-Check entry -> the funnel documents that satisfy it (reverse of the tab map).
const KEYS_BY_TAB_ENTRY: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const [key, entries] of Object.entries(DOKUMENTEN_CHECK_MAP)) {
    for (const e of entries) m.set(e, [...(m.get(e) || []), key]);
  }
  return m;
})();

// Dok_*__c checkbox -> the funnel documents it stands for.
const KEYS_BY_SF_FLAG: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(DOCUMENT_CATALOG)) {
    if (entry.salesforceField) m.set(entry.salesforceField, [...(m.get(entry.salesforceField) || []), key]);
  }
  return m;
})();

type Checklist = { filters?: Record<string, unknown>; checked?: Record<string, boolean> } | null;

export function parseChecklist(raw: unknown): Checklist {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function ageFrom(birthdate: unknown): number | null {
  if (typeof birthdate !== "string" || !birthdate) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (365.25 * 24 * 3600e3);
}

/** The funnel's document flags for a Salesforce Case. */
export function flagsForCase(rec: any, checklist: Checklist): DocumentFlags {
  const f = (checklist?.filters || {}) as Record<string, any>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(f, k);

  const borrowers = [rec.Account, rec.Client_2__r, rec.Client_3__r].filter(Boolean);
  const erwerb = new Set<string>(
    [rec.If_nat_rliche_person__c, ...borrowers.map((b: any) => b.Erwerbsstatus__c)].filter(Boolean).map((s: string) => s.toLowerCase())
  );
  const erwFilter: string[] = Array.isArray(f.erw) ? f.erw : [];
  const neubauFilter = typeof f.neubau === "string" ? f.neubau : "";

  return {
    isJur: has("typ") ? f.typ === "jur" : rec.Kreditnehmer__c === "Juristische Personen",
    isKauf: has("projekt") ? f.projekt === "kauf" : rec.Reason === "Neue Hypothek",
    isAbloesung: has("projekt") ? f.projekt === "abloesung" : rec.Reason === "Ablösung",
    isNeubau: has("immo") ? f.immo === "neubau" : rec.Art_der_Immobilie__c === "Neubau",
    isBestand: has("immo") ? f.immo === "bestehend" : rec.Art_der_Immobilie__c === "Bestehende Immobilie",
    // Strictly Stockwerkeigentum, as the funnel reads the spec; a "Wohnung" is not.
    isStockwerkeigentum: has("lieg") ? f.lieg === "Stockwerkeigentum" : rec.Art_der_Liegenschaft__c === "Stockwerkeigentum",
    isBauprojekt: neubauFilter ? neubauFilter === "bauprojekt" : rec.If_Neubau__c === "Bauprojekt",
    isRenovation: has("reno") ? f.reno === "ja" : rec.Gibt_es_Renovationen_oder_Zusatzkosten__c === true,
    isReserviert: has("reserv") ? f.reserv === "ja" : rec.Ist_die_Liegenschaft_bereits_reserviert__c === true,
    isRenditeobjekt: has("rendite") ? f.rendite === "ja" : rec.Nutzung_der_Immobilie__c === "Rendite-Immobilie",
    hasMultipleOwners: has("mehr") ? f.mehr === "ja" : borrowers.length > 1,
    hasAngestellt: erwFilter.length ? erwFilter.includes("ang") : erwerb.has("angestellt"),
    hasSelbstaendig: erwFilter.length ? erwFilter.some((e) => e.startsWith("selb")) : erwerb.has("selbständig"),
    hasRentner: erwFilter.length ? erwFilter.some((e) => e.startsWith("rent")) : erwerb.has("rentner"),
    hasAge50Plus: has("j50") ? f.j50 === "ja" : borrowers.some((b: any) => (ageFrom(b.PersonBirthdate) ?? 0) >= 50),
  };
}

/** Funnel document keys HYPOTEQ already holds for this Case. */
export function presentKeys(rec: any, checklist: Checklist, uploadedKeys: string[]): Set<string> {
  const out = new Set<string>(uploadedKeys);
  for (const [field, keys] of Array.from(KEYS_BY_SF_FLAG)) {
    if (rec[field] === true) keys.forEach((k) => out.add(k));
  }
  for (const [entry, on] of Object.entries(checklist?.checked || {})) {
    if (on === true) (KEYS_BY_TAB_ENTRY.get(entry) || []).forEach((k) => out.add(k));
  }
  return out;
}

/** Documents HYPOTEQ's specification requires for this Case and that are not on file yet. */
export function outstandingKeys(rec: any, checklist: Checklist, uploadedKeys: string[]): string[] {
  const present = presentKeys(rec, checklist, uploadedKeys);
  return visibleDocumentKeys(flagsForCase(rec, checklist)).filter((k) => !IF_EXISTING.has(k) && !present.has(k));
}
