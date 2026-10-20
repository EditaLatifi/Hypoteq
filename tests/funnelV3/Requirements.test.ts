import { describe, it, expect } from '@jest/globals';
import {
  REQ,
  reqList,
  reqDelta,
  chipDelta,
  emDelta,
  getRequirement,
  requirementForLegacyKey,
  reasonTextDe,
  documentInstances,
  isSignatureRequirement,
  type ReqState,
} from '@/lib/funnel-v3/requirements';
import type { Answers, Borrower, DocInfo, Eigenmittel } from '@/lib/funnel-v3/types';
import { DOCUMENT_CATALOG } from '@/components/funnelDocumentCatalog';
import { VERIFIED_TAB_ENTRIES } from '@/components/dokumentenCheckState';
import { MESSAGES } from '@/lib/funnel-v3/i18n';
import { MUSTERMANN_ANSWERS, MUSTERMANN_EM, mkState } from './helpers';

const codes = (s: ReqState) => reqList(s).map((r) => r.code);
const has = (s: ReqState, code: string) => codes(s).includes(code);
const docs = (s: ReqState) => documentInstances(reqList(s));

describe('Mustermann progression (Handover 4.1, v5)', () => {
  // v5: the Auskunftsermächtigung is its own block (Handover 6) — the documents list starts at 10.
  it('counts 10 → 12 → 14 → 17 → 19 documents, plus the Auskunftsermächtigung', () => {
    // Fresh funnel: nothing tapped, Max angestellt, no amounts.
    let ans: Partial<Answers> = {};
    expect(docs(mkState(ans))).toHaveLength(10);
    expect(reqList(mkState(ans))).toHaveLength(11);

    // Ablösung mit Erhöhung, bestehende Immobilie: Produktvereinbarung + Zinsabrechnung.
    ans = { ...ans, antrag: 'Ablösung', anrede: 'Herr', immo: 'Bestehende Immobilie', aufstockung: 'Ja' };
    expect(docs(mkState(ans))).toHaveLength(12);

    // Stockwerkeigentum, selbstbewohnt.
    ans = { ...ans, lieg: 'Stockwerkeigentum', nutz: 'Selbstbewohnt' };
    expect(docs(mkState(ans))).toHaveLength(14);

    // Chips: Unterhalt, Privatkredit, Leasing.
    ans = { ...ans, unterhalt: 'Ja', kredite: 'Ja', leasing: 'Ja' };
    expect(docs(mkState(ans))).toHaveLength(17);
    expect(ans).toEqual(MUSTERMANN_ANSWERS);

    // Vorsorge: Säule 3a amount → Bescheinigung + Police.
    expect(docs(mkState(ans, {}, {}, undefined, { em: MUSTERMANN_EM }))).toHaveLength(19);
  });

  it('is the 20 requirements of the v5 Mustermann list', () => {
    const ids = reqList(mkState(MUSTERMANN_ANSWERS, {}, {}, undefined, { em: MUSTERMANN_EM })).map((r) => r.id).sort();
    expect(ids).toEqual(
      ['vollmacht', 'id', 'lohnausweise', 'lohnabrechnungen', 'pk', 'steuer', 's3a', 'police',
        'unterhalt', 'kredit', 'leasing', 'fotos', 'grundbuch', 'gvz', 'verkaufsdoku', 'stwe_regl', 'stwe_plan', 'ef',
        'produkt', 'hyp_zins'].sort()
    );
  });

  it('asks every document exactly once', () => {
    const ids = reqList(mkState(MUSTERMANN_ANSWERS, {}, {}, undefined, { em: MUSTERMANN_EM })).map((r) => r.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the Auskunftsermächtigung on the list, marked as its own block', () => {
    const list = reqList(mkState());
    const p0 = list.find((r) => r.id === 'vollmacht')!;
    expect(p0.code).toBe('P0');
    expect(p0.def.block).toBe('signature');
    expect(isSignatureRequirement(p0)).toBe(true);
    expect(documentInstances(list).some((r) => r.id === 'vollmacht')).toBe(false);
  });
});

type Case = { ans?: Partial<Answers>; b?: Partial<Borrower>; em?: Partial<Eigenmittel>; info?: DocInfo; kn2?: boolean };
const KN2: Borrower = { id: 'b2', vor: 'Lea', nach: 'Mustermann', pkSe: 'Nein' };
const state = (c: Case) =>
  mkState(c.ans, c.b, {}, c.kn2 ? [{ id: 'b1', vor: 'Max', nach: 'Mustermann', job: 'Angestellt', pkSe: 'Nein', ...(c.b || {}) }, KN2] : undefined, { em: c.em, info: c.info });
const JP: Partial<Answers> = { kn: 'Juristische Person' };

const RULES: [string, Case[], Case[]][] = [
  ['O1', [{ ans: { immo: 'Bestehende Immobilie' } }, { ans: { immo: 'Neubau' } }], [{ ans: { immo: 'Bauprojekt' } }]],
  ['O2', [{ ans: { immo: 'Bestehende Immobilie' } }, { ans: { immo: 'Neubau' } }], [{ ans: { immo: 'Bauprojekt' } }]],
  ['O3', [{ ans: { immo: 'Bestehende Immobilie' } }, { ans: { immo: 'Neubau' } }], [{ ans: { immo: 'Bauprojekt' } }]],
  ['O4', [{ ans: { immo: 'Bestehende Immobilie' } }, { ans: { immo: 'Bauprojekt' } }, { ans: { immo: 'Neubau', nbDocs: 'Ja' } }], [{ ans: { immo: 'Neubau', nbDocs: 'Nein' } }]],
  ['O5', [{ ans: { immo: 'Bestehende Immobilie' } }, { ans: { immo: 'Neubau', nbDocs: 'Ja' } }], [{ ans: { immo: 'Bauprojekt', nbDocs: 'Ja' } }, { ans: { immo: 'Neubau', nbDocs: 'Nein' } }]],
  ['O6', [{ ans: { antrag: 'Neue Hypothek', immo: 'Bestehende Immobilie' } }, { ans: { antrag: 'Neue Hypothek', immo: 'Neubau' } }], [{ ans: { antrag: 'Ablösung' } }, { ans: { antrag: 'Neue Hypothek', immo: 'Bauprojekt' } }]],
  ['O7', [{ ans: { antrag: 'Neue Hypothek', reserviert: 'Ja' } }], [{ ans: { antrag: 'Neue Hypothek' } }, { ans: { antrag: 'Ablösung', reserviert: 'Ja' } }]],
  ['O8', [{ ans: { antrag: 'Neue Hypothek', reserviert: 'Ja' } }], [{ ans: { antrag: 'Neue Hypothek' } }, { ans: { antrag: 'Ablösung', reserviert: 'Ja' } }]],
  // v5: only Bauprojekt, no longer Renovation.
  ['O9', [{ ans: { immo: 'Bauprojekt' } }, { ans: { antrag: 'Neue Hypothek', immo: 'Bauprojekt' } }], [{ ans: { antrag: 'Neue Hypothek', reno: 'Ja' } }, {}]],
  ['O10', [{ ans: { immo: 'Bauprojekt' } }], [{ ans: { antrag: 'Neue Hypothek', reno: 'Ja' } }, {}]],
  ['O11', [{ ans: { antrag: 'Neue Hypothek', reno: 'Ja' } }, { ans: { antrag: 'Neue Hypothek', reno: 'Ja', immo: 'Bauprojekt' } }], [{ ans: { antrag: 'Neue Hypothek' } }, { ans: { antrag: 'Ablösung', reno: 'Ja' } }]],
  ['O12', [{ ans: { lieg: 'Stockwerkeigentum' } }], [{ ans: { lieg: 'Einfamilienhaus' } }, {}]],
  ['O13', [{ ans: { lieg: 'Stockwerkeigentum' } }], [{ ans: { lieg: 'Mehrfamilienhaus' } }]],
  ['O14', [{ ans: { nutz: 'Vermietet' } }, { ans: { ...JP, nutz: 'Vermietet' } }], [{ ans: { nutz: 'Selbstbewohnt' } }, { ans: { nutz: 'Zweitwohnsitz' } }, { ans: { ...JP, nutz: 'Gewerbe' } }]],
  ['O15', [{ ans: { baurecht: 'Ja' } }], [{ ans: { baurecht: 'Nein' } }]],
  ['O16', [{ ans: { angebote: 'Ja' } }], [{ ans: { angebote: 'Nein' } }]],
  ['H1', [{ ans: { antrag: 'Ablösung' } }], [{ ans: { antrag: 'Neue Hypothek' } }, {}]],
  ['H2', [{ ans: { antrag: 'Ablösung' } }], [{ ans: { antrag: 'Neue Hypothek' } }]],
  ['P0', [{}, { ans: JP }], []],
  ['P1', [{}, { kn2: true }], [{ ans: JP }]],
  ['P2', [{ b: { job: 'Angestellt' } }, { b: { job: undefined } }], [{ b: { job: 'Selbständig' } }, { b: { job: 'Pensioniert' } }, { ans: JP }]],
  ['P3', [{ b: { job: 'Angestellt' } }, { b: { job: undefined } }], [{ b: { job: 'Selbständig' } }, { b: { job: 'Pensioniert' } }]],
  ['P4', [{ b: { job: 'Angestellt' } }, { b: { job: 'Selbständig', pkSe: 'Ja' } }], [{ b: { job: 'Selbständig', pkSe: 'Nein' } }, { b: { job: 'Pensioniert' } }, { ans: JP }]],
  ['P5', [{ info: { bonus: true } }], [{}, { info: { raise: true } }, { info: { bonus: true }, b: { job: 'Selbständig' } }, { info: { bonus: true }, ans: JP }]],
  ['P6', [{ info: { raise: true } }], [{}, { info: { bonus: true } }, { info: { raise: true }, b: { job: 'Pensioniert' } }]],
  ['P7', [{ b: { job: 'Selbständig' } }], [{ b: { job: 'Angestellt' } }, { b: { job: 'Pensioniert' } }]],
  ['P8', [{ b: { job: 'Pensioniert' } }], [{ b: { job: 'Angestellt' } }, { b: { job: 'Selbständig' } }]],
  ['P9', [{}, { b: { job: 'Pensioniert' } }], [{ ans: JP }]],
  ['P10', [{ info: { ab50: true } }, { info: { ab50: true }, b: { job: 'Selbständig' } }], [{}, { info: { ab50: true }, b: { job: 'Pensioniert' } }, { info: { ab50: true }, ans: JP }]],
  ['P11', [{ ans: { unterhalt: 'Ja' } }], [{}, { ans: { ...JP, unterhalt: 'Ja' } }]],
  ['P12', [{ ans: { kredite: 'Ja' } }, { ans: { ...JP, kredite: 'Ja' } }], [{ ans: { kredite: 'Nein' } }]],
  ['P13', [{ ans: { leasing: 'Ja' } }, { ans: { ...JP, leasing: 'Ja' } }], [{ ans: { leasing: 'Nein' } }]],
  ['P14', [{ ans: { buerge: 'Ja' } }, { ans: { ...JP, buerge: 'Ja' } }], [{ ans: { buerge: 'Nein' } }]],
  ['P15', [{ ans: { buerge: 'Ja' } }], [{ ans: { buerge: 'Nein' } }]],
  ['P16', [{ ans: { buerge: 'Ja' } }], [{ ans: { buerge: 'Nein' } }]],
  ...(['J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map((c) => [c, [{ ans: JP }], [{}, { ans: { kn: 'Natürliche Person' } }]] as [string, Case[], Case[]])),
  // v5: only Neue Hypothek.
  ['E1', [{ ans: { antrag: 'Neue Hypothek' } }, { ans: { ...JP, antrag: 'Neue Hypothek' } }], [{ ans: { antrag: 'Ablösung' } }, {}]],
  ['E2', [{ em: { s3a: 1000 } }, { info: { ab50: true } }, { em: { s3a: 1000 }, ans: JP }], [{}, { info: { ab50: true }, ans: JP }]],
  ['E3', [{ em: { s3a: 1000 } }, { info: { ab50: true } }], [{}, { info: { ab50: true }, ans: JP }]],
  ['E4', [{ em: { pkVor: 50000 } }], [{}, { em: { pkVerp: 50000 } }]],
  ['E5', [{ em: { pkVerp: 50000 } }], [{}, { em: { pkVor: 50000 } }]],
  ['E6', [{ em: { schenk: 1 } }], [{}]],
  ['E7', [{ em: { erbe: 1 } }], [{}]],
  ['E8', [{ em: { darl: 1 } }], [{}]],
];

describe('rules O1–O16, H1–H2, P0–P16, J1–J6, E1–E8 (Handover 4.1)', () => {
  it('covers every requirement of the catalogue', () => {
    expect(RULES.map((r) => r[0]).sort()).toEqual(REQ.map((r) => r.code).sort());
  });
  for (const [code, yes, no] of RULES) {
    it(`${code}: asked when it should be, and only then`, () => {
      for (const c of yes) expect([code, c, has(state(c), code)]).toEqual([code, c, true]);
      for (const c of no) expect([code, c, has(state(c), code)]).toEqual([code, c, false]);
    });
  }
});

describe('P17 · Kreditnehmer 2', () => {
  const two: Borrower[] = [
    { id: 'b1', vor: 'Max', nach: 'Mustermann', job: 'Angestellt', pkSe: 'Nein' },
    { id: 'b2', vor: 'Lea', nach: 'Mustermann', pkSe: 'Nein' },
  ];
  it('gives Kreditnehmer 2 ID, Lohnausweis, Lohnabrechnungen and PK-Ausweis — no tax return, no 4.2 documents', () => {
    const list = reqList(mkState({}, {}, {}, two, { info: { bonus: true, raise: true } }));
    expect(list.filter((r) => r.borrowerId === 'b2').map((r) => r.instanceId)).toEqual(['id#b2', 'lohnausweise#b2', 'lohnabrechnungen#b2', 'pk#b2']);
    expect(list.filter((r) => r.borrowerId === 'b1').map((r) => r.id)).toEqual(['id', 'lohnausweise', 'lohnabrechnungen', 'pk', 'lohnausweise_alt', 'anstellung', 'steuer']);
  });
  it('has none without a Kreditnehmer 2', () => {
    expect(reqList(mkState()).some((r) => r.borrowerId && r.borrowerId !== 'b1')).toBe(false);
  });
  it('names the documents after the person', () => {
    const id2 = reqList(mkState({}, {}, {}, two)).find((r) => r.instanceId === 'id#b2')!;
    expect(id2.person).toMatchObject({ kind: 'borrower', first: 'Lea', last: 'Mustermann', display: 'Lea Mustermann' });
    expect(id2.reason).toEqual({ key: 'why.perBorrower' });
  });
  it('still reads a stored v3 Kreditnehmer 2 with a Beschäftigung by it', () => {
    const v3: Borrower[] = [two[0], { ...two[1], job: 'Selbständig', pkSe: 'Ja' }, { id: 'b3', vor: 'Hans', nach: 'Muster', job: 'Pensioniert', pkSe: 'Nein' }];
    const person = reqList(mkState({}, {}, {}, v3)).filter((r) => r.group === 'person').map((r) => r.instanceId);
    expect(person).toEqual([
      'vollmacht',
      'id#b1', 'lohnausweise#b1', 'lohnabrechnungen#b1', 'pk#b1', 'steuer#b1',
      'id#b2', 'pk#b2', 'abschluss_se#b2',
      'id#b3', 'rente#b3',
    ]);
  });
});

describe('Bestehende Immobilie / Neubau / Bauprojekt', () => {
  const objekt = (immo: Answers['immo'], nbDocs: 'Ja' | 'Nein' = 'Nein', antrag: Answers['antrag'] = 'Neue Hypothek') =>
    reqList(mkState({ immo, nbDocs, antrag })).filter((r) => r.group === 'objekt').map((r) => r.code);

  it('Bestehende Immobilie: the full Objekt set incl. Grundbuch and GVZ', () => {
    expect(objekt('Bestehende Immobilie')).toEqual(['O1', 'O2', 'O3', 'O4', 'O5', 'O6']);
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
  });
  it('Renovation: the Aufstellung der Renovationen, not the Baubewilligung (v5)', () => {
    const list = reqList(mkState({ antrag: 'Neue Hypothek', immo: 'Bestehende Immobilie', reno: 'Ja' }));
    expect(list.filter((r) => r.group === 'objekt').map((r) => r.id)).toEqual(['fotos', 'verkaufsdoku', 'stwe_plan', 'grundbuch', 'gvz', 'kaufvertrag', 'reno_liste']);
  });
  it('gives the Neubau Grundbuch its reason', () => {
    const gb = reqList(mkState({ immo: 'Neubau', nbDocs: 'Ja' })).find((r) => r.id === 'grundbuch')!;
    expect(reasonTextDe(gb.reason)).toBe('weil: Grundbuch und GVZ vorhanden = Ja');
  });
});

describe('juristische Person', () => {
  const s = mkState({ kn: 'Juristische Person', antrag: 'Neue Hypothek', immo: 'Bestehende Immobilie', unterhalt: 'Ja' }, {}, { firma: 'Muster Immobilien AG', zeichner: 'Anna Muster' }, undefined, { info: { ab50: true } });
  const list = reqList(s);

  it('uses J1–J6 instead of the natural-person documents', () => {
    expect(list.filter((r) => r.group === 'person').map((r) => r.code)).toEqual(['P0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6']);
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
  it('names the Solidarbürge from txt.buergeName', () => {
    const l = reqList(mkState({ buerge: 'Ja' }, {}, { buergeName: 'Peter Bürgi' }));
    const b = l.filter((r) => r.def.personKind === 'guarantor');
    expect(b.map((r) => r.code)).toEqual(['P14', 'P15', 'P16']);
    expect(b[0].person).toMatchObject({ kind: 'guarantor', first: 'Peter', last: 'Bürgi' });
  });
  it('still lists one borrower before any is entered, named from step 1', () => {
    const l = reqList({ ...mkState(), borrowers: [] });
    expect(l.find((r) => r.id === 'id')!.person?.display).toBe('Max Mustermann');
    expect(l).toHaveLength(11);
  });
  it('gives case-level person documents to the first borrower', () => {
    expect(reqList(mkState()).find((r) => r.id === 'vollmacht')!.person?.display).toBe('Max Mustermann');
  });
});

describe('reasons', () => {
  const list = reqList(mkState({ ...MUSTERMANN_ANSWERS, baurecht: 'Ja' }, {}, {}, undefined, { em: MUSTERMANN_EM, info: { bonus: true, raise: true } }));
  const why = (id: string) => reasonTextDe(list.find((r) => r.id === id)!.reason);
  it('says Pflicht, pro Kreditnehmer, Falls vorhanden, weil: … and the 4.2 / amount reasons', () => {
    expect(why('fotos')).toBe('Pflicht');
    expect(why('id')).toBe('Pflicht · pro Kreditnehmer');
    expect(why('verkaufsdoku')).toBe('Falls vorhanden');
    expect(why('baurecht')).toBe('weil: Baurecht = Ja');
    expect(why('hyp_zins')).toBe('weil: Kreditantrag = Ablösung');
    expect(why('produkt')).toBe('weil: Kreditantrag = Ablösung');
    expect(why('stwe_regl')).toBe('weil: Liegenschaft = Stockwerkeigentum');
    expect(why('unterhalt')).toBe('weil: Unterhaltszahlungen = Ja');
    expect(why('s3a')).toBe('weil: Säule 3a eingetragen');
    expect(why('lohnausweise_alt')).toBe('weil: variabler Lohnanteil erkannt');
    expect(why('anstellung')).toBe('weil: Lohnerhöhung erkannt');
    const ab50 = reqList(mkState({}, {}, {}, undefined, { info: { ab50: true } }));
    expect(reasonTextDe(ab50.find((r) => r.id === 'ahv_voraus')!.reason)).toBe('weil: ab 50 (aus ID)');
    expect(reasonTextDe(ab50.find((r) => r.id === 'police')!.reason)).toBe('weil: ab 50 (aus ID)');
  });
  it('points at real keys of the message files', () => {
    const de = MESSAGES.de as any;
    const all = reqList(mkState({ ...MUSTERMANN_ANSWERS, baurecht: 'Ja', buerge: 'Ja', reno: 'Ja', reserviert: 'Ja', nutz: 'Vermietet' }, { job: 'Selbständig', pkSe: 'Ja' }, {}, undefined, { em: { s3a: 1, pkVor: 1, pkVerp: 1, schenk: 1, erbe: 1, darl: 1 }, info: { ab50: true } }));
    for (const r of all) {
      expect([r.id, de.why[r.reason.key.slice(4)]]).not.toContain(undefined);
      if (r.reason.key === 'why.amount') expect(de.em[r.reason.field]).toBeDefined();
      if (r.reason.key !== 'why.because') continue;
      for (const c of r.reason.conditions) {
        expect([r.id, c.question, de.qs[c.question]]).not.toContain(undefined);
        if (c.value !== 'Ja') expect([c.question, c.value, de.opt[`${c.question}.${c.value}`]]).not.toContain(undefined);
      }
    }
  });
});

describe('reqDelta, chipDelta, emDelta («+3»)', () => {
  it('counts what an answer would add', () => {
    expect(reqDelta(mkState(), { ans: { antrag: 'Ablösung' } })).toEqual({ added: ['produkt', 'hyp_zins'], removed: [], net: 2 });
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
    expect(d.removed).toEqual(['lohnausweise#b1', 'lohnabrechnungen#b1', 'pk#b1']);
  });
  it('shows what each chip asks for, tapped or not', () => {
    expect(chipDelta(mkState(), 'buerge')).toBe(3);
    expect(chipDelta(mkState({ buerge: 'Ja' }), 'buerge')).toBe(3);
    expect(chipDelta(mkState(), 'kredite')).toBe(1);
    expect(chipDelta(mkState(), 'unterhalt')).toBe(1);
    expect(chipDelta(mkState({ kn: 'Juristische Person' }), 'unterhalt')).toBe(0);
    expect(chipDelta(mkState(), 'steuer')).toBe(0);
  });
  it('shows what an Eigenmittel amount asks for', () => {
    expect(emDelta(mkState(), 's3a')).toBe(2);
    expect(emDelta(mkState({}, {}, {}, undefined, { info: { ab50: true } }), 's3a')).toBe(0);
    expect(emDelta(mkState(), 'spar')).toBe(0);
    expect(emDelta(mkState(), 'pkVerp')).toBe(1);
  });
});

describe('stored v3 Eigenmittel answers (legacy.ts)', () => {
  it('still ask for their documents', () => {
    const s = { ...mkState({ antrag: 'Neue Hypothek' }), legacyEquity: { s3a: 'Ja' as const, pk: 'Ja' as const, schenkung: 'Ja' as const, erbe: 'Ja' as const, darlehen: 'Ja' as const } };
    expect(reqList(s).filter((r) => r.group === 'eigenmittel').map((r) => r.id)).toEqual(['vermoegen', 's3a', 'police', 'pkvorbezug', 'schenkung', 'erbe', 'darlehen']);
  });
});

describe('catalogue', () => {
  const langs = ['de', 'en', 'fr', 'it'] as const;
  const lookup = (lang: (typeof langs)[number], key: string) => {
    const i = key.indexOf('.');
    return (MESSAGES[lang] as any)?.[key.slice(0, i)]?.[key.slice(i + 1)];
  };

  it('has unique ids and codes', () => {
    expect(new Set(REQ.map((r) => r.id)).size).toBe(REQ.length);
    expect(new Set(REQ.map((r) => r.code)).size).toBe(REQ.length);
    expect(REQ).toHaveLength(16 + 2 + 17 + 6 + 8);
  });
  it('drops the Rahmenvertrag and the Schuldbrief, keeps every other v3 id', () => {
    expect(getRequirement('hyp_rahmen')).toBeUndefined();
    expect(getRequirement('hyp_sicher')).toBeUndefined();
    for (const id of ['fotos', 'grundbuch', 'hyp_zins', 'vollmacht', 'id', 'lohnausweise', 'anstellung', 'pkvorbezug', 'ahv_voraus', 'darlehen', 'b_lohn'])
      expect(getRequirement(id)).toBeDefined();
    for (const id of ['produkt', 'reno_liste', 'lohnausweise_alt', 'pkverp']) expect(getRequirement(id)).toBeDefined();
  });
  it('has every label in all four languages, and the German one verbatim', () => {
    for (const r of REQ) {
      for (const l of langs) expect([r.labelKey, l, typeof lookup(l, r.labelKey)]).toEqual([r.labelKey, l, 'string']);
      expect(lookup('de', r.labelKey)).toBe(r.labelDe);
    }
  });
  it('has every group, reason and state key in all four languages', () => {
    const keys = ['grp.objekt', 'grp.hypothek', 'grp.person', 'grp.eigenmittel', 'why.required', 'why.perBorrower', 'why.ifAvailable', 'why.because', 'why.bonus', 'why.raise', 'why.age50', 'why.amount',
      ...['missing', 'analysing', 'partial', 'ok', 'outdated', 'skipped', 'surplus', 'duplicate', 'notneeded', 'unknown'].map((s) => `state.${s}`),
      ...['loan', 'maint', '3a', 'stwe'].map((s) => `sug.${s}.title`), 'sug.loan.chipText', 'sug.maint.chipText', 'sug.3a.amountText', 'sug.3a.enterText', 'sug.stwe.text'];
    for (const k of keys) for (const l of langs) expect([k, l, typeof lookup(l, k)]).toEqual([k, l, 'string']);
  });
  it('expects 2 files for P5 and the 3a-Police, 1 otherwise (P2 and P16: the current Lohnausweis)', () => {
    expect(REQ.filter((r) => r.expect !== 1).map((r) => [r.code, r.expect])).toEqual([['P5', 2], ['E3', 2]]);
  });
  it('allows «Habe ich nicht» only for O2 and J4', () => {
    expect(REQ.filter((r) => r.optional).map((r) => r.code)).toEqual(['O2', 'J4']);
  });
  // Spec 6.9's ten, plus the five HYPOTEQ added on 20.10.2026 (company documents, Eigenmittelnachweis).
  it('maps exactly the spec 6.9 Dok_* checkboxes and the five added on 20.10.2026', () => {
    const map = Object.fromEntries(REQ.filter((r) => r.sfDokField).map((r) => [r.id, r.sfDokField]));
    expect(map).toEqual({
      id: 'Dok_Identitaetsdokument__c',
      lohnausweise: 'Dok_Lohnausweis__c',
      pk: 'Dok_Pensionskassenausweis__c',
      steuer: 'Dok_Steuererklaerung__c',
      fotos: 'Dok_Fotos_der_Immobilie__c',
      stwe_plan: 'Dok_Grundrissplaene__c',
      grundbuch: 'Dok_Grundbuchauszug__c',
      gvz: 'Dok_Gebaeudeversicherungsausweis__c',
      kaufvertrag: 'Dok_Kaufvertrag__c',
      betreibung: 'Dok_Betreibungsregisterauszug__c',
      hr: 'Dok_Handelsregisterauszug__c',
      wb: 'Dok_ID_Zeichnungsberechtigte__c',
      jahresabschluss: 'Dok_Jahresabschluesse__c',
      steuer_jp: 'Dok_Steuererklaerung_Gesellschaft__c',
      vermoegen: 'Dok_Eigenmittelnachweis__c',
    });
  });
  it('uses the rename groups 01 Person · 02 Hypothek · 03 Objekt · 04 Eigenmittel', () => {
    for (const r of REQ) expect(r.renameGroup).toBe({ person: '01', hypothek: '02', objekt: '03', eigenmittel: '04' }[r.group]);
  });
  it('keeps the prototype short names', () => {
    const SHORT = { fotos: 'Fotos', verkaufsdoku: 'Verkaufsdokumentation', stwe_plan: 'Grundrissplaene', grundbuch: 'Grundbuchauszug', gvz: 'Gebaeudeversicherung', stwe_regl: 'STWE-Reglement', ef: 'Erneuerungsfonds', produkt: 'Produktvereinbarung', hyp_zins: 'Zinsabrechnung', vollmacht: 'Auskunftsermaechtigung', id: 'ID', lohnausweise: 'Lohnausweis', lohnabrechnungen: 'Lohnabrechnungen', anstellung: 'Anstellungsvertrag', pk: 'Pensionskassenausweis', steuer: 'Steuererklaerung', unterhalt: 'Unterhaltsvereinbarung', kredit: 'Kreditvertrag', leasing: 'Leasingvertrag', vermoegen: 'Eigenmittelnachweis', s3a: 'Saeule3a-Bescheinigung', police: 'Vorsorgepolice-3a' };
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
    // The Produktvereinbarung replaces the Rahmenvertrag (Handover 4.1 H1).
    expect(requirementForLegacyKey('funnel.currentMortgageContract')!.id).toBe('produkt');
  });
  it('ticks only verified tab entries', () => {
    const verified = new Set(VERIFIED_TAB_ENTRIES);
    expect(REQ.flatMap((r) => r.tabEntries.filter((e) => !verified.has(e)))).toEqual([]);
    expect(getRequirement('lohnausweise')!.tabEntries).toEqual(['Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis']);
    expect(getRequirement('grundbuch')!.tabEntries).toEqual([]);
  });
  it('resolves an instance id to its requirement', () => {
    expect(getRequirement('id#b2')!.code).toBe('P1');
  });
});
