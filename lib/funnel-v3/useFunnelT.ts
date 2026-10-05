"use client";

import { useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { langFromPath, optionLabel, translate, type Lang, type Params } from "./i18n";

/**
 * Funnel v3 translations for the language in the URL (`/de|en|fr|it/...`), German otherwise.
 *
 *   const { t, opt, lang } = useFunnelT();
 *   t("side.submittedBy", { name });   opt("lieg", ans.lieg);
 */
export function useFunnelT(): {
  lang: Lang;
  t: (key: string, params?: Params) => string;
  opt: (group: string, value: string | null | undefined) => string;
} {
  const pathname = usePathname();
  const lang = langFromPath(pathname);
  const t = useCallback((key: string, params?: Params) => translate(lang, key, params), [lang]);
  const opt = useCallback(
    (group: string, value: string | null | undefined) => optionLabel(lang, group, value),
    [lang]
  );
  return useMemo(() => ({ lang, t, opt }), [lang, t, opt]);
}
