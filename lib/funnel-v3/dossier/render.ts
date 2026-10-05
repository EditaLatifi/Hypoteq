/**
 * Draws a DossierModel as an A4 PDF with pdf-lib (pure JavaScript: no Chromium, no font files
 * read at run time — it runs on Vercel serverless and in jest alike).
 *
 * Layout follows the dossier prototype: running header (wordmark, «Fall-Dossier · Nr · Name,
 * Ort») and footer («Vertraulich · für Kreditgeber», page, hypoteq.com) on every page, a dark
 * Deckblatt with the lime wedge and the KPIs, sections that are kept on one page where they
 * fit, the annex on a new page with tables that continue across pages (header repeated).
 *
 * Fonts are the PDF standard Helvetica pair (WinAnsi). Every string goes through `safe()`, so a
 * character outside that set (an arrow, an emoji in a file name) degrades to a close ASCII
 * form instead of throwing.
 */

import {
  PDFDocument,
  StandardFonts,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingRgbColor,
  type PDFFont,
  type PDFOperator,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { interpolate } from "../i18n";
import type { DossierModel, DossierSection, KeyValue, Kpi, Table, TableCell } from "./model";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 54;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const TOP = PAGE_H - 70;
const BOTTOM = 64;

const COLOR = {
  forest: rgb(19 / 255, 34 / 255, 25 / 255),
  lime: rgb(202 / 255, 244 / 255, 118 / 255),
  rule: rgb(225 / 255, 231 / 255, 220 / 255),
  white: rgb(1, 1, 1),
  warn: rgb(168 / 255, 104 / 255, 0),
};

const REPLACE: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "⚠": "!",
  "✓": "v",
  "✔": "v",
  "≥": ">=",
  "≤": "<=",
  "−": "-",
  "‑": "-",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  "	": " ",
};

interface TextStyle {
  size: number;
  bold?: boolean;
  color?: RGB;
  opacity?: number;
}

class Pdf {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = TOP;
  private charset: Set<number>;

  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont
  ) {
    this.charset = new Set(regular.getCharacterSet());
  }

  static async create(): Promise<Pdf> {
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const pdf = new Pdf(doc, regular, bold);
    pdf.addPage();
    return pdf;
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = TOP;
  }

  /** Room for `h` below the cursor, or a new page. */
  ensure(h: number) {
    if (this.y - h < BOTTOM) this.addPage();
  }

  safe(s: string): string {
    let out = "";
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      if (this.charset.has(cp)) out += ch;
      else if (REPLACE[ch] !== undefined) out += REPLACE[ch];
      else {
        const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
        out += base && [...base].every((c) => this.charset.has(c.codePointAt(0)!)) ? base : "?";
      }
    }
    return out;
  }

  font(bold?: boolean) {
    return bold ? this.bold : this.regular;
  }

  width(s: string, size: number, bold?: boolean) {
    return this.font(bold).widthOfTextAtSize(this.safe(s), size);
  }

  /** Lines of at most `maxW`; long tokens (file names) break after _ - / . or anywhere. */
  wrap(text: string, size: number, maxW: number, bold?: boolean): string[] {
    const f = this.font(bold);
    const w = (s: string) => f.widthOfTextAtSize(s, size);
    const out: string[] = [];
    for (const para of String(text ?? "").split("\n")) {
      const words = this.safe(para).split(/ +/);
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (w(candidate) <= maxW) {
          line = candidate;
          continue;
        }
        if (line) out.push(line);
        line = "";
        let rest = word;
        while (rest && w(rest) > maxW) {
          let cut = 1;
          for (let i = 1; i <= rest.length; i++) {
            if (w(rest.slice(0, i)) <= maxW) cut = i;
            else break;
          }
          const head = rest.slice(0, cut);
          const bp = Math.max(head.lastIndexOf("_"), head.lastIndexOf("-"), head.lastIndexOf("/"), head.lastIndexOf("."));
          if (bp >= Math.floor(cut * 0.4) && bp < cut - 1) cut = bp + 1;
          out.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      out.push(line);
    }
    return out;
  }

  text(s: string, x: number, baseline: number, st: TextStyle) {
    const t = this.safe(s);
    if (!t) return;
    this.page.drawText(t, { x, y: baseline, size: st.size, font: this.font(st.bold), color: st.color ?? COLOR.forest, opacity: st.opacity ?? 1 });
  }

  textRight(s: string, xRight: number, baseline: number, st: TextStyle) {
    this.text(s, xRight - this.width(s, st.size, st.bold), baseline, st);
  }

  rule(x1: number, x2: number, y: number, color: RGB = COLOR.rule, thickness = 0.75) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }

  rect(x: number, yBottom: number, w: number, h: number, color: RGB) {
    this.page.drawRectangle({ x, y: yBottom, width: w, height: h, color });
  }

  roundRect(x: number, yBottom: number, w: number, h: number, r: number, color: RGB) {
    this.page.pushOperators(pushGraphicsState(), setFillingRgbColor(color.red, color.green, color.blue), ...roundedPath(x, yBottom, w, h, r), fill(), popGraphicsState());
  }
}

function roundedPath(x: number, y: number, w: number, h: number, r: number): PDFOperator[] {
  const k = r * 0.4477;
  return [
    moveTo(x + r, y),
    lineTo(x + w - r, y),
    appendBezierCurve(x + w - k, y, x + w, y + k, x + w, y + r),
    lineTo(x + w, y + h - r),
    appendBezierCurve(x + w, y + h - k, x + w - k, y + h, x + w - r, y + h),
    lineTo(x + r, y + h),
    appendBezierCurve(x + k, y + h, x, y + h - k, x, y + h - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + k, x + k, y, x + r, y),
    closePath(),
  ];
}

const upper = (s: string) => s.toLocaleUpperCase("de-CH");

// ---- Deckblatt ------------------------------------------------------------------------------

function drawCover(pdf: Pdf, c: DossierModel["cover"]) {
  const h = 430;
  const x = MARGIN;
  const top = pdf.y;
  const bottom = top - h;
  const pad = 30;
  pdf.roundRect(x, bottom, CONTENT_W, h, 14, COLOR.forest);

  // The lime wedge, clipped to the card (prototype: skewX(-14deg) on the right edge).
  const xr = x + CONTENT_W;
  const skew = Math.tan((14 * Math.PI) / 180) * (h / 2);
  pdf.page.pushOperators(
    pushGraphicsState(),
    ...roundedPath(x, bottom, CONTENT_W, h, 14),
    clip(),
    endPath(),
    setFillingRgbColor(COLOR.lime.red, COLOR.lime.green, COLOR.lime.blue),
    moveTo(xr - 105 + skew, top),
    lineTo(xr + 10, top),
    lineTo(xr + 10, bottom),
    lineTo(xr - 105 - skew, bottom),
    closePath(),
    fill(),
    popGraphicsState()
  );

  const inner = x + pad;
  const textW = CONTENT_W * 0.6;
  pdf.text("HYPOTEQ", inner, top - pad - 16, { size: 20, bold: true, color: COLOR.white });
  if (c.draft) {
    const label = upper(c.draft);
    const w = pdf.width(label, 7.5, true) + 16;
    pdf.roundRect(inner + 120, top - pad - 20, w, 17, 8.5, COLOR.lime);
    pdf.text(label, inner + 128, top - pad - 14.5, { size: 7.5, bold: true });
  }

  // Bottom-up: footer line, KPIs, rule, description, title, eyebrow, lime bar.
  let yb = bottom + pad;
  pdf.text(c.left, inner, yb, { size: 8, color: COLOR.white, opacity: 0.6 });
  pdf.textRight(c.right, inner + textW, yb, { size: 8, color: COLOR.white, opacity: 0.6 });
  yb += 26;
  const kw = textW / Math.max(c.kpis.length, 1);
  c.kpis.forEach((k, i) => {
    pdf.text(k.value, inner + i * kw, yb, { size: 15, bold: true, color: k.accent ? COLOR.lime : COLOR.white });
    pdf.text(upper(k.label), inner + i * kw, yb + 21, { size: 6.8, color: COLOR.white, opacity: 0.6 });
  });
  yb += 40;
  pdf.page.drawLine({ start: { x: inner, y: yb }, end: { x: inner + textW, y: yb }, thickness: 0.6, color: COLOR.white, opacity: 0.18 });
  yb += 18;
  const desc = c.description ? pdf.wrap(c.description, 10.5, textW) : [];
  for (let i = desc.length - 1; i >= 0; i--) {
    pdf.text(desc[i], inner, yb, { size: 10.5, color: COLOR.white, opacity: 0.78 });
    yb += 15;
  }
  yb += desc.length ? 8 : 0;
  const title = c.title.flatMap((l) => pdf.wrap(l, 24, textW, true));
  for (let i = title.length - 1; i >= 0; i--) {
    pdf.text(title[i], inner, yb, { size: 24, bold: true, color: COLOR.white });
    yb += 27;
  }
  yb += 4;
  pdf.text(upper(c.eyebrow), inner, yb, { size: 7.2, color: COLOR.white, opacity: 0.62 });
  yb += 18;
  pdf.rect(inner, yb, 32, 2.5, COLOR.lime);

  pdf.y = bottom;
}

// ---- Sections -------------------------------------------------------------------------------

const KV_SIZE = 8.8;
const KV_LINE = 11.6;
const SMALL = 7;

function kvHeight(pdf: Pdf, kv: KeyValue | undefined, colW: number): number {
  if (!kv) return 0;
  const l = pdf.wrap(kv.label, KV_SIZE, colW * 0.47).length;
  const v = pdf.wrap(kv.value, KV_SIZE, colW * 0.5, kv.strong).length;
  return Math.max(l, v) * KV_LINE + 9;
}

function drawKv(pdf: Pdf, kv: KeyValue | undefined, x: number, top: number, colW: number, h: number) {
  if (!kv) return;
  const labels = pdf.wrap(kv.label, KV_SIZE, colW * 0.47);
  const values = pdf.wrap(kv.value, KV_SIZE, colW * 0.5, kv.strong);
  labels.forEach((l, i) => pdf.text(l, x, top - 13 - i * KV_LINE, { size: KV_SIZE, opacity: 0.62 }));
  values.forEach((v, i) => pdf.textRight(v, x + colW, top - 13 - i * KV_LINE, { size: KV_SIZE, bold: kv.strong }));
  pdf.rule(x, x + colW, top - h);
}

function columnsHeight(pdf: Pdf, cols: [KeyValue[], KeyValue[]]): number {
  const colW = (CONTENT_W - 28) / 2;
  let h = 0;
  for (let i = 0; i < Math.max(cols[0].length, cols[1].length); i++) h += Math.max(kvHeight(pdf, cols[0][i], colW), kvHeight(pdf, cols[1][i], colW));
  return h;
}

function drawColumns(pdf: Pdf, cols: [KeyValue[], KeyValue[]]) {
  const colW = (CONTENT_W - 28) / 2;
  for (let i = 0; i < Math.max(cols[0].length, cols[1].length); i++) {
    const h = Math.max(kvHeight(pdf, cols[0][i], colW), kvHeight(pdf, cols[1][i], colW));
    drawKv(pdf, cols[0][i], MARGIN, pdf.y, colW, h);
    drawKv(pdf, cols[1][i], MARGIN + colW + 28, pdf.y, colW, h);
    pdf.y -= h;
  }
}

function calloutHeight(pdf: Pdf, c: { label: string; text: string }): number {
  return 12 + pdf.wrap(c.text, 8.6, CONTENT_W - 14).length * 11.4 + 8;
}

function drawCallout(pdf: Pdf, c: { label: string; text: string }) {
  const h = calloutHeight(pdf, c);
  const top = pdf.y;
  pdf.rect(MARGIN, top - h + 6, 2.5, h - 8, COLOR.lime);
  pdf.text(c.label, MARGIN + 12, top - 10, { size: 8.6, bold: true });
  pdf.wrap(c.text, 8.6, CONTENT_W - 14).forEach((l, i) => pdf.text(l, MARGIN + 12, top - 22 - i * 11.4, { size: 8.6 }));
  pdf.y -= h;
}

function bandHeight() {
  return 62;
}

function drawBand(pdf: Pdf, kpis: Kpi[]) {
  const h = bandHeight();
  pdf.roundRect(MARGIN, pdf.y - h, CONTENT_W, h, 10, COLOR.forest);
  const kw = (CONTENT_W - 40) / Math.max(kpis.length, 1);
  kpis.forEach((k, i) => {
    const x = MARGIN + 20 + i * kw;
    pdf.text(upper(k.label), x, pdf.y - 22, { size: 6.6, color: COLOR.white, opacity: 0.6 });
    pdf.text(k.value, x, pdf.y - 42, { size: 14, bold: true, color: k.accent ? COLOR.lime : COLOR.white });
  });
  pdf.y -= h;
}

// ---- Tables ---------------------------------------------------------------------------------

const T_SIZE = 8.2;
const T_LINE = 10.6;
const T_SUB = 7;
const T_SUB_LINE = 9;

function colWidths(table: Table): number[] {
  const sum = table.widths.reduce((a, b) => a + b, 0);
  return table.widths.map((w) => (w / sum) * CONTENT_W);
}

function cellLines(pdf: Pdf, cell: TableCell, w: number) {
  return { main: pdf.wrap(cell.text, T_SIZE, w - 8, cell.strong), sub: cell.sub ? pdf.wrap(cell.sub, T_SUB, w - 8) : [] };
}

function rowHeight(pdf: Pdf, row: TableCell[], widths: number[]): number {
  let h = 0;
  row.forEach((cell, i) => {
    const l = cellLines(pdf, cell, widths[i]);
    h = Math.max(h, l.main.length * T_LINE + l.sub.length * T_SUB_LINE);
  });
  return h + 10;
}

function headHeight(table: Table) {
  return table.head.length ? 20 : 0;
}

function drawHead(pdf: Pdf, table: Table, widths: number[]) {
  if (!table.head.length) return;
  let x = MARGIN;
  table.head.forEach((h, i) => {
    const st = { size: 6.6, bold: true, opacity: 0.55 };
    if (table.right?.includes(i)) pdf.textRight(upper(h), x + widths[i], pdf.y - 12, st);
    else pdf.text(upper(h), x, pdf.y - 12, st);
    x += widths[i];
  });
  pdf.y -= 20;
  pdf.rule(MARGIN, MARGIN + CONTENT_W, pdf.y);
}

function drawRow(pdf: Pdf, table: Table, row: TableCell[], widths: number[], h: number) {
  let x = MARGIN;
  row.forEach((cell, i) => {
    const l = cellLines(pdf, cell, widths[i]);
    const right = table.right?.includes(i);
    let base = pdf.y - 12;
    for (const line of l.main) {
      const st = { size: T_SIZE, bold: cell.strong, opacity: cell.muted ? 0.62 : 1 };
      if (right) pdf.textRight(line, x + widths[i], base, st);
      else pdf.text(line, x, base, st);
      base -= T_LINE;
    }
    for (const line of l.sub) {
      pdf.text(line, x, base + 1, { size: T_SUB, color: cell.warn ? COLOR.warn : COLOR.forest, opacity: cell.warn ? 1 : 0.62 });
      base -= T_SUB_LINE;
    }
    x += widths[i];
  });
  pdf.y -= h;
  pdf.rule(MARGIN, MARGIN + CONTENT_W, pdf.y);
}

/** Rows continue across pages; the header is repeated on each new page. */
function drawTable(pdf: Pdf, table: Table) {
  const widths = colWidths(table);
  drawHead(pdf, table, widths);
  for (const row of table.rows) {
    const h = rowHeight(pdf, row, widths);
    if (pdf.y - h < BOTTOM) {
      pdf.addPage();
      drawHead(pdf, table, widths);
    }
    drawRow(pdf, table, row, widths, h);
  }
}

function tableHeight(pdf: Pdf, table: Table): number {
  const widths = colWidths(table);
  return headHeight(table) + table.rows.reduce((h, r) => h + rowHeight(pdf, r, widths), 0);
}

function notesHeight(pdf: Pdf, notes: string[]) {
  return notes.reduce((h, n) => h + pdf.wrap(n, 8.2, CONTENT_W).length * 10.6 + 3, 6);
}

function drawNotes(pdf: Pdf, notes: string[]) {
  pdf.y -= 6;
  for (const n of notes) {
    for (const line of pdf.wrap(n, 8.2, CONTENT_W)) {
      pdf.text(line, MARGIN, pdf.y - 9, { size: 8.2, opacity: 0.68 });
      pdf.y -= 10.6;
    }
    pdf.y -= 3;
  }
}

function sectionTitle(pdf: Pdf, title: string, gapBefore: number) {
  pdf.y -= gapBefore;
  pdf.text(upper(title), MARGIN, pdf.y - 8, { size: 7.6, bold: true });
  pdf.y -= 18;
}

function sectionHeight(pdf: Pdf, s: DossierSection): number {
  let h = 28 + 18;
  if (s.columns) h += columnsHeight(pdf, s.columns);
  if (s.band) h += bandHeight() + 10;
  if (s.table) h += tableHeight(pdf, s.table);
  if (s.notes?.length) h += notesHeight(pdf, s.notes);
  if (s.callouts?.length) h += (s.calloutsTitle ? 22 : 10) + s.callouts.reduce((a, c) => a + calloutHeight(pdf, c), 0);
  return h;
}

function drawSection(pdf: Pdf, s: DossierSection) {
  const h = sectionHeight(pdf, s);
  // «break-inside: avoid» as in the prototype, unless the section is taller than a page.
  if (pdf.y - h < BOTTOM && h <= TOP - BOTTOM) pdf.addPage();
  sectionTitle(pdf, s.title, pdf.y === TOP ? 0 : 28);
  if (s.columns) drawColumns(pdf, s.columns);
  if (s.band) {
    drawBand(pdf, s.band);
    pdf.y -= 10;
  }
  if (s.table) drawTable(pdf, s.table);
  if (s.notes?.length) drawNotes(pdf, s.notes);
  if (s.callouts?.length) {
    pdf.y -= 10;
    if (s.calloutsTitle) {
      pdf.text(upper(s.calloutsTitle), MARGIN, pdf.y - 6, { size: 6.8, bold: true, opacity: 0.55 });
      pdf.y -= 12;
    }
    for (const c of s.callouts) {
      pdf.ensure(calloutHeight(pdf, c));
      drawCallout(pdf, c);
    }
  }
}

// ---- Annex ----------------------------------------------------------------------------------

function drawAnnex(pdf: Pdf, a: DossierModel["annex"]) {
  pdf.addPage();
  pdf.rect(MARGIN, pdf.y - 3, 32, 2.5, COLOR.lime);
  pdf.y -= 16;
  for (const line of pdf.wrap(a.title, 20, CONTENT_W, true)) {
    pdf.text(line, MARGIN, pdf.y - 18, { size: 20, bold: true });
    pdf.y -= 24;
  }
  pdf.y -= 4;
  for (const line of pdf.wrap(a.intro, 9, CONTENT_W * 0.9)) {
    pdf.text(line, MARGIN, pdf.y - 9, { size: 9, opacity: 0.68 });
    pdf.y -= 12;
  }
  pdf.y -= 8;

  for (const g of a.groups) {
    const widths = colWidths(g.table);
    const first = g.table.rows[0] ? rowHeight(pdf, g.table.rows[0], widths) : 0;
    pdf.ensure(22 + headHeight(g.table) + first);
    pdf.y -= 12;
    pdf.text(upper(g.title), MARGIN, pdf.y - 6, { size: 7.6, bold: true });
    pdf.y -= 10;
    drawTable(pdf, g.table);
  }

  // Vollständigkeit
  const noteLines = pdf.wrap(a.completeness.note, 8.2, CONTENT_W * 0.46);
  const h = Math.max(60, noteLines.length * 10.6 + 30);
  pdf.ensure(h + 22);
  pdf.y -= 22;
  pdf.roundRect(MARGIN, pdf.y - h, CONTENT_W, h, 10, COLOR.forest);
  pdf.text(upper(a.completeness.label), MARGIN + 20, pdf.y - 22, { size: 6.6, color: COLOR.white, opacity: 0.6 });
  pdf.text(a.completeness.value, MARGIN + 20, pdf.y - 42, { size: 14, bold: true, color: COLOR.lime });
  noteLines.forEach((l, i) => pdf.textRight(l, MARGIN + CONTENT_W - 20, pdf.y - 22 - i * 10.6, { size: 8.2, color: COLOR.white, opacity: 0.72 }));
  pdf.y -= h;
}

// ---- Running header and footer --------------------------------------------------------------

function drawFrame(pdf: Pdf, m: DossierModel) {
  const total = pdf.pages.length;
  pdf.pages.forEach((page, i) => {
    pdf.page = page;
    pdf.text("HYPOTEQ", MARGIN, PAGE_H - 40, { size: 10.5, bold: true });
    const right = upper(m.header.right);
    const maxW = CONTENT_W - 90;
    const fitted = pdf.wrap(right, 6.8, maxW)[0] ?? "";
    pdf.textRight(fitted, MARGIN + CONTENT_W, PAGE_H - 39, { size: 6.8, opacity: 0.6 });
    pdf.rule(MARGIN, MARGIN + CONTENT_W, PAGE_H - 48);

    pdf.rule(MARGIN, MARGIN + CONTENT_W, 46);
    const st = { size: 6.8, opacity: 0.5 };
    pdf.text(upper(m.footer.left), MARGIN, 34, st);
    const pageLabel = upper(interpolate(m.footer.page, { n: i + 1, total }));
    pdf.text(pageLabel, MARGIN + CONTENT_W / 2 - pdf.width(pageLabel, 6.8) / 2, 34, st);
    pdf.textRight(upper(m.footer.right), MARGIN + CONTENT_W, 34, st);
  });
}

export interface RenderOptions {
  /** Creation date written into the PDF metadata. */
  date?: Date;
}

export async function renderDossierPdf(m: DossierModel, opts: RenderOptions = {}): Promise<Uint8Array> {
  const pdf = await Pdf.create();
  const when = opts.date ?? new Date();
  pdf.doc.setTitle(pdf.safe(m.documentTitle));
  pdf.doc.setAuthor("HYPOTEQ AG");
  pdf.doc.setCreator("HYPOTEQ Funnel");
  pdf.doc.setProducer("HYPOTEQ Funnel");
  pdf.doc.setLanguage(m.lang);
  pdf.doc.setCreationDate(when);
  pdf.doc.setModificationDate(when);

  drawCover(pdf, m.cover);
  for (const s of m.sections) drawSection(pdf, s);
  drawAnnex(pdf, m.annex);
  drawFrame(pdf, m);
  return pdf.doc.save();
}
