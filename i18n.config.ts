import { notFound } from "next/navigation";

type Locale = "de" | "en" | "fr" | "it";

const locales: Locale[] = ["de", "en", "fr", "it"];

export function isValidLocale(locale: any): locale is Locale {
  return locales.includes(locale);
}

export function getLocales(): Locale[] {
  return locales;
}

export function getDefaultLocale(): Locale {
  return "de";
}

export function notFoundLocale() {
  return notFound();
}
