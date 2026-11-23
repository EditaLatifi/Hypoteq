import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WebsitePage, { websiteMetadata } from "@/components/website/WebsitePage";
import { IDS, isLang, pidOf, slug } from "@/lib/website/site";

type Props = { params: { locale: string; slug: string } };

/** Every page of the design in the four languages, built at deploy time. */
export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return IDS.filter((pid) => pid !== "home").map((pid) => ({ slug: slug(pid, params.locale) }));
}

function resolve(params: Props["params"]) {
  if (!isLang(params.locale)) return null;
  const pid = pidOf(params.locale, params.slug);
  return pid ? { pid, lang: params.locale } : null;
}

export function generateMetadata({ params }: Props): Metadata {
  const page = resolve(params);
  return page ? websiteMetadata(page.pid, page.lang) : {};
}

export default function WebsiteSubPage({ params }: Props) {
  const page = resolve(params);
  if (!page) notFound();
  return <WebsitePage pid={page.pid} lang={page.lang} />;
}
