import { describe, it, expect } from '@jest/globals';
import {
  DOCUMENT_CATALOG,
  isRequiredDoc,
  computeDocumentCompleteness,
} from '../components/funnelDocumentCatalog';

/**
 * Guards the Dokumenten-Upload & Completeness-Check spec (V1).
 *
 * What this protects: the verdict decides which customers receive a "fehlende Unterlagen"
 * mail naming documents they may well have sent. Getting it wrong is visible to customers,
 * so the edge cases below (case-type scoping, shared Salesforce flags, empty dossiers) are
 * worth pinning down rather than re-deriving each time the catalog is edited.
 */

// Representative documents, chosen so the assertions stay readable.
const REQUIRED_SALARY = 'funnel.salaryStatementBonus';   // -> Dok_Lohnausweis__c
const REQUIRED_TAX = 'funnel.taxReturnLatest';           // -> Dok_Steuererklaerung__c
const OPTIONAL_LAND_REGISTRY = 'funnel.landRegistryIfAvailable'; // "falls vorhanden"
const REQUIRED_PURCHASE = 'funnel.purchaseContractDraft'; // -> Dok_Kaufvertrag__c

describe('Document catalog', () => {
  it('classifies "falls vorhanden" documents as optional', () => {
    expect(isRequiredDoc(OPTIONAL_LAND_REGISTRY)).toBe(false);
    expect(isRequiredDoc('funnel.buildingInsuranceIfAvailable')).toBe(false);
    expect(isRequiredDoc('funnel.interimBalanceIfAvailable')).toBe(false);
  });

  it('treats an unknown document as optional rather than blocking on it', () => {
    // A document added to DocumentsStep but not to the catalog must never silently
    // start sending "fehlende Unterlagen" mails.
    expect(isRequiredDoc('funnel.somethingNobodyCatalogued')).toBe(false);
  });

  it('only ever points at Dok_*__c booleans that exist on Case', () => {
    for (const [key, entry] of Object.entries(DOCUMENT_CATALOG)) {
      if (entry.salesforceField === null) continue;
      expect(`${key}: ${entry.salesforceField}`).toMatch(/: Dok_[A-Za-z_]+__c$/);
    }
  });
});

describe('computeDocumentCompleteness', () => {
  it('reports complete when every shown document has a file', () => {
    // Every shown document, including the "falls vorhanden" one — nothing is exempt now.
    const shown = [REQUIRED_SALARY, REQUIRED_TAX, OPTIONAL_LAND_REGISTRY];
    const r = computeDocumentCompleteness(shown, shown);
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('asks for a document that was shown but not uploaded, whatever its requirement', () => {
    // "Missing" means shown-and-not-uploaded. The required/optional distinction is not
    // consulted: the funnel presents every document identically, so a customer who skipped
    // one must still be told about it.
    const r = computeDocumentCompleteness([OPTIONAL_LAND_REGISTRY], []);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual([OPTIONAL_LAND_REGISTRY]);
  });

  it('lists exactly what was shown and not uploaded', () => {
    const r = computeDocumentCompleteness(
      [REQUIRED_SALARY, REQUIRED_TAX, OPTIONAL_LAND_REGISTRY],
      [OPTIONAL_LAND_REGISTRY],
    );
    expect(r.complete).toBe(false);
    expect(r.missing.sort()).toEqual([REQUIRED_SALARY, REQUIRED_TAX].sort());
  });

  it('is incomplete when the customer uploads nothing at all', () => {
    // The bug this guards against: customers who uploaded nothing were receiving
    // "Ihr Dossier ist vollständig".
    const r = computeDocumentCompleteness([REQUIRED_SALARY, REQUIRED_TAX], []);
    expect(r.complete).toBe(false);
    expect(r.missing.sort()).toEqual([REQUIRED_SALARY, REQUIRED_TAX].sort());
  });

  it('scopes the check to documents shown for this case type', () => {
    // An Ablösung dossier must not be flagged incomplete over Kauf paperwork that was
    // never rendered for it.
    const r = computeDocumentCompleteness([REQUIRED_SALARY], [REQUIRED_SALARY]);
    expect(r.complete).toBe(true);
    expect(r.missing).not.toContain(REQUIRED_PURCHASE);
  });

  it('ignores a supplied document that was not shown', () => {
    const r = computeDocumentCompleteness([REQUIRED_SALARY], [REQUIRED_SALARY, REQUIRED_PURCHASE]);
    expect(r.salesforceFlags).not.toHaveProperty('Dok_Kaufvertrag__c');
  });

  it('treats an empty dossier as complete, not incomplete', () => {
    // No sections rendered means nothing was asked for — sending "you are missing
    // documents" with an empty list would be nonsense.
    const r = computeDocumentCompleteness([], []);
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('deduplicates a document shown in more than one section', () => {
    // Deduplication is asserted through the Salesforce flags, since `missing` is now always
    // empty: one entry per field, not one per occurrence.
    const r = computeDocumentCompleteness([REQUIRED_SALARY, REQUIRED_SALARY], []);
    expect(Object.keys(r.salesforceFlags)).toEqual(['Dok_Lohnausweis__c']);
    expect(r.missing).toEqual([REQUIRED_SALARY]);
  });

  describe('Salesforce flags', () => {
    it('sets a flag when its document was supplied', () => {
      const r = computeDocumentCompleteness([REQUIRED_SALARY], [REQUIRED_SALARY]);
      expect(r.salesforceFlags['Dok_Lohnausweis__c']).toBe(true);
    });

    it('leaves a flag false when the document is still missing', () => {
      const r = computeDocumentCompleteness([REQUIRED_SALARY], []);
      expect(r.salesforceFlags['Dok_Lohnausweis__c']).toBe(false);
    });

    it('is true when ANY document feeding a shared flag was supplied', () => {
      // Every pension document feeds Dok_Pensionskassenausweis__c.
      const r = computeDocumentCompleteness(
        ['funnel.pensionCertificatePKAHV', 'funnel.pensionForecastAHV'],
        ['funnel.pensionForecastAHV'],
      );
      expect(r.salesforceFlags['Dok_Pensionskassenausweis__c']).toBe(true);
      // ...while the sibling that shares the flag is still individually outstanding.
      expect(r.missing).toEqual(['funnel.pensionCertificatePKAHV']);
    });

    it('does not invent a flag for documents that have none', () => {
      const r = computeDocumentCompleteness(['funnel.giftContract'], ['funnel.giftContract']);
      expect(Object.keys(r.salesforceFlags)).toEqual([]);
    });
  });
});
