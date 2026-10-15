import { describe, it, expect } from '@jest/globals';
import { reqList } from '@/lib/funnel-v3/requirements';
import { answerCorrections, bankHints, hints, requirementStatus, type UploadedFile } from '@/lib/funnel-v3/requirementStatus';
import type { Borrower } from '@/lib/funnel-v3/types';
import { GERBER_ANSWERS, GERBER_EM, mkState } from './helpers';

let n = 0;
const file = (requirementId: string | null, extra: Partial<UploadedFile> = {}): UploadedFile => ({
  fileId: `f${++n}`,
  requirementId,
  status: 'done',
  ...extra,
});

const gerberState = mkState(GERBER_ANSWERS, {}, {}, undefined, { em: GERBER_EM, info: { bonus: true } });
/** v5 Gerber list (20) with the two older Lohnausweise of a recognised bonus (P5, 2 files): 21. */
const gerber = reqList(gerberState);
const stateOf = (files: UploadedFile[], skipped: string[] = [], list = gerber) => {
  const res = requirementStatus(list, files, skipped);
  return { res, st: (id: string) => res.requirements.find((r) => r.instance.instanceId === id)!.state };
};

/** One complete file set for every Gerber requirement. */
const fullSet = () =>
  gerber.flatMap((r) => Array.from({ length: r.expect }, () => file(r.instanceId)));

describe('requirementStatus (spec 4.2)', () => {
  it('starts with everything missing', () => {
    const { res } = stateOf([]);
    expect(res.counts).toMatchObject({ total: 21, missing: 21, ok: 0, fulfilled: 0 });
    expect(res.completeForSalesforce).toBe(false);
  });

  it('is analysing while a file is read, whatever else is there', () => {
    const { st } = stateOf([file('grundbuch'), file('grundbuch', { status: 'analysing' })]);
    expect(st('grundbuch')).toBe('analysing');
  });

  it('is ok with the one current Lohnausweis (v5 P2); partial with 1 of the 2 older ones (P5)', () => {
    expect(stateOf([file('lohnausweise#b1')]).st('lohnausweise#b1')).toBe('ok');
    const one = [file('lohnausweise_alt#b1')];
    expect(stateOf(one).st('lohnausweise_alt#b1')).toBe('partial');
    const res = stateOf(one).res.requirements.find((r) => r.instance.id === 'lohnausweise_alt')!;
    expect([res.doneFiles, res.expect]).toEqual([1, 2]);
    expect(stateOf([...one, file('lohnausweise_alt#b1')]).st('lohnausweise_alt#b1')).toBe('ok');
  });

  it('accepts the bare id when there is only one instance of it', () => {
    expect(stateOf([file('id')]).st('id#b1')).toBe('ok');
  });

  it('is partial with 1 of 2 3a-Police files', () => {
    expect(stateOf([file('police')]).st('police')).toBe('partial');
  });

  it('is outdated until overridden', () => {
    expect(stateOf([file('grundbuch', { outdated: true })]).st('grundbuch')).toBe('outdated');
    const over = stateOf([file('grundbuch', { outdated: true, outdatedOverride: true })]);
    expect(over.st('grundbuch')).toBe('ok');
    expect(over.res.requirements.find((r) => r.instance.id === 'grundbuch')!.overridden).toBe(true);
  });

  it('ignores failed files and files outside the list', () => {
    const { st, res } = stateOf([file('steuer#b1', { status: 'failed' }), file('steuer#b1', { extraKind: 'surplus' })]);
    expect(st('steuer#b1')).toBe('missing');
    expect(res.requirements.find((r) => r.instance.id === 'steuer')!.failedFiles).toBe(1);
  });

  it('marks an optional requirement skipped, and an upload replaces the mark', () => {
    expect(stateOf([], ['verkaufsdoku']).st('verkaufsdoku')).toBe('skipped');
    expect(stateOf([file('verkaufsdoku')], ['verkaufsdoku']).st('verkaufsdoku')).toBe('ok');
  });

  it('does not skip a mandatory requirement', () => {
    expect(stateOf([], ['grundbuch']).st('grundbuch')).toBe('missing');
  });

  it('is complete for Salesforce with every mandatory requirement ok, optional ones skipped', () => {
    const files = fullSet().filter((f) => f.requirementId !== 'verkaufsdoku');
    const { res } = stateOf(files, ['verkaufsdoku']);
    expect(res.counts).toMatchObject({ ok: 20, skipped: 1, fulfilled: 21, missing: 0 });
    expect(res.completeForSalesforce).toBe(true);
    // An optional document may also simply be missing.
    expect(stateOf(files).res.completeForSalesforce).toBe(true);
  });

  it('is not complete with an outdated Grundbuch, and is once it is used anyway', () => {
    const files = fullSet().map((f) => (f.requirementId === 'grundbuch' ? { ...f, outdated: true } : f));
    expect(stateOf(files).res.completeForSalesforce).toBe(false);
    const over = files.map((f) => (f.requirementId === 'grundbuch' ? { ...f, outdatedOverride: true } : f));
    expect(stateOf(over).res.completeForSalesforce).toBe(true);
  });

  it('is not complete with a partial requirement', () => {
    const files = fullSet();
    files.splice(files.findIndex((f) => f.requirementId === 'lohnausweise_alt#b1'), 1);
    expect(stateOf(files).res.completeForSalesforce).toBe(false);
  });
});

describe('Dok_* flags (spec 6.9)', () => {
  it('sets the flags of the requirements on the list, and Documents_completed__c', () => {
    const { res } = stateOf(fullSet());
    expect(res.dokFlags).toEqual({
      Dok_Fotos_der_Immobilie__c: true,
      Dok_Grundrissplaene__c: true,
      Dok_Grundbuchauszug__c: true,
      Dok_Gebaeudeversicherungsausweis__c: true,
      Dok_Identitaetsdokument__c: true,
      Dok_Lohnausweis__c: true,
      Dok_Pensionskassenausweis__c: true,
      Dok_Steuererklaerung__c: true,
      Documents_completed__c: true,
    });
  });

  it('leaves Dok_Grundbuchauszug__c off for an outdated extract, even when used anyway', () => {
    for (const extra of [{ outdated: true }, { outdated: true, outdatedOverride: true }]) {
      const files = fullSet().map((f) => (f.requirementId === 'grundbuch' ? { ...f, ...extra } : f));
      expect(stateOf(files).res.dokFlags.Dok_Grundbuchauszug__c).toBe(false);
    }
  });

  it('sets Dok_Lohnausweis__c with the current Lohnausweis (v5: one file)', () => {
    expect(stateOf([]).res.dokFlags.Dok_Lohnausweis__c).toBe(false);
    expect(stateOf([file('lohnausweise#b1')]).res.dokFlags.Dok_Lohnausweis__c).toBe(true);
  });

  it('sets a per-borrower flag only when every borrower supplied it', () => {
    const bs: Borrower[] = [
      { id: 'b1', vor: 'Gary', nach: 'Gerber', job: 'Angestellt', pkSe: 'Nein' },
      { id: 'b2', vor: 'Lea', nach: 'Gerber', job: 'Angestellt', pkSe: 'Nein' },
    ];
    const list = reqList(mkState({}, {}, {}, bs));
    expect(requirementStatus(list, [file('id#b1')]).dokFlags.Dok_Identitaetsdokument__c).toBe(false);
    expect(requirementStatus(list, [file('id#b1'), file('id#b2')]).dokFlags.Dok_Identitaetsdokument__c).toBe(true);
  });

  it('writes Kaufvertrag and Betreibungsregisterauszug for a company purchase', () => {
    const list = reqList(mkState({ kn: 'Juristische Person', antrag: 'Neue Hypothek' }));
    const flags = requirementStatus(list, [file('kaufvertrag'), file('betreibung')]).dokFlags;
    expect(flags.Dok_Kaufvertrag__c).toBe(true);
    expect(flags.Dok_Betreibungsregisterauszug__c).toBe(true);
    expect(flags).not.toHaveProperty('Dok_Lohnausweis__c');
  });
});

describe('answerCorrections (spec 4.4, Handover 3.1: chips and amounts)', () => {
  const base = mkState({ antrag: 'Ablösung', immo: 'Bestehende Immobilie', lieg: 'Einfamilienhaus' });

  it('suggests the Privatkredit / Leasing chips for a recognised contract', () => {
    expect(answerCorrections(base, ['kredit'])).toEqual([
      { key: 'loan', titleKey: 'sug.loan.title', textKey: 'sug.loan.chipText', patch: { ans: { kredite: 'Ja' } }, requirementIds: ['kredit'] },
    ]);
    expect(answerCorrections(base, ['kredit', 'leasing'])[0].patch).toEqual({ ans: { kredite: 'Ja', leasing: 'Ja' } });
    expect(answerCorrections(base, ['leasing'])[0].patch).toEqual({ ans: { leasing: 'Ja' } });
  });

  it('suggests the Unterhalt chip for a recognised Unterhaltsvereinbarung (no Kinder question any more)', () => {
    expect(answerCorrections(base, ['unterhalt'])[0]).toMatchObject({ key: 'maint', textKey: 'sug.maint.chipText', patch: { ans: { unterhalt: 'Ja' } } });
  });

  it('carries the 3a amount read from the policy into the Vorsorge row (prototype suggests)', () => {
    expect(answerCorrections(base, ['police'], { s3a: 10340 })[0]).toEqual({
      key: '3a', titleKey: 'sug.3a.title', textKey: 'sug.3a.amountText', params: { amount: 10340 }, patch: { em: { s3a: 10340 } }, requirementIds: ['police'],
    });
  });

  it('asks for the 3a amount by hand when none could be read', () => {
    expect(answerCorrections(base, ['s3a'])[0]).toMatchObject({ key: '3a', textKey: 'sug.3a.enterText', patch: {}, focus: 'em.s3a', requirementIds: ['s3a'] });
  });

  it('proposes Stockwerkeigentum for STWE documents', () => {
    expect(answerCorrections(base, ['stwe_regl', 'ef'])[0]).toMatchObject({ key: 'stwe', patch: { ans: { lieg: 'Stockwerkeigentum' } }, requirementIds: ['stwe_regl', 'ef'] });
  });

  it('says nothing when the answers already ask for the document', () => {
    expect(answerCorrections(gerberState, ['kredit', 'leasing', 'unterhalt', 's3a', 'police', 'stwe_regl', 'ef', 'grundbuch'])).toEqual([]);
    // From the ID (ab 50) the 3a documents are on the list without an amount.
    expect(answerCorrections(mkState({}, {}, {}, undefined, { info: { ab50: true } }), ['police'])).toEqual([]);
  });

  it('does not suggest what would not bring the document onto the list', () => {
    // A company has no Unterhalt document.
    expect(answerCorrections(mkState({ kn: 'Juristische Person' }), ['unterhalt'])).toEqual([]);
    // Plans are always asked (except Bauprojekt), so they never imply STWE.
    expect(answerCorrections(base, ['stwe_plan'])).toEqual([]);
  });

  it('accepts instance ids', () => {
    expect(answerCorrections(base, ['kredit#x'])[0].key).toBe('loan');
  });
});

describe('hints to the bank (spec Schritt 6)', () => {
  it('reports outdated, Privatkredit, Leasing and a pledged 3a policy with the extraction note', () => {
    const files = [
      file('grundbuch', { outdated: true, note: 'Auszug ist älter als 6 Monate (15.01.2026).' }),
      file('kredit', { note: 'Wird mit der Erhöhung abgelöst.' }),
      file('leasing'),
      file('police', { note: 'Police ist an die ZKB verpfändet.' }),
      file('police'),
      file('s3a'),
    ];
    const res = requirementStatus(gerber, files);
    expect(bankHints(res, files)).toEqual([
      { kind: 'outdated', instanceId: 'grundbuch', titleKey: 'doc.grundbuch', titleDe: 'Aktueller Grundbuchauszug (max. 6 Monate)', text: 'Auszug ist älter als 6 Monate (15.01.2026).' },
      { kind: 'kredit', instanceId: 'kredit', titleKey: 'doc.kredit', titleDe: 'Kreditverträge (Privatkredite)', text: 'Wird mit der Erhöhung abgelöst.' },
      { kind: 'leasing', instanceId: 'leasing', titleKey: 'doc.leasing', titleDe: 'Leasingverträge', text: '' },
      { kind: 'pledged3a', instanceId: 'police', titleKey: 'doc.police', titleDe: 'Vorsorgepolice 3a inkl. Wertmitteilung', text: 'Police ist an die ZKB verpfändet.' },
    ]);
    expect(hints).toBe(bankHints);
  });

  it('keeps the outdated hint when the extract is used anyway', () => {
    const files = [file('grundbuch', { outdated: true, outdatedOverride: true, note: 'alt' })];
    expect(bankHints(requirementStatus(gerber, files), files).map((h) => h.kind)).toEqual(['outdated']);
  });

  it('has nothing to say without files', () => {
    expect(bankHints(requirementStatus(gerber, []), [])).toEqual([]);
  });
});
