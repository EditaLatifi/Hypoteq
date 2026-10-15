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

import { imageMeta, imageResponseHeaders, logoAccountFor } from "@/lib/portal/images";

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

describe("logoAccountFor", () => {
  it("ignores an account id that is not a Salesforce id", async () => {
    expect(await logoAccountFor(partner({ sfAccountId: "../etc" }))).toBeNull();
  });

  it("survives Salesforce being down while viewing as a partner", async () => {
    scopeFor.mockRejectedValue(new Error("down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await logoAccountFor(partner({ viewingAs: { contactId: "003AB00000viewedXX", name: "X" } }))).toBeNull();
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
