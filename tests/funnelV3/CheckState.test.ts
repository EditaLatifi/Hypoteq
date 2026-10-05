import { describe, it, expect } from '@jest/globals';
import { reqList } from '@/lib/funnel-v3/requirements';
import { bankHints, requirementStatus, type UploadedFile } from '@/lib/funnel-v3/requirementStatus';
import { buildCheckState, CHECK_STATE_MAX_LENGTH, type CheckStateDetail } from '@/lib/funnel-v3/checkState';
import { VERIFIED_TAB_ENTRIES } from '@/components/dokumentenCheckState';
import { GERBER_ANSWERS, mkState } from './helpers';

const AT = new Date('2026-10-05T12:12:00.000Z');
const state = mkState(GERBER_ANSWERS);
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
    files: [{ originalName: '03_Grundbuchauszug_Etzelstrasse_52_Waedenswil_2026_01_15.pdf', storedName: 'HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf', url: 'https://example.sharepoint.com/x.pdf', confidence: 0.97 }],
    fields: [{ key: 'Eigentümer', value: 'Gary Samuel Gerber', confidence: 0.97 }],
    audit: [{ ts: '05.10.2026 14:03', text: 'Erkannt als «Grundbuchauszug» · Konfidenz 97 %' }],
  },
};

const build = (previous?: string | null, extra: Partial<Parameters<typeof buildCheckState>[0]> = {}) =>
  JSON.parse(
    buildCheckState({
      state,
      status,
      details,
      extras: [{ name: '01_Lohnausweis_Gary_Gerber_2022.pdf', kind: 'surplus' }],
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
    expect(s.answers).toMatchObject({ antrag: 'Ablösung', kn: 'Natürliche Person', lieg: 'Stockwerkeigentum', kinder: 'Ja', s3a: 'Ja', pkSe: 'Nein', nbDocs: 'Nein', job: 'Angestellt' });
    expect(s.answers.borrowers).toEqual([{ id: 'b1', job: 'Angestellt', pkSe: 'Nein' }]);
    expect(s.requirements).toHaveLength(23);
    expect(s.requirements.find((r: any) => r.id === 'grundbuch')).toEqual({
      id: 'grundbuch', code: 'O4', label: 'Aktueller Grundbuchauszug (max. 6 Monate)', group: 'objekt', reason: 'Pflicht', status: 'outdated',
      files: details.grundbuch.files, fields: details.grundbuch.fields, audit: details.grundbuch.audit,
    });
    expect(s.requirements.find((r: any) => r.id === 'lohnausweise#b1')).toMatchObject({ requirementId: 'lohnausweise', status: 'ok', person: 'Gary Gerber', reason: 'Pflicht · pro Kreditnehmer' });
    expect(s.requirements.find((r: any) => r.id === 'kredit')).toMatchObject({ status: 'missing', reason: 'weil: Privatkredite = Ja' });
    expect(s.extras).toEqual([{ name: '01_Lohnausweis_Gary_Gerber_2022.pdf', kind: 'surplus' }]);
    expect(s.hints).toEqual([{ title: 'Aktueller Grundbuchauszug (max. 6 Monate)', text: 'Auszug ist älter als 6 Monate.' }]);
    expect(s).not.toHaveProperty('truncated');
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

  it('does not tick for an outdated Grundbuch or a partial requirement', () => {
    const partial = requirementStatus(list, files.filter((f) => f.fileId !== 'l3'));
    expect(build(null, { status: partial }).checked).not.toHaveProperty(['Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis']);
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
