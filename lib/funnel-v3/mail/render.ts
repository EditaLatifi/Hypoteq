/**
 * The v5 closing mail as HTML (Handover 7.2): one layout for the three recipients, filled from
 * a CaseSummary. Pure — the subject and the HTML, so the blocks can be tested without a mailbox.
 *
 *    1 Kopf             wordmark, Anfrage-Nr., Datum, erfasst von
 *      (intern)         Salesforce: link to the Case, or «Sync fehlgeschlagen» (Handover 7.1)
 *      greeting / intro
 *    2 Nächster Schritt only when it applies: the Auskunftsermächtigung (attached for the
 *                       customer, upload link) and / or the missing documents with the link back
 *    3–9                the summary blocks (summary.ts)
 *   10 Fuss             contact (the Berater for a Berater case, else HYPOTEQ), link to the request
 *
 * Inline styles and tables only: mail clients ignore most of CSS. Every value is escaped.
 */

import { interpolate, translate, type Params } from "../i18n";
import { signatureReviewNote } from "../signature";
import type { CaseSummary, SummaryBlock, SummaryRow } from "./summary";
import { closingSubject } from "./summary";
import { MAIL_FOOTER, MAIL_TEXTS, type Audience, type MailTexts } from "./texts";

export interface SalesforceOutcome {
  caseId: string | null;
  /** Lightning link to the Case (caseLink.ts); null when not known. */
  url: string | null;
  /** The sync threw: the Case is missing. */
  failed: boolean;
  /** HYPOTEQ_TEST_MODE: the sync was skipped on purpose. */
  testMode: boolean;
  /** Fields Salesforce did not take (writeWithFieldFallback). */
  dropped: string[];
}

export interface RenderContext {
  /** The inquiry's Nachreich link: upload, state of the dossier. */
  returnUrl: string | null;
  /** Validity of that link in days. */
  linkDays: number;
  /** The Auskunftsermächtigung attached to this mail (customer, signature pending). */
  attachmentName?: string | null;
  /** Internal mail only. */
  salesforce?: SalesforceOutcome;
  inquiryId?: string;
  folderUrl?: string | null;
  dossierUrl?: string | null;
}

export interface RenderedMail {
  subject: string;
  html: string;
}

const C = {
  forest: "#132219",
  lime: "#CAF476",
  muted: "#5f6b63",
  rule: "#e3e8e0",
  warn: "#a86800",
  ok: "#2f6b1f",
  bad: "#b42318",
  page: "#f5f5f5",
};

export const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

function button(href: string, label: string): string {
  return `<p style="margin:16px 0 4px 0;"><a href="${esc(href)}" style="background:${C.forest};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:600;display:inline-block;">${esc(label)}</a></p>`;
}

function mark(row: SummaryRow, lang: CaseSummary["lang"]): string {
  if (!row.fromDoc) return "";
  const base = translate(lang, row.fromDoc.unsure ? "fast.fromDocUnsure" : "chip.fromDoc");
  const text = row.fromDoc.doc ? `${base} · ${row.fromDoc.doc}` : base;
  return `<div style="font-size:11px;line-height:1.4;color:${C.muted};margin-top:2px;">${esc(text)}</div>`;
}

function rowHtml(row: SummaryRow, lang: CaseSummary["lang"]): string {
  const value = esc(row.value).replace(/\n/g, "<br>");
  return `<tr>
      <td style="padding:7px 12px 7px 0;border-bottom:1px solid ${C.rule};vertical-align:top;width:42%;color:${C.muted};font-size:13px;">${esc(row.label)}</td>
      <td style="padding:7px 0;border-bottom:1px solid ${C.rule};vertical-align:top;font-size:13px;${row.strong ? "font-weight:600;" : ""}">${value}${row.note ? `<div style="font-size:11px;color:${C.muted};margin-top:2px;">${esc(row.note)}</div>` : ""}${mark(row, lang)}</td>
    </tr>`;
}

function sectionTitle(title: string): string {
  return `<div style="margin:26px 0 8px 0;padding-bottom:6px;border-bottom:2px solid ${C.lime};font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${C.forest};">${esc(title)}</div>`;
}

function blockHtml(block: SummaryBlock, lang: CaseSummary["lang"]): string {
  if (block.id === "result") {
    // The result as a dark band, like the funnel's live calculation.
    const cells = block.groups[0].rows
      .map(
        (r) => `<td style="padding:14px 16px;vertical-align:top;">
          <div style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;opacity:0.65;">${esc(r.label)}</div>
          <div style="font-size:17px;font-weight:700;color:${C.lime};margin-top:4px;">${esc(r.value)}</div>
        </td>`
      )
      .join("");
    return `${sectionTitle(block.title)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.forest};border-radius:10px;border-collapse:separate;"><tr>${cells}</tr></table>`;
  }
  const body = block.groups
    .map(
      (g) => `${g.title ? `<div style="margin:14px 0 2px 0;font-size:13px;font-weight:600;color:${C.forest};">${esc(g.title)}</div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${g.rows.map((r) => rowHtml(r, lang)).join("")}</table>`
    )
    .join("");
  return sectionTitle(block.title) + body;
}

/** The customer mail lists at most this many missing documents; the rest are behind the link (HYPOTEQ 20.10.2026). */
const CUSTOMER_MISSING_MAX = 5;

function docsHtml(s: CaseSummary): string {
  if (!s.docs.total) return "";
  // HYPOTEQ 20.10.2026: the customer mail keeps only «X von Y Anforderungen erfüllt»; the
  // footer's «Zur Anfrage» button follows. Berater and intern keep the full list.
  if (s.audience === "kunde") {
    return `${sectionTitle(s.docs.title)}
    <div style="font-size:14px;font-weight:600;">${esc(s.docs.line)}</div>`;
  }
  const groups = s.docs.groups
    .map(
      (g) => `<div style="margin:12px 0 2px 0;font-size:13px;font-weight:600;">${esc(g.title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${g.lines
      .map(
        (l) => `<tr>
        <td style="padding:6px 12px 6px 0;border-bottom:1px solid ${C.rule};font-size:13px;">${esc(l.label)}</td>
        <td style="padding:6px 0;border-bottom:1px solid ${C.rule};font-size:13px;text-align:right;white-space:nowrap;color:${l.warn ? C.warn : l.state === "ok" ? C.ok : C.muted};">${esc(l.stateLabel)}</td>
      </tr>`
      )
      .join("")}</table>`
    )
    .join("");
  return `${sectionTitle(s.docs.title)}
    <div style="font-size:14px;font-weight:600;">${esc(s.docs.line)}</div>
    ${groups}`;
}

function callout(inner: string, color = C.lime): string {
  return `<div style="margin:18px 0;padding:14px 16px;border-left:4px solid ${color};background:#f7faf2;border-radius:6px;">${inner}</div>`;
}

/** Block 2: the Auskunftsermächtigung and the missing documents, worded per recipient. */
function nextStepHtml(s: CaseSummary, ctx: RenderContext, T: MailTexts): string {
  const t = (key: string, params?: Params) => translate(s.lang, key, params);
  const parts: string[] = [];
  const customer = s.customer.name || s.customer.email;
  // HYPOTEQ 19.10. E.4: submitted anyway over the AI's verdict — internally only, as a note.
  if (s.audience === "intern" && s.signature.override) {
    const note = signatureReviewNote(s.signature.aiProblems ?? [], s.lang);
    parts.push(callout(`<div style="font-size:15px;font-weight:700;color:${C.warn};">${esc(T.signReviewTitle)}</div><div style="font-size:14px;margin-top:6px;">${esc(note)}</div>`, C.warn));
  }
  if (s.next.signature) {
    if (s.audience === "intern") {
      // German: signature.ts's note, the same sentence the Case JSON carries; else its translation.
      const note = s.lang === "de" && s.signature.note ? s.signature.note : T.signIntern;
      parts.push(callout(`<div style="font-size:15px;font-weight:700;color:${C.bad};">${esc(T.signTitleIntern)}</div><div style="font-size:14px;margin-top:6px;">${esc(note)}</div>`, C.bad));
    } else {
      const text = s.audience === "kunde" ? T.signKunde : interpolate(T.signBerater, { name: customer });
      const attachment = s.audience === "kunde" && ctx.attachmentName ? `<div style="font-size:12px;color:${C.muted};margin-top:8px;">📎 ${esc(interpolate(T.attachment, { file: ctx.attachmentName }))}</div>` : "";
      parts.push(
        callout(
          `<div style="font-size:15px;font-weight:700;">${esc(t("mail.next.sign"))}</div>
          <div style="font-size:14px;margin-top:6px;">${esc(text)}</div>${attachment}${ctx.returnUrl ? button(ctx.returnUrl, T.signCta) : ""}`
        )
      );
    }
  }
  if (s.next.missing.length) {
    const shown = s.audience === "kunde" ? s.next.missing.slice(0, CUSTOMER_MISSING_MAX) : s.next.missing;
    const more = s.next.missing.length - shown.length;
    const moreLine = more > 0 ? `<div style="font-size:14px;margin-top:4px;">${esc(more === 1 ? T.missingMoreOne : interpolate(T.missingMore, { n: more }))}</div>` : "";
    const list = `<ul style="margin:8px 0 0 0;padding-left:20px;font-size:14px;">${shown.map((m) => `<li style="margin-bottom:3px;">${esc(m)}</li>`).join("")}</ul>${moreLine}`;
    const hint = s.audience === "kunde" ? T.missingKunde : s.audience === "berater" ? T.missingBerater : "";
    const cta = s.audience === "intern" || !ctx.returnUrl ? "" : button(ctx.returnUrl, s.audience === "kunde" ? T.missingCtaKunde : T.missingCtaBerater);
    const note = cta ? `<div style="font-size:12px;color:${C.muted};margin-top:6px;">${esc(interpolate(T.linkNote, { days: ctx.linkDays }))}</div>` : "";
    parts.push(
      callout(
        `<div style="font-size:15px;font-weight:700;">${esc(t("mail.next.missing"))}</div>${list}${hint ? `<div style="font-size:14px;margin-top:8px;">${esc(hint)}</div>` : ""}${cta}${note}`,
        C.warn
      )
    );
  }
  return parts.join("");
}

/** Internal mail: the Case in Salesforce, or why there is none (Handover 7.1). */
function salesforceHtml(s: CaseSummary, ctx: RenderContext, T: MailTexts): string {
  const sf = ctx.salesforce;
  const L = T.labels;
  const lines: string[] = [];
  if (sf) {
    if (sf.failed) lines.push(`<div style="font-size:14px;font-weight:700;color:${C.bad};">${esc(interpolate(T.sfFailed, { id: ctx.inquiryId ?? "–" }))}</div>`);
    else if (sf.testMode) lines.push(`<div style="font-size:14px;">${esc(T.sfTest)}</div>`);
    else if (sf.url) lines.push(button(sf.url, T.sfOpen));
    else if (sf.caseId) lines.push(`<div style="font-size:14px;">${esc(interpolate(T.sfNoLink, { caseId: sf.caseId }))}</div>`);
    if (!sf.failed && sf.dropped.length) lines.push(`<div style="font-size:12px;color:${C.warn};margin-top:6px;">${esc(interpolate(T.sfDropped, { list: sf.dropped.join(", ") }))}</div>`);
  }
  const links: string[] = [];
  if (ctx.folderUrl) links.push(`<a href="${esc(ctx.folderUrl)}" style="color:${C.forest};">${esc(L.folder)}</a>`);
  if (ctx.dossierUrl) links.push(`<a href="${esc(ctx.dossierUrl)}" style="color:${C.forest};">${esc(L.dossier)}</a>`);
  if (ctx.returnUrl) links.push(`<a href="${esc(ctx.returnUrl)}" style="color:${C.forest};">${esc(L.uploadPage)}</a>`);
  if (links.length) lines.push(`<div style="font-size:13px;margin-top:8px;">${links.join(" · ")}</div>`);
  if (ctx.inquiryId) lines.push(`<div style="font-size:12px;color:${C.muted};margin-top:6px;">${esc(L.inquiryId)}: <code>${esc(ctx.inquiryId)}</code></div>`);
  if (!lines.length) return "";
  return callout(`<div style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${C.muted};margin-bottom:4px;">${esc(L.salesforceCase)}</div>${lines.join("")}`, sf?.failed ? C.bad : C.lime);
}

// HYPOTEQ Mail-Texte 20.10.2026: M1 one intro for every customer (who entered the request stands
// in the head and under «Dein Berater»), M2 «Guten Tag {Berater}» in «Sie», M3 entry and submitter.
function introHtml(s: CaseSummary, T: MailTexts): string {
  const greetingHtml = (g: string) => `<p style="font-size:17px;font-weight:600;margin:22px 0 6px 0;">${esc(g)}</p>`;
  if (s.audience === "kunde") {
    const greeting = interpolate(T.greeting, { name: s.customer.greetingName }).replace(" ,", ",");
    return `${greetingHtml(greeting)}
    <p style="font-size:14px;line-height:1.7;margin:0 0 4px 0;">${esc(T.introKunde)}</p>`;
  }
  if (s.audience === "berater") {
    const name = s.berater?.name.trim();
    const greeting = name ? interpolate(T.greetingBerater, { name }) : T.greetingBeraterNoName;
    const text = [
      interpolate(T.introBerater, { name: s.customer.name || "–" }),
      s.customer.email ? interpolate(T.introBeraterSent, { email: s.customer.email }) : "",
      T.introBeraterOverview,
    ]
      .filter(Boolean)
      .join(" ");
    return `${greetingHtml(greeting)}
    <p style="font-size:14px;line-height:1.7;margin:0 0 4px 0;">${esc(text)}</p>`;
  }
  const by = s.role === "berater" ? interpolate(T.internByBerater, { name: s.berater?.name || s.berater?.email || "–" }) : T.internOwn;
  const text = interpolate(T.introIntern, { entry: s.channel === "chat" ? T.internChat : s.mode === "schnell" ? T.internFast : T.internGuided, by });
  return `<p style="font-size:14px;line-height:1.7;margin:22px 0 4px 0;">${esc(text)}</p>`;
}

function footerHtml(s: CaseSummary, ctx: RenderContext, T: MailTexts): string {
  const out: string[] = [];
  if (s.audience !== "intern" && ctx.returnUrl) {
    const intro = s.audience === "kunde" ? T.linkIntro : "";
    out.push(`<div style="margin-top:26px;">${intro ? `<div style="font-size:14px;">${esc(intro)}</div>` : ""}${button(ctx.returnUrl, T.linkCta)}</div>`);
  }
  if (s.audience === "kunde" && s.berater && (s.berater.name || s.berater.email)) {
    const b = s.berater;
    out.push(`<div style="margin-top:22px;font-size:13px;line-height:1.6;">
      <div style="font-weight:600;">${esc(T.yourAdvisor)}</div>
      ${[b.name, b.firma, b.email, b.phone].filter(Boolean).map((x) => `<div>${esc(x)}</div>`).join("")}
    </div>`);
  }
  if (s.audience === "intern") {
    out.push(`<div style="margin-top:26px;font-size:12px;color:${C.muted};">${esc(T.autoIntern)}</div>`);
  } else {
    const kunde = s.audience === "kunde";
    out.push(`<div style="margin-top:26px;padding-top:16px;border-top:2px solid ${C.lime};font-size:14px;">
      <div>${esc(kunde ? T.questions : T.closingBerater)}</div>
      <div style="margin-top:10px;">${esc(kunde ? T.signoff : T.signoffBerater)}</div>
      <div style="font-weight:600;margin-top:8px;">${esc(kunde ? T.team : T.teamBerater)}</div>
      <div style="margin-top:12px;font-size:12px;color:${C.muted};line-height:1.6;">${esc(MAIL_FOOTER)}</div>
    </div>`);
  }
  return out.join("");
}

export function renderClosingMail(s: CaseSummary, ctx: RenderContext): RenderedMail {
  const T: MailTexts = MAIL_TEXTS[s.lang] ?? MAIL_TEXTS.de;
  const L = T.labels;
  const subject = closingSubject(s.audience, s.lang, s.caseNumber, s.customer.name, s.place);
  const head = [s.caseNumber ? `${L.caseNo} ${s.caseNumber}` : "", `${L.date} ${s.date}`, s.submitter].filter(Boolean);

  const html = `<!DOCTYPE html>
<html lang="${s.lang}">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:20px 12px;background:${C.page};font-family:${FONT};color:${C.forest};">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:10px;padding:32px 28px;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid ${C.lime};">
      <tr>
        <td style="padding-bottom:14px;vertical-align:bottom;">
          <img src="https://www.hypoteq.com/images/HYPOTEQ_layout_logo.png" alt="HYPOTEQ" width="140" style="display:block;width:140px;height:auto;border:0;" />
        </td>
        <td style="padding-bottom:14px;vertical-align:bottom;text-align:right;font-size:12px;color:${C.muted};line-height:1.6;">${head.map((h) => `<div>${esc(h)}</div>`).join("")}</td>
      </tr>
    </table>
    ${s.audience === "intern" ? salesforceHtml(s, ctx, T) : ""}
    ${introHtml(s, T)}
    ${nextStepHtml(s, ctx, T)}
    ${s.audience === "kunde" ? `<p style="font-size:14px;margin:18px 0 0 0;">${esc(T.summaryIntro)}</p>` : ""}
    ${s.blocks.map((b) => blockHtml(b, s.lang)).join("")}
    ${docsHtml(s)}
    ${footerHtml(s, ctx, T)}
  </div>
  <div style="max-width:640px;margin:14px auto 0 auto;text-align:center;font-size:11px;color:#888888;">© ${new Date().getFullYear()} HYPOTEQ AG – ${esc(T.rights)}</div>
</body>
</html>`;
  return { subject, html };
}

export type { Audience };
