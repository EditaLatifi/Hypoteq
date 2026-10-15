import type { SupportDict } from "@/lib/portal/i18n/special";
import type { Tone } from "@/lib/portal/status";

/**
 * Support & Feedback (handoff 14.10.2026): ticket types, statuses and the checks shared by
 * the form and the server action. Pure and client-safe.
 */

export const SUPPORT_TYPES = ["frage", "fehler", "wunsch"] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

export const SUPPORT_STATUSES = ["eingegangen", "in_pruefung", "behoben", "beantwortet"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

// Badge tones as in the prototype's ticket list.
export const SUPPORT_TONE: Record<SupportStatus, Tone> = {
  eingegangen: "neutral",
  in_pruefung: "info",
  behoben: "success",
  beantwortet: "success",
};

export const SUBJECT_MAX = 200;
export const BODY_MAX = 5000;

export function isSupportType(v: unknown): v is SupportType {
  return typeof v === "string" && (SUPPORT_TYPES as readonly string[]).includes(v);
}

export function isSupportStatus(v: unknown): v is SupportStatus {
  return typeof v === "string" && (SUPPORT_STATUSES as readonly string[]).includes(v);
}

export function supportStatusLabel(t: SupportDict, status: string): string {
  return isSupportStatus(status) ? t.statuses[status] : status;
}

export function supportTone(status: string): Tone {
  return isSupportStatus(status) ? SUPPORT_TONE[status] : "neutral";
}

/** Short ticket number shown to the partner and in the mail: «T-3F9A1C». */
export function ticketRef(id: string): string {
  return `T-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** «Technische Angaben mitsenden»: what the browser may tell us. Never case data. */
export type TechInfo = { browser: string; viewport: string; page: string; appVersion?: string };

const SF_ID = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The page the partner came from, as a bare path with record ids masked:
 * «/portal/cases/500AB000001xYzQAAU?x=1» → «/portal/cases/:id». The Case a page shows is
 * case data, and the path alone says enough about where something went wrong.
 */
export function sanitizePagePath(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";
  let path = raw.trim();
  try {
    // Absolute URLs (document.referrer) lose origin, query and hash.
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return "";
  }
  path = path.split(/[?#]/)[0];
  if (!path.startsWith("/")) return "";
  return path
    .split("/")
    .map((seg) => (SF_ID.test(seg) && /\d/.test(seg) ? ":id" : UUID.test(seg) || seg.length > 40 ? ":id" : seg))
    .join("/")
    .slice(0, 200);
}

function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";
}

/** Only the whitelisted keys, as short strings; null when nothing usable arrived. */
export function sanitizeTechInfo(raw: unknown): TechInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const viewport = clip(r.viewport, 20);
  const info: TechInfo = {
    browser: clip(r.browser, 300),
    viewport: /^\d{2,5}\s?[x×]\s?\d{2,5}$/.test(viewport) ? viewport : "",
    page: sanitizePagePath(r.page),
  };
  return info.browser || info.viewport || info.page ? info : null;
}

export type SupportError = keyof SupportDict["err"];

export type SupportInput = { type: SupportType; subject: string; body: string; caseId: string | null; sendTech: boolean; tech: TechInfo | null };

export function validateSupport(raw: unknown): { ok: true; value: SupportInput } | { ok: false; error: SupportError } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!isSupportType(r.type)) return { ok: false, error: "type" };
  const subject = typeof r.subject === "string" ? r.subject.replace(/\s+/g, " ").trim() : "";
  const body = typeof r.body === "string" ? r.body.replace(/\r\n?/g, "\n").trim() : "";
  if (!subject) return { ok: false, error: "subject" };
  if (!body) return { ok: false, error: "body" };
  if (subject.length > SUBJECT_MAX || body.length > BODY_MAX) return { ok: false, error: "tooLong" };
  const caseId = typeof r.caseId === "string" && SF_ID.test(r.caseId) ? r.caseId : null;
  if (typeof r.caseId === "string" && r.caseId && !caseId) return { ok: false, error: "case" };
  const sendTech = r.sendTech === true;
  return { ok: true, value: { type: r.type, subject, body, caseId, sendTech, tech: sendTech ? sanitizeTechInfo(r.tech) : null } };
}
