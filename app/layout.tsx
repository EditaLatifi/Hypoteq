import type { Metadata } from "next";
import "@/styles/globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
import StructuredData from "@/components/StructuredData";
import { generateOrganizationSchema } from "@/lib/seo";

export const metadata: Metadata = {
  title: {
    default: "Home - HYPOTEQ AG - günstige Hypothek mit Profi-Beratung",
    template: "%s | HYPOTEQ AG - günstige Hypothek mit Profi-Beratung"
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
  metadataBase: new URL("https://www.hypoteq.ch"),
  alternates: {
    canonical: "https://www.hypoteq.ch/",
    languages: {
      'de-CH': 'https://www.hypoteq.ch/de',
      'en': 'https://www.hypoteq.ch/en',
      'fr-CH': 'https://www.hypoteq.ch/fr',
      'it-CH': 'https://www.hypoteq.ch/it',
    },
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "https://www.hypoteq.ch/",
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
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
  manifest: "/manifest.json",
  other: {
    'article:modified_time': new Date().toISOString(),
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizationSchema = generateOrganizationSchema();

  return (
    <html lang="de" className="font-sf">
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
        
        {/* Canonical */}
        <link rel="canonical" href="https://www.hypoteq.ch" />
        
        {/* Favicon */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/favicon.ico" />
      </head>
      <body
        className="font-sfpro bg-white text-[#132219] overflow-visible"
        suppressHydrationWarning
      >
        <LanguageProvider>
          <main className="pt-0 overflow-visible">{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}