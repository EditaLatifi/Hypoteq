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
    de: "HYPOTEQ - Hypotheken in der Schweiz | Beste Konditionen & Beratung",
    en: "HYPOTEQ - Mortgages in Switzerland | Best Conditions & Advice",
    fr: "HYPOTEQ - Hypothèques en Suisse | Meilleures Conditions & Conseils",
    it: "HYPOTEQ - Mutui in Svizzera | Migliori Condizioni e Consulenza"
  };

  return generateSEOMetadata(locale, {
    title: titles[locale],
    description: SITE_CONFIG.description[locale],
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
