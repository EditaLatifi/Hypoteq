import type { Metadata } from "next";
import "@/styles/globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
import StructuredData from "@/components/StructuredData";
import PromoPopup from "@/components/PromoPopup";
import { generateOrganizationSchema } from "@/lib/seo";

/**
 * The root document of the pages that keep the previous design (funnel, Nachreich page, portal,
 * partner landing pages, AGB, thank-you pages). It was app/layout.tsx; since the new website
 * (app/(site)) has its own root layout without Tailwind, each of these sections renders this
 * root itself: app/[locale]/layout.tsx, app/portal/layout.tsx, app/funnel/layout.tsx.
 * Domain: hypoteq.com (hypoteq.ch redirects there).
 */

export const LEGACY_TITLE_TEMPLATE = "%s | HYPOTEQ AG - günstige Hypothek mit Profi-Beratung";

export const legacyMetadata: Metadata = {
  title: {
    default: "Home - HYPOTEQ AG - günstige Hypothek mit Profi-Beratung",
    template: LEGACY_TITLE_TEMPLATE,
  },
  description: "HYPOTEQ AG - günstige Hypothek mit Profi-Beratung. Ihr vertrauenswürdiger Partner für Hypotheken in der Schweiz. Beste Konditionen, persönliche Beratung und digitale Lösungen für Ihre Traumimmobilie.",
  keywords: [
    "Hypothek Schweiz",
    "günstige Hypothek",
    "Hypothekenrechner",
    "Immobilienfinanzierung",
    "Hypothekenvergleich",
    "Festhypothek",
    "Mezzanine Finanzierung",
    "Profi-Beratung Hypothek",
    "HYPOTEQ AG"
  ],
  authors: [{ name: "HYPOTEQ AG" }],
  creator: "HYPOTEQ AG",
  publisher: "HYPOTEQ AG",
  metadataBase: new URL("https://hypoteq.com"),
  alternates: {
    canonical: "https://hypoteq.com/",
    languages: {
      'de-CH': 'https://hypoteq.com/de',
      'en': 'https://hypoteq.com/en',
      'fr-CH': 'https://hypoteq.com/fr',
      'it-CH': 'https://hypoteq.com/it',
    },
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "https://hypoteq.com/",
    siteName: "HYPOTEQ AG - günstige Hypothek mit Profi-Beratung",
    title: "Home - HYPOTEQ AG - günstige Hypothek mit Profi-Beratung",
    description: "HYPOTEQ AG - günstige Hypothek mit Profi-Beratung. Ihr vertrauenswürdiger Partner für Hypotheken in der Schweiz.",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "HYPOTEQ AG - günstige Hypothek mit Profi-Beratung"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Home - HYPOTEQ AG - günstige Hypothek mit Profi-Beratung",
    description: "HYPOTEQ AG - günstige Hypothek mit Profi-Beratung. Ihr vertrauenswürdiger Partner für Hypotheken in der Schweiz.",
    images: ["/images/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
  },
  manifest: "/manifest.json",
  other: {
    'article:modified_time': new Date().toISOString(),
  },
};

export default function LegacyRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizationSchema = generateOrganizationSchema();

  // Detect language from URL path
  let lang = "de";
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path.startsWith("/it")) lang = "it";
    else if (path.startsWith("/fr")) lang = "fr";
    else if (path.startsWith("/en")) lang = "en";
  }
  return (
    <html lang={lang} className="font-sf">
      <head>
        <StructuredData data={organizationSchema} />

        {/* Performance optimizations */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#CAF476" />

        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* DNS prefetch for faster lookups */}
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />

        {/* Canonical: from each page's metadata (a fixed tag here sent every page to the home page) */}

        {/* Favicon */}
        <link rel="icon" type="image/x-icon" sizes="16x16 32x32 48x48" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
      </head>
      <body
        className="font-sfpro bg-white text-[#132219] overflow-visible"
        suppressHydrationWarning
      >
        <LanguageProvider>
          <main className="pt-0 overflow-visible">{children}</main>
          <PromoPopup />
        </LanguageProvider>
      </body>
    </html>
  );
}
