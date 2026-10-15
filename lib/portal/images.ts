import { prisma } from "@/lib/prisma";
import { isSalesforceId } from "@/lib/portal/salesforce";
import { scopeFor } from "@/lib/portal/scope";
import type { SessionUser } from "@/lib/portal/session";

/**
 * Profile photo and partner logo (handoff 4 «Profil», DECISIONS P1 / P6).
 *
 * Both live in the PortalImage table, served by /api/portal/image/[kind] behind the
 * session — no second storage system, no public URL:
 *   - photo: one per portal user (ownerId = PortalUser.id)
 *   - logo:  one per partner company (ownerId = Salesforce Account Id), so it applies to
 *            every user of that partner
 *
 * Server-only: reads the database.
 */

export type ImageKind = "photo" | "logo";
export const IMAGE_KINDS: ImageKind[] = ["photo", "logo"];

export function isImageKind(v: unknown): v is ImageKind {
  return v === "photo" || v === "logo";
}

/** `v` is updatedAt in ms: callers append `?v=<v>` to the image URL, so a new image is a new URL. */
export type ImageMeta = { photo: { v: number } | null; logo: { v: number; onLight: boolean } | null };

/**
 * The partner company (Salesforce Account) this session shows — whose logo and company
 * documents: the partner's own, or — for an admin using «Als Partner ansehen» — the
 * viewed partner's.
 */
export async function sessionAccountFor(user: SessionUser): Promise<string | null> {
  if (!user.viewingAs) return isSalesforceId(user.sfAccountId) ? user.sfAccountId : null;
  try {
    const scope = await scopeFor(user);
    return isSalesforceId(scope?.accountId) ? scope!.accountId : null;
  } catch (err) {
    console.error("[portal] could not resolve the viewed partner's account", err);
    return null;
  }
}

/** Whose photo this session shows. None while viewing as a partner: the photo is personal. */
export function photoOwnerFor(user: SessionUser): string | null {
  return user.viewingAs ? null : user.id;
}

/**
 * Whether the session has a photo and a logo, and their versions — without the bytes.
 * Used by the portal layout on every page, so it never throws: a database without the
 * PortalImage table yet (prisma/sql/2026-10-15-v5-and-portal.sql not run) just has no images.
 */
export async function imageMeta(user: SessionUser): Promise<ImageMeta> {
  const photoOwner = photoOwnerFor(user);
  const accountId = await sessionAccountFor(user);
  const select = { id: true, updatedAt: true, onLight: true } as const;
  try {
    const [photo, logo] = await Promise.all([
      photoOwner ? prisma.portalImage.findUnique({ where: { kind_ownerId: { kind: "photo", ownerId: photoOwner } }, select }) : null,
      accountId ? prisma.portalImage.findUnique({ where: { kind_ownerId: { kind: "logo", ownerId: accountId } }, select }) : null,
    ]);
    return {
      photo: photo ? { v: photo.updatedAt.getTime() } : null,
      logo: logo ? { v: logo.updatedAt.getTime(), onLight: logo.onLight } : null,
    };
  } catch (err) {
    console.error("[portal] reading image meta failed", err);
    return { photo: null, logo: null };
  }
}

/** The image this session sees for `kind`, with its bytes — for the image route. */
export async function loadImage(user: SessionUser, kind: ImageKind) {
  const ownerId = kind === "photo" ? photoOwnerFor(user) : await sessionAccountFor(user);
  if (!ownerId) return null;
  return prisma.portalImage.findUnique({
    where: { kind_ownerId: { kind, ownerId } },
    select: { id: true, mime: true, data: true, updatedAt: true },
  });
}

/** Store (or replace) an image. Replacing a logo keeps its «Auf hellem Hintergrund» choice. */
export async function saveImage(kind: ImageKind, ownerId: string, mime: ImageMime, data: Uint8Array) {
  return prisma.portalImage.upsert({
    where: { kind_ownerId: { kind, ownerId } },
    create: { kind, ownerId, mime, data },
    update: { mime, data },
    select: { id: true, updatedAt: true },
  });
}

export async function removeImage(kind: ImageKind, ownerId: string): Promise<boolean> {
  const res = await prisma.portalImage.deleteMany({ where: { kind, ownerId } });
  return res.count > 0;
}

/** «Auf hellem Hintergrund anzeigen»: a white plate behind dark logos. */
export async function setLogoOnLight(accountId: string, onLight: boolean): Promise<boolean> {
  const res = await prisma.portalImage.updateMany({ where: { kind: "logo", ownerId: accountId }, data: { onLight } });
  return res.count > 0;
}

// ---------------------------------------------------------------------------
// Validation: what an upload really is, decided by its bytes
// ---------------------------------------------------------------------------

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";

/** Handoff: photo PNG/JPG (WebP as well — phones produce it), logo PNG/SVG/JPG. */
export const ACCEPTED_IMAGES: Record<ImageKind, ImageMime[]> = {
  photo: ["image/png", "image/jpeg", "image/webp"],
  logo: ["image/png", "image/jpeg", "image/svg+xml"],
};

/** For the file picker only; the server decides by the bytes. */
export const IMAGE_ACCEPT_ATTR: Record<ImageKind, string> = {
  photo: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp",
  logo: ".png,.svg,.jpg,.jpeg,image/png,image/svg+xml,image/jpeg",
};

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...Array.from(bytes.subarray(from, to)));
}

/** End of a `<!DOCTYPE …>` starting at `i`, including an internal subset `[ … ]`; -1 if open. */
function endOfDeclaration(s: string, i: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let j = i + 2; j < s.length; j++) {
    const c = s[j];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === ">" && depth <= 0) return j + 1;
  }
  return -1;
}

/** Text whose first element, after the XML prolog, is `<svg`. */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 64 * 1024);
  if (head.includes(0)) return false; // binary, or UTF-16 — neither is an SVG we take
  const s = new TextDecoder("utf-8").decode(head).replace(/^﻿/, "");
  let i = 0;
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s.startsWith("<?", i)) {
      const e = s.indexOf("?>", i + 2);
      if (e < 0) return false;
      i = e + 2;
    } else if (s.startsWith("<!--", i)) {
      const e = s.indexOf("-->", i + 4);
      if (e < 0) return false;
      i = e + 3;
    } else if (/^<!doctype/i.test(s.slice(i, i + 9))) {
      const e = endOfDeclaration(s, i);
      if (e < 0) return false;
      i = e;
    } else break;
  }
  return /^<svg[\s>/]/.test(s.slice(i, i + 5));
}

/** The real type of an upload, from its first bytes — the file name and the browser's type are not trusted. */
export function sniffImage(bytes: Uint8Array): ImageMime | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (looksLikeSvg(b)) return "image/svg+xml";
  return null;
}

export type ImageProblem = "empty" | "tooLarge" | "type" | "svg";

/**
 * Check an upload for `kind`: size, real type, and for SVG the sanitised markup that will
 * be stored instead of what was sent.
 */
export function validateImage(
  kind: ImageKind,
  bytes: Uint8Array
): { ok: true; mime: ImageMime; data: Uint8Array } | { ok: false; problem: ImageProblem } {
  if (!bytes.length) return { ok: false, problem: "empty" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, problem: "tooLarge" };
  const mime = sniffImage(bytes);
  if (!mime || !ACCEPTED_IMAGES[kind].includes(mime)) return { ok: false, problem: "type" };
  if (mime !== "image/svg+xml") return { ok: true, mime, data: bytes };
  const clean = sanitizeSvg(new TextDecoder("utf-8").decode(bytes));
  if (!clean) return { ok: false, problem: "svg" };
  const data = new TextEncoder().encode(clean);
  if (data.length > MAX_IMAGE_BYTES) return { ok: false, problem: "tooLarge" };
  return { ok: true, mime, data };
}

// ---------------------------------------------------------------------------
// SVG sanitising
//
// A logo SVG is shown to every user of the partner company, and an SVG opened on its own
// is a document that can run script on this origin. The CSP on the image route already
// forbids that; this is the second wall. It is an allowlist rebuild, not a blocklist
// filter: the markup is tokenised and only known, static SVG elements are written back,
// with their attributes checked one by one. Dropped entirely, with their content:
// script, foreignObject (HTML inside SVG), animation elements (they can rewrite
// attributes, e.g. an href to javascript:), elements that load from elsewhere (feImage,
// cursor, font-face), metadata and anything in a foreign namespace. DOCTYPE (entities),
// processing instructions (xml-stylesheet) and comments go as well.
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

const KEEP_ELEMENTS = [
  "svg", "g", "defs", "title", "desc", "symbol", "use", "switch",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "marker",
  "image", "style",
  "filter", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix",
  "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood",
  "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feMerge", "feMergeNode",
  "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence",
];
const KEEP = new Map(KEEP_ELEMENTS.map((n) => [n.toLowerCase(), n]));

// Attributes that name something to load or navigate to. Meaningless on the elements kept,
// so they are never written back.
const URL_ATTRS = new Set(["src", "action", "formaction", "background", "poster", "ping", "srcdoc", "srcset", "codebase", "data", "lowsrc", "dynsrc"]);

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    const l = e.toLowerCase();
    if (l === "amp") return "&";
    if (l === "lt") return "<";
    if (l === "gt") return ">";
    if (l === "quot") return '"';
    if (l === "apos") return "'";
    const code = l.startsWith("#x") ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
    try {
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  });
}

// Characters XML 1.0 does not allow at all; removed so the output always parses.
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function escapeText(s: string): string {
  return s.replace(XML_INVALID, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

function fromCodePoint(n: number): string {
  return n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : "";
}

/**
 * CSS from a <style> element or a style attribute, with every way of loading something
 * removed: @import, @font-face, url() to anything but an element of this file, image-set()
 * and friends; declarations that still name a script hook (expression(), -moz-binding,
 * behavior, javascript:) or an absolute URL are dropped whole. CSS escapes are decoded
 * first — «u\72l(» is url( — and comments removed, which can split a keyword. Every step
 * is linear in the length of the CSS.
 */
export function sanitizeCss(css: string): string {
  let c = css
    .replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?/g, (_m, hex: string) => fromCodePoint(parseInt(hex, 16)))
    .replace(/\\([\s\S])/g, "$1")
    .replace(/\\/g, "")
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, "");
  c = c.replace(/@import[^;]*;?/gi, "").replace(/@namespace[^;]*;?/gi, "").replace(/@font-face\s*\{[^}]*\}?/gi, "");
  // No «(» inside the target, so an unclosed url( cannot make the match scan the whole file.
  c = c.replace(/url\(\s*(['"]?)([^'"()]*)\1\s*\)/gi, (_m, _q, target: string) => {
    const t = target.trim();
    return /^#[A-Za-z_][\w.:-]*$/.test(t) ? `url(${t})` : "none";
  });
  // Anything still opening url( is not an internal reference — an unclosed url( loads too.
  c = c.replace(/url\((?!#)/gi, "none(");
  c = c.replace(/(-webkit-)?image-set\(|\bimage\(|cross-fade\(|element\(/gi, "none(");
  return c
    .split(/([;{}])/)
    .filter((part) => !/expression\s*\(|(java|vb|live)script\s*:|-moz-binding|behavior\s*:|:\/\//i.test(part))
    .join("");
}

function safeHref(element: string, value: string): boolean {
  const v = value.trim();
  if (/^#[A-Za-z_][\w.:-]*$/.test(v)) return true; // a reference inside this file
  // Embedded raster images: common when a logo is a PNG wrapped in an SVG. Not SVG — a
  // nested SVG would be a second document to sanitise.
  return element === "image" && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]*$/i.test(v);
}

function safeValue(value: string): boolean {
  if (value.includes("\\")) return false; // presentation attributes are CSS: escapes could hide url(
  const n = value.replace(/[\s\u0000-\u001f]+/g, "").toLowerCase();
  if (/(java|vb|live)script:/.test(n) || n.includes("data:")) return false;
  if (/url\((?!['"]?#)/.test(n)) return false; // fill="url(#grad)" yes, url(https://…) no
  return !/expression\(|@import|-moz-binding|behavior:/.test(n);
}

function cleanAttributes(element: string, attrs: [string, string][]): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  for (const [raw, rawValue] of attrs) {
    if (!/^[A-Za-z_][\w.:-]*$/.test(raw)) continue;
    const lower = raw.toLowerCase();
    if (lower.startsWith("on")) continue; // event handlers
    let name = raw;
    if (lower === "href" || lower === "xlink:href") name = "href"; // SVG 2: no xlink namespace needed
    else if (lower === "xml:space" || lower === "xml:lang") name = lower;
    else if (raw.includes(":") || lower === "xmlns") continue; // other namespaces; the root gets the SVG one
    if (URL_ATTRS.has(lower)) continue;

    let value = decodeEntities(rawValue);
    if (name === "href") {
      if (!safeHref(element, value)) continue;
      value = value.trim();
    } else if (lower === "style") {
      value = sanitizeCss(value).trim();
      if (!value) continue;
    } else if (!safeValue(value)) continue;

    if (seen.has(name)) continue; // a duplicate attribute would make the XML invalid
    seen.add(name);
    out.push([name, value]);
  }
  return out;
}

type StartTag = { name: string; attrs: [string, string][]; selfClosing: boolean; end: number };

/**
 * A start tag at `i`, or null. A tag never spans a raw «<» (not even inside quotes, where
 * XML forbids it too), so a broken tag costs a scan up to the next «<» and no more — a
 * crafted 2 MB file cannot make this quadratic.
 */
function parseStartTag(s: string, i: number): StartTag | null {
  const m = /^<([A-Za-z_][\w.:-]*)/.exec(s.slice(i, i + 200));
  if (!m) return null;
  const attrs: [string, string][] = [];
  let j = i + m[0].length;
  while (j < s.length) {
    while (j < s.length && /\s/.test(s[j])) j++;
    if (s[j] === "<") return null;
    if (s[j] === ">") return { name: m[1], attrs, selfClosing: false, end: j + 1 };
    if (s.startsWith("/>", j)) return { name: m[1], attrs, selfClosing: true, end: j + 2 };
    const a = /^[^\s=/>"'<]+/.exec(s.slice(j, j + 200));
    if (!a) {
      j++; // a stray character inside the tag
      continue;
    }
    j += a[0].length;
    while (j < s.length && /\s/.test(s[j])) j++;
    let value = "";
    if (s[j] === "=") {
      j++;
      while (j < s.length && /\s/.test(s[j])) j++;
      const q = s[j];
      if (q === '"' || q === "'") {
        let e = j + 1;
        while (e < s.length && s[e] !== q && s[e] !== "<") e++;
        if (s[e] !== q) return null;
        value = s.slice(j + 1, e);
        j = e + 1;
      } else {
        let e = j;
        while (e < s.length && !/[\s<>]/.test(s[e])) e++;
        value = s.slice(j, e).replace(/\/$/, "");
        j += value.length;
      }
    }
    attrs.push([a[0], value]);
  }
  return null;
}

// Deeper than any real logo; refusing beyond it keeps the work linear in the file size.
const MAX_SVG_DEPTH = 256;

type Frame = { name: string; mode: "keep" | "drop" | "unwrap" | "style"; element?: string; open?: string; css?: string[] };

/**
 * The SVG rebuilt from its safe parts, or null when it is not an SVG document (the first
 * element must be <svg>). Always well-formed: unclosed elements are closed, stray end tags
 * ignored, text re-escaped.
 */
export function sanitizeSvg(input: string): string | null {
  const s = input.replace(/^﻿/, "");
  const out: string[] = [];
  const stack: Frame[] = [];
  let rootSeen = false;
  let done = false;
  let invalid = false;
  // Open frames whose content is not written as markup (dropped, or a <style>).
  let hidden = 0;

  const top = () => stack[stack.length - 1];
  const push = (f: Frame) => {
    if (stack.length >= MAX_SVG_DEPTH) {
      invalid = true;
      return;
    }
    if (f.mode === "drop" || f.mode === "style") hidden++;
    stack.push(f);
  };
  const pop = () => {
    const f = stack.pop()!;
    if (f.mode === "drop" || f.mode === "style") hidden--;
    return f;
  };

  const text = (value: string) => {
    if (!rootSeen || done || !stack.length) return;
    const t = top();
    if (t.mode === "style") t.css!.push(value);
    else if (!hidden) out.push(escapeText(value));
  };

  const close = (f: Frame) => {
    if (f.mode === "keep") out.push(`</${f.element}>`);
    else if (f.mode === "style") {
      const css = sanitizeCss(f.css!.join("")).trim();
      if (css) out.push(`${f.open}${escapeText(css)}</style>`);
    }
  };

  const open = (tag: StartTag) => {
    const lower = tag.name.toLowerCase();
    if (!rootSeen && lower !== "svg") {
      invalid = true;
      return;
    }
    const nest = (mode: Frame["mode"]) => {
      if (!tag.selfClosing) push({ name: tag.name, mode });
    };
    if (hidden) return nest("drop");
    if (lower === "a") return nest("unwrap"); // keep a link's content, not the link
    const element = tag.name.includes(":") ? undefined : KEEP.get(lower);
    if (!element) return nest("drop");

    const isRoot = !rootSeen;
    const attrs = cleanAttributes(element, tag.attrs);
    if (element === "image" && !attrs.some(([k]) => k === "href")) return nest("drop");
    const head = `<${element}${isRoot ? ` xmlns="${SVG_NS}"` : ""}${attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join("")}`;
    rootSeen = true;

    if (element === "style") {
      if (!tag.selfClosing) push({ name: tag.name, mode: "style", element, open: `${head}>`, css: [] });
      return;
    }
    if (tag.selfClosing) {
      out.push(`${head}/>`);
      if (isRoot) done = true;
      return;
    }
    out.push(`${head}>`);
    push({ name: tag.name, mode: "keep", element });
  };

  const end = (name: string) => {
    let idx = -1;
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].name === name) {
        idx = k;
        break;
      }
    }
    if (idx < 0) return; // an end tag nothing opened
    while (stack.length > idx) close(pop());
    if (!stack.length && rootSeen) done = true;
  };

  let i = 0;
  while (i < s.length && !done && !invalid) {
    const lt = s.indexOf("<", i);
    const stop = lt < 0 ? s.length : lt;
    if (stop > i) text(decodeEntities(s.slice(i, stop)));
    if (lt < 0) break;
    i = lt;
    if (s.startsWith("<!--", i)) {
      const e = s.indexOf("-->", i + 4);
      i = e < 0 ? s.length : e + 3;
    } else if (s.startsWith("<![CDATA[", i)) {
      const e = s.indexOf("]]>", i + 9);
      text(s.slice(i + 9, e < 0 ? s.length : e));
      i = e < 0 ? s.length : e + 3;
    } else if (s.startsWith("<?", i)) {
      const e = s.indexOf("?>", i + 2);
      i = e < 0 ? s.length : e + 2;
    } else if (s.startsWith("<!", i)) {
      const e = endOfDeclaration(s, i);
      i = e < 0 ? s.length : e;
    } else if (s.startsWith("</", i)) {
      const e = s.indexOf(">", i + 2);
      end(s.slice(i + 2, e < 0 ? s.length : e).trim());
      i = e < 0 ? s.length : e + 1;
    } else {
      const tag = parseStartTag(s, i);
      if (!tag) {
        text("<"); // a stray «<» is text, written back escaped
        i++;
        continue;
      }
      i = tag.end;
      open(tag);
    }
  }
  if (invalid) return null;
  while (stack.length) close(pop());
  return rootSeen ? out.join("") : null;
}

/**
 * Headers for serving a stored image. Private (it sits behind the login), never sniffed,
 * and under a CSP that allows no script and no external load — so even an SVG opened
 * directly in the browser cannot run anything on this origin. A request carrying the
 * current version (`?v=`) may be cached for good; anything else revalidates.
 */
export function imageResponseHeaders(img: { id: string; mime: string; updatedAt: Date }, requestedVersion: string | null): Record<string, string> {
  const v = String(img.updatedAt.getTime());
  return {
    "Content-Type": img.mime,
    "Cache-Control": requestedVersion === v ? "private, max-age=31536000, immutable" : "private, no-cache",
    ETag: `"${img.id}-${v}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Disposition": "inline",
  };
}
