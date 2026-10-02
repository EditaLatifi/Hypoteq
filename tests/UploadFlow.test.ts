/**
 * The documents step's server side, end to end, against an in-memory database and a fake
 * SharePoint and AI: upload → finalize → analyse → remove → adoption by the Inquiry.
 *
 * Nothing here reaches a real service. That matters in this repo more than most: every
 * environment, local included, points at the production database, org and drive.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ---- in-memory database -------------------------------------------------------------
type Row = Record<string, any>;
const db: { holding: Row[]; document: Row[]; inquiry: Row[] } = { holding: [], document: [], inquiry: [] };
let nextId = 1;
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) =>
    v && typeof v === 'object' && 'in' in (v as any) ? (v as any).in.includes(row[k]) : row[k] === v
  );
const table = (rows: () => Row[], set: (r: Row[]) => void) => ({
  create: async ({ data }: any) => {
    const row = { id: `row-${nextId++}`, uploadedAt: new Date(), ...data };
    rows().push(row);
    return row;
  },
  createMany: async ({ data }: any) => {
    for (const d of data) rows().push({ id: `row-${nextId++}`, ...d });
    return { count: data.length };
  },
  findUnique: async ({ where }: any) => rows().find((r) => matches(r, where)) ?? null,
  findFirst: async ({ where }: any) => rows().find((r) => matches(r, where)) ?? null,
  findMany: async ({ where }: any) => rows().filter((r) => matches(r, where)),
  update: async ({ where, data }: any) => {
    const row = rows().find((r) => matches(r, where));
    if (!row) throw new Error('not found');
    Object.assign(row, data);
    return row;
  },
  delete: async ({ where }: any) => {
    const row = rows().find((r) => matches(r, where));
    set(rows().filter((r) => r !== row));
    return row;
  },
  deleteMany: async ({ where }: any) => {
    const before = rows().length;
    set(rows().filter((r) => !matches(r, where)));
    return { count: before - rows().length };
  },
});
const prismaMock: any = {
  holdingDocument: table(() => db.holding, (r) => (db.holding = r)),
  document: table(() => db.document, (r) => (db.document = r)),
  inquiry: table(() => db.inquiry, (r) => (db.inquiry = r)),
};
prismaMock.$transaction = async (fn: any) => fn(prismaMock);
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

// ---- fake AI ------------------------------------------------------------------------
const analyseDocument = jest.fn(async (req: any) => ({
  documentId: req.documentId,
  status: 'classified',
  classification: { type: 'salary_certificate', label: 'Lohnausweis', confidence: 0.95 },
  fields: { grossIncome: { value: 120000, confidence: 0.9 } },
  funnelDocKey: 'funnel.salaryStatement',
  audit: { durationMs: 5 },
  receivedBytes: req.data.length,
  receivedMime: req.mimeType,
}));
jest.mock('@/components/documentIntelligence/analyse', () => ({ analyseDocument }));

// ---- fake SharePoint (Graph) ---------------------------------------------------------
const freshDrive = () => ({
  'item-1': { name: 'Lohnausweis 1.pdf', parent: 'folder-A', bytes: Buffer.from('%PDF-1.4 fake') },
  'item-2': { name: 'Scan.pdf', parent: 'folder-A', bytes: Buffer.from('%PDF-1.4 other') },
});
const drive: Record<string, { name: string; parent: string; bytes: Buffer }> = freshDrive();
const deleted: string[] = [];
const fetchMock = jest.fn(async (url: any, init: any = {}) => {
  const u = String(url);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.includes('login.microsoftonline.com')) return json({ access_token: 'tok', expires_in: 3600 });
  const m = u.match(/\/items\/([^/?]+)(\/content)?/);
  const id = m ? decodeURIComponent(m[1]) : '';
  const item = drive[id];
  if (init.method === 'DELETE') {
    deleted.push(id);
    delete drive[id];
    return new Response(null, { status: 204 });
  }
  if (!item) return json({ error: { message: 'not found' } }, 404);
  if (m?.[2]) return new Response(item.bytes, { status: 200 });
  return json({
    id,
    name: item.name,
    webUrl: `https://sharepoint.example/${encodeURIComponent(item.name)}`,
    size: item.bytes.length,
    file: { mimeType: 'application/pdf' },
    parentReference: { id: item.parent },
  });
});
(globalThis as any).fetch = fetchMock;

import { POST as finalize } from '../app/api/upload-doc/finalize/route';
import { POST as analyse } from '../app/api/document-intelligence/analyse/route';
import { DELETE as remove } from '../app/api/upload-doc/[id]/route';
import { adoptHoldingDocuments } from '../lib/sharepoint';

const post = (body: unknown) =>
  new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const SUBMISSION = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
  db.holding = [];
  db.document = [];
  db.inquiry = [];
  analyseDocument.mockClear();
  for (const k of Object.keys(drive)) delete drive[k];
  Object.assign(drive, freshDrive());
  deleted.length = 0;
  process.env.DRIVE_ID = 'drive';
  process.env.FOLDER_ID = 'root';
  delete process.env.VERCEL_ENV;
});

async function upload(itemId: string, docType: string | null) {
  const res = await finalize(
    post({
      driveItemId: itemId,
      folderId: 'folder-A',
      originalFileName: 'Lohnausweis.pdf',
      email: 'partner@example.com',
      submissionId: SUBMISSION,
      docType,
    })
  );
  return { status: res.status, body: (await res.json()) as any };
}

describe('upload flow', () => {
  it('leaves out a file the customer removed whose delete had not landed yet', async () => {
    drive['item-1'] = { name: 'Lohnausweis 1.pdf', parent: 'folder-A', bytes: Buffer.from('%PDF') };
    drive['item-2'] = { name: 'Scan.pdf', parent: 'folder-A', bytes: Buffer.from('%PDF') };
    const kept = (await upload('item-1', 'funnel.salaryStatement')).body.documentId;
    await upload('item-2', 'funnel.salaryStatement');
    const adopted = await adoptHoldingDocuments('inq-2', SUBMISSION, [{ documentId: kept }]);
    expect(adopted).toBe(1);
    expect(db.document.map((d) => d.id)).toEqual([kept]);
    expect(db.holding).toHaveLength(0);
    expect(deleted).toContain('item-2');
  });

  it('stores an analysis that finishes after the Inquiry already claimed the file', async () => {
    drive['item-1'] = { name: 'Lohnausweis 1.pdf', parent: 'folder-A', bytes: Buffer.from('%PDF') };
    const id = (await upload('item-1', 'funnel.salaryStatement')).body.documentId;
    let release!: () => void;
    analyseDocument.mockImplementationOnce(async (req: any) => {
      await new Promise<void>((r) => (release = r));
      return {
        documentId: req.documentId,
        status: 'classified',
        classification: { type: 'salary_certificate', label: 'Lohnausweis', confidence: 0.9 },
        fields: {},
        funnelDocKey: 'funnel.salaryStatement',
        audit: { durationMs: 1 },
      } as any;
    });
    const pending = analyse(post({ documentId: id, submissionId: SUBMISSION }));
    await new Promise((r) => setTimeout(r, 10));
    await adoptHoldingDocuments(SUBMISSION, SUBMISSION, [{ documentId: id }]);
    release();
    await pending;
    expect(db.document[0].id).toBe(id);
    expect(db.document[0].aiStatus).toBe('classified');
  });

  it('records the file as SharePoint reports it, not as the browser names it', async () => {
    const { status, body } = await upload('item-1', 'funnel.salaryStatement');
    expect(status).toBe(200);
    expect(body.documentId).toBeTruthy();
    const row = db.holding[0];
    // Renamed on a name clash: the stored name must be the real one.
    expect(row.fileName).toBe('Lohnausweis 1.pdf');
    expect(row.originalFileName).toBe('Lohnausweis.pdf');
    expect(row.driveItemId).toBe('item-1');
    expect(row.fileUrl).toMatch(/^https:\/\/sharepoint\.example\//);
    expect(row.submissionId).toBe(SUBMISSION);
  });

  it('refuses a file that is not in the submission folder', async () => {
    drive['item-x'] = { name: 'x.pdf', parent: 'someone-elses-folder', bytes: Buffer.from('x') };
    const { status } = await upload('item-x', null);
    expect(status).toBe(400);
    expect(db.holding).toHaveLength(0);
  });

  it('analyses the file read back from SharePoint and stores the result on the row', async () => {
    const { body } = await upload('item-1', 'funnel.salaryStatement');
    const res = await analyse(
      post({
        documentId: body.documentId,
        submissionId: SUBMISSION,
        visibleDocKeys: ['funnel.salaryStatement'],
        expectedDocKey: 'funnel.salaryStatement',
      })
    );
    const json: any = await res.json();
    expect(json.success).toBe(true);
    const call: any = analyseDocument.mock.calls[0][0];
    expect(call.data.toString()).toBe('%PDF-1.4 fake');
    expect(call.mimeType).toBe('application/pdf');
    expect(db.holding[0].aiStatus).toBe('classified');
    expect(db.holding[0].aiDocType).toBe('salary_certificate');

    // Asked again after a remount: the stored answer, without a second model call.
    const again: any = await (
      await analyse(post({ documentId: body.documentId, submissionId: SUBMISSION, reuse: true }))
    ).json();
    expect(again.reused).toBe(true);
    expect(analyseDocument).toHaveBeenCalledTimes(1);
  });

  it('does not analyse a row for a different submission', async () => {
    const { body } = await upload('item-1', null);
    const res = await analyse(post({ documentId: body.documentId, submissionId: 'someone-else' }));
    expect(res.status).toBe(404);
    expect(analyseDocument).not.toHaveBeenCalled();
  });

  it('removes a file taken back before submit, from SharePoint and the database', async () => {
    const { body } = await upload('item-2', null);
    const wrong = await remove(
      new Request(`http://localhost/api/upload-doc/${body.documentId}?submissionId=other`, { method: 'DELETE' }),
      { params: { id: body.documentId } }
    );
    expect(((await wrong.json()) as any).result).toBe('not_found');
    expect(db.holding).toHaveLength(1);

    const res = await remove(
      new Request(`http://localhost/api/upload-doc/${body.documentId}?submissionId=${SUBMISSION}`, { method: 'DELETE' }),
      { params: { id: body.documentId } }
    );
    expect(((await res.json()) as any).result).toBe('deleted');
    expect(db.holding).toHaveLength(0);
    expect(deleted).toContain('item-2');
  });

  it('hands every held file to the Inquiry with the customer decisions, exactly once', async () => {
    drive['item-1'] = { name: 'Lohnausweis 1.pdf', parent: 'folder-A', bytes: Buffer.from('%PDF') };
    const a = (await upload('item-1', 'funnel.salaryStatement')).body.documentId;
    const adopted = await adoptHoldingDocuments('inq-1', SUBMISSION, [
      { documentId: a, humanEdits: { grossIncome: '118000' } },
    ]);
    expect(adopted).toBe(1);
    expect(db.holding).toHaveLength(0);
    expect(db.document).toHaveLength(1);
    expect(db.document[0].inquiryId).toBe('inq-1');
    expect(db.document[0].driveItemId).toBe('item-1');
    expect(db.document[0].aiAnalysis.humanEdits).toEqual({ grossIncome: '118000' });

    // The adopted row keeps the id the page and a running analysis know it by.
    expect(db.document[0].id).toBe(a);

    // Running it again finds nothing left to claim rather than duplicating.
    expect(await adoptHoldingDocuments('inq-1', SUBMISSION)).toBe(0);
    expect(db.document).toHaveLength(1);
  });
});
