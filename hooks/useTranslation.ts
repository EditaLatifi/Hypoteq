"use client";

import { useCallback } from "react";
import type { NestedKeyOf } from "./types";

type Locale = "de" | "en" | "fr" | "it";
type Translations = typeof import("@/messages/de.json");

// In-browser translations cache
const translationCache: Record<Locale, Translations> = {
  de: require("@/messages/de.json"),
  en: require("@/messages/en.json"),
  fr: require("@/messages/fr.json"),
  it: require("@/messages/it.json"),
};

function getNestedValue(obj: any, path: string): string {
  return path.split(".").reduce((current, prop) => current?.[prop], obj) || path;
}

export function useTranslation(locale?: Locale) {
  const currentLocale = locale || (typeof window !== "undefined" ? (localStorage.getItem("lang") as Locale) || "de" : "de");

  const t = useCallback(
    (key: NestedKeyOf<Translations>, defaultValue?: string): string => {
      const translations = translationCache[currentLocale];
      return getNestedValue(translations, key) || defaultValue || key;
    },
    [currentLocale]
  );

  const setLanguage = useCallback((lang: Locale) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("lang", lang);
      window.location.reload();
    }
  }, []);

  return { t, setLanguage, locale: currentLocale };
}
