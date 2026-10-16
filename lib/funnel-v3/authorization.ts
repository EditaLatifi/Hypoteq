/**
 * The HYPOTEQ Auskunftsermächtigung as a prefilled PDF (Handover 6 «Vorlage herunterladen –
 * PDF, vorausgefüllt mit Vollmachtgeber, Geburtsdatum, Adresse, Objekt und Zweck»; DECISIONS
 * V12, V31–V33). Server only: it reads the template from `public/documents` with node `fs`.
 * Browser code takes the data and the file name from ./authorizationData (no `fs`, no pdf-lib).
 *
 * The four templates (de/en/fr/it, HYPOTEQ's own forms, Version 2.0) carry twelve text fields,
 * read from the PDFs with their printed labels:
 *
 *   page 1, left column    Text1 Vorname · Text2 Name · Text3 Adresse · Text4 PLZ/Ort · Text5 E-Mail   (Vollmachtgeber 1)
 *   page 1, right column   Text6 … Text10, the same                                                (Vollmachtgeber 2)
 *   page 2                 Text11 / Text12 «Datum / Ort» beside signature 1 / 2
 *
 * The form has no field for the birth date, the object or the purpose. They are drawn as two
 * small lines into free space of page 1 (V32): under the title «Anfrage HQ-… · Objekt … ·
 * Zweck … · Firma …», under the person table «Geburtsdatum …» per column. The positions per
 * language are in TEMPLATES, measured from the PDFs (tests/funnelV3/authorization.test.ts
 * keeps them between the printed text). «Datum / Ort» stays empty and the form stays editable
 * (not flattened): signed by hand, dated by hand or typed (V31).
 *
 * Kreditnehmer 1 and 2 fill the two columns; a juristische Person signs through its
 * zeichnungsberechtigte Person (left column), the company is named in the line under the title.
 */

import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFForm } from "pdf-lib";
import { translate, type Lang } from "./i18n";
import { authorizationFileName, normaliseAuthorizationData } from "./authorizationData";

export { authorizationFileName } from "./authorizationData";

export interface AuthorizationSigner {
  vor: string;
  nach: string;
  adresse?: string | null;
  plzOrt?: string | null;
  email?: string | null;
  /**
   * TT.MM.JJJJ (or JJJJ-MM-TT). Optional addition to the contract: drawn under the person table
   * because the form has no field for it (Handover 6 «Geburtsdatum»).
   */
  geburtsdatum?: string | null;
}

export interface AuthorizationData {
  lang: "de" | "en" | "fr" | "it";
  signers: AuthorizationSigner[];
  firma?: string | null;
  caseNumber?: string | null;
  objekt?: string | null;
  zweck?: "Neue Hypothek" | "Ablösung" | null;
}

// ---- Templates --------------------------------------------------------------------------------

/** Where the extra lines go, in points from the TOP of page 1 (pdf-lib counts from the bottom). */
export interface TemplateLayout {
  file: string;
  /** Line under the title: Anfrage · Objekt · Zweck · Firma. Baseline. */
  caseLine: { x: number; top: number };
  /** Line under the person table: «Geburtsdatum …» at each column's label. Baseline. */
  birthLine: { top: number; x: [number, number] };
}

/**
 * Measured with the printed text and the table rules of each template (page 1, A4 595 × 842):
 * the case line sits in the empty line between the title and the first field row, the birth
 * line between the last table rule and the heading «Vollmacht» / «Power of attorney» /
 * «Procuration» / «Procura».
 */
export const TEMPLATES: Record<Lang, TemplateLayout> = {
  // Title ends 172.2, Text1 starts 199.8 · last rule 316.3, «Vollmacht» 335.2 · labels at 72.5 / 296.4.
  de: { file: "Auskunftsermaechtigung-1.pdf", caseLine: { x: 72.5, top: 189 }, birthLine: { top: 327.5, x: [72.5, 296.4] } },
  // Title ends 172.9, Text1 starts 202.0 · last rule 317.0, «Power of attorney» 335.9 · labels at 73.0 / 297.4.
  en: { file: "20250711_HYPOTEQ-Authorisation-for-information-1.pdf", caseLine: { x: 73, top: 190.5 }, birthLine: { top: 328.2, x: [73, 297.4] } },
  // Title (two lines) ends 189.4, Text1 starts 220.0 · last rule 352.8, «Procuration» 371.6 · labels at 81.1 / 305.0.
  fr: { file: "20250711_HYPOTEQ-Pouvoir-dinformation-1-1.pdf", caseLine: { x: 72, top: 207.5 }, birthLine: { top: 364.5, x: [81.1, 305] } },
  // Title ends 162.8, Text1 starts 190.0 · last rule 321.1, «Procura» 352.9 · labels at 81.1 / 305.0.
  it: { file: "20250711_HYPOTEQ-Procura-per-informazioni-1.pdf", caseLine: { x: 72, top: 179 }, birthLine: { top: 333, x: [81.1, 305] } },
};

/** The form fields of one column, top to bottom. */
export const SIGNER_FIELDS: readonly [readonly string[], readonly string[]] = [
  ["Text1", "Text2", "Text3", "Text4", "Text5"],
  ["Text6", "Text7", "Text8", "Text9", "Text10"],
];
/** «Datum / Ort» beside signature 1 / 2 (page 2) — left empty, filled in by hand. */
export const DATE_PLACE_FIELDS = ["Text11", "Text12"] as const;

/** At most two Vollmachtgeber: the form has two columns. */
export const MAX_SIGNERS = 2;

const EXTRA_SIZE = 8;
const FIELD_SIZE = 9;
const MIN_FIELD_SIZE = 6;
const FIELD_PADDING = 4;
const INK = rgb(19 / 255, 34 / 255, 25 / 255);

const cache = new Map<Lang, Uint8Array>();

/**
 * The template bytes. From `public/documents` (next.config.mjs traces the files into the
 * serverless functions that build the PDF); if the deployment lacks them after all, from the
 * site itself, where `public` is served — so a tracing slip costs a request, not the PDF.
 */
export async function readAuthorizationTemplate(lang: Lang): Promise<Uint8Array> {
  const hit = cache.get(lang);
  if (hit) return hit;
  const file = TEMPLATES[lang].file;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(path.join(process.cwd(), "public", "documents", file)));
  } catch (err) {
    const { siteBaseUrl } = await import("@/components/nachreichung");
    const url = `${siteBaseUrl()}/documents/${encodeURIComponent(file)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res?.ok) throw new Error(`Auskunftsermächtigung template ${file} not readable: ${err instanceof Error ? err.message : String(err)}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  cache.set(lang, bytes);
  return bytes;
}

// ---- Text --------------------------------------------------------------------------------------

const REPLACE: Record<string, string> = {
  "–": "-",
  "—": "-",
  "−": "-",
  "‑": "-",
  "’": "'",
  "‘": "'",
  " ": " ",
  " ": " ",
  " ": " ",
  // Letters NFD does not take apart.
  "Ł": "L",
  "ł": "l",
  "Đ": "D",
  "đ": "d",
  "ı": "i",
  "Ħ": "H",
  "ħ": "h",
};

/** Only what Helvetica (WinAnsi) can draw; anything else degrades to a close ASCII form. */
function safeText(font: PDFFont, s: string): string {
  const charset = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of s.replace(/\s+/g, " ").trim()) {
    const cp = ch.codePointAt(0)!;
    if (charset.has(cp)) out += ch;
    else if (REPLACE[ch] !== undefined) out += REPLACE[ch];
    else {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += base && [...base].every((c) => charset.has(c.codePointAt(0)!)) ? base : "?";
    }
  }
  return out;
}

/** The size at which `text` fits the field, between MIN_FIELD_SIZE and FIELD_SIZE. */
function fittingSize(font: PDFFont, text: string, width: number): number {
  const w = font.widthOfTextAtSize(text, FIELD_SIZE);
  if (w <= width) return FIELD_SIZE;
  return Math.max(MIN_FIELD_SIZE, Math.floor(((FIELD_SIZE * width) / w) * 10) / 10);
}

function fill(form: PDFForm, font: PDFFont, name: string, value: string | null | undefined) {
  const text = safeText(font, value || "");
  if (!text) return;
  const field = form.getTextField(name);
  const widget = field.acroField.getWidgets()[0];
  const width = widget ? widget.getRectangle().width - FIELD_PADDING : 140;
  field.setText(text);
  field.setFontSize(fittingSize(font, text, width));
}

/** The line under the title: «Anfrage HQ-… · Objekt 8820 Wädenswil · Zweck: Ablösung · Firma: …». */
export function caseLineText(data: AuthorizationData): string {
  const t = (k: string) => translate(data.lang, `sig.pdf.${k}`);
  const parts: string[] = [];
  if (data.caseNumber) parts.push(`${t("case")} ${data.caseNumber}`);
  if (data.objekt) parts.push(`${t("object")}: ${data.objekt}`);
  if (data.zweck) parts.push(`${t("purpose")}: ${translate(data.lang, `opt.antrag.${data.zweck}`)}`);
  if (data.firma) parts.push(`${t("company")}: ${data.firma}`);
  return parts.join(" · ");
}

/** «Geburtsdatum: 12.03.1980» for one column, or "" without a date. */
export function birthLineText(lang: Lang, geburtsdatum: string | null | undefined): string {
  return geburtsdatum ? `${translate(lang, "sig.pdf.birth")}: ${geburtsdatum}` : "";
}

// ---- Build -------------------------------------------------------------------------------------

/**
 * The template of `data.lang` with the Vollmachtgeber filled in and the extra lines drawn.
 * Missing values stay empty fields (filled in by hand). Never more than two signers.
 */
export async function buildAuthorizationPdf(input: AuthorizationData): Promise<Uint8Array> {
  const data = normaliseAuthorizationData(input);
  const layout = TEMPLATES[data.lang];
  const doc = await PDFDocument.load(await readAuthorizationTemplate(data.lang));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();

  data.signers.slice(0, MAX_SIGNERS).forEach((s, col) => {
    const [vor, nach, adresse, plzOrt, email] = SIGNER_FIELDS[col];
    fill(form, font, vor, s.vor);
    fill(form, font, nach, s.nach);
    fill(form, font, adresse, s.adresse);
    fill(form, font, plzOrt, s.plzOrt);
    fill(form, font, email, s.email);
  });

  const page = doc.getPage(0);
  const height = page.getHeight();
  const draw = (text: string, x: number, top: number, maxWidth: number) => {
    const t = safeText(font, text);
    if (!t) return;
    let size = EXTRA_SIZE;
    while (size > 6 && font.widthOfTextAtSize(t, size) > maxWidth) size -= 0.5;
    page.drawText(t, { x, y: height - top, size, font, color: INK, opacity: 0.85 });
  };
  draw(caseLineText(data), layout.caseLine.x, layout.caseLine.top, page.getWidth() - layout.caseLine.x - 60);
  data.signers.slice(0, MAX_SIGNERS).forEach((s, col) => {
    const x = layout.birthLine.x[col];
    draw(birthLineText(data.lang, s.geburtsdatum), x, layout.birthLine.top, col === 0 ? layout.birthLine.x[1] - x - 8 : page.getWidth() - x - 60);
  });

  doc.setTitle(safeText(font, authorizationFileName(data).replace(/\.pdf$/, "").replace(/_/g, " ")));
  doc.setProducer("HYPOTEQ Funnel");
  // Field appearances are regenerated with Helvetica, so every viewer shows the values.
  form.updateFieldAppearances(font);
  return doc.save();
}
