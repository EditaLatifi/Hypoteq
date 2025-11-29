"use client";

import { usePathname } from "next/navigation";
import { SITE_CONFIG } from "@/lib/seo";

export default function AlternateLinks() {
  const pathname = usePathname();
  const locales = ["de", "en", "fr", "it"] as const;
  
  // Remove locale from pathname
  const pathWithoutLocale = pathname.replace(/^\/(de|en|fr|it)/, "") || "";

  return (
    <>
      {locales.map((locale) => (
        <link
          key={locale}
          rel="alternate"
          hrefLang={locale}
          href={`${SITE_CONFIG.url}/${locale}${pathWithoutLocale}`}
        />
      ))}
      <link
        rel="alternate"
        hrefLang="x-default"
        href={`${SITE_CONFIG.url}/de${pathWithoutLocale}`}
      />
    </>
  );
}
