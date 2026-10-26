import { describe, it, expect } from '@jest/globals';
import { getRequirement, reqList } from '@/lib/funnel-v3/requirements';
import { cleanNamePart, extraStoredName, formatDocDate, katOf, MAX_STORED_NAME, nameDate, objectNamePart, storedName } from '@/lib/funnel-v3/storedName';
import { MUSTERMANN_ANSWERS, mkState } from './helpers';

/** HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 8; answer 10 of 26.10.2026 (the funnel's case number). */

const CASE = 'HQ-26-10-000123';
const req = (id: string) => getRequirement(id)!;
const max = { first: 'Max', last: 'Mustermann' };
const object = { street: 'Musterweg 1', place: '8000 Zürich' };

describe('storedName — the examples of 8.1 (answer 10), on the fictional Mustermann case', () => {
  it('HQ-26-10-000123_01_Lohnausweis_Mustermann-Max_2025-12-31.pdf', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('lohnausweise'), person: max, docDate: '2025', ext: 'pdf' })).toBe('HQ-26-10-000123_01_Lohnausweis_Mustermann-Max_2025-12-31.pdf');
  });
  it('HQ-26-10-000123_03_Grundbuchauszug_Musterweg-1-Zuerich_2026-01-15.pdf', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('grundbuch'), object, docDate: '2026-01-15', ext: 'pdf' })).toBe('HQ-26-10-000123_03_Grundbuchauszug_Musterweg-1-Zuerich_2026-01-15.pdf');
  });
  it('HQ-26-10-000123_01_ZUSATZ_Leasingvertrag_Mustermann-Max_2024-06-05.pdf', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('leasing'), person: max, docDate: '05.06.2024', ext: 'pdf', extraKind: 'surplus' })).toBe(
      'HQ-26-10-000123_01_ZUSATZ_Leasingvertrag_Mustermann-Max_2024-06-05.pdf'
    );
  });
});

describe('Kat (8.1): 00 Formulare · 01 / 02 Kreditnehmer · 03 Objekt · 04 Finanzierung', () => {
  it('by the requirement and the Kreditnehmer', () => {
    expect(katOf(req('vollmacht'))).toBe('00');
    expect(katOf(req('lohnausweise'), 0)).toBe('01');
    expect(katOf(req('lohnausweise'), 1)).toBe('02');
    expect(katOf(req('gvz'))).toBe('03');
    expect(katOf(req('produkt'))).toBe('04');
    expect(katOf(req('s3a'))).toBe('04');
    expect(storedName({ caseNumber: CASE, requirement: req('lohnausweise'), person: { first: 'Anna', last: 'Muster' }, borrowerIndex: 1, docDate: '2025', ext: 'pdf' })).toBe('HQ-26-10-000123_02_Lohnausweis_Muster-Anna_2025-12-31.pdf');
  });
  it('the existing mortgage keeps the bank', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('hyp_zins'), bank: 'Musterbank', docDate: '30.03.2026', ext: 'pdf' })).toBe('HQ-26-10-000123_04_Zinsabrechnung_Musterbank_2026-03-30.pdf');
  });
});

describe('storedName rules (8.1, 8.2)', () => {
  it('the upload date when the document has no date of its own (an ID: a birth date is none)', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('id'), person: max, docDate: '05.03.1985', uploadedAt: new Date(2026, 9, 20), ext: 'pdf' })).toBe('HQ-26-10-000123_01_ID_Mustermann-Max_2026-10-20.pdf');
    expect(storedName({ caseNumber: CASE, requirement: req('fotos'), object, uploadedAt: '2026-10-21T08:00:00Z', ext: 'jpg' })).toBe('HQ-26-10-000123_03_Fotos_Musterweg-1-Zuerich_2026-10-21.jpg');
  });
  it('takes the person from the list instance', () => {
    const inst = reqList(mkState(MUSTERMANN_ANSWERS)).find((r) => r.id === 'steuer')!;
    expect(storedName({ caseNumber: CASE, requirement: inst, docDate: 'Steuerjahr 2025', ext: 'PDF' })).toBe('HQ-26-10-000123_01_Steuererklaerung_Mustermann-Max_2025-12-31.pdf');
  });
  it('accepts «Vorname Nachname»', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('b_id'), personName: 'Peter Bürgi', ext: 'jpg' })).toBe('HQ-26-10-000123_01_ID_Buergi-Peter.jpg');
  });
  it('transcribes umlauts (ä → ae), drops accents and every other character', () => {
    expect(cleanNamePart('Müller-Lüdenscheid Zoë Élodie')).toBe('Mueller-LuedenscheidZoeElodie');
    expect(objectNamePart('Hauptstrasse 12a', '8820 Wädenswil')).toBe('Hauptstrasse-12a-Waedenswil');
    expect(storedName({ caseNumber: CASE, requirement: req('steuer'), person: { first: 'Anna Lena', last: 'Bächtold' }, docDate: '2025', ext: '.pdf' })).toBe('HQ-26-10-000123_01_Steuererklaerung_Baechtold-Anna-Lena_2025-12-31.pdf');
  });
  it('no person for Eigenmittel documents; several alike are told apart at the closing, not here', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('police'), person: max, docDate: '09.01.2026', index: 1, total: 2, ext: 'pdf' })).toBe('HQ-26-10-000123_04_Vorsorgepolice-3a_2026-01-09.pdf');
  });
  it('writes the company for company documents', () => {
    const inst = reqList(mkState({ kn: 'Juristische Person' }, {}, { firma: 'Muster Immobilien AG' })).find((r) => r.id === 'hr')!;
    expect(storedName({ caseNumber: CASE, requirement: inst, docDate: '2026-09-01', ext: 'pdf' })).toBe('HQ-26-10-000123_01_Handelsregisterauszug_MusterImmobilienAG_2026-09-01.pdf');
  });
  it('marks surplus and duplicate files after the Kat', () => {
    expect(storedName({ caseNumber: CASE, requirement: req('lohnausweise'), person: max, docDate: '2022', ext: 'pdf', extraKind: 'surplus' })).toBe('HQ-26-10-000123_01_ZUSATZ_Lohnausweis_Mustermann-Max_2022-12-31.pdf');
    expect(storedName({ caseNumber: CASE, requirement: req('leasing'), person: max, ext: 'pdf', extraKind: 'duplicate' })).toBe('HQ-26-10-000123_01_DUPLIKAT_Leasingvertrag_Mustermann-Max.pdf');
  });
  it('stays within about 100 characters: the name part is shortened', () => {
    const long = storedName({ caseNumber: CASE, requirement: req('grundbuch'), object: { street: 'Sehr lange Strasse des Dorfes mit vielen Wörtern und einer Hausnummer 123', place: '8820 Wädenswil' }, docDate: '2026-01-15', ext: 'pdf' });
    expect(long.length).toBeLessThanOrEqual(MAX_STORED_NAME);
    expect(long).toMatch(/^HQ-26-10-000123_03_Grundbuchauszug_Sehr-lange-Strasse.*_2026-01-15\.pdf$/);
  });
  it('a not-needed type is named after the type, an unknown file keeps its own name', () => {
    expect(extraStoredName(CASE, 'scan_123.PDF', 'notneeded', { type: 'Steuerrechnung', personName: 'Mustermann Max', docDate: '2023' })).toBe('HQ-26-10-000123_ZUSATZ_Steuerrechnung_Mustermann-Max_2023-12-31.pdf');
    expect(extraStoredName(CASE, 'Image 4711.jpg', 'unknown')).toBe('HQ-26-10-000123_ZUSATZ_Image-4711.jpg');
    expect(extraStoredName(CASE, 'x.pdf', 'duplicate', { type: 'Nebenkostenabrechnung', uploadedAt: '2026-10-21' })).toBe('HQ-26-10-000123_DUPLIKAT_Nebenkostenabrechnung_2026-10-21.pdf');
  });
});

describe('formatDocDate / nameDate', () => {
  it('reads the usual forms; in a stored name a year is its 31 December', () => {
    expect(formatDocDate('15.01.2026')).toBe('2026-01-15');
    expect(formatDocDate('1.2.2026')).toBe('2026-02-01');
    expect(formatDocDate('2026_01_15')).toBe('2026-01-15');
    expect(formatDocDate('Steuerjahr 2025')).toBe('2025');
    expect(nameDate('Steuerjahr 2025')).toBe('2025-12-31');
    expect(nameDate('15.01.2026')).toBe('2026-01-15');
    expect(formatDocDate(new Date(2026, 2, 30))).toBe('2026-03-30');
    expect(formatDocDate('laufend')).toBe('');
    expect(formatDocDate(null)).toBe('');
  });
});
