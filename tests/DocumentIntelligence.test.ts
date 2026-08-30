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
