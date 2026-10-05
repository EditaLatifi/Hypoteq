import { describe, it, expect } from '@jest/globals';
import { getRequirement, reqList } from '@/lib/funnel-v3/requirements';
import { cleanNamePart, formatDocDate, storedName } from '@/lib/funnel-v3/storedName';
import { GERBER_ANSWERS, mkState } from './helpers';

const CASE = 'HQ-26-06-156283';
const req = (id: string) => getRequirement(id)!;
const gary = { first: 'Gary', last: 'Gerber' };

describe('storedName — the Gerber examples of spec 5.1', () => {
  it('03_Grundbuchauszug_Etzelstrasse_52_Waedenswil_2026_01_15.pdf', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('grundbuch'), docDate: '2026-01-15', ext: 'pdf' }))
      .toBe('HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf');
  });
  it('01_Lohnausweis_Gary_Gerber_2024_Etzel_Liegenschaften_AG.pdf', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('lohnausweise'), person: gary, docDate: '2024', index: 2, total: 3, ext: 'pdf' }))
      .toBe('HQ-26-06-156283_01_Lohnausweis_Gerber-Gary_2024_2.pdf');
  });
  it('03_Hypothek_Zinsabrechnung_ZKB_Gary_Gerber.pdf', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('hyp_zins'), bank: 'ZKB', docDate: '30.03.2026', ext: 'pdf' }))
      .toBe('HQ-26-06-156283_02_Zinsabrechnung_ZKB_2026-03-30.pdf');
  });
  it('01_ID_Gary_Gerber.pdf — no date, a birth date is not a document date', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('id'), person: gary, docDate: '04.01.1988', ext: 'pdf' }))
      .toBe('HQ-26-06-156283_01_ID_Gerber-Gary.pdf');
  });
});

describe('storedName rules', () => {
  it('takes the person from the list instance', () => {
    const inst = reqList(mkState(GERBER_ANSWERS)).find((r) => r.id === 'steuer')!;
    expect(storedName({ caseNumber: CASE, requirement: inst, docDate: 'Steuerjahr 2025', ext: 'PDF' }))
      .toBe('HQ-26-06-156283_01_Steuererklaerung_Gerber-Gary_2025.pdf');
  });
  it('accepts «Vorname Nachname»', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('b_id'), personName: 'Peter Bürgi', ext: 'jpg' }))
      .toBe('HQ-26-06-156283_01_ID_Burgi-Peter.jpg');
  });
  it('replaces umlauts and accents and drops spaces (D10)', () => {
    expect(cleanNamePart('Müller-Lüdenscheid Zoë Élodie')).toBe('Muller-LudenscheidZoeElodie');
    expect(storedName({ caseNumber: CASE, requirement: req('steuer'), person: { first: 'Anna Lena', last: 'Bächtold' }, docDate: '2025', ext: '.pdf' }))
      .toBe('HQ-26-06-156283_01_Steuererklaerung_Bachtold-AnnaLena_2025.pdf');
  });
  it('leaves the person out for Objekt and Eigenmittel documents', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('fotos'), person: gary, ext: 'pdf' })).toBe('HQ-26-06-156283_03_Fotos.pdf');
    expect(storedName({ caseNumber: CASE, requirement: req('police'), person: gary, docDate: '09.01.2026', index: 1, total: 2, ext: 'pdf' }))
      .toBe('HQ-26-06-156283_04_Vorsorgepolice-3a_2026-01-09_1.pdf');
  });
  it('writes the company for company documents', () => {
    const inst = reqList(mkState({ kn: 'Juristische Person' }, {}, { firma: 'Muster Immobilien AG' })).find((r) => r.id === 'hr')!;
    expect(storedName({ caseNumber: CASE, requirement: inst, docDate: '2026-09-01', ext: 'pdf' }))
      .toBe('HQ-26-06-156283_01_Handelsregisterauszug_MusterImmobilienAG_2026-09-01.pdf');
  });
  it('writes no number for a single file', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('grundbuch'), docDate: '2026-01-15', index: 1, total: 1, ext: 'pdf' }))
      .toBe('HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf');
  });
  it('marks surplus and duplicate files after the group', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('lohnausweise'), person: gary, docDate: '2022', ext: 'pdf', extraKind: 'surplus' }))
      .toBe('HQ-26-06-156283_01_ZUSATZ_Lohnausweis_Gerber-Gary_2022.pdf');
    expect(storedName({ caseNumber: CASE, requirement: req('leasing'), person: gary, ext: 'pdf', extraKind: 'duplicate' }))
      .toBe('HQ-26-06-156283_01_DUPLIKAT_Leasingvertrag_Gerber-Gary.pdf');
  });
});

describe('formatDocDate', () => {
  it('reads the usual forms', () => {
    expect(formatDocDate('15.01.2026')).toBe('2026-01-15');
    expect(formatDocDate('1.2.2026')).toBe('2026-02-01');
    expect(formatDocDate('2026_01_15')).toBe('2026-01-15');
    expect(formatDocDate('Steuerjahr 2025')).toBe('2025');
    expect(formatDocDate(new Date(2026, 2, 30))).toBe('2026-03-30');
    expect(formatDocDate('laufend')).toBe('');
    expect(formatDocDate(null)).toBe('');
  });
});
