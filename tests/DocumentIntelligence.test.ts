import { describe, it, expect } from '@jest/globals';
import { analyseDocument } from '../components/documentIntelligence/analyse';
import {
  DOCUMENT_TYPES,
  ageInMonths,
  candidateTypesFor,
  funnelKeyFor,
} from '../components/documentIntelligence/documentTypes';
import { DOCUMENT_CATALOG } from '../components/funnelDocumentCatalog';
import type {
  DocumentIntelligenceProvider,
  ProviderResult,
} from '../components/documentIntelligence/types';

/**
 * Spec section 28 is explicit: whether something counts as a problem is decided by HYPOTEQ
 * rules, not by the language model. These tests hold that line — they run the pipeline with
 * a stub provider, so every assertion here is about our own logic and none of it depends on
 * a model call, an API key, or account credit.
 */

const VISIBLE = [
  'funnel.salaryStatementBonus',
  'funnel.landRegistryNotOlder6Months',
  'funnel.passportIDAllBorrowers',
];

function stub(result: Partial<ProviderResult>): DocumentIntelligenceProvider {
  return {
    name: 'stub',
    model: 'stub-1',
    async analyse(): Promise<ProviderResult> {
      return {
        classification: { type: 'salary_certificate', label: 'Aktueller Lohnausweis', confidence: 0.98 },
        person: { borrowerId: 'borrower_01', confidence: 0.97 },
        documentDate: '2025-12-31',
        fields: {},
        durationMs: 1,
        ...result,
      };
    },
  };
}

const req = (over: Partial<Parameters<typeof analyseDocument>[0]> = {}) => ({
  fileName: 'IMG_4829.pdf',
  mimeType: 'application/pdf',
  data: Buffer.from('x'),
  visibleFunnelKeys: VISIBLE,
  now: new Date('2026-08-25T00:00:00Z'),
  ...over,
});

describe('the mapping the spec leaves out', () => {
  it('points every document type at funnel keys that exist', () => {
    // A key that no longer exists in the catalog silently attaches a recognised document to
    // nothing — the same failure that left documents invisible in the Salesforce tab.
    const bad: string[] = [];
    for (const t of DOCUMENT_TYPES) {
      for (const k of t.funnelKeys) if (!DOCUMENT_CATALOG[k]) bad.push(`${t.id} -> ${k}`);
    }
    expect(bad).toEqual([]);
  });

  it('gives every type at least one requirement to satisfy', () => {
    expect(DOCUMENT_TYPES.filter((t) => t.funnelKeys.length === 0)).toEqual([]);
  });

  it('offers only the types this case was actually asked for', () => {
    const ids = candidateTypesFor(['funnel.salaryStatementBonus']).map((t) => t.id);
    expect(ids).toEqual(['salary_certificate']);
  });

  it('prefers a requirement the case was shown over the type default', () => {
    // Both keys belong to tax_return; the visible one must win.
    expect(funnelKeyFor('tax_return', ['funnel.taxReturnLatestJur'])).toBe('funnel.taxReturnLatestJur');
    expect(funnelKeyFor('tax_return', [])).toBe('funnel.taxReturnLatest');
  });
});

describe('status (section 32)', () => {
  it('is classified when the type and every field read cleanly', async () => {
    const a = await analyseDocument(req(), stub({ fields: { employer: { value: 'Muster AG', confidence: 0.99 } } }));
    expect(a.status).toBe('classified');
    expect(a.funnelDocKey).toBe('funnel.salaryStatementBonus');
  });

  it('asks for review when the classification itself is shaky', async () => {
    const a = await analyseDocument(
      req(),
      stub({ classification: { type: 'salary_certificate', label: 'Aktueller Lohnausweis', confidence: 0.72 } })
    );
    expect(a.status).toBe('review_required');
  });

  it('asks for review when the type is certain but a value is not', async () => {
    // Section 14: nothing derived from an uncertain number may be trusted unchecked.
    const a = await analyseDocument(
      req(),
      stub({ fields: { grossAnnualSalary: { value: 142300, unit: 'CHF', confidence: 0.55 } } })
    );
    expect(a.status).toBe('review_required');
  });

  it('reports a document it cannot place instead of guessing (section 21)', async () => {
    const a = await analyseDocument(
      req(),
      stub({ classification: { type: 'unknown', label: 'Nicht erkannt', confidence: 0.2 } })
    );
    expect(a.status).toBe('unsupported');
    expect(a.funnelDocKey).toBeNull();
    expect(a.suggestedFilename).toBeNull();
  });

  it('attributes nobody when it could not place the document (section 24)', async () => {
    // A real run came back with an electricity bill assigned to borrower_01 at 96%: the
    // model answers the person question even when it has answered nothing else. Section 24
    // assigns a document to a borrower, and there is no document here to assign.
    const a = await analyseDocument(
      req(),
      stub({
        classification: { type: 'unknown', label: 'Nicht erkannt', confidence: 0.2 },
        person: { borrowerId: 'borrower_01', confidence: 0.96 },
      })
    );
    expect(a.person).toBeNull();
  });
});

describe('wrong document (section 20)', () => {
  it('flags a file that is not what the requirement asked for', async () => {
    const a = await analyseDocument(
      req({ expectedFunnelKey: 'funnel.landRegistryNotOlder6Months' }),
      stub({})
    );
    expect(a.status).toBe('rejected');
    expect(a.mismatchedRequirement).toEqual({
      expected: 'funnel.landRegistryNotOlder6Months',
      got: 'salary_certificate',
    });
  });

  it('does not flag a file that matches any key of its own type', async () => {
    const a = await analyseDocument(req({ expectedFunnelKey: 'funnel.salaryStatementBonus' }), stub({}));
    expect(a.mismatchedRequirement).toBeNull();
    expect(a.status).toBe('classified');
  });
});

describe('freshness (section 25)', () => {
  const landRegistry = (documentDate: string) =>
    stub({
      classification: { type: 'land_registry_extract', label: 'Grundbuchauszug', confidence: 0.97 },
      documentDate,
      fields: {},
    });

  it('marks an extract older than its configured deadline', async () => {
    const a = await analyseDocument(req({ fileName: 'scan.pdf' }), landRegistry('2024-01-15'));
    expect(a.status).toBe('outdated');
    expect(a.freshness?.maxAgeMonths).toBe(6);
    expect(a.freshness?.ageMonths).toBeGreaterThan(6);
  });

  it('accepts one inside the deadline', async () => {
    const a = await analyseDocument(req({ fileName: 'scan.pdf' }), landRegistry('2026-05-01'));
    expect(a.freshness).toBeNull();
    expect(a.status).toBe('classified');
  });

  it('leaves types with no deadline alone however old they are', async () => {
    const a = await analyseDocument(req(), stub({ documentDate: '2009-01-01' }));
    expect(a.freshness).toBeNull();
  });

  it('counts whole months, not part ones', () => {
    const now = new Date('2026-08-25T00:00:00Z');
    expect(ageInMonths('2026-02-25', now)).toBe(6);
    expect(ageInMonths('2026-02-26', now)).toBe(5);
    expect(ageInMonths('not a date', now)).toBeNull();
  });
});

describe('suggested filename (section 11)', () => {
  it('names the file after what it turned out to be', async () => {
    const a = await analyseDocument(
      req(),
      stub({ fields: { employee: { value: 'Max Muster', confidence: 0.99 } } })
    );
    expect(a.suggestedFilename).toBe('Lohnausweis_2025_Max_Muster.pdf');
  });

  it('produces a name safe for links and paths', async () => {
    const a = await analyseDocument(
      req(),
      stub({ fields: { employee: { value: 'Jürg Müller-Groß', confidence: 0.99 } } })
    );
    expect(a.suggestedFilename).toMatch(/^[A-Za-z0-9_.-]+$/);
    expect(a.suggestedFilename).toContain('Juerg_Mueller-Gross');
  });

  it('takes the name out of a register entry that states far more than a name', async () => {
    // Exactly what a real Grundbuchauszug returned. Passing the field through whole
    // produced Grundbuchauszug_2024_Muster_Max_geb_14_03_1985_Alleineigentum.pdf — a name
    // worse than the IMG_4829.pdf it replaced, which is the one outcome section 11 forbids.
    const a = await analyseDocument(
      req(),
      stub({
        classification: { type: 'land_registry_extract', label: 'Grundbuchauszug', confidence: 0.99 },
        documentDate: '2024-01-15',
        fields: { owner: { value: 'Muster, Max, geb. 14.03.1985, Alleineigentum', confidence: 0.97 } },
      })
    );
    expect(a.suggestedFilename).toBe('Grundbuchauszug_2024_Muster_Max.pdf');
  });

  it('keeps a joint name intact rather than truncating it to one person', async () => {
    const a = await analyseDocument(
      req(),
      stub({
        classification: { type: 'purchase_contract', label: 'Kaufvertrag', confidence: 0.99 },
        documentDate: '2026-05-04',
        fields: { buyer: { value: 'Max Muster und Anna Muster', confidence: 0.98 } },
      })
    );
    expect(a.suggestedFilename).toBe('Kaufvertrag_2026_Max_Muster_und_Anna_Muster.pdf');
  });

  it('keeps the original name for the audit trail (section 36)', async () => {
    const a = await analyseDocument(req(), stub({}));
    expect(a.audit.originalFileName).toBe('IMG_4829.pdf');
    expect(a.audit.model).toBe('stub-1');
    expect(a.audit.provider).toBe('stub');
  });
});

describe('provider independence (section 30)', () => {
  it('runs the whole pipeline through any provider implementation', async () => {
    // The stub is not OpenAI and nothing above needed changing to use it. That is the
    // property section 30 asks for, asserted rather than asserted-in-prose.
    const a = await analyseDocument(req(), stub({}));
    expect(a.audit.provider).toBe('stub');
    expect(a.documentId).toMatch(/^doc_/);
  });
});

describe('several documents in one file (section 22)', () => {
  it('names the other documents it saw in the same upload', async () => {
    const a = await analyseDocument(
      req(),
      stub({ alsoContains: ['identity_document', 'land_registry_extract'] })
    );
    expect(a.alsoContains).toEqual(['identity_document', 'land_registry_extract']);
  });

  it('drops the file\'s own type from that list', async () => {
    // A salary certificate does not also contain a salary certificate. Repeating the primary
    // type would show the customer a document they were never asked to look for.
    const a = await analyseDocument(req(), stub({ alsoContains: ['salary_certificate'] }));
    expect(a.alsoContains).toEqual([]);
  });

  it('drops a type it does not recognise rather than showing it', async () => {
    const a = await analyseDocument(req(), stub({ alsoContains: ['not_a_real_type'] }));
    expect(a.alsoContains).toEqual([]);
  });

  it('is empty for an ordinary single document', async () => {
    const a = await analyseDocument(req(), stub({}));
    expect(a.alsoContains).toEqual([]);
  });
});
