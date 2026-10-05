import { describe, it, expect } from '@jest/globals';
import { translate, optionLabel, type Lang } from '@/lib/funnel-v3/i18n';
import { reqList } from '@/lib/funnel-v3/requirements';
import { EMPTY_AMOUNTS, EMPTY_TEXTS, type Borrower, type FunnelState } from '@/lib/funnel-v3/types';
import {
  OPTIONS,
  arrowAction,
  barWidth,
  canOpenStep,
  caseLine,
  deltaLabel,
  doneCount,
  firstErrorField,
  localePath,
  needSubline,
  nextLabelKey,
  normalisePartner,
  optionDelta,
  pathSubtitle,
  railGroups,
  reasonLine,
  roleFromParams,
  roleLine,
  stepSummary,
  visibleFields,
  isLookupEmail,
  type KeyContext,
} from '@/components/funnel-v3/logic';
import { GARY, GERBER_ANSWERS, mkState } from './helpers';

const tr = (lang: Lang) => (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
const op = (lang: Lang) => (group: string, value: string | null | undefined) => optionLabel(lang, group, value);
const t = tr('de');
const opt = op('de');

function full(over: Partial<FunnelState> = {}, ans = {}, txt = {}): FunnelState {
  const s = mkState(ans, {}, txt);
  return { role: 'kunde', fin: { ...EMPTY_AMOUNTS }, ...s, ...over };
}

describe('visibleFields', () => {
  it('step 1 asks the advisor e-mail only for the Berater, the phone only for the Kunde', () => {
    expect(visibleFields(1, full({ role: 'berater' }))).toEqual(['bmail', 'antrag', 'kn', 'anrede', 'vor', 'nach', 'mail']);
    expect(visibleFields(1, full({ role: 'kunde' }))).toEqual(['antrag', 'kn', 'anrede', 'vor', 'nach', 'mail', 'tel']);
  });

  it('step 2 follows Antrag, Neubau and Erhöhung', () => {
    const base = visibleFields(2, full());
    expect(base).toEqual(['plz', 'ort', 'immo', 'lieg', 'nutz', 'heizung', 'baurecht', 'angebote']);
    expect(visibleFields(2, full({}, { immo: 'Neubau' }))).toContain('nbDocs');
    const abl = visibleFields(2, full({}, { antrag: 'Ablösung' }));
    expect(abl).toEqual(expect.arrayContaining(['old', 'aufstockung']));
    expect(abl).not.toContain('up');
    expect(visibleFields(2, full({}, { antrag: 'Ablösung', aufstockung: 'Ja' }))).toEqual(expect.arrayContaining(['up', 'zweck']));
    const kauf = visibleFields(2, full({}, { antrag: 'Neue Hypothek' }));
    expect(kauf).toEqual(expect.arrayContaining(['kaufpreis', 'reno', 'reserviert']));
    expect(kauf).not.toContain('old');
  });

  it('step 3: borrower block or company, Unterhalt under Kinder, Solidarbürge name', () => {
    const np = visibleFields(3, full({}, { kinder: 'Ja', buerge: 'Ja' }));
    expect(np).toEqual([
      'borrower.0.vor', 'borrower.0.nach', 'inc', 'borrower.0.job', 'ab50',
      'kinder', 'unterhalt', 'kredite', 'leasing', 'buerge', 'buergeName',
    ]);
    const jp = visibleFields(3, full({}, { kn: 'Juristische Person' }));
    expect(jp).toEqual(['firma', 'zeichner', 'kredite', 'leasing', 'buerge']);
  });

  it('step 3: pkSe per self-employed borrower; household income after several borrowers', () => {
    const two: Borrower[] = [GARY, { id: 'b2', vor: 'Anna', nach: 'Gerber', job: 'Selbständig', pkSe: 'Nein' }];
    const f = visibleFields(3, { ...full(), borrowers: two });
    expect(f).toContain('borrower.1.pkSe');
    expect(f).not.toContain('borrower.0.pkSe');
    expect(f.indexOf('inc')).toBeGreaterThan(f.indexOf('borrower.1.job'));
  });

  it('step 4 leaves out the income for a juristische Person', () => {
    expect(visibleFields(4, full())).toContain('inc');
    expect(visibleFields(4, full({}, { kn: 'Juristische Person' }))).not.toContain('inc');
  });

  it('the first error follows the screen order', () => {
    expect(firstErrorField({ mail: 'val.email', antrag: 'val.choose' }, visibleFields(1, full()))).toBe('antrag');
    expect(firstErrorField({}, [])).toBeNull();
  });
});

describe('«+N Unterlagen» badges', () => {
  const s = mkState();

  it('count what an answer adds against its neutral answer', () => {
    expect(optionDelta(s, 'baurecht', 'Ja')).toBe(1);
    expect(optionDelta(s, 'baurecht', 'Nein')).toBe(0);
    expect(optionDelta(s, 'antrag', 'Ablösung')).toBe(3);
    expect(optionDelta(s, 'antrag', 'Neue Hypothek')).toBe(1);
    expect(optionDelta(s, 'lieg', 'Stockwerkeigentum')).toBe(2);
    expect(optionDelta(s, 'nutz', 'Vermietet')).toBe(1);
  });

  it('keep the badge on the selected answer (measured from «Nein», not from the state)', () => {
    expect(optionDelta(mkState({ baurecht: 'Ja' }), 'baurecht', 'Ja')).toBe(1);
  });

  it('per borrower: Selbständig removes documents, Pensionskasse vorhanden adds one', () => {
    expect(optionDelta(s, 'job', 'Selbständig', GARY.id)).toBeLessThan(1);
    const se = mkState({}, { job: 'Selbständig' });
    expect(optionDelta(se, 'pkSe', 'Ja', GARY.id)).toBe(1);
  });

  it('Unterhalt only counts with Kinder = Ja', () => {
    expect(optionDelta(mkState({ kinder: 'Ja' }), 'unterhalt', 'Ja')).toBe(1);
  });

  it('labels: «+2» on a chip, «+2 Unterlagen» / «+1 Unterlage» on a card, nothing for ≤ 0', () => {
    expect(deltaLabel(2, t)).toEqual({ short: '+2', long: '+2 Unterlagen' });
    expect(deltaLabel(1, t)).toEqual({ short: '+1', long: '+1 Unterlage' });
    expect(deltaLabel(0, t)).toBeNull();
    expect(deltaLabel(-3, t)).toBeNull();
    expect(deltaLabel(3, tr('fr'))?.long).toBe(translate('fr', 'rail.plusDocs', { n: 3 }));
  });

  it('every option value has a label in every language', () => {
    for (const lang of ['de', 'en', 'fr', 'it'] as Lang[]) {
      for (const [key, values] of Object.entries(OPTIONS)) {
        for (const v of values) expect(optionLabel(lang, key, v)).not.toBe('');
      }
      for (const key of Object.keys(OPTIONS)) expect(translate(lang, `qs.${key}`)).not.toBe(`qs.${key}`);
    }
  });
});

describe('question path and header lines', () => {
  const gerber = full({ fin: { ...EMPTY_AMOUNTS, old: 900000, up: 100000, val: 1400000, inc: 180000 } }, GERBER_ANSWERS, { plz: '8820', ort: 'Wädenswil' });

  it('summaries of finished topics', () => {
    expect(stepSummary(1, gerber, t, opt)).toBe('Ablösung · Natürliche Person');
    expect(stepSummary(2, gerber, t, opt)).toBe('Stockwerkeigentum · 8820 Wädenswil');
    expect(stepSummary(3, gerber, t, opt)).toBe('Gary Gerber · Angestellt');
    expect(stepSummary(4, gerber, t, opt)).toBe("CHF 1'000'000 · 71.4 %");
    expect(stepSummary(4, { ...gerber, fin: { ...gerber.fin, val: 0 } }, t, opt)).toBe('');
    expect(stepSummary(5, gerber, t, opt, { fulfilled: 4, total: 23 })).toBe('4 von 23 erfüllt');
    expect(stepSummary(3, full({}, { kn: 'Juristische Person' }, { firma: 'Muster AG' }), t, opt)).toBe('Muster AG · Juristische Person');
  });

  it('subtitles: summary when done, «Jetzt · …» when current, why otherwise', () => {
    expect(pathSubtitle(1, 3, 'Ablösung', t)).toBe('Ablösung');
    expect(pathSubtitle(1, 3, '', t)).toBe('Erledigt');
    expect(pathSubtitle(3, 3, '', t)).toBe('Jetzt · Bestimmt die Personenunterlagen');
    expect(pathSubtitle(5, 3, '', t)).toBe('Wir lesen alles aus');
    expect(doneCount(1)).toBe(0);
    expect(doneCount(4)).toBe(3);
  });

  it('case line and role line', () => {
    expect(caseLine(gerber.txt, t)).toBe('Gary Gerber · 8820 Wädenswil');
    expect(caseLine({ ...EMPTY_TEXTS }, t)).toBe('Neue Anfrage');
    expect(roleLine('kunde', EMPTY_TEXTS, null, t)).toBe('Eigene Anfrage');
    expect(roleLine('berater', EMPTY_TEXTS, { status: 'partner', name: 'Anna Muster' }, t)).toBe('Erfasst von Anna Muster');
    expect(roleLine('berater', { ...EMPTY_TEXTS, pvor: 'Max', pnach: 'Meier' }, { status: 'unknown' }, t)).toBe('Erfasst von Max Meier · neuer Partner');
    expect(roleLine('berater', { ...EMPTY_TEXTS, pvor: 'Max', pnach: 'Meier', pfirma: 'Meier GmbH' }, null, t)).toBe('Erfasst von Max Meier · Meier GmbH');
    expect(roleLine('berater', EMPTY_TEXTS, null, t)).toBe('Erfasst von HYPOTEQ Berater');
    expect(roleLine('kunde', EMPTY_TEXTS, null, tr('fr'))).toBe(translate('fr', 'side.ownRequest'));
  });

  it('«Weiter» labels and D6', () => {
    expect(nextLabelKey(1)).toBe('common.next');
    expect(nextLabelKey(4)).toBe('common.toDocs');
    expect(nextLabelKey(5)).toBe('common.toFinish');
    expect(nextLabelKey(6)).toBeNull();
    expect(t('common.toDocs')).toBe('Zu den Unterlagen');
    expect(canOpenStep(2, 4)).toBe(true);
    expect(canOpenStep(5, 4)).toBe(false);
  });
});

describe('calculation card helpers', () => {
  it('sub line and bar widths', () => {
    const abl = full({ fin: { ...EMPTY_AMOUNTS, old: 900000, up: 100000 } }, { antrag: 'Ablösung', aufstockung: 'Ja' });
    expect(needSubline(abl, t)).toBe("CHF 900'000 Ablösung + CHF 100'000 Erhöhung");
    expect(needSubline(full({}, { antrag: 'Neue Hypothek' }), t)).toBe('Bei 80 % Belehnung');
    expect(barWidth(64, 1.25)).toBe(80);
    expect(barWidth(90, 1.25)).toBe(100);
    expect(barWidth(null, 2.5)).toBe(0);
  });
});

describe('rail', () => {
  it('reason lines are translated', () => {
    const r = reqList(mkState({ baurecht: 'Ja' })).find((x) => x.id === 'baurecht')!;
    expect(reasonLine(r.reason, t, opt)).toBe('weil: Baurecht = Ja');
    expect(reasonLine(r.reason, tr('fr'), op('fr'))).toBe(
      translate('fr', 'why.because', { reason: `${translate('fr', 'qs.baurecht')} = ${translate('fr', 'common.yes')}` })
    );
    const pk = reqList(mkState({}, { job: 'Selbständig', pkSe: 'Ja' })).find((x) => x.id === 'pk')!;
    expect(reasonLine(pk.reason, t, opt)).toBe('weil: Beschäftigung = Selbständig · Pensionskasse vorhanden = Ja');
    const id = reqList(mkState()).find((x) => x.id === 'id')!;
    expect(reasonLine(id.reason, t, opt)).toBe('Pflicht · pro Kreditnehmer');
  });

  it('groups in order with counts; the person group names the customer', () => {
    const s = mkState(GERBER_ANSWERS);
    const list = reqList(s);
    const groups = railGroups(list, s, new Set([list[0].instanceId]), t, opt);
    expect(groups.map((g) => g.group)).toEqual(['objekt', 'hypothek', 'person', 'eigenmittel']);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(list.length);
    expect(groups[2].name).toBe('Zur Person · Gary Gerber');
    expect(groups[0].items[0].ok).toBe(true);
    expect(groups[0].items[1].ok).toBe(false);
  });

  it('a company is «Zur Gesellschaft»; several borrowers carry their names', () => {
    const jp = mkState({ kn: 'Juristische Person' });
    expect(railGroups(reqList(jp), jp, new Set(), t, opt).find((g) => g.group === 'person')!.name).toBe('Zur Gesellschaft');
    const two = mkState({}, {}, {}, [GARY, { id: 'b2', vor: '', nach: '', pkSe: 'Nein' }]);
    const person = railGroups(reqList(two), two, new Set(), t, opt).find((g) => g.group === 'person')!;
    expect(person.name).toBe('Zur Person');
    expect(person.items.map((i) => i.label)).toEqual(
      expect.arrayContaining(['Pass / Identitätskarte · Gary Gerber', 'Pass / Identitätskarte · Kreditnehmer 2'])
    );
  });
});

describe('entry, language, keys, partner', () => {
  it('?customer= preselects the role', () => {
    expect(roleFromParams('?customer=partner')).toBe('berater');
    expect(roleFromParams('?customer=direct')).toBe('kunde');
    expect(roleFromParams('?customerType=partner')).toBe('berater');
    expect(roleFromParams('?customer=other')).toBeNull();
    expect(roleFromParams('')).toBeNull();
  });

  it('switches the language segment', () => {
    expect(localePath('/de/funnel', 'fr')).toBe('/fr/funnel');
    expect(localePath('/funnel', 'it')).toBe('/it/funnel');
    expect(localePath('/en', 'de')).toBe('/de');
    expect(localePath('/de/funnel/', 'en')).toBe('/en/funnel');
  });

  it('← / → only outside fields and radio groups, never on the start screen', () => {
    const base: KeyContext = { key: 'ArrowRight', step: 2, tag: 'button', editable: false, inRadioGroup: false, modifier: false, defaultPrevented: false };
    expect(arrowAction(base)).toBe('next');
    expect(arrowAction({ ...base, key: 'ArrowLeft' })).toBe('prev');
    expect(arrowAction({ ...base, tag: 'input' })).toBeNull();
    expect(arrowAction({ ...base, tag: 'textarea' })).toBeNull();
    expect(arrowAction({ ...base, editable: true })).toBeNull();
    expect(arrowAction({ ...base, inRadioGroup: true })).toBeNull();
    expect(arrowAction({ ...base, step: 0 })).toBeNull();
    expect(arrowAction({ ...base, modifier: true })).toBeNull();
    expect(arrowAction({ ...base, dialogOpen: true })).toBeNull();
    expect(arrowAction({ ...base, key: 'Enter' })).toBeNull();
  });

  it('partner answers are read defensively and never block', () => {
    expect(normalisePartner({ status: 'partner', name: 'Anna Muster', company: 'VZ' })).toEqual({
      status: 'partner', name: 'Anna Muster', company: 'VZ', initials: 'AM', degraded: false,
    });
    expect(normalisePartner({ status: 'hypoteq', name: 'Ben Test', company: 'HYPOTEQ AG', initials: 'bt' }).initials).toBe('BT');
    expect(normalisePartner({ status: 'unknown', degraded: true })).toEqual({ status: 'unknown', degraded: true });
    expect(normalisePartner({ status: 'partner' }).status).toBe('unknown');
    expect(normalisePartner(null).status).toBe('unknown');
    expect(normalisePartner('nonsense').status).toBe('unknown');
    expect(isLookupEmail('anna@vzch.ch')).toBe(true);
    expect(isLookupEmail('anna@vzch')).toBe(false);
    expect(isLookupEmail('  ')).toBe(false);
  });
});
