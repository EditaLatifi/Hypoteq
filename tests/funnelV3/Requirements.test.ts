import { describe, it, expect } from '@jest/globals';
import {
  REQ,
  reqList,
  reqDelta,
  getRequirement,
  requirementForLegacyKey,
  reasonTextDe,
  type ReqState,
} from '@/lib/funnel-v3/requirements';
import type { Answers, Borrower } from '@/lib/funnel-v3/types';
import { DOCUMENT_CATALOG } from '@/components/funnelDocumentCatalog';
import { VERIFIED_TAB_ENTRIES } from '@/components/dokumentenCheckState';
import { GERBER_ANSWERS, mkState } from './helpers';
import i18n from '@/docs/funnel-v3/HYPOTEQ_Funnel_i18n.json';

const codes = (s: ReqState) => reqList(s).map((r) => r.code);
const has = (s: ReqState, code: string) => codes(s).includes(code);

describe('Gerber progression (spec 4.1)', () => {
  it('counts 13 → 16 → 18 → 21 → 23', () => {
    // Fresh funnel: every yes/no on «Nein», Gary angestellt.
    let ans: Partial<Answers> = {};
    expect(reqList(mkState(ans))).toHaveLength(13);

    // Schritt 1/2: Ablösung mit Erhöhung, bestehende Immobilie.
    ans = { ...ans, antrag: 'Ablösung', anrede: 'Herr', immo: 'Bestehende Immobilie', aufstockung: 'Ja' };
    expect(reqList(mkState(ans))).toHaveLength(16);

    // Stockwerkeigentum, selbstbewohnt.
    ans = { ...ans, lieg: 'Stockwerkeigentum', nutz: 'Selbstbewohnt', heizung: 'Unbekannt' };
    expect(reqList(mkState(ans))).toHaveLength(18);

    // Schritt 3: Kinder + Unterhalt, Privatkredit, Leasing.
    ans = { ...ans, kinder: 'Ja', unterhalt: 'Ja', kredite: 'Ja', leasing: 'Ja' };
    expect(reqList(mkState(ans))).toHaveLength(21);

    // Schritt 4: Säule 3a.
    ans = { ...ans, s3a: 'Ja' };
    expect(reqList(mkState(ans))).toHaveLength(23);
    expect(ans).toEqual(GERBER_ANSWERS);
  });

  it('is the 23 documents of the prototype catalogue', () => {
    const ids = reqList(mkState(GERBER_ANSWERS)).map((r) => r.id).sort();
    expect(ids).toEqual(
      ['vollmacht', 'id', 'lohnausweise', 'lohnabrechnungen', 'anstellung', 'steuer', 'vermoegen', 'pk', 's3a', 'police',
        'unterhalt', 'kredit', 'leasing', 'fotos', 'grundbuch', 'gvz', 'verkaufsdoku', 'stwe_regl', 'stwe_plan', 'ef',
        'hyp_rahmen', 'hyp_sicher', 'hyp_zins'].sort()
    );
  });

  it('starts at 13 also when the Beschäftigung is still open', () => {
    expect(reqList(mkState({}, { job: undefined }))).toHaveLength(13);
  });

  it('asks every document exactly once', () => {
    const ids = reqList(mkState(GERBER_ANSWERS)).map((r) => r.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

type Case = { ans?: Partial<Answers>; b?: Partial<Borrower> };
const RULES: [string, Case[], Case[]][] = [
  ['O1', [{ ans: { immo: 'Bestehende Immobilie' } }, { ans: { immo: 'Neubau' } }], [{ ans: { immo: 'Bauprojekt' } }]],
  ['O2', [{ ans: { immo: 'Bestehende Immobilie' } }, { ans: { immo: 'Neubau' } }], [{ ans: { immo: 'Bauprojekt' } }]],
  ['O3', [{ ans: { immo: 'Bestehende Immobilie' } }, { ans: { immo: 'Neubau' } }], [{ ans: { immo: 'Bauprojekt' } }]],
  ['O4', [{ ans: { immo: 'Bestehende Immobilie' } }, { ans: { immo: 'Bauprojekt' } }, { ans: { immo: 'Neubau', nbDocs: 'Ja' } }], [{ ans: { immo: 'Neubau', nbDocs: 'Nein' } }]],
  ['O5', [{ ans: { immo: 'Bestehende Immobilie' } }, { ans: { immo: 'Neubau', nbDocs: 'Ja' } }], [{ ans: { immo: 'Bauprojekt', nbDocs: 'Ja' } }, { ans: { immo: 'Neubau', nbDocs: 'Nein' } }]],
  ['O6', [{ ans: { antrag: 'Neue Hypothek', immo: 'Bestehende Immobilie' } }, { ans: { antrag: 'Neue Hypothek', immo: 'Neubau' } }], [{ ans: { antrag: 'Ablösung' } }, { ans: { antrag: 'Neue Hypothek', immo: 'Bauprojekt' } }]],
  ['O7', [{ ans: { antrag: 'Neue Hypothek', reserviert: 'Ja' } }], [{ ans: { antrag: 'Neue Hypothek' } }, { ans: { antrag: 'Ablösung', reserviert: 'Ja' } }]],
  ['O8', [{ ans: { antrag: 'Neue Hypothek', reserviert: 'Ja' } }], [{ ans: { antrag: 'Neue Hypothek' } }, { ans: { antrag: 'Ablösung', reserviert: 'Ja' } }]],
  ['O9', [{ ans: { immo: 'Bauprojekt' } }, { ans: { antrag: 'Ablösung', immo: 'Bauprojekt' } }, { ans: { antrag: 'Neue Hypothek', reno: 'Ja' } }], [{ ans: { antrag: 'Neue Hypothek' } }, { ans: { antrag: 'Ablösung', reno: 'Ja' } }]],
  ['O10', [{ ans: { immo: 'Bauprojekt' } }, { ans: { antrag: 'Neue Hypothek', reno: 'Ja' } }], [{ ans: { antrag: 'Neue Hypothek' } }, { ans: { antrag: 'Ablösung', reno: 'Ja' } }]],
  ['O11', [{ ans: { lieg: 'Stockwerkeigentum' } }], [{ ans: { lieg: 'Einfamilienhaus' } }, {}]],
  ['O12', [{ ans: { lieg: 'Stockwerkeigentum' } }], [{ ans: { lieg: 'Mehrfamilienhaus' } }]],
  ['O13', [{ ans: { nutz: 'Vermietet' } }], [{ ans: { nutz: 'Selbstbewohnt' } }, { ans: { nutz: 'Zweitwohnsitz' } }]],
  ['O14', [{ ans: { baurecht: 'Ja' } }], [{ ans: { baurecht: 'Nein' } }]],
  ['O15', [{ ans: { angebote: 'Ja' } }], [{ ans: { angebote: 'Nein' } }]],
  ['H1', [{ ans: { antrag: 'Ablösung' } }], [{ ans: { antrag: 'Neue Hypothek' } }, {}]],
  ['H2', [{ ans: { antrag: 'Ablösung' } }], [{ ans: { antrag: 'Neue Hypothek' } }]],
  ['H3', [{ ans: { antrag: 'Ablösung' } }], [{ ans: { antrag: 'Neue Hypothek' } }]],
  ['P1', [{}, { ans: { kn: 'Juristische Person' } }], []],
  ['P2', [{}], [{ ans: { kn: 'Juristische Person' } }]],
  ['P3', [{ b: { job: 'Angestellt' } }, { b: { job: undefined } }], [{ b: { job: 'Selbständig' } }, { b: { job: 'Pensioniert' } }, { ans: { kn: 'Juristische Person' } }]],
  ['P4', [{ b: { job: 'Angestellt' } }, { b: { job: undefined } }], [{ b: { job: 'Selbständig' } }, { b: { job: 'Pensioniert' } }]],
  ['P5', [{ b: { job: 'Angestellt' } }, { b: { job: undefined } }], [{ b: { job: 'Selbständig' } }, { b: { job: 'Pensioniert' } }]],
  ['P6', [{ b: { job: 'Angestellt' } }, { b: { job: 'Selbständig', pkSe: 'Ja' } }], [{ b: { job: 'Selbständig', pkSe: 'Nein' } }, { b: { job: 'Pensioniert' } }, { ans: { kn: 'Juristische Person' } }]],
  ['P7', [{ b: { job: 'Selbständig' } }], [{ b: { job: 'Angestellt' } }, { b: { job: 'Pensioniert' } }]],
  ['P8', [{ b: { job: 'Pensioniert' } }], [{ b: { job: 'Angestellt' } }, { b: { job: 'Selbständig' } }]],
  ['P9', [{}, { b: { job: 'Pensioniert' } }], [{ ans: { kn: 'Juristische Person' } }]],
  ['P10', [{ ans: { ab50: 'Ja' } }, { ans: { ab50: 'Ja' }, b: { job: 'Selbständig' } }], [{ ans: { ab50: 'Nein' } }, { ans: { ab50: 'Ja' }, b: { job: 'Pensioniert' } }, { ans: { ab50: 'Ja', kn: 'Juristische Person' } }]],
  ['P11', [{ ans: { kinder: 'Ja', unterhalt: 'Ja' } }], [{ ans: { kinder: 'Ja' } }, { ans: { unterhalt: 'Ja' } }, { ans: { kinder: 'Ja', unterhalt: 'Ja', kn: 'Juristische Person' } }]],
  ['P12', [{ ans: { kredite: 'Ja' } }, { ans: { kredite: 'Ja', kn: 'Juristische Person' } }], [{ ans: { kredite: 'Nein' } }]],
  ['P13', [{ ans: { leasing: 'Ja' } }, { ans: { leasing: 'Ja', kn: 'Juristische Person' } }], [{ ans: { leasing: 'Nein' } }]],
  ['P14', [{ ans: { buerge: 'Ja' } }, { ans: { buerge: 'Ja', kn: 'Juristische Person' } }], [{ ans: { buerge: 'Nein' } }]],
  ['P15', [{ ans: { buerge: 'Ja' } }], [{ ans: { buerge: 'Nein' } }]],
  ['P16', [{ ans: { buerge: 'Ja' } }], [{ ans: { buerge: 'Nein' } }]],
  ...(['J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map((c) => [c, [{ ans: { kn: 'Juristische Person' } }], [{}, { ans: { kn: 'Natürliche Person' } }]] as [string, Case[], Case[]])),
  ['E1', [{}, { ans: { kn: 'Juristische Person' } }], []],
  ['E2', [{ ans: { s3a: 'Ja' } }, { ans: { ab50: 'Ja' } }, { ans: { s3a: 'Ja', kn: 'Juristische Person' } }], [{}, { ans: { ab50: 'Ja', kn: 'Juristische Person' } }]],
  ['E3', [{ ans: { s3a: 'Ja' } }, { ans: { ab50: 'Ja' } }], [{}, { ans: { ab50: 'Ja', kn: 'Juristische Person' } }]],
  ['E4', [{ ans: { pk: 'Ja' } }], [{}]],
  ['E5', [{ ans: { schenkung: 'Ja' } }], [{}]],
  ['E6', [{ ans: { erbe: 'Ja' } }], [{}]],
  ['E7', [{ ans: { darlehen: 'Ja' } }], [{}]],
];

describe('rules O1–E7 (spec 4.1)', () => {
  it('covers every requirement of the catalogue', () => {
    expect(RULES.map((r) => r[0]).sort()).toEqual(REQ.map((r) => r.code).sort());
  });
  for (const [code, yes, no] of RULES) {
    it(`${code}: asked when it should be, and only then`, () => {
      for (const c of yes) expect([code, c, has(mkState(c.ans, c.b), code)]).toEqual([code, c, true]);
      for (const c of no) expect([code, c, has(mkState(c.ans, c.b), code)]).toEqual([code, c, false]);
    });
  }
});

describe('Bestehende Immobilie / Neubau / Bauprojekt', () => {
  const objekt = (immo: Answers['immo'], nbDocs: 'Ja' | 'Nein' = 'Nein', antrag: Answers['antrag'] = 'Neue Hypothek') =>
    reqList(mkState({ immo, nbDocs, antrag })).filter((r) => r.group === 'objekt').map((r) => r.code);

  it('Bestehende Immobilie: the full Objekt set incl. Grundbuch and GVZ', () => {
    expect(objekt('Bestehende Immobilie')).toEqual(['O1', 'O2', 'O3', 'O4', 'O5', 'O6']);
    // nbDocs is a Neubau question and does not matter otherwise.
    expect(objekt('Bestehende Immobilie', 'Ja')).toEqual(['O1', 'O2', 'O3', 'O4', 'O5', 'O6']);
  });
  it('Neubau without Grundbuch/GVZ yet', () => {
    expect(objekt('Neubau', 'Nein')).toEqual(['O1', 'O2', 'O3', 'O6']);
  });
  it('Neubau with Grundbuch/GVZ', () => {
    expect(objekt('Neubau', 'Ja')).toEqual(['O1', 'O2', 'O3', 'O4', 'O5', 'O6']);
  });
  it('Bauprojekt: Grundbuch, Baubewilligung and Projektunterlagen, no photos/plans/GVZ/Kaufvertrag', () => {
    expect(objekt('Bauprojekt')).toEqual(['O4', 'O9', 'O10']);
    expect(objekt('Bauprojekt', 'Ja')).toEqual(['O4', 'O9', 'O10']);
    expect(objekt('Bauprojekt', 'Nein', 'Ablösung')).toEqual(['O4', 'O9', 'O10']);
  });
  it('gives the Neubau Grundbuch its reason', () => {
    const gb = reqList(mkState({ immo: 'Neubau', nbDocs: 'Ja' })).find((r) => r.id === 'grundbuch')!;
    expect(reasonTextDe(gb.reason)).toBe('weil: Grundbuch und GVZ vorhanden = Ja');
  });
});

describe('juristische Person', () => {
  const s = mkState({ kn: 'Juristische Person', antrag: 'Neue Hypothek', immo: 'Bestehende Immobilie', ab50: 'Ja', kinder: 'Ja', unterhalt: 'Ja' }, {}, { firma: 'Muster Immobilien AG', zeichner: 'Anna Muster' });
  const list = reqList(s);

  it('uses J1–J6 instead of the natural-person documents', () => {
    expect(list.filter((r) => r.group === 'person').map((r) => r.code)).toEqual(['P1', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6']);
  });
  it('shares the Objekt block with natural persons', () => {
    const nat = reqList(mkState({ antrag: 'Neue Hypothek', immo: 'Bestehende Immobilie' })).filter((r) => r.group === 'objekt');
    expect(list.filter((r) => r.group === 'objekt').map((r) => r.id)).toEqual(nat.map((r) => r.id));
  });
  it('makes only the Zwischenbilanz optional', () => {
    expect(list.filter((r) => r.optional).map((r) => r.code)).toEqual(['O2', 'J4']);
    expect(list.find((r) => r.code === 'J4')!.reason).toEqual({ key: 'why.ifAvailable' });
  });
  it('names the company and the signatory', () => {
    expect(list.find((r) => r.id === 'hr')!.person).toMatchObject({ kind: 'company', company: 'Muster Immobilien AG' });
    expect(list.find((r) => r.id === 'wb')!.person).toMatchObject({ kind: 'signatory', first: 'Anna', last: 'Muster' });
  });
});

describe('per-borrower expansion', () => {
  const borrowers: Borrower[] = [
    { id: 'b1', vor: 'Gary', nach: 'Gerber', job: 'Angestellt', pkSe: 'Nein' },
    { id: 'b2', vor: 'Lea', nach: 'Gerber', job: 'Selbständig', pkSe: 'Ja' },
    { id: 'b3', vor: 'Hans', nach: 'Muster', job: 'Pensioniert', pkSe: 'Nein' },
  ];
  const list = reqList(mkState({ ab50: 'Ja' }, {}, {}, borrowers));

  it('expands each borrower by his own Beschäftigung', () => {
    const person = list.filter((r) => r.group === 'person').map((r) => r.instanceId);
    expect(person).toEqual([
      'vollmacht',
      'id#b1', 'lohnausweise#b1', 'lohnabrechnungen#b1', 'anstellung#b1', 'pk#b1', 'steuer#b1',
      'id#b2', 'pk#b2', 'abschluss_se#b2', 'steuer#b2',
      'id#b3', 'rente#b3', 'steuer#b3',
      'ahv_voraus',
    ]);
  });
  it('carries the borrower on the instance', () => {
    const id2 = list.find((r) => r.instanceId === 'id#b2')!;
    expect(id2.borrowerId).toBe('b2');
    expect(id2.person).toMatchObject({ kind: 'borrower', first: 'Lea', last: 'Gerber', display: 'Lea Gerber' });
    expect(id2.reason).toEqual({ key: 'why.perBorrower' });
  });
  it('gives case-level person documents to the first borrower', () => {
    expect(list.find((r) => r.id === 'vollmacht')!.person?.display).toBe('Gary Gerber');
  });
  it('names the Solidarbürge from txt.buergeName', () => {
    const l = reqList(mkState({ buerge: 'Ja' }, {}, { buergeName: 'Peter Bürgi' }));
    const b = l.filter((r) => r.def.personKind === 'guarantor');
    expect(b.map((r) => r.code)).toEqual(['P14', 'P15', 'P16']);
    expect(b[0].person).toMatchObject({ kind: 'guarantor', first: 'Peter', last: 'Bürgi' });
  });
  it('still lists one borrower before any is entered, named from step 1', () => {
    const l = reqList({ ...mkState(), borrowers: [] });
    expect(l.find((r) => r.id === 'id')!.person?.display).toBe('Gary Gerber');
    expect(l).toHaveLength(13);
  });
});

describe('reasons', () => {
  const list = reqList(mkState({ ...GERBER_ANSWERS, baurecht: 'Ja' }));
  const why = (id: string) => reasonTextDe(list.find((r) => r.id === id)!.reason);
  it('says Pflicht, pro Kreditnehmer, Falls vorhanden or weil: …', () => {
    expect(why('fotos')).toBe('Pflicht');
    expect(why('id')).toBe('Pflicht · pro Kreditnehmer');
    expect(why('verkaufsdoku')).toBe('Falls vorhanden');
    expect(why('baurecht')).toBe('weil: Baurecht = Ja');
    expect(why('hyp_zins')).toBe('weil: Kreditantrag = Ablösung');
    expect(why('stwe_regl')).toBe('weil: Liegenschaft = Stockwerkeigentum');
    expect(why('s3a')).toBe('weil: Säule 3a = Ja');
  });
  it('points at real question and option keys of the i18n file', () => {
    const de = (i18n as any).de;
    for (const r of reqList(mkState({ ...GERBER_ANSWERS, baurecht: 'Ja', ab50: 'Ja', buerge: 'Ja', pk: 'Ja', reno: 'Ja', reserviert: 'Ja', nutz: 'Vermietet' }, { job: 'Selbständig', pkSe: 'Ja' }))) {
      expect(de.why[r.reason.key.slice(4)]).toBeDefined();
      if (r.reason.key !== 'why.because') continue;
      for (const c of r.reason.conditions) {
        expect([r.id, c.question, de.q[c.question]]).not.toContain(undefined);
        if (c.value !== 'Ja') expect([c.question, c.value, de.opt[`${c.question}.${c.value}`]]).not.toContain(undefined);
      }
    }
  });
});

describe('reqDelta', () => {
  it('counts what an answer would add', () => {
    expect(reqDelta(mkState(), { ans: { antrag: 'Ablösung' } })).toEqual({ added: ['hyp_rahmen', 'hyp_sicher', 'hyp_zins'], removed: [], net: 3 });
    expect(reqDelta(mkState(), { ans: { lieg: 'Stockwerkeigentum' } }).net).toBe(2);
    expect(reqDelta(mkState(), { ans: { baurecht: 'Ja' } }).net).toBe(1);
    expect(reqDelta(mkState(), { ans: { baurecht: 'Nein' } }).net).toBe(0);
  });
  it('counts what a change removes', () => {
    const d = reqDelta(mkState({ immo: 'Bestehende Immobilie' }), { ans: { immo: 'Bauprojekt' } });
    expect(d.removed).toEqual(['fotos', 'verkaufsdoku', 'stwe_plan', 'gvz']);
    expect(d.added).toEqual(['baubewilligung', 'projekt']);
    expect(d.net).toBe(-2);
  });
  it('handles a per-borrower answer', () => {
    const d = reqDelta(mkState(), { borrower: { id: 'b1', job: 'Selbständig' } });
    expect(d.added).toEqual(['abschluss_se#b1']);
    expect(d.removed).toEqual(['lohnausweise#b1', 'lohnabrechnungen#b1', 'anstellung#b1', 'pk#b1']);
  });
});

describe('catalogue', () => {
  const langs = ['de', 'en', 'fr', 'it'] as const;
  // The file has two levels: section, then the rest of the key verbatim («opt» → «lieg.Stockwerkeigentum»).
  const lookup = (lang: string, key: string) => {
    const i = key.indexOf('.');
    return (i18n as any)[lang]?.[key.slice(0, i)]?.[key.slice(i + 1)];
  };

  it('has unique ids and codes', () => {
    expect(new Set(REQ.map((r) => r.id)).size).toBe(REQ.length);
    expect(new Set(REQ.map((r) => r.code)).size).toBe(REQ.length);
    expect(REQ).toHaveLength(15 + 3 + 16 + 6 + 7);
  });
  it('has every label in all four languages, and the German one verbatim', () => {
    for (const r of REQ) {
      for (const l of langs) expect([r.labelKey, l, typeof lookup(l, r.labelKey)]).toEqual([r.labelKey, l, 'string']);
      expect(lookup('de', r.labelKey)).toBe(r.labelDe);
    }
  });
  it('has every group, reason and state key in all four languages', () => {
    const keys = ['grp.objekt', 'grp.hypothek', 'grp.person', 'grp.eigenmittel', 'why.required', 'why.perBorrower', 'why.ifAvailable', 'why.because',
      ...['missing', 'analysing', 'partial', 'ok', 'outdated', 'skipped', 'surplus', 'duplicate', 'notneeded', 'unknown'].map((s) => `state.${s}`),
      ...['loan', 'maint', '3a', 'stwe'].flatMap((s) => [`sug.${s}.title`, `sug.${s}.text`])];
    for (const k of keys) for (const l of langs) expect([k, l, typeof lookup(l, k)]).toEqual([k, l, 'string']);
  });
  it('expects 3 Lohnausweise (P3, and P16 for the Solidarbürge — D22) and 2 3a-Police files, 1 otherwise', () => {
    expect(REQ.filter((r) => r.expect !== 1).map((r) => [r.code, r.expect])).toEqual([['P3', 3], ['P16', 3], ['E3', 2]]);
  });
  it('allows «Habe ich nicht» only for O2 and J4', () => {
    expect(REQ.filter((r) => r.optional).map((r) => r.code)).toEqual(['O2', 'J4']);
  });
  it('maps exactly the spec 6.9 Dok_* checkboxes', () => {
    const map = Object.fromEntries(REQ.filter((r) => r.sfDokField).map((r) => [r.code, r.sfDokField]));
    expect(map).toEqual({
      P2: 'Dok_Identitaetsdokument__c',
      P3: 'Dok_Lohnausweis__c',
      P6: 'Dok_Pensionskassenausweis__c',
      P9: 'Dok_Steuererklaerung__c',
      O1: 'Dok_Fotos_der_Immobilie__c',
      O3: 'Dok_Grundrissplaene__c',
      O4: 'Dok_Grundbuchauszug__c',
      O5: 'Dok_Gebaeudeversicherungsausweis__c',
      O6: 'Dok_Kaufvertrag__c',
      J5: 'Dok_Betreibungsregisterauszug__c',
    });
  });
  it('uses the rename groups 01 Person · 02 Hypothek · 03 Objekt · 04 Eigenmittel', () => {
    for (const r of REQ) expect(r.renameGroup).toBe({ person: '01', hypothek: '02', objekt: '03', eigenmittel: '04' }[r.group]);
  });
  it('keeps the prototype short names', () => {
    const SHORT = { fotos: 'Fotos', verkaufsdoku: 'Verkaufsdokumentation', stwe_plan: 'Grundrissplaene', grundbuch: 'Grundbuchauszug', gvz: 'Gebaeudeversicherung', stwe_regl: 'STWE-Reglement', ef: 'Erneuerungsfonds', hyp_rahmen: 'Hypothekarvertrag', hyp_sicher: 'Sicherungsvereinbarung', hyp_zins: 'Zinsabrechnung', vollmacht: 'Auskunftsermaechtigung', id: 'ID', lohnausweise: 'Lohnausweis', lohnabrechnungen: 'Lohnabrechnungen', anstellung: 'Anstellungsvertrag', pk: 'Pensionskassenausweis', steuer: 'Steuererklaerung', unterhalt: 'Unterhaltsvereinbarung', kredit: 'Kreditvertrag', leasing: 'Leasingvertrag', vermoegen: 'Eigenmittelnachweis', s3a: 'Saeule3a-Bescheinigung', police: 'Vorsorgepolice-3a' };
    for (const [id, short] of Object.entries(SHORT)) expect(getRequirement(id)!.shortName).toBe(short);
    for (const r of REQ) expect(r.shortName).toMatch(/^[A-Za-z0-9-]+$/);
  });
});

describe('legacy compatibility', () => {
  it('only uses legacy keys that exist in funnelDocumentCatalog', () => {
    const bad = REQ.flatMap((r) => r.legacyKeys.filter((k) => !DOCUMENT_CATALOG[k]));
    expect(bad).toEqual([]);
  });
  it('resolves every legacy key, each to exactly one requirement', () => {
    const all = REQ.flatMap((r) => [...r.legacyKeys]);
    expect(new Set(all).size).toBe(all.length);
    expect(Object.keys(DOCUMENT_CATALOG).filter((k) => !requirementForLegacyKey(k))).toEqual([]);
    expect(requirementForLegacyKey('funnel.landRegistryNotOlder6Months')!.id).toBe('grundbuch');
    expect(requirementForLegacyKey('funnel.taxReturnLatestJur')!.id).toBe('steuer_jp');
  });
  it('ticks only verified tab entries', () => {
    const verified = new Set(VERIFIED_TAB_ENTRIES);
    expect(REQ.flatMap((r) => r.tabEntries.filter((e) => !verified.has(e)))).toEqual([]);
    expect(getRequirement('lohnausweise')!.tabEntries).toEqual(['Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis']);
    expect(getRequirement('grundbuch')!.tabEntries).toEqual([]);
  });
  it('resolves an instance id to its requirement', () => {
    expect(getRequirement('id#b2')!.code).toBe('P2');
  });
});
