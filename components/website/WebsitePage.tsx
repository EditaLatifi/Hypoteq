import type { Metadata } from "next";
import { renderPage } from "@/lib/website/render";
import { HREFLANG, LANGS, type Lang, urlOf } from "@/lib/website/site";

/**
 * One page of the website (design «Look 06», HYPOTEQ 20.11.2026): the markup comes from
 * lib/website/render.ts, exactly as the design's generator writes it, so styles/website.css and
 * public/site/app.js (animations, menu, calculator) work on it unchanged.
 */
export default function WebsitePage({ pid, lang }: { pid: string; lang: Lang }) {
  const page = renderPage(pid, lang);
  // app.js changes this markup (reveal classes, counters, calculator) before React hydrates;
  // React leaves innerHTML alone, the warning would only report that.
  return <div style={{ display: "contents" }} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: page.jsonld + page.body }} />;
}

export function websiteMetadata(pid: string, lang: Lang): Metadata {
  const { meta, noindex } = renderPage(pid, lang);
  const url = urlOf(pid, lang);
  return {
    title: { absolute: meta.title },
    description: meta.description,
    robots: { index: !noindex, follow: true },
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(LANGS.map((l) => [HREFLANG[l], urlOf(pid, l)])),
        "x-default": urlOf(pid, "de"),
      },
    },
    openGraph: {
      type: "website",
      title: meta.title,
      description: meta.description,
      url,
      locale: HREFLANG[lang].replace("-", "_"),
    },
  };
}
