"use client";

import { useLanguage } from "@/components/LanguageProvider";

/**
 * Example Component showing how to use translations
 * 
 * Usage:
 * 1. Import useLanguage hook
 * 2. Get t function and locale from hook
 * 3. Use t("key.path") to get translated strings
 * 4. Use setLocale() to change language
 */

export function TranslationExample() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <div className="p-8 bg-gray-50 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">{t("common.language")}</h2>
      
      <p className="text-gray-600 mb-6">
        Current Language: <strong>{locale.toUpperCase()}</strong>
      </p>

      {/* Example translations */}
      <div className="space-y-3 mb-6">
        <p><strong>Home:</strong> {t("common.home")}</p>
        <p><strong>About:</strong> {t("common.about")}</p>
        <p><strong>Contact:</strong> {t("common.contact")}</p>
        <p><strong>Partner:</strong> {t("common.partner")}</p>
      </div>

      {/* Language switcher */}
      <div className="flex gap-2 flex-wrap">
        {["de", "en", "fr", "it"].map((lang) => (
          <button
            key={lang}
            onClick={() => setLocale(lang as "de" | "en" | "fr" | "it")}
            className={`px-4 py-2 rounded font-semibold transition ${
              locale === lang
                ? "bg-blue-500 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
            }`}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Helper text */}
      <p className="text-sm text-gray-500 mt-6">
        This is an example component. Replace hardcoded German text in your components
        with t("key.path") to enable multi-language support.
      </p>
    </div>
  );
}
