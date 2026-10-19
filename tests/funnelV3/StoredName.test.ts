import { describe, it, expect } from '@jest/globals';
import { getRequirement, reqList } from '@/lib/funnel-v3/requirements';
import { cleanNamePart, formatDocDate, storedName } from '@/lib/funnel-v3/storedName';
import { MUSTERMANN_ANSWERS, mkState } from './helpers';

const CASE = 'HQ-26-01-000001';
const req = (id: string) => getRequirement(id)!;
const max = { first: 'Max', last: 'Mustermann' };

describe('storedName — the examples of spec 5.1, on the fictional Mustermann case', () => {
  it('03_Grundbuchauszug_Musterweg_1_Zuerich_2026_01_15.pdf', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('grundbuch'), docDate: '2026-01-15', ext: 'pdf' }))
      .toBe('HQ-26-01-000001_03_Grundbuchauszug_2026-01-15.pdf');
  });
  it('01_Lohnausweis_Max_Mustermann_2024_Muster_Treuhand_AG.pdf', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('lohnausweise'), person: max, docDate: '2024', index: 2, total: 3, ext: 'pdf' }))
      .toBe('HQ-26-01-000001_01_Lohnausweis_Mustermann-Max_2024_2.pdf');
  });
  it('03_Hypothek_Zinsabrechnung_Musterbank_Max_Mustermann.pdf', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('hyp_zins'), bank: 'Musterbank', docDate: '30.03.2026', ext: 'pdf' }))
      .toBe('HQ-26-01-000001_02_Zinsabrechnung_Musterbank_2026-03-30.pdf');
  });
  it('01_ID_Max_Mustermann.pdf — no date, a birth date is not a document date', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('id'), person: max, docDate: '05.03.1985', ext: 'pdf' }))
      .toBe('HQ-26-01-000001_01_ID_Mustermann-Max.pdf');
  });
});

describe('storedName rules', () => {
  it('takes the person from the list instance', () => {
    const inst = reqList(mkState(MUSTERMANN_ANSWERS)).find((r) => r.id === 'steuer')!;
    expect(storedName({ caseNumber: CASE, requirement: inst, docDate: 'Steuerjahr 2025', ext: 'PDF' }))
      .toBe('HQ-26-01-000001_01_Steuererklaerung_Mustermann-Max_2025.pdf');
  });
  it('accepts «Vorname Nachname»', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('b_id'), personName: 'Peter Bürgi', ext: 'jpg' }))
      .toBe('HQ-26-01-000001_01_ID_Burgi-Peter.jpg');
  });
  it('replaces umlauts and accents and drops spaces (D10)', () => {
    expect(cleanNamePart('Müller-Lüdenscheid Zoë Élodie')).toBe('Muller-LudenscheidZoeElodie');
    expect(storedName({ caseNumber: CASE, requirement: req('steuer'), person: { first: 'Anna Lena', last: 'Bächtold' }, docDate: '2025', ext: '.pdf' }))
      .toBe('HQ-26-01-000001_01_Steuererklaerung_Bachtold-AnnaLena_2025.pdf');
  });
  it('leaves the person out for Objekt and Eigenmittel documents', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('fotos'), person: max, ext: 'pdf' })).toBe('HQ-26-01-000001_03_Fotos.pdf');
    expect(storedName({ caseNumber: CASE, requirement: req('police'), person: max, docDate: '09.01.2026', index: 1, total: 2, ext: 'pdf' }))
      .toBe('HQ-26-01-000001_04_Vorsorgepolice-3a_2026-01-09_1.pdf');
  });
  it('writes the company for company documents', () => {
    const inst = reqList(mkState({ kn: 'Juristische Person' }, {}, { firma: 'Muster Immobilien AG' })).find((r) => r.id === 'hr')!;
    expect(storedName({ caseNumber: CASE, requirement: inst, docDate: '2026-09-01', ext: 'pdf' }))
      .toBe('HQ-26-01-000001_01_Handelsregisterauszug_MusterImmobilienAG_2026-09-01.pdf');
  });
  it('writes no number for a single file', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('grundbuch'), docDate: '2026-01-15', index: 1, total: 1, ext: 'pdf' }))
      .toBe('HQ-26-01-000001_03_Grundbuchauszug_2026-01-15.pdf');
  });
  it('marks surplus and duplicate files after the group', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('lohnausweise'), person: max, docDate: '2022', ext: 'pdf', extraKind: 'surplus' }))
      .toBe('HQ-26-01-000001_01_ZUSATZ_Lohnausweis_Mustermann-Max_2022.pdf');
    expect(storedName({ caseNumber: CASE, requirement: req('leasing'), person: max, ext: 'pdf', extraKind: 'duplicate' }))
      .toBe('HQ-26-01-000001_01_DUPLIKAT_Leasingvertrag_Mustermann-Max.pdf');
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
