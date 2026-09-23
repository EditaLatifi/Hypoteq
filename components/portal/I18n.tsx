"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import { setLocaleAction } from "@/app/portal/actions";
import { DICTS, LOCALES, type Dict, type Locale } from "@/lib/portal/i18n/dict";

const Ctx = createContext<Locale>("de");

/** The dictionary holds functions, which cannot cross from server to client — so the
 *  client gets the locale and looks the dictionary up itself. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}

export function useT(): Dict {
  return DICTS[useContext(Ctx)];
}

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <div className={`flex items-center gap-1 ${pending ? "opacity-60" : ""} ${className}`} role="group" aria-label={DICTS[locale].common.language}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={DICTS[l].langName}
          aria-pressed={l === locale}
          onClick={() => start(() => setLocaleAction(l))}
          className={`h-8 min-w-[34px] rounded-full px-2 text-[12px] font-semibold uppercase tracking-[.06em] transition-colors ${
            l === locale ? "bg-white/[.14] text-white" : "text-white/60 hover:text-white"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
