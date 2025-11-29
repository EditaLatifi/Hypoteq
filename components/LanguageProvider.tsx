"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

type Locale = "de" | "en" | "fr" | "it";
type Translations = typeof import("@/messages/de.json");

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, defaultValue?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("de");
  const [isClient, setIsClient] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    setIsClient(true);
    const savedLocale = (localStorage.getItem("lang") as Locale) || "de";
    if (savedLocale !== locale) {
      setLocaleState(savedLocale);
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    localStorage.setItem("lang", newLocale);
    setLocaleState(newLocale);
  }, []);

  const t = useCallback(
    (key: string, defaultValue?: string): string => {
      const translations = translationCache[locale];
      return getNestedValue(translations, key) || defaultValue || key;
    },
    [locale]
  );

  const value: LanguageContextType = { locale, setLocale, t };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  
  if (!context) {
    // Return default context if not provided
    // This handles edge cases during hydration
    const translationCache: Record<Locale, Translations> = {
      de: require("@/messages/de.json"),
      en: require("@/messages/en.json"),
      fr: require("@/messages/fr.json"),
      it: require("@/messages/it.json"),
    };

    function getNestedValue(obj: any, path: string): string {
      return path.split(".").reduce((current, prop) => current?.[prop], obj) || path;
    }

    return {
      locale: "de",
      setLocale: () => {},
      t: (key: string, defaultValue?: string): string => {
        const translations = translationCache.de;
        return getNestedValue(translations, key) || defaultValue || key;
      },
    };
  }
  
  return context;
}
