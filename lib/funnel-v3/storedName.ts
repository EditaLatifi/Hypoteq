/**
 * Automatic renaming (Spezifikation 5.1). Pure.
 *
 *   {Fallnummer}_{Gruppe}_{Dokumenttyp}_{Person}_{Datum}_{Nr}.{Endung}
 *
 * Empty parts are left out together with their underscore.
 */

import type { RequirementDef, RequirementInstance } from "./requirements";
import type { ExtraKind } from "./requirementStatus";

/** DECISIONS D10: ä → a, ö → o, ü → u, é → e; spaces and every other special character go. */
export function cleanNamePart(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9-]+/g, "");
}

/**
 * Document date as `JJJJ-MM-TT` or `JJJJ`. Accepts a Date, `2026-01-15`, `15.01.2026`,
 * `2026`, or any text containing one of those (`Steuerjahr 2025`). Anything else → "".
 */
export function formatDocDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  let m = d.match(/(\d{4})[-_.](\d{2})[-_.](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = d.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = d.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  return m ? m[1] : "";
}

export interface StoredNameInput {
  /** `HQ-26-06-156283`. */
  caseNumber: string;
  /** The requirement (catalogue entry or list instance) the file belongs to. */
  requirement: RequirementDef | RequirementInstance;
  /** Person documents: the person. `company` wins over first/last. Defaults to the instance's person. */
  person?: { first?: string; last?: string; company?: string };
  /** Alternative to `person`: «Vorname Nachname» (the last word is the family name). */
  personName?: string;
  /** Hypothek documents: the bank (short form, e.g. «ZKB»). */
  bank?: string;
  /** Document date from the extraction — not the upload date. */
  docDate?: string | Date | null;
  /** 1-based number of the file within the requirement. */
  index?: number;
  /** Number of files of the requirement; `Nr` is written only when > 1. */
  total?: number;
  /** File extension, with or without dot; lower-cased. */
  ext: string;
  /** Files outside the list: `_ZUSATZ_` (surplus, kept not-needed, unknown) or `_DUPLIKAT_`. */
  extraKind?: ExtraKind;
}

function defOf(r: RequirementDef | RequirementInstance): RequirementDef {
  return "def" in r ? r.def : r;
}

function personPart(first?: string, last?: string): string {
  return [cleanNamePart(last), cleanNamePart(first)].filter(Boolean).join("-");
}

export function storedName(input: StoredNameInput): string {
  const def = defOf(input.requirement);
  const inst = "def" in input.requirement ? input.requirement : undefined;

  let who = "";
  if (def.personKind === "bank") {
    who = cleanNamePart(input.bank);
  } else if (def.personKind !== "none") {
    if (input.person?.company) who = cleanNamePart(input.person.company);
    else if (input.person) who = personPart(input.person.first, input.person.last);
    else if (input.personName) {
      const parts = input.personName.trim().split(/\s+/).filter(Boolean);
      who = personPart(parts.slice(0, -1).join(" "), parts[parts.length - 1]);
    } else if (inst?.person) {
      who = inst.person.company ? cleanNamePart(inst.person.company) : personPart(inst.person.first, inst.person.last);
    }
  }

  const date = def.datedName ? formatDocDate(input.docDate) : "";
  const nr = input.total && input.total > 1 && input.index ? String(input.index) : "";
  const marker = !input.extraKind ? "" : input.extraKind === "duplicate" ? "DUPLIKAT" : "ZUSATZ";
  const ext = (input.ext || "pdf").replace(/^\./, "").toLowerCase();

  return [input.caseNumber, def.renameGroup, marker, def.shortName, who, date, nr].filter(Boolean).join("_") + "." + ext;
}
