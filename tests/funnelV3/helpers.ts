import { DEFAULT_ANSWERS, EMPTY_TEXTS, type Answers, type Borrower, type Texts } from '@/lib/funnel-v3/types';
import type { ReqState } from '@/lib/funnel-v3/requirements';

export const GARY: Borrower = { id: 'b1', vor: 'Gary', nach: 'Gerber', job: 'Angestellt', pkSe: 'Nein' };

/** A state built on DEFAULT_ANSWERS with one borrower (Gary Gerber, angestellt). */
export function mkState(
  ans: Partial<Answers> = {},
  borrower: Partial<Borrower> = {},
  txt: Partial<Texts> = {},
  borrowers?: Borrower[]
): ReqState {
  return {
    ans: { ...DEFAULT_ANSWERS, ...ans },
    borrowers: borrowers ?? [{ ...GARY, ...borrower }],
    txt: { ...EMPTY_TEXTS, vor: 'Gary', nach: 'Gerber', ...txt },
  };
}

/** The Gerber case after the full progression of spec 4.1 (23 requirements). */
export const GERBER_ANSWERS: Partial<Answers> = {
  antrag: 'Ablösung',
  anrede: 'Herr',
  immo: 'Bestehende Immobilie',
  aufstockung: 'Ja',
  lieg: 'Stockwerkeigentum',
  nutz: 'Selbstbewohnt',
  heizung: 'Unbekannt',
  kinder: 'Ja',
  unterhalt: 'Ja',
  kredite: 'Ja',
  leasing: 'Ja',
  s3a: 'Ja',
};
