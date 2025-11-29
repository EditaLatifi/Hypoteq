import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Props = {
  children: React.ReactNode;
  params: { locale: string };
};

const locales = ["de", "en", "fr", "it"];

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Hypoteq",
  description: "Mortgage platform",
};

export default function LocaleLayout({ children, params }: Props) {
  if (!locales.includes(params.locale)) {
    notFound();
  }

  return <>{children}</>;
}
