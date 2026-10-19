import { describe, it, expect } from '@jest/globals';
import { hasKey, translate, optionLabel, type Lang } from '@/lib/funnel-v3/i18n';
import { reqList } from '@/lib/funnel-v3/requirements';
import { calcFinancing } from '@/lib/funnel-v3/calc';
import { SCREENS, screenWhyKey } from '@/lib/funnel-v3/steps';
import { EMPTY_AMOUNTS, EMPTY_EM, EMPTY_TEXTS, type Borrower, type FunnelState } from '@/lib/funnel-v3/types';
import {
  INFO_KEYS,
  OPTIONS,
  PATH_LABEL,
  arrowAction,
  barWidth,
  calcInputOf,
  canOpenStep,
  caseLine,
  deltaLabel,
  disabledOptions,
  emRowHint,
  equityLine,
  factAdditions,
  fillRailItems,
  finishGate,
  firstErrorField,
  localePath,
  needSubline,
  nextLabelKey,
  normalisePartner,
  optionDelta,
  pathLine,
  pathSubtitle,
  railGroups,
  reasonLine,
  roleFromParams,
  entryFromParams,
  portalAction,
  roleLine,
  screenHead,
  screenSummary,
  startRole,
  visibleFields,
  isLookupEmail,
  type KeyContext,
} from '@/components/funnel-v3/logic';
import { MAX, MUSTERMANN_ANSWERS, MUSTERMANN_EM, mkState } from './helpers';

const tr = (lang: Lang) => (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
const op = (lang: Lang) => (group: string, value: string | null | undefined) => optionLabel(lang, group, value);
const t = tr('de');
const opt = op('de');

function full(over: Partial<FunnelState> = {}, ans = {}, txt = {}): FunnelState {
  const s = mkState(ans, {}, txt);
  return { role: 'kunde', mode: 'begleitet', fin: { ...EMPTY_AMOUNTS }, src: {}, touched: {}, sig: null, ...s, em: s.em!, info: s.info!, ...over };
}

describe('visibleFields (v5: per screen, Handover 2, 3)', () => {
  it('Kontakt (Schnellanmeldung): the e-mail addresses and the phone only', () => {
    expect(visibleFields('kontakt', full({ role: 'berater' }))).toEqual(['bmail', 'mail', 'tel']);
    expect(visibleFields('kontakt', full({ role: 'kunde' }))).toEqual(['mail', 'tel']);
  });

  it('Anfrage asks the advisor e-mail only for the Berater, the phone in both roles', () => {
    expect(visibleFields('anfrage', full({ role: 'berater' }))).toEqual(['bmail', 'antrag', 'kn', 'anrede', 'vor', 'nach', 'mail', 'tel']);
    expect(visibleFields('anfrage', full({ role: 'kunde' }))).toEqual(['antrag', 'kn', 'anrede', 'vor', 'nach', 'mail', 'tel']);
    // Handover 2: Firma and zeichnungsberechtigte Person replace Anrede and name.
    expect(visibleFields('anfrage', full({}, { kn: 'Juristische Person' }))).toEqual(['antrag', 'kn', 'firma', 'zeichner', 'mail', 'tel']);
  });

  it('Objekt & Finanzierung follows Antrag, Neubau, Nutzung and Erhöhung; Laufzeit and Kommentar last', () => {
    expect(visibleFields('objekt', full())).toEqual(['plz', 'ort', 'immo', 'lieg', 'nutz', 'laufzeit', 'kommentar']);
    expect(visibleFields('objekt', full({}, { nutz: 'Vermietet' }))).toContain('miete');
    expect(visibleFields('objekt', full({}, { antrag: 'Neue Hypothek', reno: 'Ja' }))).toEqual(expect.arrayContaining(['kaufdatum', 'renoBetrag']));
    expect(visibleFields('objekt', full({}, { immo: 'Neubau' }))).toEqual(['plz', 'ort', 'immo', 'nbDocs', 'lieg', 'nutz', 'laufzeit', 'kommentar']);
    const abl = visibleFields('objekt', full({}, { antrag: 'Ablösung' }));
    expect(abl).toEqual(expect.arrayContaining(['old', 'aufstockung', 'val', 'em.s3a', 'em.pkVerp']));
    expect(abl).not.toContain('up');
    expect(abl).not.toContain('em.spar');
    expect(visibleFields('objekt', full({}, { antrag: 'Ablösung', aufstockung: 'Ja' }))).toEqual(expect.arrayContaining(['up', 'zweck']));
    const kauf = visibleFields('objekt', full({}, { antrag: 'Neue Hypothek' }));
    expect(kauf).toEqual(expect.arrayContaining(['kaufpreis', 'reno', 'reserviert', 'val', 'em.spar', 'em.darl']));
    expect(kauf).not.toContain('old');
    // v5: Baurecht and Angebote are chips on the Personen screen.
    expect(kauf).not.toContain('baurecht');
  });

  it('Personen: borrower block or company, the chips (no Kinder, no ab 50 since v5), Solidarbürge name', () => {
    const np = visibleFields('personen', full({}, { buerge: 'Ja' }));
    expect(np).toEqual([
      'borrower.0.vor', 'borrower.0.nach', 'inc', 'borrower.0.job',
      'unterhalt', 'kredite', 'leasing', 'buerge', 'baurecht', 'angebote', 'steuer', 'buergeName',
    ]);
    const jp = visibleFields('personen', full({}, { kn: 'Juristische Person' }));
    expect(jp).toEqual(['firma', 'zeichner', 'kredite', 'leasing', 'buerge', 'baurecht', 'angebote', 'steuer']);
  });

  it('Personen: pkSe for a self-employed Kreditnehmer 1; Kreditnehmer 2 has name and income', () => {
    const two: Borrower[] = [{ ...MAX, job: 'Selbständig' }, { id: 'b2', vor: 'Anna', nach: 'Mustermann', pkSe: 'Nein' }];
    const f = visibleFields('personen', { ...full(), borrowers: two });
    expect(f).toContain('borrower.0.pkSe');
    expect(f).not.toContain('borrower.1.job');
    expect(f.indexOf('inc')).toBeLessThan(f.indexOf('borrower.1.vor'));
    expect(f.indexOf('inc2')).toBeGreaterThan(f.indexOf('borrower.1.nach'));
  });

  it('upload and closing ask nothing', () => {
    expect(visibleFields('upload', full())).toEqual([]);
    expect(visibleFields('abschluss', full())).toEqual([]);
  });

  it('the first error follows the screen order', () => {
    expect(firstErrorField({ mail: 'val.email', antrag: 'val.choose' }, visibleFields('anfrage', full()))).toBe('antrag');
    expect(firstErrorField({}, [])).toBeNull();
  });

  it('Bauprojekt is offered but disabled at an Ablösung (Handover 2)', () => {
    expect(disabledOptions({ antrag: 'Ablösung' }, 'immo')).toEqual(['Bauprojekt']);
    expect(disabledOptions({ antrag: 'Neue Hypothek' }, 'immo')).toEqual([]);
    expect(disabledOptions({ antrag: 'Ablösung' }, 'lieg')).toEqual([]);
  });
});

describe('«+N Unterlagen» badges', () => {
  const s = mkState();

  it('count what an answer adds against its neutral answer', () => {
    expect(optionDelta(s, 'baurecht', 'Ja')).toBe(1);
    expect(optionDelta(s, 'baurecht', 'Nein')).toBe(0);
    // v5: Produktvereinbarung + Zinsabrechnung; Kaufvertrag + Eigenmittelnachweis.
    expect(optionDelta(s, 'antrag', 'Ablösung')).toBe(2);
    expect(optionDelta(s, 'antrag', 'Neue Hypothek')).toBe(2);
    expect(optionDelta(s, 'lieg', 'Stockwerkeigentum')).toBe(2);
    expect(optionDelta(s, 'nutz', 'Vermietet')).toBe(1);
  });

  it('keep the badge on the selected answer (measured from «Nein», not from the state)', () => {
    expect(optionDelta(mkState({ baurecht: 'Ja' }), 'baurecht', 'Ja')).toBe(1);
  });

  it('per borrower: Selbständig removes documents, Pensionskasse vorhanden adds one', () => {
    expect(optionDelta(s, 'job', 'Selbständig', MAX.id)).toBeLessThan(1);
    const se = mkState({}, { job: 'Selbständig' });
    expect(optionDelta(se, 'pkSe', 'Ja', MAX.id)).toBe(1);
  });

  it('the Unterhalt chip adds the Unterhaltsvereinbarung (no Kinder question since v5)', () => {
    expect(optionDelta(mkState(), 'unterhalt', 'Ja')).toBe(1);
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
  const mustermann = full({ fin: { ...EMPTY_AMOUNTS, old: 900000, up: 100000, val: 1400000, inc: 180000 } }, MUSTERMANN_ANSWERS, { plz: '8000', ort: 'Zürich' });

  it('summaries of finished screens', () => {
    expect(screenSummary('anfrage', mustermann, t, opt)).toBe('Ablösung · Natürliche Person');
    expect(screenSummary('objekt', mustermann, t, opt)).toBe('Stockwerkeigentum · 8000 Zürich');
    expect(screenSummary('personen', mustermann, t, opt)).toBe('Max Mustermann · Angestellt');
    expect(screenSummary('kontakt', { ...mustermann, txt: { ...mustermann.txt, mail: 'max@example.invalid' } }, t, opt)).toBe('max@example.invalid');
    expect(screenSummary('upload', mustermann, t, opt, { fulfilled: 4, total: 20 })).toBe('4 von 20 erfüllt');
    expect(screenSummary('abschluss', mustermann, t, opt)).toBe('');
    expect(screenSummary('personen', full({}, { kn: 'Juristische Person' }, { firma: 'Muster AG' }), t, opt)).toBe('Muster AG · Juristische Person');
  });

  it('subtitles: summary when done, «Jetzt · …» when current, why otherwise', () => {
    const why = t(screenWhyKey('begleitet', 'personen'));
    expect(pathSubtitle(1, 3, 'Ablösung', why, t)).toBe('Ablösung');
    expect(pathSubtitle(1, 3, '', why, t)).toBe('Erledigt');
    expect(pathSubtitle(3, 3, '', why, t)).toBe('Jetzt · Kreditnehmer und Zusatzpunkte');
    expect(pathSubtitle(4, 3, '', 'Hochladen und abschliessen', t)).toBe('Hochladen und abschliessen');
  });

  it('«Fragepfad» line: entry and time left (Handover 0)', () => {
    expect(pathLine('begleitet', '2:30', t)).toBe('Begleitete Anmeldung · noch ca. 2:30 Min.');
    expect(pathLine('schnell', '0:30', t)).toBe('Schnellanmeldung · noch ca. 0:30 Min.');
  });

  it('screen heads exist in all four languages', () => {
    for (const mode of ['begleitet', 'schnell'] as const)
      for (const s of SCREENS[mode]) {
        const h = screenHead(mode, s);
        for (const l of ['de', 'en', 'fr', 'it'] as const) {
          expect([mode, s, l, hasKey(l, h.titleKey), hasKey(l, h.leadKey)]).toEqual([mode, s, l, true, true]);
        }
      }
    expect(t(screenHead('schnell', 'abschluss').titleKey)).toBe('Fehlende Unterlagen');
    expect(t(screenHead('begleitet', 'anfrage').titleKey)).toBe('Neue Finanzierungsanfrage');
    expect(t(screenHead('schnell', 'anfrage').titleKey)).toBe('Deine Anfrage');
  });

  it('case line and role line', () => {
    expect(caseLine(mustermann.txt, t)).toBe('Max Mustermann · 8000 Zürich');
    expect(caseLine({ ...EMPTY_TEXTS, firma: 'Muster AG', vor: 'Max' }, t, 'Juristische Person')).toBe('Muster AG');
    expect(caseLine({ ...EMPTY_TEXTS }, t)).toBe('Neue Anfrage');
    expect(roleLine('kunde', EMPTY_TEXTS, null, t)).toBe('Eigene Anfrage');
    expect(roleLine('berater', EMPTY_TEXTS, { status: 'partner', name: 'Anna Muster' }, t)).toBe('Erfasst von Anna Muster');
    expect(roleLine('berater', { ...EMPTY_TEXTS, pvor: 'Max', pnach: 'Meier' }, { status: 'unknown' }, t)).toBe('Erfasst von Max Meier · neuer Partner');
    expect(roleLine('berater', { ...EMPTY_TEXTS, pvor: 'Max', pnach: 'Meier', pfirma: 'Meier GmbH' }, null, t)).toBe('Erfasst von Max Meier · Meier GmbH');
    expect(roleLine('berater', EMPTY_TEXTS, null, t)).toBe('Erfasst von HYPOTEQ Berater');
    expect(roleLine('kunde', EMPTY_TEXTS, null, tr('fr'))).toBe(translate('fr', 'side.ownRequest'));
  });

  it('«Weiter» labels per screen (prototype nextLabel) and D6', () => {
    expect(nextLabelKey('begleitet', 1)).toBe('common.next');
    expect(nextLabelKey('begleitet', 3)).toBe('common.toDocs');
    expect(nextLabelKey('begleitet', 4)).toBeNull();
    expect(nextLabelKey('schnell', 1)).toBe('common.next');
    expect(nextLabelKey('schnell', 2)).toBe('fast.toRequest');
    expect(nextLabelKey('schnell', 5)).toBe('fast.toMissing');
    expect(nextLabelKey('schnell', 6)).toBeNull();
    expect(t('common.toDocs')).toBe('Zu den Unterlagen');
    expect(t('fast.toRequest')).toBe('Weiter zur Anfrage');
    expect(canOpenStep(2, 4, 4)).toBe(true);
    expect(canOpenStep(5, 4, 6)).toBe(false);
    expect(canOpenStep(5, 6, 4)).toBe(false);
  });
});

describe('calculation card and Eigenmittel helpers', () => {
  it('sub line and bar widths', () => {
    const abl = full({ fin: { ...EMPTY_AMOUNTS, old: 900000, up: 100000 } }, { antrag: 'Ablösung', aufstockung: 'Ja' });
    expect(needSubline(abl, t)).toBe("CHF 900'000 Ablösung + CHF 100'000 Erhöhung");
    expect(needSubline(full({}, { antrag: 'Neue Hypothek' }), t)).toBe('Bei 80 % Belehnung');
    const kauf = full({ fin: { ...EMPTY_AMOUNTS, kaufpreis: 800000 }, em: { ...EMPTY_EM, spar: 120000 } }, { antrag: 'Neue Hypothek' });
    expect(needSubline(kauf, t)).toBe("Kaufpreis minus CHF 120'000 Eigenmittel");
    expect(needSubline({ ...kauf, ans: { ...kauf.ans, reno: 'Ja' } }, t)).toBe("Kaufpreis + Renovation minus CHF 120'000 Eigenmittel");
    expect(barWidth(64, 1.25)).toBe(80);
    expect(barWidth(90, 1.25)).toBe(100);
    expect(barWidth(null, 2.5)).toBe(0);
  });

  it('the Eigenmittel total line with % and the 10 % warning (Handover 2)', () => {
    const c = calcFinancing({ ...calcInputOf(full({ fin: { ...EMPTY_AMOUNTS, kaufpreis: 1000000 }, em: { ...EMPTY_EM, spar: 50000, pkVor: 150000 } }, { antrag: 'Neue Hypothek' })) });
    const line = equityLine(c, t);
    expect(line.text).toBe("Eigenmittel total CHF 200'000 · 20.0 % · davon hart CHF 50'000");
    expect(line.warn).toBe('mind. 10 % des Kaufpreises nötig');
    const ok = calcFinancing(calcInputOf(full({ fin: { ...EMPTY_AMOUNTS, kaufpreis: 1000000 }, em: { ...EMPTY_EM, spar: 200000 } }, { antrag: 'Neue Hypothek' })));
    expect(equityLine(ok, t).warn).toBeNull();
  });

  it('each Eigenmittel row names the document it asks for', () => {
    const kauf = mkState({ antrag: 'Neue Hypothek' });
    expect(emRowHint(kauf, 'schenk', t)).toBe('→ Schenkungsvertrag');
    expect(emRowHint(kauf, 's3a', t)).toBe('→ Säule 3a Bescheinigung · Vorsorgepolice 3a inkl. Wertmitteilung');
    expect(emRowHint(kauf, 'spar', t)).toBe('');
    // At a Kauf the PK-Verpfändung is a security, not Eigenmittel (Handover 5).
    expect(emRowHint(kauf, 'pkVerp', t)).toBe('Sicherheit, zählt nicht zu den Eigenmitteln');
    expect(emRowHint(mkState({ antrag: 'Ablösung' }), 'pkVerp', t)).toBe('→ Bestätigung PK-Verpfändung');
    // «ab 50» already asks for the 3a documents: the amount adds nothing.
    expect(emRowHint(mkState({ antrag: 'Neue Hypothek' }, {}, {}, undefined, { info: { ab50: true } }), 's3a', t)).toBe('');
  });
});

describe('closing gate (Handover 6)', () => {
  it('follows signatureView.canFinish: locked until the signed copy is there or «Später nachreichen» is chosen', () => {
    expect(finishGate({ status: 'missing', canFinish: false })).toEqual({ enabled: false, labelKey: 's6.finishBlockedUpload' });
    expect(finishGate({ status: 'analysing', canFinish: false })).toEqual({ enabled: false, labelKey: 's6.finishBlockedUpload' });
    expect(finishGate({ status: 'received', canFinish: true })).toEqual({ enabled: true, labelKey: 's6.submitTitle' });
    expect(finishGate({ status: 'later', canFinish: true }).enabled).toBe(true);
    // A copy without signature keeps it locked — unless «später» was chosen.
    expect(finishGate({ status: 'unsigned', canFinish: false })).toEqual({ enabled: false, labelKey: 's6.finishBlocked' });
    expect(finishGate({ status: 'unsigned', canFinish: true }).enabled).toBe(true);
    expect(t('s6.finishBlockedUpload')).toBe('Erst Auskunftsermächtigung hochladen');
    expect(t('s6.finishBlocked')).toBe('Erst Auskunftsermächtigung unterzeichnen');
  });
});

describe('the list grows after the upload (Handover 4.2)', () => {
  it('names the documents the facts added, not those an answer added', () => {
    const before = reqList(mkState());
    const after = reqList(mkState({ baurecht: 'Ja' }, {}, {}, undefined, { info: { bonus: true, ab50: true } }));
    const added = factAdditions(before, after).map((r) => r.id);
    expect(added).toEqual(expect.arrayContaining(['lohnausweise_alt', 'ahv_voraus', 's3a', 'police']));
    expect(added).not.toContain('baurecht');
    expect(factAdditions(after, after)).toEqual([]);
  });
});

describe('«Deine Anfrage füllt sich» (Handover 3)', () => {
  it('lists each prefilled value with its document, then the facts for mail and Salesforce', () => {
    const s = full(
      {
        fin: { ...EMPTY_AMOUNTS, inc: 110310, val: 1240000 },
        src: {
          'fin.inc': { doc: 'Lohnausweis 2025', unsure: false, docType: 'lohnausweise' },
          'fin.val': { doc: 'Verkaufsdokumentation 2024', unsure: true, docType: 'verkaufsdoku' },
          'ans.kredite': { doc: 'Kreditvertrag Muster Kredit', unsure: false, docType: 'kredit' },
          'txt.ort': { doc: 'Grundbuchauszug', unsure: false, docType: 'grundbuch' },
        },
        info: { geb: '05.03.1985', zivil: 'ledig', bonus: false },
      },
      { kredite: 'Ja' },
      { ort: '' }
    );
    const { items, facts } = fillRailItems(s, t, opt, 'de');
    expect(items).toEqual([
      { path: 'fin.inc', label: 'Bruttoeinkommen pro Jahr', value: "CHF 110'310", unsure: false, why: 'aus Lohnausweis 2025' },
      { path: 'fin.val', label: 'Geschätzter Objektwert', value: "CHF 1'240'000", unsure: true, why: 'aus Verkaufsdokumentation 2024 · bitte bestätigen' },
      { path: 'ans.kredite', label: 'Privatkredit', value: 'Ja', unsure: false, why: 'aus Kreditvertrag Muster Kredit' },
    ]);
    expect(facts).toEqual([
      { key: 'geb', label: 'Geburtsdatum', value: '05.03.1985' },
      { key: 'zivil', label: 'Zivilstand', value: 'ledig' },
    ]);
    // Another language names the document type.
    expect(fillRailItems(s, tr('fr'), op('fr'), 'fr').items[0].why).toBe(
      translate('fr', 'fast.from', { doc: translate('fr', 'doc.lohnausweis1') })
    );
  });

  it('every fact and every prefillable field has a label in every language', () => {
    for (const lang of ['de', 'en', 'fr', 'it'] as Lang[]) {
      for (const k of INFO_KEYS) expect([lang, k, hasKey(lang, `info.${k}`)]).toEqual([lang, k, true]);
      for (const [p, key] of Object.entries(PATH_LABEL)) expect([lang, p, hasKey(lang, key!)]).toEqual([lang, p, true]);
    }
  });
});

describe('start screen (Handover 1)', () => {
  it('shows the preset role, «Kunde selbst» without one (DECISIONS V49)', () => {
    expect(startRole(null)).toBe('kunde');
    expect(startRole('berater')).toBe('berater');
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
    const s = mkState(MUSTERMANN_ANSWERS, {}, {}, undefined, { em: MUSTERMANN_EM });
    const list = reqList(s);
    const groups = railGroups(list, s, new Set([list[0].instanceId]), t, opt);
    expect(groups.map((g) => g.group)).toEqual(['objekt', 'hypothek', 'person', 'eigenmittel']);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(list.length);
    expect(groups[2].name).toBe('Zur Person · Max Mustermann');
    expect(groups[0].items[0].ok).toBe(true);
    expect(groups[0].items[1].ok).toBe(false);
  });

  it('a company is «Zur Gesellschaft»; several borrowers carry their names', () => {
    const jp = mkState({ kn: 'Juristische Person' });
    expect(railGroups(reqList(jp), jp, new Set(), t, opt).find((g) => g.group === 'person')!.name).toBe('Zur Gesellschaft');
    const two = mkState({}, {}, {}, [MAX, { id: 'b2', vor: '', nach: '', pkSe: 'Nein' }]);
    const person = railGroups(reqList(two), two, new Set(), t, opt).find((g) => g.group === 'person')!;
    expect(person.name).toBe('Zur Person');
    expect(person.items.map((i) => i.label)).toEqual(
      expect.arrayContaining(['Pass / Identitätskarte · Max Mustermann', 'Pass / Identitätskarte · Kreditnehmer 2'])
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

describe('entryFromParams — opened from the Partnerportal', () => {
  it('Berater entry, address and the way back', () => {
    expect(entryFromParams('?customer=partner&bmail=anna%40vzch.ch&from=portal')).toEqual({ role: 'berater', bmail: 'anna@vzch.ch', fromPortal: true });
  });
  it('a portal link without customer= still means Berater', () => {
    expect(entryFromParams('?from=portal')).toEqual({ role: 'berater', bmail: '', fromPortal: true });
    expect(entryFromParams('?bmail=anna%40vzch.ch')).toEqual({ role: 'berater', bmail: 'anna@vzch.ch', fromPortal: false });
  });
  it('ignores a bmail that is not an address, keeps the plain presets', () => {
    expect(entryFromParams('?customer=direct&bmail=nope')).toEqual({ role: 'kunde', bmail: '', fromPortal: false });
    expect(entryFromParams('')).toEqual({ role: null, bmail: '', fromPortal: false });
  });
});

describe("portalAction — the Berater's way back after the closing", () => {
  it('dashboard when logged in, login when not, portal root while unknown', () => {
    expect(portalAction('in')).toEqual({ href: '/portal/dashboard', labelKey: 's6.toDashboard' });
    expect(portalAction('out')).toEqual({ href: '/portal/login', labelKey: 's6.toPortalLogin' });
    expect(portalAction('unknown')).toEqual({ href: '/portal', labelKey: 's6.toPortal' });
  });
});
