"use client";

import { usePathname, useRouter } from "next/navigation";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { Lang } from "@/lib/funnel-v3/i18n";
import { LANGUAGES, localePath } from "./logic";

/**
 * DE · EN · FR · IT. Opens the same funnel under the other language segment; the answers stay
 * (same store). The choice is also written to localStorage `lang`, which the rest of the site
 * reads.
 */
export function useSwitchLanguage() {
  const router = useRouter();
  const pathname = usePathname();
  return (lang: Lang) => {
    try {
      window.localStorage.setItem("lang", lang);
    } catch {
      // storage blocked: the URL still carries the language
    }
    router.replace(`${localePath(pathname, lang)}${window.location.search}`, { scroll: false });
  };
}

export default function LanguageSwitch({ dark, compact }: { dark?: boolean; compact?: boolean }) {
  const { lang, t } = useFunnelT();
  const switchTo = useSwitchLanguage();

  if (compact) {
    return (
      <select
        className="v3-lang-select"
        aria-label={t("common.language")}
        value={lang}
        onChange={(e) => switchTo(e.target.value as Lang)}
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div role="group" aria-label={t("common.language")} className={`v3-langs${dark ? " v3-langs--dark" : ""}`}>
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          className="v3-lang"
          aria-current={l === lang ? "true" : undefined}
          onClick={() => l !== lang && switchTo(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
