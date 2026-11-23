import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AGB from "@/components/AGB";
import { generateMetadata as generateSEOMetadata } from "@/lib/seo";

type Locale = "de" | "en" | "fr" | "it";

/** The AGB's own title, description and canonical (it had the layout's home-page ones). */
const META: Record<Locale, { title: string; description: string }> = {
  de: { title: "Allgemeine Geschäftsbedingungen (AGB) | HYPOTEQ", description: "Allgemeine Geschäftsbedingungen der HYPOTEQ AG für die Nutzung der Website sowie die Hypothekarberatung und -vermittlung. Es gilt schweizerisches Recht." },
  en: { title: "General Terms and Conditions | HYPOTEQ", description: "General terms and conditions of HYPOTEQ AG for the use of the website and for mortgage advice and brokerage. Swiss law applies." },
  fr: { title: "Conditions générales | HYPOTEQ", description: "Conditions générales de HYPOTEQ AG pour l'utilisation du site web ainsi que le conseil et le courtage hypothécaires. Le droit suisse s'applique." },
  it: { title: "Condizioni generali | HYPOTEQ", description: "Condizioni generali di HYPOTEQ AG per l'uso del sito web e per la consulenza e l'intermediazione ipotecaria. Si applica il diritto svizzero." },
};

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const locale = (params.locale in META ? params.locale : "de") as Locale;
  return generateSEOMetadata(locale, { ...META[locale], canonical: "/agb" });
}

export default function AGBPage() {
  return (
    <main className="min-h-screen">
      <Header />
      <AGB />
      <Footer />
    </main>
  );
}
