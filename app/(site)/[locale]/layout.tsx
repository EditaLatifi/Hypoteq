import type { Metadata, Viewport } from "next";
import "@/styles/website.css";
import "@/styles/website-extra.css";
import { HREFLANG, LANGS, isLang } from "@/lib/website/site";

/**
 * Root layout of the website (design «Look 06», HYPOTEQ 20.11.2026). Its own document, without
 * the previous site's Tailwind base styles and body classes, so the design's stylesheet applies
 * as in the delivered HTML. The funnel, the Nachreich page and the portal keep their root
 * (components/legacy/LegacyRoot.tsx); moving between the two loads the page anew.
 */

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#132219" };

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
  },
  manifest: "/manifest.json",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.map((locale) => ({ locale }));
}

export default function WebsiteRootLayout({ children, params }: { children: React.ReactNode; params: { locale: string } }) {
  const lang = isLang(params.locale) ? params.locale : "de";
  return (
    <html lang={HREFLANG[lang]}>
      <head>
        <link rel="preload" href="/site/fonts/geist-600.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <script src="/site/app.js" defer />
        <script src="/site/forms.js" defer />
      </body>
    </html>
  );
}
