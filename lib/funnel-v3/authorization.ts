/**
 * The HYPOTEQ Auskunftsermächtigung as a prefilled PDF (Handover 6 «Vorlage herunterladen –
 * PDF, vorausgefüllt mit Vollmachtgeber, Geburtsdatum, Adresse, Objekt und Zweck»; DECISIONS
 * V12, V31–V33, V81). Server only: it reads the template from `public/documents` with node `fs`.
 * Browser code takes the data and the file name from ./authorizationData (no `fs`, no pdf-lib).
 *
 * HYPOTEQ's templates of 21.10.2026 (de/en/fr/it, one layout) carry sixteen text fields:
 *
 *   page 1, left column    Text1 Vorname · Text2 Name · Geburtsdatum1 · Text3 Adresse · Text4 PLZ/Ort · Text5 E-Mail   (Kreditnehmer/in 1)
 *   page 1, right column   Text6 · Text7 · Geburtsdatum2 · Text8 · Text9 · Text10, the same                            (Kreditnehmer/in 2)
 *   page 1, below          Objekt (Adresse der Liegenschaft) · Zweck
 *   page 2                 Text11 / Text12 «Datum / Ort» beside signature 1 / 2
 *
 * Only the request number and, for a juristische Person, the company have no field: they are
 * drawn as one small line under the title (V32), positioned per language in TEMPLATES.
 * «Datum / Ort» stays empty and the form stays editable (not flattened): signed by hand, dated
 * by hand or typed (V31).
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

/** Where the case line goes, in points from the TOP of page 1 (pdf-lib counts from the bottom). */
export interface TemplateLayout {
  file: string;
  /** Line under the title: Anfrage · Firma. Baseline. */
  caseLine: { x: number; top: number };
}

/**
 * Measured from each template (page 1, A4 595 × 842): the case line sits between the title and
 * the first card, at the title's left edge.
 */
export const TEMPLATES: Record<Lang, TemplateLayout> = {
  // One-line title ends 116.4, the first card starts 141.7.
  de: { file: "HYPOTEQ_Auskunftsermaechtigung_DE.pdf", caseLine: { x: 51, top: 132 } },
  // Two-line title ends 134.5, the first card starts 160.2 (en, fr, it alike).
  en: { file: "HYPOTEQ_Auskunftsermaechtigung_EN.pdf", caseLine: { x: 51, top: 150.5 } },
  fr: { file: "HYPOTEQ_Auskunftsermaechtigung_FR.pdf", caseLine: { x: 51, top: 150.5 } },
  it: { file: "HYPOTEQ_Auskunftsermaechtigung_IT.pdf", caseLine: { x: 51, top: 150.5 } },
};

/** The form fields of one column, top to bottom: Vorname, Name, Geburtsdatum, Adresse, PLZ/Ort, E-Mail. */
export const SIGNER_FIELDS: readonly [readonly string[], readonly string[]] = [
  ["Text1", "Text2", "Geburtsdatum1", "Text3", "Text4", "Text5"],
  ["Text6", "Text7", "Geburtsdatum2", "Text8", "Text9", "Text10"],
];
/** «Objekt (Adresse der Liegenschaft)» and «Zweck» under the two columns (multi-line fields). */
export const OBJECT_FIELD = "Objekt";
export const PURPOSE_FIELD = "Zweck";
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

/** The line under the title: «Anfrage HQ-… · Firma: …» — what the form has no field for. */
export function caseLineText(data: AuthorizationData): string {
  const t = (k: string) => translate(data.lang, `sig.pdf.${k}`);
  const parts: string[] = [];
  if (data.caseNumber) parts.push(`${t("case")} ${data.caseNumber}`);
  if (data.firma) parts.push(`${t("company")}: ${data.firma}`);
  return parts.join(" · ");
}

/** The «Zweck» field: the Kreditantrag in the form's language («Ablösung», «Refinancing» …). */
export function purposeText(data: AuthorizationData): string {
  return data.zweck ? translate(data.lang, `opt.antrag.${data.zweck}`) : "";
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
    const [vor, nach, geburtsdatum, adresse, plzOrt, email] = SIGNER_FIELDS[col];
    fill(form, font, vor, s.vor);
    fill(form, font, nach, s.nach);
    fill(form, font, geburtsdatum, s.geburtsdatum);
    fill(form, font, adresse, s.adresse);
    fill(form, font, plzOrt, s.plzOrt);
    fill(form, font, email, s.email);
  });
  fill(form, font, OBJECT_FIELD, data.objekt);
  fill(form, font, PURPOSE_FIELD, purposeText(data));

  const page = doc.getPage(0);
  const height = page.getHeight();
  const draw = (text: string, x: number, top: number, maxWidth: number) => {
    const t = safeText(font, text);
    if (!t) return;
    let size = EXTRA_SIZE;
    while (size > 6 && font.widthOfTextAtSize(t, size) > maxWidth) size -= 0.5;
    page.drawText(t, { x, y: height - top, size, font, color: INK, opacity: 0.85 });
  };
  draw(caseLineText(data), layout.caseLine.x, layout.caseLine.top, page.getWidth() - layout.caseLine.x - 51);

  doc.setTitle(safeText(font, authorizationFileName(data).replace(/\.pdf$/, "").replace(/_/g, " ")));
  doc.setProducer("HYPOTEQ Funnel");
  // Field appearances are regenerated with Helvetica, so every viewer shows the values.
  form.updateFieldAppearances(font);
  return doc.save();
}
