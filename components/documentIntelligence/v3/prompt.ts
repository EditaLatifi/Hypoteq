/**
 * The v3 instructions and strict JSON schema, provider-neutral so a sibling provider (another
 * vendor) answers in exactly the same shape. Pure — testable without a model.
 */

import { classifiableTypes, V3_DOC_TYPES, type V3DocType } from "./catalogue";

/** Every field key any type defines (the schema's `fields[].key` enum). */
export function allFieldKeys(): string[] {
  const keys = new Set<string>();
  for (const t of V3_DOC_TYPES) for (const f of t.fields) keys.add(f.key);
  return [...keys];
}

function typeLine(t: V3DocType): string {
  const aliases = [...t.aliases.de, ...t.aliases.fr, ...t.aliases.it, ...t.aliases.en].join(" / ");
  const lines = [`- ${t.id} — ${t.labelDe}. ${t.describe} Also called: ${aliases}.`];
  if (t.kind === "notneeded") {
    lines.push("  (not needed by the bank — classify it so, extract nothing)");
    return lines.join("\n");
  }
  const members = V3_DOC_TYPES.filter((x) => x.family === t.id && x.id !== t.id);
  if (members.length) {
    lines.push(
      `  Use this id also for: ${members.map((m) => `${m.labelDe}`).join("; ")} — whose document it is is read from personName.`
    );
  }
  if (t.fields.length) {
    lines.push(`  Fields: ${t.fields.map((f) => (f.hint ? `«${f.key}» (${f.hint})` : `«${f.key}»`)).join(", ")}`);
  }
  const read: string[] = [];
  if (t.naming.person) read.push("personName");
  if (t.naming.bank) read.push("bank");
  if (t.naming.date === "year") read.push("docDate as the YEAR the document covers (JJJJ)");
  else if (t.naming.date === "date") read.push("docDate as the document's own date (JJJJ-MM-TT)");
  else read.push("docDate null (a birth date is not a document date)");
  lines.push(`  Read: ${read.join(", ")}.`);
  if (t.noteWhen) lines.push(`  note: ${t.noteWhen}.`);
  return lines.join("\n");
}

export function buildV3Instructions(): string {
  const types = classifiableTypes();
  return [
    "You classify and read documents uploaded with a Swiss mortgage application (HYPOTEQ).",
    "Documents may be in German, French, Italian or English.",
    "",
    "1. Decide which ONE of the document types below the file mainly is. Classify against the",
    "   whole list, also types the applicant may not have been asked for. Answer \"unknown\"",
    "   when it is none of them — never force the nearest type.",
    "2. Extract only the fields listed for THAT type, as printed, as short strings in Swiss",
    "   German formatting (amounts like «CHF 125'385», dates DD.MM.YYYY). Leave a field out when",
    "   the document does not state it; never calculate, infer or average a value.",
    "3. confidence (0–1) is your probability that the type / the value is right. Keep values",
    "   above 0.9 for what you read directly off the page.",
    "4. personName: the person the document belongs to, «Nachname Vorname» as printed",
    "   (for a company document, the company name). null when there is none.",
    "5. bank: on mortgage documents the lender, in its usual short form (ZKB, UBS, Raiffeisen,",
    "   PostFinance, Zuger Kantonalbank → ZugerKB …). Else null.",
    "6. docDate: as stated per type below — never today's date, never the upload date.",
    "7. note: one short German sentence for the bank, ONLY where a type says so and the document",
    "   supports it (e.g. a pledged policy, a credit to be repaid). Else null.",
    "",
    "Read every page — key values are often not on the first one. The file name is an unreliable",
    "hint only: what the pages show wins.",
    "",
    "Document types:",
    ...types.map(typeLine),
  ].join("\n");
}

/** Strict JSON schema (OpenAI structured outputs compatible; plain JSON Schema otherwise). */
export function buildV3Schema() {
  const ids = classifiableTypes().map((t) => t.id);
  return {
    type: "object",
    properties: {
      docType: { type: "string", enum: [...ids, "unknown"] },
      confidence: { type: "number" },
      personName: { type: ["string", "null"] },
      bank: { type: ["string", "null"] },
      docDate: { type: ["string", "null"] },
      note: { type: ["string", "null"] },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: allFieldKeys() },
            value: { type: ["string", "null"] },
            confidence: { type: "number" },
          },
          required: ["key", "value", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["docType", "confidence", "personName", "bank", "docDate", "note", "fields"],
    additionalProperties: false,
  };
}
