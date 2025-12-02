import { MetadataRoute } from "next";

const baseUrl = "https://hypoteq.ch";
const locales = ["de", "en", "fr", "it"];

const routes = [
  "",
  "/hypotheken",
  "/uber-uns",
  "/kontaktieren-sie-uns",
  "/funnel",
  "/hypothekenrechner",
  "/faq",
  "/documents",
  "/mezzanine",
  "/partner-werden",
  "/beratung",
  "/impressum",
  "/vorteile",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const sitemapEntries: MetadataRoute.Sitemap = [];

  locales.forEach((locale) => {
    routes.forEach((route) => {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}${route}`,
        lastModified: new Date(),
        changeFrequency: route === "" ? "daily" : "weekly",
        priority: route === "" ? 1.0 : route === "/funnel" ? 0.9 : 0.8,
        alternates: {
          languages: {
            de: `${baseUrl}/de${route}`,
            en: `${baseUrl}/en${route}`,
            fr: `${baseUrl}/fr${route}`,
            it: `${baseUrl}/it${route}`,
          },
        },
      });
    });
  });

  return sitemapEntries;
}
