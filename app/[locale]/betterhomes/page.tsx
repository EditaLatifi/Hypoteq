import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BetterHome from "@/components/BetterHome";
import { generateMetadata as generateSEOMetadata } from "@/lib/seo";
import deMessages from "@/messages/de.json";
import enMessages from "@/messages/en.json";
import frMessages from "@/messages/fr.json";
import itMessages from "@/messages/it.json";

const locales = ["de", "en", "fr", "it"] as const;
type Locale = (typeof locales)[number];

const messagesByLocale = {
  de: deMessages,
  en: enMessages,
  fr: frMessages,
  it: itMessages,
};

type Props = {
  params: { locale: Locale };
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = params;
  if (!locales.includes(locale)) return {};

  const seo = messagesByLocale[locale].betterhomes.seo;

  return generateSEOMetadata(locale, {
    title: seo.title,
    description: seo.description,
    canonical: "/betterhomes",
  });
}

export default function BetterhomesPage({ params }: Props) {
  if (!locales.includes(params.locale)) notFound();
  return <BetterHome />;
}
