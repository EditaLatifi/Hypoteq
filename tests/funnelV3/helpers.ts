import { DEFAULT_ANSWERS, EMPTY_EM, EMPTY_TEXTS, type Answers, type Borrower, type DocInfo, type Eigenmittel, type Texts } from '@/lib/funnel-v3/types';
import type { ReqState } from '@/lib/funnel-v3/requirements';

export const GARY: Borrower = { id: 'b1', vor: 'Gary', nach: 'Gerber', job: 'Angestellt', pkSe: 'Nein' };

/** A state built on DEFAULT_ANSWERS with one borrower (Gary Gerber, angestellt). */
export function mkState(
  ans: Partial<Answers> = {},
  borrower: Partial<Borrower> = {},
  txt: Partial<Texts> = {},
  borrowers?: Borrower[],
  extra: { em?: Partial<Eigenmittel>; info?: DocInfo } = {}
): ReqState {
  return {
    ans: { ...DEFAULT_ANSWERS, ...ans },
    borrowers: borrowers ?? [{ ...GARY, ...borrower }],
    txt: { ...EMPTY_TEXTS, vor: 'Gary', nach: 'Gerber', ...txt },
    em: { ...EMPTY_EM, ...(extra.em || {}) },
    info: { ...(extra.info || {}) },
  };
}

/** The Gerber case (Handover: Ablösung mit Erhöhung, STWE, Unterhalt, Privatkredit, Leasing, Säule 3a). */
export const GERBER_ANSWERS: Partial<Answers> = {
  antrag: 'Ablösung',
  anrede: 'Herr',
  immo: 'Bestehende Immobilie',
  aufstockung: 'Ja',
  lieg: 'Stockwerkeigentum',
  nutz: 'Selbstbewohnt',
  unterhalt: 'Ja',
  kredite: 'Ja',
  leasing: 'Ja',
};

/** Säule 3a of the Gerber case: the policy's Rückkaufswert (prototype AUTO). */
export const GERBER_EM: Partial<Eigenmittel> = { s3a: 10340 };
