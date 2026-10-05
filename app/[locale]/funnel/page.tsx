import type { Metadata } from "next";
import FunnelV3 from "@/components/funnel-v3/FunnelV3";
import { isLang, translate, DEFAULT_LANG } from "@/lib/funnel-v3/i18n";
import { generateMetadata as generateSEOMetadata } from "@/lib/seo";

/**
 * The financing funnel (Funnel v3, docs/funnel-v3). The locale comes from the segment: the
 * [locale] layout validates it; the funnel reads its texts for the language in the path
 * (lib/funnel-v3/useFunnelT.ts).
 *
 * The tab title and description are the funnel's own start texts (spec 7, one language
 * file), not the site's home-page metadata the layout provides.
 *
 * The previous funnel's step components stay in app/funnel/steps for now.
 */
export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const lang = isLang(params.locale) ? params.locale : DEFAULT_LANG;
  const title = translate(lang, "start.title").replace(/\.$/, "");
  return generateSEOMetadata(lang, {
    title: `${title} – HYPOTEQ`,
    description: translate(lang, "start.lead"),
    canonical: "/funnel",
    // A half-filled request is personal; search engines have nothing to index here.
    noindex: true,
  });
}

export default function FunnelPage() {
  return <FunnelV3 />;
}
