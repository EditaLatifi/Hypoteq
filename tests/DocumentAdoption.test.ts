import { describe, it, expect } from '@jest/globals';
import { adoptedDocumentData } from '../lib/sharepoint';

/**
 * What a held upload becomes when its Inquiry claims it.
 *
 * The AI's analysis is already stored on the held row; the customer's decisions arrive with
 * the submit. Section 36 needs both halves, so the merge must add the person's answers beside
 * the machine's and never replace the evidence of what the machine said.
 */

const held = (over: Record<string, unknown> = {}) => ({
  email: 'partner@example.com',
  fileName: 'Lohnausweis.pdf',
  fileUrl: 'https://sharepoint.example/Lohnausweis.pdf',
  driveItemId: 'item-1',
  docType: 'funnel.salaryStatement',
  originalFileName: 'Lohnausweis.pdf',
  aiStatus: 'classified',
  aiDocType: 'salary_certificate',
  aiConfidence: 0.93,
  aiAnalysis: {
    status: 'classified',
    classification: { type: 'salary_certificate', label: 'Lohnausweis', confidence: 0.93 },
    fields: { grossIncome: { value: 120000 } },
  },
  uploadedAt: new Date('2026-10-02T08:00:00Z'),
  ...over,
});

describe('adoptedDocumentData', () => {
  it('copies a held row unchanged when the customer decided nothing about it', () => {
    const row = adoptedDocumentData(held(), 'inq-1');
    expect(row.inquiryId).toBe('inq-1');
    expect(row.driveItemId).toBe('item-1');
    expect(row.docType).toBe('funnel.salaryStatement');
    expect(row.aiStatus).toBe('classified');
    expect(row.aiAnalysis).toEqual(held().aiAnalysis);
  });

  it('records corrections and mismatch answers beside the extraction', () => {
    const row = adoptedDocumentData(held(), 'inq-1', {
      documentId: 'h1',
      humanReview: [{ field: 'grossIncome', choice: 'kept_own' }],
      humanEdits: { grossIncome: '118000' },
    });
    const a = row.aiAnalysis as any;
    expect(a.fields.grossIncome.value).toBe(120000);
    expect(a.humanEdits).toEqual({ grossIncome: '118000' });
    expect(a.humanReview).toHaveLength(1);
    expect(row.aiStatus).toBe('classified');
  });

  it('keeps the machine verdict readable when the customer chose the type by hand', () => {
    const row = adoptedDocumentData(
      held({ aiStatus: 'unsupported', aiDocType: 'unknown' }),
      'inq-1',
      { documentId: 'h1', manualClassification: { type: 'tax_return', label: 'Steuererklärung' } }
    );
    const a = row.aiAnalysis as any;
    expect(row.aiStatus).toBe('confirmed');
    expect(row.aiDocType).toBe('tax_return');
    expect(a.classifiedBy).toBe('human');
    expect(a.machineClassification.type).toBe('salary_certificate');
  });

  it('takes the requirement the file ended up answering from the submit', () => {
    const loose = held({ docType: null });
    expect(adoptedDocumentData(loose, 'inq-1', { documentId: 'h1', docType: 'funnel.taxReturn' }).docType)
      .toBe('funnel.taxReturn');
    expect(adoptedDocumentData(held(), 'inq-1', { documentId: 'h1' }).docType)
      .toBe('funnel.salaryStatement');
  });

  it('marks values a person confirmed as confirmed', () => {
    const row = adoptedDocumentData(held({ aiStatus: 'review_required' }), 'inq-1', {
      documentId: 'h1',
      confirmedByHuman: true,
    });
    expect(row.aiStatus).toBe('confirmed');
    expect((row.aiAnalysis as any).confirmedByHuman).toBe(true);
  });
});
