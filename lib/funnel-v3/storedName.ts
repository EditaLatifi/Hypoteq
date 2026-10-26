/**
 * Automatic renaming (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 8; answer 10 of 26.10.2026
 * — the funnel's case number). Pure.
 *
 *   HQ-<Fallnummer>_<Kat>[_ZUSATZ]_<Dokumenttyp>_<Person-oder-Objekt>_<Dokumentdatum>.<Endung>
 *   HQ-26-10-000123_01_Lohnausweis_Mustermann-Max_2025-12-31.pdf
 *   HQ-26-10-000123_03_Grundbuchauszug_Musterweg-1-Zuerich_2026-01-15.pdf
 *   HQ-26-10-000123_01_ZUSATZ_Leasingvertrag_Mustermann-Max_2024-06-05.pdf
 *
 *   Kat            00 HYPOTEQ-Formulare · 01 Kreditnehmer 1 · 02 Kreditnehmer 2 · 03 Objekt ·
 *                  04 Finanzierung / bestehende Hypothek (with the Eigenmittel)
 *   Dokumenttyp    the requirement's canonical name, never the original file name
 *   Person/Objekt  «Nachname-Vorname», the company, «Strasse-Nr-Ort» for the object, the bank
 *                  for the existing mortgage
 *   Dokumentdatum  ISO date of the document (a year counts as its 31 December); the upload date
 *                  when the document has none
 *
 * Only A–Z, a–z, 0–9, «-» and «_»; umlauts transcribed (ä → ae); about 100 characters at most.
 * Several files of one type that come out alike get `_2`, `_3` at the closing (completion.ts).
 * The original name stays stored; a name set by hand is never replaced.
 */

import { SIGNATURE_REQUIREMENT_ID, type RequirementDef, type RequirementInstance } from "./requirements";
import type { ExtraKind } from "./requirementStatus";

/** Spezifikation Datenabgleich 8.2: ä → ae, ö → oe, ü → ue, é → e; spaces and every other special character go. */
export function cleanNamePart(s: string | null | undefined): string {
  return (s || "")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9-]+/g, "");
}

/** «Musterweg 1», «8000 Zürich» → «Musterweg-1-Zuerich». */
export function objectNamePart(street: string | null | undefined, place: string | null | undefined): string {
  // The Grundbuch's address («Seestrasse 118, 8038 Zürich») carries PLZ and place itself: the
  // place is named once, the funnel's where there is one.
  const m = String(street ?? "").match(/^(.*?)(?:,\s*|\s+)\d{4}\s+(\S.*)$/);
  const road = m ? m[1] : street;
  const town = String(place ?? "").replace(/\b\d{4}\b/, "").trim() || (m ? m[2] : "");
  const words = [road, town]
    .flatMap((s) => String(s ?? "").split(/[\s,/]+/))
    .map(cleanNamePart)
    .filter(Boolean);
  return words.join("-");
}

export type Kat = "00" | "01" | "02" | "03" | "04";

/** Spezifikation Datenabgleich 8.1 «<Kat>». `borrowerIndex`: 0 = Kreditnehmer 1, 1 = Kreditnehmer 2. */
export function katOf(def: Pick<RequirementDef, "id" | "group">, borrowerIndex?: number): Kat {
  if (def.id === SIGNATURE_REQUIREMENT_ID) return "00";
  if (def.group === "objekt") return "03";
  if (def.group === "hypothek" || def.group === "eigenmittel") return "04";
  return borrowerIndex === 1 ? "02" : "01";
}

/**
 * Document date as `JJJJ-MM-TT` or `JJJJ`. Accepts a Date, `2026-01-15`, `15.01.2026`,
 * `2026`, or any text containing one of those (`Steuerjahr 2025`). Anything else → "".
 * (The analysis keeps a year as a year: the freshness rules read it so.)
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

/**
 * The «<Dokumentdatum>» of the stored name (8.1): always `JJJJ-MM-TT`, a year as its
 * 31 December (the Lohnausweis 2025 covers the year up to 31.12.2025).
 */
export function nameDate(d: string | Date | null | undefined): string {
  const f = formatDocDate(d);
  return /^\d{4}$/.test(f) ? `${f}-12-31` : f;
}

/** Spezifikation Datenabgleich 8.2 «max. ~100 Zeichen». */
export const MAX_STORED_NAME = 100;

export interface StoredNameInput {
  /** `HQ-26-01-000001`. */
  caseNumber: string;
  /** The requirement (catalogue entry or list instance) the file belongs to. */
  requirement: RequirementDef | RequirementInstance;
  /** Person documents: the person. `company` wins over first/last. Defaults to the instance's person. */
  person?: { first?: string; last?: string; company?: string };
  /** Alternative to `person`: «Vorname Nachname» (the last word is the family name). */
  personName?: string;
  /** Person documents: 0 = Kreditnehmer 1, 1 = Kreditnehmer 2 (Kat 01 / 02). */
  borrowerIndex?: number;
  /** Object documents: street with number and place (Kat 03 «Strasse-Nr-Ort»). */
  object?: { street?: string | null; place?: string | null };
  /** Hypothek documents: the bank (short form, e.g. «ZKB»). */
  bank?: string;
  /** Document date from the extraction — not the upload date. */
  docDate?: string | Date | null;
  /** The upload date: the fallback when the document has no date of its own. */
  uploadedAt?: string | Date | null;
  /** File extension, with or without dot; lower-cased. */
  ext: string;
  /** Files outside the list: `_ZUSATZ_` (surplus, kept not-needed, unknown) or `_DUPLIKAT_`. */
  extraKind?: ExtraKind;
  /** No longer used: several files of one type that come out alike are told apart at the closing. */
  index?: number;
  total?: number;
}

function defOf(r: RequirementDef | RequirementInstance): RequirementDef {
  return "def" in r ? r.def : r;
}

function personPart(first?: string, last?: string): string {
  return [...String(last ?? "").split(/\s+/), ...String(first ?? "").split(/\s+/)].map(cleanNamePart).filter(Boolean).join("-");
}

/** The parts joined, the who-part shortened first when the whole would pass ~100 characters. */
function assemble(head: string[], who: string, tail: string[], ext: string): string {
  const name = (w: string) => [...head, w, ...tail].filter(Boolean).join("_") + "." + ext;
  const full = name(who);
  if (full.length <= MAX_STORED_NAME || !who) return full;
  const room = Math.max(8, who.length - (full.length - MAX_STORED_NAME));
  return name(who.slice(0, room).replace(/-+$/, ""));
}

export function storedName(input: StoredNameInput): string {
  const def = defOf(input.requirement);
  const inst = "def" in input.requirement ? input.requirement : undefined;

  let who = "";
  if (def.personKind === "bank") {
    who = cleanNamePart(input.bank);
  } else if (def.group === "objekt") {
    who = objectNamePart(input.object?.street, input.object?.place);
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

  // A date of the document where it has one that names it (not an ID's birth date), else the upload.
  const date = (def.datedName ? nameDate(input.docDate) : "") || nameDate(input.uploadedAt ?? null);
  const marker = !input.extraKind ? "" : input.extraKind === "duplicate" ? "DUPLIKAT" : "ZUSATZ";
  const ext = (input.ext || "pdf").replace(/^\./, "").toLowerCase();
  return assemble([input.caseNumber, katOf(def, input.borrowerIndex), marker, def.shortName], who, [date], ext);
}

/**
 * The stored name of a kept file outside the list whose type is no requirement. A recognised
 * type (a not-needed document: «Steuerrechnung») is named after the type, never after the
 * original file name (8.1); a file nobody could recognise keeps its own name behind the
 * marker. Nothing is deleted (Handover 4.3), so the closing names these too — and the documents
 * step shows the same name in advance.
 */
export function extraStoredName(
  caseNumber: string,
  originalName: string,
  kind: ExtraKind | undefined,
  known?: { type?: string | null; personName?: string | null; docDate?: string | Date | null; uploadedAt?: string | Date | null }
): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(originalName || "");
  const ext = m ? m[1].toLowerCase() : "pdf";
  const marker = kind === "duplicate" ? "DUPLIKAT" : "ZUSATZ";
  // The type's label, cut at a word when long («Aktueller-Hypothekarvertrag-Rahmenvertrag»).
  const label = cleanNamePart((known?.type || "").replace(/[\s/_()]+/g, "-")).replace(/-+/g, "-").replace(/^-|-$/g, "");
  const type = label.length <= 60 ? label : label.slice(0, 60).replace(/-[^-]*$/, "");
  if (type) {
    const parts = (known?.personName || "").trim().split(/\s+/).filter(Boolean);
    // «Nachname Vorname» as printed on the document.
    const who = parts.length ? personPart(parts.slice(1).join(" "), parts[0]) : "";
    const date = nameDate(known?.docDate ?? null) || nameDate(known?.uploadedAt ?? null);
    return assemble([caseNumber, marker, type], who, [date], ext);
  }
  const base = cleanNamePart((originalName || "").replace(/\.[A-Za-z0-9]{1,8}$/, "").replace(/[\s_]+/g, "-")).slice(0, 80) || "Datei";
  return `${caseNumber}_${marker}_${base}.${ext}`;
}
