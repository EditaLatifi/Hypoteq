import type { Metadata } from "next";

export const SITE_CONFIG = {
  name: "HYPOTEQ AG - günstige Hypothek mit Profi-Beratung",
  description: {
    de: "HYPOTEQ AG - günstige Hypothek mit Profi-Beratung. Ihr vertrauenswürdiger Partner für Hypotheken in der Schweiz. Beste Konditionen, persönliche Beratung und digitale Lösungen für Ihre Traumimmobilie.",
    en: "HYPOTEQ AG - Affordable mortgages with expert advice. Your trusted partner for mortgages in Switzerland. Best conditions, personal advice and digital solutions for your dream property.",
    fr: "HYPOTEQ AG - Hypothèque avantageuse avec conseils d'experts. Votre partenaire de confiance pour les hypothèques en Suisse. Meilleures conditions, conseils personnalisés et solutions numériques.",
    it: "HYPOTEQ AG - Mutuo conveniente con consulenza professionale. Il vostro partner di fiducia per i mutui in Svizzera. Migliori condizioni, consulenza personale e soluzioni digitali."
  },
  url: "https://www.hypoteq.ch",
  ogImage: "/images/og-image.png",
  keywords: {
    de: [
      "Hypothek Schweiz",
      "Hypothekenrechner",
      "Hypothek berechnen",
      "Immobilienfinanzierung",
      "Hypothekenvergleich",
      "Hypothekenzinsen",
      "Hypothekenberatung",
      "Festhypothek",
      "Variable Hypothek",
      "Umschuldung Hypothek",
      "Hypothek aufstocken",
      "Eigenheim finanzieren",
      "Wohnung kaufen Schweiz",
      "Mezzanine Finanzierung",
      "Hypothekarkredit"
    ],
    en: [
      "Mortgage Switzerland",
      "Mortgage calculator",
      "Calculate mortgage",
      "Property financing",
      "Mortgage comparison",
      "Mortgage rates",
      "Mortgage advice",
      "Fixed mortgage",
      "Variable mortgage",
      "Refinancing mortgage",
      "Increase mortgage",
      "Finance home",
      "Buy apartment Switzerland",
      "Mezzanine financing",
      "Mortgage loan"
    ],
    fr: [
      "Hypothèque Suisse",
      "Calculateur hypothécaire",
      "Calculer hypothèque",
      "Financement immobilier",
      "Comparaison hypothèques",
      "Taux hypothécaires",
      "Conseil hypothécaire",
      "Hypothèque fixe",
      "Hypothèque variable",
      "Refinancement hypothèque",
      "Augmenter hypothèque",
      "Financer maison",
      "Acheter appartement Suisse",
      "Financement mezzanine",
      "Crédit hypothécaire"
    ],
    it: [
      "Ipoteca Svizzera",
      "Calcolatore ipotecario",
      "Calcolare ipoteca",
      "Finanziamento immobiliare",
      "Confronto ipoteche",
      "Tassi ipotecari",
      "Consulenza ipotecaria",
      "Ipoteca fissa",
      "Ipoteca variabile",
      "Rifinanziamento ipoteca",
      "Aumentare ipoteca",
      "Finanziare casa",
      "Comprare appartamento Svizzera",
      "Finanziamento mezzanino",
      "Credito ipotecario"
    ]
  }
};

export interface SEOConfig {
  title: string;
  description: string;
  keywords?: string[];
  canonical?: string;
  noindex?: boolean;
  ogImage?: string;
}

export function generateMetadata(
  locale: "de" | "en" | "fr" | "it",
  config: SEOConfig
): Metadata {
  const siteUrl = SITE_CONFIG.url;
  const canonical = config.canonical || "";
  const fullUrl = `${siteUrl}/${locale}${canonical}`;

  const localeMap = {
    de: "de_DE",
    en: "en_US", 
    fr: "fr_CH",
    it: "it_CH"
  };

  return {
    title: config.title,
    description: config.description,
    keywords: config.keywords || SITE_CONFIG.keywords[locale],
    authors: [{ name: "HYPOTEQ AG" }],
    creator: "HYPOTEQ AG",
    publisher: "HYPOTEQ AG",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical: fullUrl,
      languages: {
        'de-CH': `${siteUrl}/de${canonical}`,
        'en': `${siteUrl}/en${canonical}`,
        'fr-CH': `${siteUrl}/fr${canonical}`,
        'it-CH': `${siteUrl}/it${canonical}`,
      },
    },
    openGraph: {
      title: config.title,
      description: config.description,
      url: fullUrl,
      siteName: SITE_CONFIG.name,
      images: [
        {
          url: config.ogImage || SITE_CONFIG.ogImage,
          width: 1200,
          height: 630,
          alt: config.title,
        },
      ],
      locale: localeMap[locale],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: config.title,
      description: config.description,
      images: [config.ogImage || SITE_CONFIG.ogImage],
    },
    robots: {
      index: !config.noindex,
      follow: !config.noindex,
      googleBot: {
        index: !config.noindex,
        follow: !config.noindex,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    verification: {
      google: "your-google-verification-code", // Add your Google Search Console verification
      // yandex: "your-yandex-verification-code",
      // bing: "your-bing-verification-code",
    },
  };
}

// Structured Data helpers
export function generateOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FinancialService",
    name: SITE_CONFIG.name,
    description: SITE_CONFIG.description.de,
    url: SITE_CONFIG.url,
    logo: `${SITE_CONFIG.url}/images/HYPOTEQ_layout_logo.png`,
    image: `${SITE_CONFIG.url}${SITE_CONFIG.ogImage}`,
    telephone: "+41-XX-XXX-XX-XX", // Add your phone number
    address: {
      "@type": "PostalAddress",
      addressCountry: "CH",
      addressLocality: "Zürich", // Update with your city
      addressRegion: "Zürich", // Update with your region
      postalCode: "8000", // Update with your postal code
      streetAddress: "Your Street Address", // Update with your address
    },
    areaServed: {
      "@type": "Country",
      name: "Switzerland",
    },
    sameAs: [
      "https://www.linkedin.com/company/hypoteq", // Add your social media links
      "https://twitter.com/hypoteq",
    ],
  };
}

export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_CONFIG.url}${item.url}`,
    })),
  };
}

export function generateFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function generateProductSchema(product: {
  name: string;
  description: string;
  offers?: any;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: product.name,
    description: product.description,
    provider: {
      "@type": "FinancialService",
      name: SITE_CONFIG.name,
    },
    ...product.offers,
  };
}
