import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  documentSectionsFor,
  documentFlagsFrom,
  visibleDocumentKeys,
  EMPTY_DOCUMENT_FLAGS,
  FEEDBACK_FLAG_NAMES,
  type DocumentFlags,
} from '../components/funnelDocumentSections';
import {
  DOCUMENT_CATALOG,
  isRequiredDoc,
  computeDocumentCompleteness,
} from '../components/funnelDocumentCatalog';

/**
 * Sweep over every case the funnel can produce.
 *
 * The document logic branches on 23 independent booleans. They were never tested, because
 * the logic used to live inside a client component. Sweeping them is cheap (it is a pure
 * function) and it is the only way to be sure no combination produces an empty section, an
 * uncatalogued document, or — the case that matters most commercially — a customer being
 * told documents are missing when the funnel never asked them for any.
 *
 * 2^23 cases would take minutes, so the sweep is split:
 *  - the original 15 flags exhaustively (32'768 cases), once with every feedback flag off
 *    and once with every one on;
 *  - the 8 flags added with the September 2026 feedback exhaustively (256 cases), against
 *    every combination of the flags they interact with: borrower type, project type,
 *    property type and employment status (144 cases).
 */

const FLAG_NAMES = Object.keys(EMPTY_DOCUMENT_FLAGS) as (keyof DocumentFlags)[];
const ORIGINAL_FLAG_NAMES = FLAG_NAMES.filter((n) => !FEEDBACK_FLAG_NAMES.includes(n));

function combinations(names: (keyof DocumentFlags)[]): Partial<DocumentFlags>[] {
  const out: Partial<DocumentFlags>[] = [];
  for (let mask = 0; mask < 1 << names.length; mask++) {
    const part: Partial<DocumentFlags> = {};
    names.forEach((name, bit) => {
      (part as any)[name] = Boolean(mask & (1 << bit));
    });
    out.push(part);
  }
  return out;
}

function allFlagCombinations(): DocumentFlags[] {
  const out: DocumentFlags[] = [];
  const feedbackOff = Object.fromEntries(FEEDBACK_FLAG_NAMES.map((n) => [n, false]));
  const feedbackOn = Object.fromEntries(FEEDBACK_FLAG_NAMES.map((n) => [n, true]));
  for (const original of combinations(ORIGINAL_FLAG_NAMES)) {
    out.push({ ...EMPTY_DOCUMENT_FLAGS, ...original, ...feedbackOff });
    out.push({ ...EMPTY_DOCUMENT_FLAGS, ...original, ...feedbackOn });
  }

  const borrowerTypes = [{ isJur: false }, { isJur: true }];
  const projects = [{}, { isKauf: true }, { isAbloesung: true }];
  const propertyTypes = [{}, { isNeubau: true }, { isBestand: true }];
  const employment = combinations(['hasAngestellt', 'hasSelbstaendig', 'hasAge50Plus']);
  const feedback = combinations(FEEDBACK_FLAG_NAMES);
  for (const b of borrowerTypes)
    for (const p of projects)
      for (const t of propertyTypes)
        for (const e of employment)
          for (const fb of feedback) out.push({ ...EMPTY_DOCUMENT_FLAGS, ...b, ...p, ...t, ...e, ...fb });
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

// ---------------------------------------------------------------------------------------
// Business feedback on the document rules (September 2026)
// ---------------------------------------------------------------------------------------

const flags = (over: Partial<DocumentFlags>): DocumentFlags => ({ ...EMPTY_DOCUMENT_FLAGS, ...over });
const sections = (f: DocumentFlags) =>
  documentSectionsFor(f).map((s) => [s.titleKey, s.items] as [string, string[]]);
const section = (f: DocumentFlags, titleKey: string) =>
  documentSectionsFor(f).find((s) => s.titleKey === titleKey)?.items;
const readLocale = (locale: string) =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'messages', `${locale}.json`), 'utf-8').replace(/^﻿/, '')
  );

describe('Pinned section layouts', () => {
  it('private purchase of an existing property, employed borrower', () => {
    expect(sections(flags({ isKauf: true, isBestand: true, hasAngestellt: true }))).toEqual([
      ['funnel.docSectionAuskunftsermaechtigung', ['funnel.auskunftsermaechtigungDoc']],
      ['funnel.personalDocuments', [
        'funnel.passportIDAllBorrowers',
        'funnel.ownFundsProofOfficial',
        'funnel.taxReturnLatest',
      ]],
      ['funnel.docSectionObjekt', [
        'funnel.salesDocPhotos',
        'funnel.constructionPlansNetArea',
        'funnel.propertyPhotosInteriorExterior',
        'funnel.landRegistryNotOlder6Months',
        'funnel.buildingInsuranceIfAvailable',
        'funnel.purchaseContractDraft',
      ]],
      ['funnel.forEmployed', [
        'funnel.salaryStatementBonus',
        'funnel.monthlyPayslips3',
        'funnel.pensionFundCertificate',
      ]],
    ]);
  });

  it('private Ablösung, everything in the Eigenmittel section answered', () => {
    expect(
      sections(
        flags({
          isAbloesung: true,
          isBestand: true,
          hasLeasing: true,
          hasSchenkung: true,
          hasDarlehen: true,
          hasErbschaft: true,
          hasSaeule3: true,
        })
      )
    ).toEqual([
      ['funnel.docSectionAuskunftsermaechtigung', ['funnel.auskunftsermaechtigungDoc']],
      ['funnel.personalDocuments', [
        'funnel.passportIDAllBorrowers',
        'funnel.ownFundsProofOfficial',
        'funnel.taxReturnLatest',
      ]],
      ['funnel.docSectionObjekt', [
        'funnel.oldSalesDocuments',
        'funnel.constructionPlansNetArea',
        'funnel.propertyPhotosInteriorExterior',
        'funnel.landRegistryNotOlder6Months',
        'funnel.buildingInsuranceIfAvailable',
      ]],
      ['funnel.docSectionEigenmittel', [
        'funnel.leasingContract',
        'funnel.giftContract',
        'funnel.loanContractGift',
        'funnel.inheritanceConfirmation',
        'funnel.pillar3BuybackValues',
      ]],
      ['funnel.docSectionAbloesung', ['funnel.currentMortgageContract']],
    ]);
  });

  it('company purchase of a new build, Baurecht, Grundbuch/GV already there', () => {
    expect(
      sections(flags({ isJur: true, isKauf: true, isNeubau: true, isBaurecht: true, hasNeubauGrundbuchGv: true }))
    ).toEqual([
      ['funnel.docSectionAuskunftsermaechtigung', ['funnel.auskunftsermaechtigungDoc']],
      ['funnel.documentsJur', [
        'funnel.commercialRegisterCurrent',
        'funnel.passportAuthorizedPersonJur',
        'funnel.annualFinancialStatementsJur',
        'funnel.interimBalanceIfAvailable',
        'funnel.debtCollectionExtractCurrent',
        'funnel.taxReturnLatestJur',
        'funnel.ownFundsProofJur',
      ]],
      ['funnel.docSectionObjekt', [
        'funnel.salesDocPhotos',
        'funnel.constructionPlansNetArea',
        'funnel.propertyPhotosInteriorExterior',
        'funnel.landRegistryNotOlder6Months',
        'funnel.buildingInsuranceIfAvailable',
        'funnel.purchaseOrRenovationContract',
        'funnel.baurechtsvertrag',
      ]],
    ]);
  });

  it('company Ablösung keeps the Baubeschrieb and the mortgage contract', () => {
    expect(section(flags({ isJur: true, isAbloesung: true, isBestand: true }), 'funnel.docSectionAbloesung')).toEqual([
      'funnel.constructionDescriptionPhotos',
      'funnel.currentMortgageContract',
    ]);
  });
});

describe('Objektunterlagen', () => {
  it('is shown to every case, private and company, right after the base documents', () => {
    const bad = ALL.filter((f) => documentSectionsFor(f)[2]?.titleKey !== 'funnel.docSectionObjekt');
    expect(bad.map(describeCase)).toEqual([]);
  });

  it('photos and Baurechtsvertrag are no longer base documents', () => {
    for (const isJur of [false, true]) {
      const base = section(
        flags({ isJur, isBaurecht: true }),
        isJur ? 'funnel.documentsJur' : 'funnel.personalDocuments'
      );
      expect(base).not.toContain('funnel.propertyPhotosInteriorExterior');
      expect(base).not.toContain('funnel.baurechtsvertrag');
    }
  });

  it('asks for the Baurechtsvertrag only when Baurecht was ticked', () => {
    for (const isJur of [false, true]) {
      expect(visibleDocumentKeys(flags({ isJur, isKauf: true }))).not.toContain('funnel.baurechtsvertrag');
      expect(section(flags({ isJur, isKauf: true, isBaurecht: true }), 'funnel.docSectionObjekt')).toContain(
        'funnel.baurechtsvertrag'
      );
    }
  });

  it('always asks an existing property for Grundbuchauszug and Gebäudeversicherung', () => {
    for (const isJur of [false, true])
      for (const project of [{ isKauf: true }, { isAbloesung: true }]) {
        const objekt = section(flags({ isJur, isBestand: true, ...project }), 'funnel.docSectionObjekt');
        expect(objekt).toContain('funnel.landRegistryNotOlder6Months');
        expect(objekt).toContain('funnel.buildingInsuranceIfAvailable');
      }
  });

  it('asks a Neubau for Grundbuchauszug and Gebäudeversicherung only when ticked', () => {
    for (const isJur of [false, true]) {
      const without = visibleDocumentKeys(flags({ isJur, isKauf: true, isNeubau: true }));
      expect(without).not.toContain('funnel.landRegistryNotOlder6Months');
      expect(without).not.toContain('funnel.buildingInsuranceIfAvailable');
      const withTick = section(
        flags({ isJur, isKauf: true, isNeubau: true, hasNeubauGrundbuchGv: true }),
        'funnel.docSectionObjekt'
      );
      expect(withTick).toContain('funnel.landRegistryNotOlder6Months');
      expect(withTick).toContain('funnel.buildingInsuranceIfAvailable');
    }
  });

  it('asks for the Kaufvertrag on a purchase only', () => {
    expect(section(flags({ isKauf: true, isBestand: true }), 'funnel.docSectionObjekt')).toContain(
      'funnel.purchaseContractDraft'
    );
    expect(visibleDocumentKeys(flags({ isAbloesung: true }))).not.toContain('funnel.purchaseContractDraft');
    expect(visibleDocumentKeys(flags({}))).not.toContain('funnel.purchaseContractDraft');
  });

  it('asks an Ablösung for the old sales documents instead of current ones', () => {
    for (const isJur of [false, true]) {
      const objekt = section(flags({ isJur, isAbloesung: true, isBestand: true }), 'funnel.docSectionObjekt');
      expect(objekt).toContain('funnel.oldSalesDocuments');
      expect(objekt).not.toContain('funnel.salesDocPhotos');
      expect(visibleDocumentKeys(flags({ isJur, isAbloesung: true }))).toContain('funnel.currentMortgageContract');
    }
  });

  it('no longer shows a separate Neubau section', () => {
    const bad = ALL.filter((f) => documentSectionsFor(f).some((s) => s.titleKey === 'funnel.docSectionNeubau'));
    expect(bad.map(describeCase)).toEqual([]);
  });
});

describe('Pension documents', () => {
  it('never asks for the retired combined PK / 3. Säule document', () => {
    const bad = ALL.filter((f) => visibleDocumentKeys(f).includes('funnel.pensionFund3rdPillarBuyback'));
    expect(bad.map(describeCase)).toEqual([]);
  });

  it('asks every employee for the Pensionskassenausweis', () => {
    expect(section(flags({ hasAngestellt: true }), 'funnel.forEmployed')).toContain('funnel.pensionFundCertificate');
  });

  it('asks a self-employed borrower for it only when a Pensionskasse was ticked', () => {
    expect(visibleDocumentKeys(flags({ hasSelbstaendig: true }))).not.toContain('funnel.pensionFundCertificate');
    expect(section(flags({ hasSelbstaendig: true, hasPkSelbstaendig: true }), 'funnel.forSelfEmployed')).toEqual([
      'funnel.balanceSheetAudit3Years',
      'funnel.pensionFundCertificate',
    ]);
  });

  it('asks for the 3. Säule only when 3. Säule money is put in', () => {
    expect(visibleDocumentKeys(flags({ hasAngestellt: true }))).not.toContain('funnel.pillar3BuybackValues');
    expect(section(flags({ hasAngestellt: true, hasSaeule3: true }), 'funnel.docSectionEigenmittel')).toEqual([
      'funnel.pillar3BuybackValues',
    ]);
  });

  it('from 50 asks for both, each only once', () => {
    expect(section(flags({ hasAge50Plus: true }), 'funnel.from50Years')).toEqual([
      'funnel.pensionForecastAHV',
      'funnel.pensionFundCertificate',
      'funnel.pillar3BuybackValues',
    ]);
    const f = flags({ hasAge50Plus: true, hasAngestellt: true, hasSaeule3: true });
    const all = documentSectionsFor(f).flatMap((s) => s.items);
    expect(all.filter((k) => k === 'funnel.pillar3BuybackValues')).toHaveLength(1);
    expect(all.filter((k) => k === 'funnel.pensionFundCertificate')).toHaveLength(1);
  });
});

describe('Eigenmittel und Verpflichtungen (private borrowers)', () => {
  it('replaces "Andere Einkommen und Schulden" and the private "Andere Eigentümer"', () => {
    const bad = ALL.filter(
      (f) =>
        !f.isJur &&
        documentSectionsFor(f).some((s) => s.titleKey === 'funnel.otherIncomeAndDebts' || s.titleKey === 'funnel.otherOwners')
    );
    expect(bad.map(describeCase)).toEqual([]);
  });

  it('is absent when nothing in it applies', () => {
    expect(section(flags({ hasMultipleOwners: true }), 'funnel.docSectionEigenmittel')).toBeUndefined();
  });

  it.each([
    ['hasLeasing', 'funnel.leasingContract'],
    ['hasSchenkung', 'funnel.giftContract'],
    ['hasDarlehen', 'funnel.loanContractGift'],
    ['hasErbschaft', 'funnel.inheritanceConfirmation'],
    ['hasSaeule3', 'funnel.pillar3BuybackValues'],
  ] as const)('%s asks for %s, and no other answer does', (flag, doc) => {
    expect(section(flags({ [flag]: true }), 'funnel.docSectionEigenmittel')).toEqual([doc]);
    // Every other feedback answer on, this one off (and not 50+, which asks for the 3a too).
    const others = FEEDBACK_FLAG_NAMES.filter((n) => n !== flag);
    const everythingElse = flags({
      ...Object.fromEntries(others.map((n) => [n, true])),
      isKauf: true,
      hasAngestellt: true,
      hasSelbstaendig: true,
      hasMultipleOwners: true,
    });
    expect(visibleDocumentKeys(everythingElse)).not.toContain(doc);
  });

  it('companies keep their "Andere Eigentümer" section for several borrowers', () => {
    expect(section(flags({ isJur: true, hasMultipleOwners: true }), 'funnel.otherOwners')).toEqual([
      'funnel.giftContract',
      'funnel.loanContractGift',
      'funnel.inheritanceContract',
    ]);
    expect(section(flags({ isJur: true, hasSchenkung: true }), 'funnel.docSectionEigenmittel')).toBeUndefined();
  });
});

describe('documentFlagsFrom — from funnel answers to flags', () => {
  const NOW = new Date(2026, 9, 2, 12, 0, 0);
  const answers = (over: { property?: any; financing?: any; project?: any; borrowers?: any[] }) => ({
    borrowers: [{ type: 'nat' }],
    project: { projektArt: 'kauf' },
    property: { artImmobilie: 'bestehend', kreditnehmer: [{ erwerb: 'angestellt', geburtsdatum: '01.01.1990' }] },
    financing: {},
    ...over,
  });

  it('recognises a Renditeobjekt in every language the funnel stores the label in', () => {
    for (const locale of ['de', 'en', 'fr', 'it']) {
      const label = readLocale(locale).funnel.investmentProperty;
      const f = documentFlagsFrom(answers({ property: { nutzung: label } }), NOW);
      expect([locale, label, f.isRenditeobjekt]).toEqual([locale, label, true]);
      expect(visibleDocumentKeys(f)).toContain('funnel.rentalOverviewCurrent');
    }
    for (const locale of ['de', 'en', 'fr', 'it']) {
      const label = readLocale(locale).funnel.ownerOccupied;
      expect(documentFlagsFrom(answers({ property: { nutzung: label } }), NOW).isRenditeobjekt).toBe(false);
    }
  });

  it('Stockwerkeigentum follows the STWE question, not every Wohnung', () => {
    expect(documentFlagsFrom(answers({ property: { artLiegenschaft: 'Wohnung' } }), NOW).isStockwerkeigentum).toBe(false);
    expect(
      documentFlagsFrom(answers({ property: { artLiegenschaft: 'Appartement', stockwerkeigentum: 'nein' } }), NOW)
        .isStockwerkeigentum
    ).toBe(false);
    const stwe = documentFlagsFrom(
      answers({ property: { artLiegenschaft: 'Appartamento', stockwerkeigentum: 'ja' } }),
      NOW
    );
    expect(stwe.isStockwerkeigentum).toBe(true);
    expect(visibleDocumentKeys(stwe)).toContain('funnel.condominiumActValue');
  });

  it('reads Baurecht and the Neubau Grundbuch/GV tick', () => {
    expect(documentFlagsFrom(answers({ property: { baurecht: 'ja' } }), NOW).isBaurecht).toBe(true);
    expect(documentFlagsFrom(answers({ property: { baurecht: 'nein' } }), NOW).isBaurecht).toBe(false);
    expect(
      documentFlagsFrom(answers({ property: { artImmobilie: 'neubau', neubauGrundbuchGvVorhanden: 'ja' } }), NOW)
        .hasNeubauGrundbuchGv
    ).toBe(true);
    // A tick left over from a Neubau answer does not apply to an existing property.
    expect(
      documentFlagsFrom(answers({ property: { artImmobilie: 'bestehend', neubauGrundbuchGvVorhanden: 'ja' } }), NOW)
        .hasNeubauGrundbuchGv
    ).toBe(false);
  });

  it('counts the PK tick only for a self-employed borrower', () => {
    const borrower = (erwerb: string, pkVorhanden?: string) =>
      documentFlagsFrom(answers({ property: { kreditnehmer: [{ erwerb, pkVorhanden }] } }), NOW);
    expect(borrower('selbständig').hasPkSelbstaendig).toBe(false);
    expect(borrower('selbständig', 'ja').hasPkSelbstaendig).toBe(true);
    expect(visibleDocumentKeys(borrower('selbständig', 'ja'))).toContain('funnel.pensionFundCertificate');
    expect(borrower('angestellt', 'ja').hasPkSelbstaendig).toBe(false);
  });

  it('reads the Eigenmittel sources and the leasing answer', () => {
    const f = documentFlagsFrom(
      answers({
        financing: {
          eigenmittel_saeule3: '20000',
          eigenmittel_schenkung: "CHF 50'000",
          eigenmittel_darlehen: '10000',
          eigenmittel_erbschaft: '',
          leasingVorhanden: 'ja',
        },
      }),
      NOW
    );
    expect(f).toMatchObject({
      hasSaeule3: true,
      hasSchenkung: true,
      hasDarlehen: true,
      hasErbschaft: false,
      hasLeasing: true,
    });
    expect(
      documentFlagsFrom(answers({ financing: { leasingVorhanden: 'nein', eigenmittel_saeule3: '0' } }), NOW)
    ).toMatchObject({ hasLeasing: false, hasSaeule3: false });
  });

  it('works out 50+ from the Swiss birth date', () => {
    const at = (geburtsdatum: string) =>
      documentFlagsFrom(answers({ property: { kreditnehmer: [{ erwerb: 'angestellt', geburtsdatum }] } }), NOW)
        .hasAge50Plus;
    expect(at('02.10.1976')).toBe(true);
    expect(at('03.10.1976')).toBe(false);
  });
});

describe('Translations for the new funnel questions', () => {
  const UI_KEYS = [
    'docSectionObjekt',
    'docSectionEigenmittel',
    'pensionFundCertificate',
    'pillar3BuybackValues',
    'loanOwnFunds',
    'inheritanceOwnFunds',
    'loanNotOwnFundsHint',
    'leasingQuestion',
    'baurechtQuestion',
    'neubauGrundbuchGvAvailable',
    'stockwerkeigentumQuestion',
    'pkAvailable',
  ];
  for (const locale of ['de', 'fr', 'it', 'en']) {
    it(`${locale}: every new key exists`, () => {
      const json = readLocale(locale);
      expect(UI_KEYS.filter((k) => !json.funnel[k])).toEqual([]);
    });
  }

  it('de: Swiss spelling, and the relabelled entries read as the business asked', () => {
    const json = readLocale('de');
    expect(UI_KEYS.filter((k) => /ß/.test(json.funnel[k]))).toEqual([]);
    expect(json.funnel.donation).toBe('Schenkung');
    expect(json.funnel.pensionForecastAHV).toBe('Rentenvorausberechnung AHV');
    expect(json.funnel.leasingContract).not.toMatch(/falls vorhanden/);
    expect(json.funnel.purchaseContractDraft).not.toMatch(/Reservationsvertrag/);
  });
});
