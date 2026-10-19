/**
 * What goes into the prefilled Auskunftsermächtigung (Handover 6 «vorausgefüllt mit
 * Vollmachtgeber, Geburtsdatum, Adresse, Objekt und Zweck (aus Funnel und Dokumenten)»), and the
 * file name. Pure and browser-safe: the closing step, the Nachreich page, the PDF route, the
 * reminders and the confirmation mail all derive the data here; ./authorization.ts draws it.
 *
 * From the funnel answers (DECISIONS V33):
 *  - Vollmachtgeber: Kreditnehmer 1 (step-1 contact, with the e-mail and the ID's birth date)
 *    and Kreditnehmer 2 (name only); at a juristische Person the zeichnungsberechtigte Person,
 *    with the company named in the line under the title.
 *  - Adresse / PLZ-Ort: the funnel does not ask for the home address. It is prefilled only at an
 *    Ablösung of a selbstbewohnte Liegenschaft (also «Vermietet & teilweise selbstbewohnt», V58),
 *    where the object is the home (Grundbuch address, else PLZ/Ort of step 2), for Kreditnehmer 1.
 *    Otherwise it is written by hand.
 *  - Objekt: the Grundbuch address, else PLZ and Ort. Zweck: the Kreditantrag.
 */

import type { AuthorizationData, AuthorizationSigner } from "./authorization";
import { isLang, type Lang } from "./i18n";
import { effectiveBorrowers, splitFullName } from "./requirements";
import { isOwnerOccupiedNutzung, type Answers, type Borrower, type DocInfo, type Texts } from "./types";

/** Longest value accepted per field (route input). A form field holds ~40 characters. */
export const MAX_FIELD_CHARS = 200;

const clean = (v: unknown, max = MAX_FIELD_CHARS): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const orNull = (s: string) => (s ? s : null);

/** TT.MM.JJJJ from «JJJJ-MM-TT», «T.M.JJJJ» or «TT.MM.JJJJ»; anything else as given. */
export function swissDate(v: string | null | undefined): string {
  const s = (v || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[3].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[1]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[3]}`;
  return s;
}

function signerOf(raw: any): AuthorizationSigner | null {
  if (!raw || typeof raw !== "object") return null;
  const s: AuthorizationSigner = {
    vor: clean(raw.vor),
    nach: clean(raw.nach),
    adresse: orNull(clean(raw.adresse)),
    plzOrt: orNull(clean(raw.plzOrt)),
    email: orNull(clean(raw.email)),
    geburtsdatum: orNull(swissDate(clean(raw.geburtsdatum, 20))),
  };
  return s.vor || s.nach ? s : null;
}

/** Trimmed, length-limited, at most two signers without empty ones; unknown language → de. */
export function normaliseAuthorizationData(raw: Partial<AuthorizationData> | null | undefined): AuthorizationData {
  const r: any = raw && typeof raw === "object" ? raw : {};
  const signers = (Array.isArray(r.signers) ? r.signers : []).slice(0, 4).map(signerOf).filter((s: AuthorizationSigner | null): s is AuthorizationSigner => !!s).slice(0, 2);
  const zweck = r.zweck === "Neue Hypothek" || r.zweck === "Ablösung" ? r.zweck : null;
  return {
    lang: isLang(r.lang) ? r.lang : "de",
    signers,
    firma: orNull(clean(r.firma)),
    caseNumber: orNull(clean(r.caseNumber, 40)),
    objekt: orNull(clean(r.objekt)),
    zweck,
  };
}

/** Largest JSON body the PDF route takes (a few names and addresses). */
export const MAX_BODY_BYTES = 8_000;

/** The route's POST body → data, or why not. */
export function parseAuthorizationBody(raw: string): { ok: true; data: AuthorizationData } | { ok: false; status: 400 | 413; error: string } {
  if (raw.length > MAX_BODY_BYTES) return { ok: false, status: 413, error: "Request too large" };
  let body: any;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "Invalid body" };
  if (body.signers !== undefined && !Array.isArray(body.signers)) return { ok: false, status: 400, error: "signers must be a list" };
  if (Array.isArray(body.signers) && body.signers.length > 4) return { ok: false, status: 400, error: "Too many signers" };
  return { ok: true, data: normaliseAuthorizationData(body) };
}

// ---- File name --------------------------------------------------------------------------------

const BASE_NAME: Record<Lang, string> = {
  de: "HYPOTEQ_Auskunftsermaechtigung",
  en: "HYPOTEQ_Authorisation-for-information",
  fr: "HYPOTEQ_Pouvoir-d-information",
  it: "HYPOTEQ_Procura-per-informazioni",
};

function asciiPart(s: string): string {
  return s
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** «HQ-26-10-000123_HYPOTEQ_Auskunftsermaechtigung_Gerber-Gary.pdf» (company at a JP). */
export function authorizationFileName(data: Pick<AuthorizationData, "lang" | "signers" | "firma" | "caseNumber">): string {
  const lang: Lang = isLang(data.lang) ? data.lang : "de";
  const first = data.signers?.[0];
  const who = asciiPart(data.firma || (first ? [first.nach, first.vor].filter(Boolean).join(" ") : ""));
  const nr = asciiPart(data.caseNumber || "");
  return [nr, BASE_NAME[lang], who].filter(Boolean).join("_") + ".pdf";
}

// ---- From the funnel ---------------------------------------------------------------------------

/** The answers the prefill reads: the funnel store, or an inquiry's stored v3State. */
export interface AuthorizationSource {
  ans: Pick<Answers, "antrag" | "kn" | "nutz">;
  txt: Pick<Texts, "vor" | "nach" | "mail" | "plz" | "ort" | "firma" | "zeichner">;
  borrowers?: Pick<Borrower, "id" | "vor" | "nach">[];
  info?: Pick<DocInfo, "geb" | "adresse">;
}

/** «Etzelstrasse 52, 8820 Wädenswil» → street and «8820 Wädenswil». */
function splitAddress(adresse: string): { street: string; place: string } {
  const m = adresse.match(/^(.*?),\s*(\d{4}\s+.+)$/);
  return m ? { street: m[1].trim(), place: m[2].trim() } : { street: adresse.trim(), place: "" };
}

export function authorizationDataFromState(state: AuthorizationSource, lang: Lang | string, opts: { caseNumber?: string | null } = {}): AuthorizationData {
  const txt = state.txt || ({} as AuthorizationSource["txt"]);
  const info = state.info || {};
  const jp = state.ans?.kn === "Juristische Person";
  const plzOrt = [txt.plz, txt.ort].map((s) => (s || "").trim()).filter(Boolean).join(" ");
  const gb = (info.adresse || "").trim();
  const objekt = gb || plzOrt || null;
  // The owner lives there, also «Vermietet & teilweise selbstbewohnt» (DECISIONS V33, V58).
  const home = !jp && state.ans?.antrag === "Ablösung" && isOwnerOccupiedNutzung(state.ans?.nutz);
  const homeAddress = home ? (gb ? splitAddress(gb) : { street: "", place: plzOrt }) : null;
  const email = (txt.mail || "").trim() || null;

  let signers: AuthorizationSigner[];
  if (jp) {
    const { first, last } = splitFullName(txt.zeichner || "");
    signers = first || last ? [{ vor: first, nach: last, email }] : [];
  } else {
    const list = effectiveBorrowers({ borrowers: (state.borrowers || []) as Borrower[], txt: txt as Texts });
    signers = list
      .slice(0, 2)
      .map((b, i): AuthorizationSigner => ({
        vor: (b.vor || "").trim(),
        nach: (b.nach || "").trim(),
        ...(i === 0
          ? {
              email,
              geburtsdatum: info.geb ? swissDate(info.geb) : null,
              adresse: homeAddress?.street || null,
              plzOrt: homeAddress?.place || null,
            }
          : {}),
      }))
      .filter((s) => s.vor || s.nach);
  }
  return normaliseAuthorizationData({
    lang: (isLang(lang) ? lang : "de") as AuthorizationData["lang"],
    signers,
    firma: jp ? (txt.firma || "").trim() || null : null,
    caseNumber: opts.caseNumber ?? null,
    objekt,
    zweck: state.ans?.antrag ?? null,
  });
}

/** The prefill as label → value rows (the closing block shows what the PDF will carry). */
export function authorizationPreview(data: AuthorizationData): { key: "signers" | "birth" | "address" | "object" | "purpose" | "company"; value: string }[] {
  const out: { key: "signers" | "birth" | "address" | "object" | "purpose" | "company"; value: string }[] = [];
  const names = data.signers.map((s) => [s.vor, s.nach].filter(Boolean).join(" ")).filter(Boolean);
  if (names.length) out.push({ key: "signers", value: names.join(", ") });
  if (data.firma) out.push({ key: "company", value: data.firma });
  const birth = data.signers.map((s) => s.geburtsdatum).filter(Boolean);
  if (birth.length) out.push({ key: "birth", value: birth.join(", ") });
  const s0 = data.signers[0];
  const addr = s0 ? [s0.adresse, s0.plzOrt].filter(Boolean).join(", ") : "";
  if (addr) out.push({ key: "address", value: addr });
  if (data.objekt) out.push({ key: "object", value: data.objekt });
  if (data.zweck) out.push({ key: "purpose", value: data.zweck });
  return out;
}
