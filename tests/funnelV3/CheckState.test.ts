import { describe, it, expect } from '@jest/globals';
import { reqList } from '@/lib/funnel-v3/requirements';
import { bankHints, requirementStatus, type UploadedFile } from '@/lib/funnel-v3/requirementStatus';
import { buildCheckState, CHECK_STATE_MAX_LENGTH, type CheckStateDetail } from '@/lib/funnel-v3/checkState';
import { VERIFIED_TAB_ENTRIES } from '@/components/dokumentenCheckState';
import { MUSTERMANN_ANSWERS, MUSTERMANN_EM, mkState } from './helpers';

const AT = new Date('2026-10-05T12:12:00.000Z');
const state = {
  ...mkState(MUSTERMANN_ANSWERS, {}, {}, undefined, { em: { ...MUSTERMANN_EM, pkVerp: 20000 }, info: { bank: 'Musterbank', geb: '05.03.1985', ab50: false } }),
  mode: 'schnell' as const,
  src: { 'fin.old': { doc: 'Zinsabrechnung', unsure: false }, 'em.s3a': { doc: '3a-Police', unsure: true } },
  sig: { choice: 'later' as const, at: '2026-10-05T12:00:00.000Z', method: 'upload' as const },
};
const list = reqList(state);

const files: UploadedFile[] = [
  { fileId: 'g', requirementId: 'grundbuch', status: 'done', outdated: true, note: 'Auszug ist älter als 6 Monate.' },
  { fileId: 'l1', requirementId: 'lohnausweise#b1', status: 'done' },
  { fileId: 'l2', requirementId: 'lohnausweise#b1', status: 'done' },
  { fileId: 'l3', requirementId: 'lohnausweise#b1', status: 'done' },
  { fileId: 'v', requirementId: 'vollmacht', status: 'done' },
  { fileId: 'p', requirementId: 'pk#b1', status: 'done' },
];
const status = requirementStatus(list, files);
const details: Record<string, CheckStateDetail> = {
  grundbuch: {
    files: [{ originalName: '03_Grundbuchauszug_Musterweg_1_Zuerich_2026_01_15.pdf', storedName: 'HQ-26-01-000001_03_Grundbuchauszug_2026-01-15.pdf', url: 'https://example.sharepoint.com/x.pdf', confidence: 0.97 }],
    fields: [{ key: 'Eigentümer', value: 'Max Simon Mustermann', confidence: 0.97 }],
    audit: [{ ts: '05.10.2026 14:03', text: 'Erkannt als «Grundbuchauszug» · Konfidenz 97 %' }],
  },
};

const build = (previous?: string | null, extra: Partial<Parameters<typeof buildCheckState>[0]> = {}) =>
  JSON.parse(
    buildCheckState({
      state,
      status,
      details,
      extras: [{ name: '01_Lohnausweis_Max_Mustermann_2022.pdf', kind: 'surplus' }],
      hints: bankHints(status, files),
      previous,
      now: AT,
      ...extra,
    })
  );

describe('Dokumenten_Check_State__c v3 (spec 6.11)', () => {
  it('writes the spec structure', () => {
    const s = build();
    expect(s.version).toBe(1);
    expect(s.updatedAt).toBe('2026-10-05T12:12:00.000Z');
    expect(s.answers).toMatchObject({ antrag: 'Ablösung', kn: 'Natürliche Person', lieg: 'Stockwerkeigentum', unterhalt: 'Ja', kredite: 'Ja', steuer: 'Nein', pkSe: 'Nein', nbDocs: 'Nein', job: 'Angestellt' });
    expect(s.answers).not.toHaveProperty('kinder');
    // Handover 8: the Eigenmittel split (PK-Verpfändung only here).
    expect(s.answers.eigenmittel).toEqual({ s3a: 8760, pkVerp: 20000 });
    expect(s.answers.borrowers).toEqual([{ id: 'b1', job: 'Angestellt', pkSe: 'Nein' }]);
    expect(s.requirements).toHaveLength(21);
    expect(s.requirements.find((r: any) => r.id === 'grundbuch')).toEqual({
      id: 'grundbuch', code: 'O4', label: 'Aktueller Grundbuchauszug (max. 6 Monate)', group: 'objekt', reason: 'Pflicht', status: 'outdated',
      files: details.grundbuch.files, fields: details.grundbuch.fields, audit: details.grundbuch.audit,
    });
    expect(s.requirements.find((r: any) => r.id === 'lohnausweise#b1')).toMatchObject({ requirementId: 'lohnausweise', status: 'ok', person: 'Max Mustermann', reason: 'Pflicht · pro Kreditnehmer' });
    expect(s.requirements.find((r: any) => r.id === 'kredit')).toMatchObject({ status: 'missing', reason: 'weil: Privatkredite = Ja' });
    expect(s.extras).toEqual([{ name: '01_Lohnausweis_Max_Mustermann_2022.pdf', kind: 'surplus' }]);
    expect(s.hints).toEqual([{ title: 'Aktueller Grundbuchauszug (max. 6 Monate)', text: 'Auszug ist älter als 6 Monate.' }]);
    expect(s).not.toHaveProperty('truncated');
  });

  it('writes entry, sources, signature and the document facts (Handover 8)', () => {
    const s = build();
    expect(s.entry).toBe('schnell');
    expect(s.sources).toEqual({ 'fin.old': 'Zinsabrechnung', 'em.s3a': '3a-Police' });
    // P0 is on file here (`v`); «später» would otherwise make it pending.
    expect(s.signature).toEqual({ status: 'uploaded', at: '2026-10-05T12:00:00.000Z', method: 'upload' });
    expect(s.info).toEqual({ bank: 'Musterbank', geb: '05.03.1985', ab50: false });
    const without = requirementStatus(list, files.filter((f) => f.fileId !== 'v'));
    expect(build(null, { status: without }).signature).toMatchObject({ status: 'pending' });
    expect(build(null, { status: without, state: { ...state, sig: null } }).signature).toEqual({ status: 'missing', at: null, method: 'upload' });
    expect(build(null, { signature: { status: 'unsigned', at: null, method: 'upload' } }).signature.status).toBe('unsigned');
  });

  it('only uses the spec statuses', () => {
    const analysing = requirementStatus(list, [{ fileId: 'a', requirementId: 'grundbuch', status: 'analysing' }]);
    const s = build(null, { status: analysing });
    for (const r of s.requirements) expect(['missing', 'partial', 'ok', 'outdated', 'skipped']).toContain(r.status);
  });
});

describe('legacy keys (DECISIONS S3)', () => {
  it('ticks the tab entries of ok requirements, only verified ones', () => {
    const s = build();
    expect(s.savedAt).toBe('2026-10-05T12:12:00.000Z');
    expect(Object.keys(s.checked).sort()).toEqual([
      'Ab 50 Jahre Alter der Kreditnehmer|Pensionskassenausweis und Rückkaufswerte von der 3. Säule',
      'Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis',
      'Angestellte / Unselbständig Erwerbstätige|Pensionskassenausweis und Rückkaufswerte von der 3. Säule',
      'Grundlegende Unterlagen|HYPOTEQ-Formular Auskunftsermächtigung',
      'Selbständig Erwerbstätige|Pensionskassenausweis und Rückkaufswerte von der 3. Säule',
    ]);
    for (const k of Object.keys(s.checked)) expect(VERIFIED_TAB_ENTRIES).toContain(k);
    expect(s).not.toHaveProperty('filters');
  });

  it('keeps manual ticks, the filters snapshot and unknown keys of the previous state', () => {
    const previous = JSON.stringify({
      filters: { typ: 'nat', projekt: 'abl' },
      checked: { 'Rentner|Rentenbescheinigung (PK, AHV)': true },
      savedAt: '2026-08-20T08:57:47.524Z',
      somethingElse: 1,
    });
    const s = build(previous);
    expect(s.filters).toEqual({ typ: 'nat', projekt: 'abl' });
    expect(s.somethingElse).toBe(1);
    expect(s.checked['Rentner|Rentenbescheinigung (PK, AHV)']).toBe(true);
    expect(s.checked['Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis']).toBe(true);
    expect(s.savedAt).toBe('2026-10-05T12:12:00.000Z');
  });

  it('replaces its own previous v3 blocks instead of keeping stale ones', () => {
    const previous = JSON.stringify({ checked: {}, version: 1, requirements: [{ id: 'old' }], truncated: ['audit'] });
    const s = build(previous);
    expect(s.requirements.some((r: any) => r.id === 'old')).toBe(false);
    expect(s).not.toHaveProperty('truncated');
  });

  it('ignores a previous value that is not tab state', () => {
    expect(build('Fehlende Unterlagen (2): …').checked).toEqual(build().checked);
  });

  it('does not tick for an outdated Grundbuch or a requirement that is not ok', () => {
    const missing = requirementStatus(list, files.filter((f) => !f.fileId.startsWith('l')));
    expect(build(null, { status: missing }).checked).not.toHaveProperty(['Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis']);
  });
});

describe('size guard', () => {
  const big = (n: number): Record<string, CheckStateDetail> =>
    Object.fromEntries(
      list.map((r) => [
        r.instanceId,
        {
          files: [{ originalName: 'x'.repeat(40) + '.pdf', storedName: 'y'.repeat(40) + '.pdf', url: 'https://example.sharepoint.com/' + 'u'.repeat(n), confidence: 0.9 }],
          fields: Array.from({ length: 10 }, (_, i) => ({ key: `F${i}`, value: 'v'.repeat(n), confidence: 0.9 })),
          audit: Array.from({ length: 10 }, () => ({ ts: '05.10.2026 14:03', text: 't'.repeat(n) })),
        },
      ])
    );

  it('keeps everything when it fits', () => {
    const raw = buildCheckState({ state, status, details: big(10), now: AT });
    expect(JSON.parse(raw).requirements[0].audit).toHaveLength(10);
  });

  it('drops audit first, then fields, then file URLs', () => {
    // ~23 × 10 × 600 per block: audit and fields together exceed the limit, fields alone fit.
    const d = big(300);
    let s = JSON.parse(buildCheckState({ state, status, details: d, now: AT }));
    expect(s.truncated).toEqual(['audit']);
    expect(s.requirements[0].fields).toHaveLength(10);

    s = JSON.parse(buildCheckState({ state, status, details: big(1200), now: AT }));
    expect(s.truncated).toEqual(['audit', 'fields']);
    expect(s.requirements[0].files[0].url).toBeDefined();

    const urls = Object.fromEntries(Object.entries(big(10)).map(([k, v]) => [k, { files: Array.from({ length: 30 }, () => ({ ...v.files![0], url: 'https://x/' + 'u'.repeat(200) })) }]));
    const raw = buildCheckState({ state, status, details: urls, now: AT });
    s = JSON.parse(raw);
    expect(s.truncated).toEqual(['audit', 'fields', 'urls']);
    expect(s.requirements[0].files[0]).not.toHaveProperty('url');
    expect(s.requirements[0].files[0].storedName).toBeDefined();
    expect(raw.length).toBeLessThanOrEqual(CHECK_STATE_MAX_LENGTH);
  });

  it('stays under the limit and keeps the legacy keys', () => {
    for (const n of [600, 1200, 5000]) {
      const raw = buildCheckState({ state, status, details: big(n), now: AT, previous: JSON.stringify({ checked: { a: true }, filters: { typ: 'nat' } }) });
      expect(raw.length).toBeLessThanOrEqual(CHECK_STATE_MAX_LENGTH);
      const s = JSON.parse(raw);
      expect(s.checked.a).toBe(true);
      expect(s.filters).toEqual({ typ: 'nat' });
    }
  });
});
