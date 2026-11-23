import { MetadataRoute } from "next";
import { BASE } from "@/lib/website/site";

/** As the website design's robots.txt (funnel and portal not crawled), sitemap on the canonical domain. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/portal/", "/*/funnel"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
