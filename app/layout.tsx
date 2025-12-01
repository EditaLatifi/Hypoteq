import type { Metadata } from "next";
import "@/styles/globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
import StructuredData from "@/components/StructuredData";
import { generateOrganizationSchema } from "@/lib/seo";

export const metadata: Metadata = {
  title: {
    default: "HYPOTEQ - Hypotheken in der Schweiz | Beste Konditionen & Beratung",
    template: "%s | HYPOTEQ"
  },
  description: "HYPOTEQ - Ihr vertrauenswürdiger Partner für Hypotheken in der Schweiz. Beste Konditionen, persönliche Beratung und digitale Lösungen für Ihre Traumimmobilie.",
  keywords: [
    "Hypothek Schweiz",
    "Hypothekenrechner",
    "Immobilienfinanzierung",
    "Hypothekenvergleich",
    "Festhypothek",
    "Mezzanine Finanzierung"
  ],
  authors: [{ name: "HYPOTEQ" }],
  creator: "HYPOTEQ",
  publisher: "HYPOTEQ",
  metadataBase: new URL("https://hypoteq.ch"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "de_CH",
    url: "https://hypoteq.ch",
    siteName: "HYPOTEQ",
    title: "HYPOTEQ - Hypotheken in der Schweiz",
    description: "Ihr vertrauenswürdiger Partner für Hypotheken in der Schweiz. Beste Konditionen, persönliche Beratung und digitale Lösungen.",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "HYPOTEQ - Hypotheken Schweiz"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "HYPOTEQ - Hypotheken in der Schweiz",
    description: "Ihr vertrauenswürdiger Partner für Hypotheken in der Schweiz.",
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#CAF476" />
        <link rel="canonical" href="https://hypoteq.ch" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
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