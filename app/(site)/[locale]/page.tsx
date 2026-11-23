import type { Metadata } from "next";
import WebsitePage, { websiteMetadata } from "@/components/website/WebsitePage";
import { isLang } from "@/lib/website/site";

type Props = { params: { locale: string } };

export function generateMetadata({ params }: Props): Metadata {
  return isLang(params.locale) ? websiteMetadata("home", params.locale) : {};
}

export default function HomePage({ params }: Props) {
  return isLang(params.locale) ? <WebsitePage pid="home" lang={params.locale} /> : null;
}
