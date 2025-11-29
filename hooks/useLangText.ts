"use client";

import { useLanguage } from "@/components/LanguageProvider";

export function useLangText(key: string, defaultValue?: string): string {
  const { t } = useLanguage();
  return t(key, defaultValue);
}
