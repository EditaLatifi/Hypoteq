import { CLOSED_STATUSES, ENDED_STATUSES, type DocStatus } from "@/lib/portal/status";

/**
 * «Ihr Portfolio» on the dashboard (handoff «Dashboard» 4). Pure; the definitions are
 * DECISIONS P22 and are computed from the partner's Cases exactly as the portal loads them:
 *
 *   Volumen in Bearbeitung  sum of the amount of every open Case (not Abgeschlossen,
 *                           Abgelehnt or Storniert)
 *   Finanziert <Jahr>       sum of the amount of the Cases Abgeschlossen in the current
 *                           calendar year (Europe/Zurich), by Case.ClosedDate
 *   Ø Finanzierungsbetrag   mean amount of every Case not Abgelehnt or Storniert that has one
 *   Ø Durchlaufzeit         mean days from CreatedDate to ClosedDate of the Abgeschlossen Cases
 *   Dokumenten-Quote        mean share of listed documents on file (Vorhanden, In Prüfung,
 *                           Hochgeladen) over the open Cases that list documents
 *
 * The amount is Gesch_tzter_Hypothekenbedarf__c (falling back as in salesforce.ts); a Case
 * without one adds nothing to a sum and is left out of the mean.
 */

export type PortfolioCase = {
  status: string;
  betrag: number | null;
  createdAt: string;
  /** When the Case was closed (ClosedDate), for Abgeschlossen Cases. */
  closedAt: string | null;
  documents: { status: DocStatus; extra?: boolean }[];
};

export type Portfolio = {
  pipeline: { volume: number; cases: number };
  financed: { year: number; volume: number; cases: number };
  average: { amount: number | null; cases: number };
  throughput: { days: number | null; cases: number };
  docQuota: { pct: number | null; cases: number };
};

const DAY = 86_400_000;
const ON_FILE: DocStatus[] = ["vorhanden", "pruefung", "hochgeladen"];

function zurichYear(d: Date): number {
  return Number(new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", year: "numeric" }).format(d));
}

function amount(c: PortfolioCase): number {
  return c.betrag && c.betrag > 0 ? c.betrag : 0;
}

function time(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Documents on the Case's list (uploads outside it do not count). */
function listed(c: PortfolioCase) {
  return c.documents.filter((d) => !d.extra);
}

export function portfolio(cases: PortfolioCase[], now: Date = new Date()): Portfolio {
  const year = zurichYear(now);
  const open = cases.filter((c) => !CLOSED_STATUSES.includes(c.status));
  const done = cases.filter((c) => c.status === "Abgeschlossen");
  const doneThisYear = done.filter((c) => {
    const t = time(c.closedAt);
    return t !== null && zurichYear(new Date(t)) === year;
  });
  const withAmount = cases.filter((c) => !ENDED_STATUSES.includes(c.status) && amount(c) > 0);

  const durations = done
    .map((c) => {
      const from = time(c.createdAt);
      const to = time(c.closedAt);
      return from !== null && to !== null && to >= from ? (to - from) / DAY : null;
    })
    .filter((d): d is number => d !== null);

  const quotaCases = open.filter((c) => listed(c).length > 0);
  const shares = quotaCases.map((c) => {
    const docs = listed(c);
    return docs.filter((d) => ON_FILE.includes(d.status)).length / docs.length;
  });

  const sum = (xs: PortfolioCase[]) => xs.reduce((n, c) => n + amount(c), 0);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const avgAmount = mean(withAmount.map(amount));
  const avgDays = mean(durations);
  const avgShare = mean(shares);
  return {
    pipeline: { volume: sum(open), cases: open.length },
    financed: { year, volume: sum(doneThisYear), cases: doneThisYear.length },
    average: { amount: avgAmount === null ? null : Math.round(avgAmount), cases: withAmount.length },
    throughput: { days: avgDays === null ? null : Math.round(avgDays), cases: durations.length },
    docQuota: { pct: avgShare === null ? null : Math.round(avgShare * 100), cases: quotaCases.length },
  };
}

/** `CHF 850'000` — Swiss grouping with a straight apostrophe, whole francs. */
export function chf(n: number): string {
  return `CHF ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
}

/** `CHF 4.06 Mio.` from a million up (two decimals, a trailing zero dropped), else `chf`. */
export function chfShort(n: number): string {
  if (Math.abs(n) < 1_000_000) return chf(n);
  return `CHF ${(n / 1_000_000).toFixed(2).replace(/0$/, "")} Mio.`;
}

/** `35 %` — Swiss percent with a space. */
export function percent(n: number): string {
  return `${Math.round(n)} %`;
}
