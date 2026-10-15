import type { SpecialDict } from "@/lib/portal/i18n/special";

/**
 * Spezialfinanzierung (handoff 14.10.2026, «Spezialfinanzierung (neu)»): the wizard's
 * answers, its step rules and their server-side twin. Pure and client-safe: the wizard and
 * the server action validate with the same functions, so the browser can never be more
 * lenient than the server. Rules from the prototype (`sfValid` in source/…dc.html).
 */

export const SPECIAL_TYPES = ["mezzanine", "bauprojekt", "rendite", "gewerbe", "ueberbrueckung", "andere"] as const;
export type SpecialType = (typeof SPECIAL_TYPES)[number];

export const CUSTOMER_KINDS = ["privat", "firma"] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const TIMEFRAMES = ["asap", "1-3", "3-6", "later"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const STEP_COUNT = 5;
export const DOCS_STEP = 3;
export const REVIEW_STEP = 4;

export const SPECIAL_MAX_FILE_BYTES = 20 * 1024 * 1024;
// XLS as well as XLSX: the prototype's check (/\.(pdf|jpe?g|png|xlsx?)$/) accepts both.
export const SPECIAL_ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "xlsx", "xls"];
export const SPECIAL_ACCEPT = SPECIAL_ALLOWED_EXT.map((e) => `.${e}`).join(",");
export const SPECIAL_MAX_FILES = 20;
// What SharePoint reports for those extensions. octet-stream: a browser or Graph that
// could not tell; the extension has been checked by then.
const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
];

export const MIN_NAME = 2;
export const MIN_DESCRIPTION = 20;
export const MIN_AMOUNT_DIGITS = 4;
// PortalSpecialRequest.amount is a 32-bit Int.
export const MAX_AMOUNT = 2_147_483_647;

export const LIMITS = {
  kunde: 160,
  ort: 120,
  kontakt: 160,
  eigenmittel: 60,
  betrag: 20,
  objekt: 200,
  beschreibung: 5000,
} as const;

export type SpecialAnswers = {
  type: SpecialType | "";
  kundeTyp: CustomerKind;
  kunde: string;
  ort: string;
  kontakt: string;
  eigenmittel: string;
  betrag: string;
  objekt: string;
  zeitrahmen: Timeframe;
  beschreibung: string;
};

export type ValidSpecialAnswers = SpecialAnswers & { type: SpecialType };

export const EMPTY_ANSWERS: SpecialAnswers = {
  type: "",
  kundeTyp: "privat",
  kunde: "",
  ort: "",
  kontakt: "",
  eigenmittel: "",
  betrag: "",
  objekt: "",
  zeitrahmen: "1-3",
  beschreibung: "",
};

export type SpecialError = keyof SpecialDict["err"];

export function isSpecialType(v: unknown): v is SpecialType {
  return typeof v === "string" && (SPECIAL_TYPES as readonly string[]).includes(v);
}

export function amountDigits(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

/** «2'500'000», «CHF 2 500 000.–» → 2500000. Null when there are no digits. */
export function parseAmount(raw: string): number | null {
  const d = amountDigits(raw);
  if (!d) return null;
  const n = Number(d);
  return Number.isSafeInteger(n) ? n : null;
}

/** Swiss format with apostrophes: 2500000 → «CHF 2'500'000». */
export function formatChfAmount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return `CHF ${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
}

/**
 * The optional «Eigenmittel» is free text («CHF 400'000», «ca. 30 %»). Only a plain amount
 * becomes a number for Salesforce; everything else stays text in the description.
 */
export function parseEigenmittel(raw: string): number | null {
  const s = (raw || "").replace(/chf|fr\.?/gi, "").replace(/[\s'’.,–-]/g, "");
  if (!/^\d{4,12}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= MAX_AMOUNT ? n : null;
}

const oneLine = (v: unknown, max: number) =>
  (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, max + 1);

function textBlock(v: unknown, max: number): string {
  return (typeof v === "string" ? v : "").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").trim().slice(0, max + 1);
}

/** Whatever arrives (form state, a server action argument) as clean answers. */
export function normalizeAnswers(raw: unknown): SpecialAnswers {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    type: isSpecialType(r.type) ? r.type : "",
    kundeTyp: r.kundeTyp === "firma" ? "firma" : "privat",
    kunde: oneLine(r.kunde, LIMITS.kunde),
    ort: oneLine(r.ort, LIMITS.ort),
    kontakt: oneLine(r.kontakt, LIMITS.kontakt),
    eigenmittel: oneLine(r.eigenmittel, LIMITS.eigenmittel),
    betrag: oneLine(r.betrag, LIMITS.betrag),
    objekt: oneLine(r.objekt, LIMITS.objekt),
    zeitrahmen: (TIMEFRAMES as readonly string[]).includes(r.zeitrahmen as string) ? (r.zeitrahmen as Timeframe) : "1-3",
    beschreibung: textBlock(r.beschreibung, LIMITS.beschreibung),
  };
}

function tooLong(a: SpecialAnswers, fields: (keyof typeof LIMITS)[]): boolean {
  return fields.some((f) => a[f].length > LIMITS[f]);
}

/**
 * What stops each step: 0 Art · 1 Endkunde · 2 Vorhaben · 3 Dokumente (optional) · 4 Prüfen.
 * Null where the step is complete.
 */
export function stepErrors(a: SpecialAnswers, ack: boolean): (SpecialError | null)[] {
  const amount = parseAmount(a.betrag);
  const digits = amountDigits(a.betrag).length;
  return [
    a.type ? null : "type",
    a.kunde.trim().length < MIN_NAME ? "kunde" : tooLong(a, ["kunde", "ort", "kontakt", "eigenmittel"]) ? "tooLong" : null,
    digits < MIN_AMOUNT_DIGITS
      ? "betrag"
      : amount == null || amount > MAX_AMOUNT
        ? "betragHigh"
        : a.beschreibung.trim().length < MIN_DESCRIPTION
          ? "text"
          : tooLong(a, ["betrag", "objekt", "beschreibung"])
            ? "tooLong"
            : null,
    null,
    ack ? null : "ack",
  ];
}

/**
 * The furthest step the stepper may jump to: every step before it is valid. «Man kann nur
 * auf bereits gültige Schritte zurückspringen» — the prototype's `reach`.
 */
export function reachableStep(a: SpecialAnswers, ack: boolean): number {
  const first = stepErrors(a, ack).findIndex((e) => e !== null);
  return first < 0 ? REVIEW_STEP : first;
}

export type SpecialValidation =
  | { ok: true; answers: ValidSpecialAnswers; amount: number }
  | { ok: false; error: SpecialError; step: number };

/** The server's check before anything is stored or sent. */
export function validateSpecial(rawAnswers: unknown, rawAck: unknown): SpecialValidation {
  const answers = normalizeAnswers(rawAnswers);
  const errors = stepErrors(answers, rawAck === true);
  const step = errors.findIndex((e) => e !== null);
  if (step >= 0) return { ok: false, error: errors[step]!, step };
  return { ok: true, answers: answers as ValidSpecialAnswers, amount: parseAmount(answers.betrag)! };
}

export function fileExt(name: string): string {
  const i = (name || "").lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** Why a file may not be attached, or null. The MIME type is checked where it is known. */
export function fileProblem(name: string, size: number, mime?: string | null): "type" | "size" | null {
  if (!SPECIAL_ALLOWED_EXT.includes(fileExt(name))) return "type";
  if (mime && !ALLOWED_MIME.includes(mime.toLowerCase())) return "type";
  if (!(size > 0) || size > SPECIAL_MAX_FILE_BYTES) return "size";
  return null;
}

export function formatFileSize(bytes: number): string {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** «Spezialfinanzierung · Mezzanine-Finanzierung» — the Case's Art in the portal. */
export function specialArt(t: SpecialDict, type: SpecialType): string {
  return t.art(t.types[type].short);
}

/** The review step's facts; also the confirmation page and (in German) the team mail. */
export function summaryRows(t: SpecialDict, a: SpecialAnswers, fileCount: number): { k: string; v: string }[] {
  const kunde = a.kunde.trim() || "–";
  return [
    { k: t.sum.art, v: a.type ? t.types[a.type].label : "–" },
    { k: t.sum.kunde, v: `${kunde} · ${t.kinds[a.kundeTyp]}` },
    { k: t.sum.ort, v: a.ort || "–" },
    { k: t.sum.kontakt, v: a.kontakt || "–" },
    { k: t.sum.betrag, v: amountDigits(a.betrag) ? formatChfAmount(parseAmount(a.betrag)) : "–" },
    { k: t.sum.eigen, v: a.eigenmittel || "–" },
    { k: t.sum.objekt, v: a.objekt || "–" },
    { k: t.sum.zeit, v: t.zeitOpts[a.zeitrahmen] },
    { k: t.sum.docs, v: t.files(fileCount) },
  ];
}

/** Short reference shown to the partner and in the team mail: «SP-3F9A1C». */
export function specialRef(id: string): string {
  return `SP-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
