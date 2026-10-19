import { describe, it, expect } from "@jest/globals";
import { backgroundOrigin, linkOrigin, trustedHosts } from "@/lib/portal/origin";

/**
 * Where the links in invite, reset and magic-link mails point (HYPOTEQ 19.10.2026 B6 / E.3):
 * back to the deployment the request came in on when it is ours, never to a forged host.
 */

const PREVIEW = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_URL: "hypoteq-abc123-hypoteq.vercel.app",
  VERCEL_BRANCH_URL: "hypoteq-git-ai-document-intelligence-hypoteq.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "www.hypoteq.ch",
} as unknown as NodeJS.ProcessEnv;

describe("linkOrigin", () => {
  it("a reset requested on the preview links to that preview, even with PORTAL_BASE_URL set to production", () => {
    const env = { ...PREVIEW, PORTAL_BASE_URL: "https://www.hypoteq.ch" };
    expect(linkOrigin({ host: PREVIEW.VERCEL_BRANCH_URL }, env)).toBe(`https://${PREVIEW.VERCEL_BRANCH_URL}`);
    expect(linkOrigin({ forwardedHost: PREVIEW.VERCEL_URL, host: "internal" }, env)).toBe(`https://${PREVIEW.VERCEL_URL}`);
  });

  it("never uses a host nobody vouches for (a forged Host header must not receive a token)", () => {
    expect(linkOrigin({ host: "evil.example" }, { ...PREVIEW, PORTAL_BASE_URL: "https://portal.hypoteq.ch" })).toBe("https://portal.hypoteq.ch");
    expect(linkOrigin({ forwardedHost: "evil.example" }, PREVIEW)).toBe(`https://${PREVIEW.VERCEL_BRANCH_URL}`);
    expect(linkOrigin({ forwardedHost: "evil.example" }, { ...PREVIEW, VERCEL_ENV: "production" })).toBe("https://www.hypoteq.ch");
    expect(linkOrigin({ host: "localhost:3000" }, PREVIEW)).toBe(`https://${PREVIEW.VERCEL_BRANCH_URL}`);
  });

  it("trusts PORTAL_BASE_URL, NEXT_PUBLIC_SITE_URL and PORTAL_TRUSTED_HOSTS", () => {
    const env = { ...PREVIEW, PORTAL_TRUSTED_HOSTS: "partner.hypoteq.ch, Test.Hypoteq.ch", NEXT_PUBLIC_SITE_URL: "https://hypoteq.ch/" };
    expect(trustedHosts(env)).toEqual(expect.arrayContaining(["partner.hypoteq.ch", "test.hypoteq.ch", "hypoteq.ch", PREVIEW.VERCEL_URL!, "www.hypoteq.ch"]));
    expect(linkOrigin({ host: "partner.hypoteq.ch" }, env)).toBe("https://partner.hypoteq.ch");
  });

  it("takes the first value of forwarded lists, and the forwarded protocol", () => {
    expect(linkOrigin({ forwardedHost: `${PREVIEW.VERCEL_URL}, proxy.internal`, forwardedProto: "https,http" }, PREVIEW)).toBe(`https://${PREVIEW.VERCEL_URL}`);
  });

  it("on a developer machine: the local host, over http", () => {
    expect(linkOrigin({ host: "localhost:3005" }, { NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("http://localhost:3005");
    expect(linkOrigin({ host: "127.0.0.1:3000" }, { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:3000");
  });

  it("the cron has no request: PORTAL_BASE_URL, else the deployment's own domain", () => {
    expect(backgroundOrigin({ ...PREVIEW, PORTAL_BASE_URL: "https://portal.hypoteq.ch/" })).toBe("https://portal.hypoteq.ch");
    expect(backgroundOrigin({ ...PREVIEW, VERCEL_ENV: "production" })).toBe("https://www.hypoteq.ch");
    expect(backgroundOrigin(PREVIEW)).toBe(`https://${PREVIEW.VERCEL_BRANCH_URL}`);
    expect(backgroundOrigin({} as NodeJS.ProcessEnv)).toBe("https://www.hypoteq.ch");
  });
});
