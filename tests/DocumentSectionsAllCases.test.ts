import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  documentSectionsFor,
  visibleDocumentKeys,
  EMPTY_DOCUMENT_FLAGS,
  type DocumentFlags,
} from '../components/funnelDocumentSections';
import {
  DOCUMENT_CATALOG,
  isRequiredDoc,
  computeDocumentCompleteness,
} from '../components/funnelDocumentCatalog';

/**
 * Exhaustive sweep over every case the funnel can produce.
 *
 * The document logic branches on 15 independent booleans, so there are 32'768 possible
 * cases. They were never tested, because the logic used to live inside a client component.
 * Enumerating all of them is cheap (it is a pure function) and it is the only way to be
 * sure no combination produces an empty section, an uncatalogued document, or — the case
 * that matters most commercially — a customer being told documents are missing when the
 * funnel never asked them for any.
 */

const FLAG_NAMES = Object.keys(EMPTY_DOCUMENT_FLAGS) as (keyof DocumentFlags)[];

function allFlagCombinations(): DocumentFlags[] {
  const out: DocumentFlags[] = [];
  const total = 1 << FLAG_NAMES.length; // 2^15
  for (let mask = 0; mask < total; mask++) {
    const flags = { ...EMPTY_DOCUMENT_FLAGS };
    FLAG_NAMES.forEach((name, bit) => {
      (flags as any)[name] = Boolean(mask & (1 << bit));
    });
    out.push(flags);
  }
  return out;
}

const ALL = allFlagCombinations();

// A case a real customer could actually be in — the funnel cannot present a purchase and a
// refinancing at once, nor a new build that is also an existing property.
function isCoherent(f: DocumentFlags): boolean {
  if (f.isKauf && f.isAbloesung) return false;
  if (f.isNeubau && f.isBestand) return false;
  return true;
}
const COHERENT = ALL.filter(isCoherent);

function describeCase(f: DocumentFlags): string {
  const on = FLAG_NAMES.filter((n) => f[n]);
  return on.length ? on.join('+') : '(no flags set)';
}

describe(`Document sections — all ${ALL.length} flag combinations`, () => {
  it('never renders an empty section', () => {
    // An empty section would show a heading with nothing under it.
    const bad = ALL.filter((f) => documentSectionsFor(f).some((s) => s.items.length === 0));
    expect(bad.map(describeCase)).toEqual([]);
  });

  it('never renders a section without a title key', () => {
    const bad = ALL.filter((f) =>
      documentSectionsFor(f).some((s) => !s.titleKey || !s.titleKey.startsWith('funnel.'))
    );
    expect(bad.map(describeCase)).toEqual([]);
  });

  it('only ever asks for documents that are in the catalog', () => {
    // An uncatalogued key silently counts as optional and maps to no Salesforce field,
    // so it would vanish from the completeness check without anyone noticing.
    const unknown = new Set<string>();
    for (const f of ALL) {
      for (const key of visibleDocumentKeys(f)) {
        if (!DOCUMENT_CATALOG[key]) unknown.add(key);
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it('always asks for at least the personal or company base documents', () => {
    // Every case has a base section, so no customer ever reaches an empty upload step.
    const empty = ALL.filter((f) => visibleDocumentKeys(f).length === 0);
    expect(empty.map(describeCase)).toEqual([]);
  });

  it('does not repeat a document within one section', () => {
    const bad = ALL.filter((f) =>
      documentSectionsFor(f).some((s) => new Set(s.items).size !== s.items.length)
    );
    expect(bad.map(describeCase)).toEqual([]);
  });
});

describe('Completeness across all coherent cases', () => {
  it('reports complete when every visible document is supplied', () => {
    const bad: string[] = [];
    for (const f of COHERENT) {
      const visible = visibleDocumentKeys(f);
      const r = computeDocumentCompleteness(visible, visible);
      if (!r.complete || r.missing.length) bad.push(describeCase(f));
    }
    expect(bad).toEqual([]);
  });

  it('reports missing exactly the documents shown but not supplied', () => {
    // No requirement filter anywhere: "missing" is shown-minus-uploaded, for every case.
    const bad: string[] = [];
    for (const f of COHERENT) {
      const visible = visibleDocumentKeys(f).sort();
      const r = computeDocumentCompleteness(visible, []);
      if (JSON.stringify(r.missing.sort()) !== JSON.stringify(visible)) bad.push(describeCase(f));
    }
    expect(bad).toEqual([]);
  });

  it('never demands a document the case was not shown', () => {
    const bad: string[] = [];
    for (const f of COHERENT) {
      const visible = new Set(visibleDocumentKeys(f));
      const r = computeDocumentCompleteness([...visible], []);
      if (r.missing.some((k) => !visible.has(k))) bad.push(describeCase(f));
    }
    expect(bad).toEqual([]);
  });

  it('a case shown no documents at all is complete without any upload', () => {
    // The genuine "this application needs no documents" case. Only an empty document list
    // qualifies — a customer who was shown documents and uploaded none is NOT complete.
    const noneShown = COHERENT.filter((f) => visibleDocumentKeys(f).length === 0);
    for (const f of noneShown) {
      const r = computeDocumentCompleteness(visibleDocumentKeys(f), []);
      expect(r.complete).toBe(true);
      expect(r.missing).toEqual([]);
    }
  });

  it('never reports a dossier complete when a shown document was skipped', () => {
    // Regression guard for the mail that said "Ihr Dossier ist vollständig" to customers
    // who had uploaded nothing.
    const bad: string[] = [];
    for (const f of COHERENT) {
      const visible = visibleDocumentKeys(f);
      if (visible.length === 0) continue;
      if (computeDocumentCompleteness(visible, []).complete) bad.push(describeCase(f));
      if (computeDocumentCompleteness(visible, visible.slice(1)).complete) bad.push(describeCase(f));
    }
    expect(bad).toEqual([]);
  });

  it('supplying a subset never counts as the whole set', () => {
    const bad: string[] = [];
    for (const f of COHERENT) {
      const visible = visibleDocumentKeys(f);
      if (visible.length < 2) continue;
      const r = computeDocumentCompleteness(visible, visible.slice(0, visible.length - 1));
      if (r.complete || r.missing.length !== 1) bad.push(describeCase(f));
    }
    expect(bad).toEqual([]);
  });

  it('produces only Salesforce fields that exist in the catalog', () => {
    const known = new Set(
      Object.values(DOCUMENT_CATALOG).map((e) => e.salesforceField).filter(Boolean) as string[]
    );
    const bad = new Set<string>();
    for (const f of COHERENT) {
      const visible = visibleDocumentKeys(f);
      const r = computeDocumentCompleteness(visible, visible);
      for (const field of Object.keys(r.salesforceFlags)) if (!known.has(field)) bad.add(field);
    }
    expect([...bad]).toEqual([]);
  });
});

describe('Case-type routing', () => {
  const base = (over: Partial<DocumentFlags>): DocumentFlags => ({ ...EMPTY_DOCUMENT_FLAGS, ...over });

  it('an Ablösung is never asked for a purchase contract', () => {
    for (const extra of [{}, { isNeubau: true }, { isBestand: true }, { isStockwerkeigentum: true }]) {
      const keys = visibleDocumentKeys(base({ isAbloesung: true, ...extra }));
      expect(keys).not.toContain('funnel.purchaseContractDraft');
      expect(keys).not.toContain('funnel.purchaseOrRenovationContract');
      expect(keys).toContain('funnel.currentMortgageContract');
    }
  });

  it('a purchase is never asked for the existing mortgage contract', () => {
    const keys = visibleDocumentKeys(base({ isKauf: true, isNeubau: true }));
    expect(keys).not.toContain('funnel.currentMortgageContract');
  });

  it('a company sees the company base set and not the private one', () => {
    const keys = visibleDocumentKeys(base({ isJur: true }));
    expect(keys).toContain('funnel.commercialRegisterCurrent');
    expect(keys).not.toContain('funnel.passportIDAllBorrowers');
  });

  it('a private borrower never sees company paperwork', () => {
    const keys = visibleDocumentKeys(base({ isKauf: true, isBestand: true, hasAngestellt: true }));
    expect(keys).toContain('funnel.passportIDAllBorrowers');
    expect(keys).not.toContain('funnel.commercialRegisterCurrent');
  });

  it('employment status drives the income documents', () => {
    expect(visibleDocumentKeys(base({ hasAngestellt: true }))).toContain('funnel.salaryStatementBonus');
    expect(visibleDocumentKeys(base({ hasSelbstaendig: true }))).toContain('funnel.balanceSheetAudit3Years');
    expect(visibleDocumentKeys(base({ hasRentner: true }))).toContain('funnel.pensionCertificatePKAHV');
    // ...and a case with no employment flag is asked for none of them.
    const none = visibleDocumentKeys(base({}));
    expect(none).not.toContain('funnel.salaryStatementBonus');
    expect(none).not.toContain('funnel.balanceSheetAudit3Years');
    expect(none).not.toContain('funnel.pensionCertificatePKAHV');
  });

  it('a reservation is only asked for when the property is reserved', () => {
    expect(visibleDocumentKeys(base({ isReserviert: true }))).toContain('funnel.reservationContractDoc');
    expect(visibleDocumentKeys(base({}))).not.toContain('funnel.reservationContractDoc');
  });
});

describe('Translations cover every document any case can show', () => {
  const LOCALES = ['de', 'fr', 'it', 'en'] as const;
  const everyKey = new Set<string>();
  const everyTitle = new Set<string>();
  for (const f of ALL) {
    for (const s of documentSectionsFor(f)) {
      everyTitle.add(s.titleKey);
      s.items.forEach((k) => everyKey.add(k));
    }
  }

  for (const locale of LOCALES) {
    it(`${locale}: every document label and section title exists`, () => {
      const raw = fs
        .readFileSync(path.join(__dirname, '..', 'messages', `${locale}.json`), 'utf-8')
        .replace(/^﻿/, '');
      const json = JSON.parse(raw);
      const missing = [...everyKey, ...everyTitle].filter((key) => {
        const [ns, name] = key.split('.');
        return !json?.[ns]?.[name];
      });
      expect(missing).toEqual([]);
    });
  }
});
