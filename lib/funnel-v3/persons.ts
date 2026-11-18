/**
 * Whose a document is, by the names printed on it. Pure, no dependencies on the rest of the funnel
 * (placement, the requirement status and the Abgleich all use it).
 */

import type { PersonRef } from "./requirements";

/** «Bürgi», «BUERGI», «Bürgi-Muster» → comparable words. */
export function nameTokens(s: string | null | undefined): string[] {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    // «Bürgi» and the machine-readable «BUERGI» are the same name.
    .map((t) => t.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u"))
    .filter((t) => t.length > 1);
}

/**
 * How well a printed name («Mustermann Max Simon») fits a person: 0 = not at all. The family
 * name must be there (word order does not matter — documents print both orders); each matching
 * given name adds to the score so spouses with one family name are told apart.
 *
 * A double family name («Muster-Beispiel», «Silva Costa») fits when one of its parts is printed:
 * a Lohnausweis or a payslip often carries only one (HYPOTEQ Komplett-Test 18.11.2026 — the
 * spouse with a double name was nobody on her own Lohnausweis, DECISIONS V128).
 */
export function personScore(printed: string | null | undefined, person: PersonRef | undefined): number {
  if (!person) return 0;
  const doc = new Set(nameTokens(printed));
  if (!doc.size) return 0;
  if (person.company) {
    const c = nameTokens(person.company).filter((t) => !["ag", "gmbh", "sa", "sarl", "sagl", "ltd"].includes(t));
    return c.length && c.every((t) => doc.has(t)) ? 2 : 0;
  }
  const last = nameTokens(person.last);
  if (!last.length) return 0;
  const full = last.every((t) => doc.has(t));
  const part = !full && last.length > 1 && last.some((t) => doc.has(t));
  if (!full && !part) return 0;
  return 2 + nameTokens(person.first).filter((t) => doc.has(t)).length;
}

export interface NamedPerson {
  vor: string;
  nach: string;
  /** «Vorname(n) Nachname». */
  display: string;
}

type Readable = { personName?: string | null; fields?: Record<string, { value: string | number | null } | undefined> | null };

/**
 * The persons a document names. An ID scan or a tax return of a couple names two — the fields then
 * read «Vornamen: Anna Ruth; Tom» and «Name: Muster-Beispiel; Muster» (DECISIONS V128); one person
 * otherwise. From the printed «Nachname Vorname[; …]» when the fields are missing.
 */
export function personsOn(a: Readable | null | undefined): NamedPerson[] {
  const split = (v: unknown) =>
    String(v ?? "")
      .split(/\s*;\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  const nachs = split(a?.fields?.Name?.value);
  const vors = split(a?.fields?.Vornamen?.value);
  const person = (vor: string, nach: string): NamedPerson => ({ vor, nach, display: [vor, nach].filter(Boolean).join(" ") });
  if (nachs.length) {
    if (nachs.length === 1) return [person(vors.join(" "), nachs[0])];
    return nachs.map((nach, i) => person(vors[i] ?? "", nach));
  }
  return split(a?.personName).map((p) => {
    const parts = p.split(/\s+/);
    return person(parts.slice(1).join(" "), parts[0] ?? "");
  });
}

/**
 * Who «als 2. Kreditnehmer/in erfassen» adds: the person on the document who is not the applicant
 * — a joint ID names both, and the button used to offer the names glued together («Tom Thomas;
 * Anna Ruth Muster; Muster-Beispiel», V128). From the document's own fields where it has them,
 * else from the printed «Vorname(n) Nachname[ / …]»; the first person when none is told apart.
 */
export function secondPerson(doc: Readable | null | undefined, printed: string, applicant: { vor: string; nach: string }): NamedPerson {
  const fromFields = doc?.fields?.Name?.value ? personsOn({ fields: doc.fields }) : [];
  const persons: NamedPerson[] = fromFields.length
    ? fromFields
    : printed
        .split(/\s*[/;]\s*/)
        .map((p) => p.trim().split(/\s+/).filter(Boolean))
        .filter((parts) => parts.length > 0)
        .map((parts) => ({ vor: parts.slice(0, -1).join(" "), nach: parts[parts.length - 1], display: parts.join(" ") }));
  const me: PersonRef = { kind: "borrower", first: applicant.vor, last: applicant.nach, display: "" };
  // The applicant is the best-fitting person (spouses share a family name); the other one is offered.
  const scores = persons.map((p) => (applicant.nach ? personScore(p.display, me) : 0));
  const best = Math.max(0, ...scores);
  const mine = best > 0 ? scores.indexOf(best) : -1;
  const other = persons.find((_, i) => i !== mine);
  return other ?? persons[0] ?? { vor: "", nach: printed.trim(), display: printed.trim() };
}

/** The document names more than one person (a joint ID, a couple's tax return). */
export function namesSeveral(a: Readable | null | undefined): boolean {
  return personsOn(a).length > 1;
}
