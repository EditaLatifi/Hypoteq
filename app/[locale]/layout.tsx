import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateMetadata as generateSEOMetadata, SITE_CONFIG } from "@/lib/seo";
import AlternateLinks from "@/components/AlternateLinks";

type Props = {
  children: React.ReactNode;
  params: { locale: string };
};

const locales = ["de", "en", "fr", "it"] as const;
type Locale = typeof locales[number];

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = params.locale as Locale;
  
  if (!locales.includes(locale as any)) {
    return {};
  }

  const titles = {
    de: "Home - HYPOTEQ AG - günstige Hypothek mit Profi-Beratung",
    en: "Home - HYPOTEQ AG - Affordable Mortgages with Expert Advice",
    fr: "Accueil - HYPOTEQ AG - Hypothèque Avantageuse avec Conseils d'Experts",
    it: "Home - HYPOTEQ AG - Mutuo Conveniente con Consulenza Professionale"
  };

  const descriptions = {
    de: "HYPOTEQ AG - günstige Hypothek mit Profi-Beratung. Ihr vertrauenswürdiger Partner für Hypotheken in der Schweiz.",
    en: "HYPOTEQ AG - Affordable mortgages with expert advice. Your trusted partner for mortgages in Switzerland.",
    fr: "HYPOTEQ AG - Hypothèque avantageuse avec conseils d'experts. Votre partenaire de confiance pour les hypothèques en Suisse.",
    it: "HYPOTEQ AG - Mutuo conveniente con consulenza professionale. Il vostro partner di fiducia per i mutui in Svizzera."
  };

  return generateSEOMetadata(locale, {
    title: titles[locale],
    description: descriptions[locale],
    canonical: "",
  });
}

export default function LocaleLayout({ children, params }: Props) {
  if (!locales.includes(params.locale as any)) {
    notFound();
  }

  return (
    <>
      <AlternateLinks />
      {children}
    </>
  );
}
