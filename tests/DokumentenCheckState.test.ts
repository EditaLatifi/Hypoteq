import { describe, it, expect } from '@jest/globals';
import {
  DOKUMENTEN_CHECK_MAP,
  UNMAPPED_FUNNEL_DOCS,
  VERIFIED_TAB_ENTRIES,
  buildDokumentenCheckState,
  tabEntriesFor,
  unmappedSupplied,
} from '../components/dokumentenCheckState';
import { DOCUMENT_CATALOG } from '../components/funnelDocumentCatalog';

/**
 * The tab ticks a document only when the key matches its own label byte-for-byte, and a
 * near-miss ticks nothing while looking exactly like a working sync. These tests exist to
 * make that failure loud: every string this module can emit is checked against the set read
 * back off Cases HYPOTEQ staff had saved by hand.
 */

const VERIFIED = new Set(VERIFIED_TAB_ENTRIES);

describe('DOKUMENTEN_CHECK_MAP', () => {
  it('only ever emits entries observed in real saved tab state', () => {
    const bad: string[] = [];
    for (const [key, entries] of Object.entries(DOKUMENTEN_CHECK_MAP)) {
      for (const entry of entries) if (!VERIFIED.has(entry)) bad.push(`${key} -> ${entry}`);
    }
    expect(bad).toEqual([]);
  });

  it('maps only document keys the funnel can actually ask for', () => {
    const unknown = Object.keys(DOKUMENTEN_CHECK_MAP).filter((k) => !DOCUMENT_CATALOG[k]);
    expect(unknown).toEqual([]);
  });

  it('uses the "Sektion|Label" shape, with exactly one separator', () => {
    for (const entry of VERIFIED_TAB_ENTRIES) {
      expect(entry.split('|')).toHaveLength(2);
      const [section, label] = entry.split('|');
      expect(section.trim()).toBe(section);
      expect(label.trim()).toBe(label);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('accounts for every catalog document exactly once — mapped or explicitly unmapped', () => {
    const unmapped = new Set(UNMAPPED_FUNNEL_DOCS);
    const unaccounted = Object.keys(DOCUMENT_CATALOG).filter(
      (k) => !DOKUMENTEN_CHECK_MAP[k] && !unmapped.has(k)
    );
    // A new funnel document must be a deliberate decision on both sides, not a silent gap.
    expect(unaccounted).toEqual([]);
  });

  it('never lists a document as both mapped and unmapped', () => {
    const both = UNMAPPED_FUNNEL_DOCS.filter((k) => DOKUMENTEN_CHECK_MAP[k]);
    expect(both).toEqual([]);
  });
});

describe('tabEntriesFor', () => {
  it('ticks the entry a supplied document satisfies', () => {
    expect(tabEntriesFor(['funnel.salaryStatementBonus'])).toEqual([
      'Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis',
    ]);
  });

  it('ticks every section a shared document appears under', () => {
    // The tab renders only the section matching the case, so all three are set.
    expect(tabEntriesFor(['funnel.pensionFund3rdPillarBuyback']).sort()).toEqual([
      'Ab 50 Jahre Alter der Kreditnehmer|Pensionskassenausweis und Rückkaufswerte von der 3. Säule',
      'Angestellte / Unselbständig Erwerbstätige|Pensionskassenausweis und Rückkaufswerte von der 3. Säule',
      'Selbständig Erwerbstätige|Pensionskassenausweis und Rückkaufswerte von der 3. Säule',
    ]);
  });

  it('de-duplicates when two documents feed the same entry', () => {
    // Both purchase-contract variants point at the tab's single Kaufvertrag line.
    const entries = tabEntriesFor(['funnel.purchaseContractDraft', 'funnel.purchaseOrRenovationContract']);
    expect(entries).toEqual(['Neubau|Kaufvertrag (Entwurf/original) und, falls vorhanden, Reservationsvertrag']);
  });

  it('yields nothing for a document the tab has no entry for', () => {
    expect(tabEntriesFor(['funnel.landRegistryNotOlder6Months'])).toEqual([]);
  });
});

describe('unmappedSupplied', () => {
  it('names the uploads the tab cannot show', () => {
    expect(unmappedSupplied(['funnel.salaryStatementBonus', 'funnel.buildingPermitDoc2'])).toEqual([
      'funnel.buildingPermitDoc2',
    ]);
  });
});

describe('buildDokumentenCheckState', () => {
  const AT = new Date('2026-08-24T15:00:00.000Z');

  it('produces the shape the tab persists', () => {
    const state = JSON.parse(buildDokumentenCheckState(['funnel.salaryStatementBonus'], null, AT)!);
    expect(state).toEqual({
      checked: { 'Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis': true },
      savedAt: '2026-08-24T15:00:00.000Z',
    });
  });

  it('writes no filters block — the tab derives those from Case fields', () => {
    const state = JSON.parse(buildDokumentenCheckState(['funnel.salaryStatementBonus'], null, AT)!);
    expect(state).not.toHaveProperty('filters');
  });

  it('returns null when nothing maps and there is no state to preserve', () => {
    // Writing an empty checklist over the field would read as "checked and found nothing".
    expect(buildDokumentenCheckState([], null, AT)).toBeNull();
    expect(buildDokumentenCheckState(['funnel.buildingPermitDoc2'], null, AT)).toBeNull();
  });

  it('keeps a caseworker\'s manual ticks and their filters snapshot', () => {
    const previous = JSON.stringify({
      filters: { typ: 'nat', projekt: 'kauf' },
      checked: { 'Grundlegende Unterlagen|HYPOTEQ-Formular Auskunftsermächtigung': true },
      savedAt: '2026-08-20T08:57:47.524Z',
    });
    const state = JSON.parse(buildDokumentenCheckState(['funnel.salaryStatementBonus'], previous, AT)!);
    expect(state.checked['Grundlegende Unterlagen|HYPOTEQ-Formular Auskunftsermächtigung']).toBe(true);
    expect(state.checked['Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis']).toBe(true);
    expect(state.filters).toEqual({ typ: 'nat', projekt: 'kauf' });
    expect(state.savedAt).toBe('2026-08-24T15:00:00.000Z');
  });

  it('never unticks — a Nachreichung adds documents, it does not withdraw them', () => {
    const previous = JSON.stringify({ checked: { 'Rentner|Rentenbescheinigung (PK, AHV)': true } });
    const state = JSON.parse(buildDokumentenCheckState(['funnel.salaryStatementBonus'], previous, AT)!);
    expect(state.checked['Rentner|Rentenbescheinigung (PK, AHV)']).toBe(true);
  });

  it('preserves existing state even when this round maps nothing', () => {
    const previous = JSON.stringify({ checked: { 'Rentner|Rentenbescheinigung (PK, AHV)': true } });
    const state = JSON.parse(buildDokumentenCheckState(['funnel.buildingPermitDoc2'], previous, AT)!);
    expect(state.checked).toEqual({ 'Rentner|Rentenbescheinigung (PK, AHV)': true });
  });

  it('ignores a previous value that is not tab state', () => {
    // An earlier version of the sync wrote German prose into this field.
    const prose = 'Fehlende Unterlagen (2):\n- Aktueller Lohnausweis';
    const state = JSON.parse(buildDokumentenCheckState(['funnel.salaryStatementBonus'], prose, AT)!);
    expect(state.checked).toEqual({ 'Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis': true });
  });

  it('emits valid JSON that round-trips to the same ticks', () => {
    const supplied = ['funnel.salaryStatementBonus', 'funnel.taxReturnLatest', 'funnel.auskunftsermaechtigungDoc'];
    const raw = buildDokumentenCheckState(supplied, null, AT)!;
    expect(Object.keys(JSON.parse(raw).checked).sort()).toEqual(tabEntriesFor(supplied).sort());
  });
});
