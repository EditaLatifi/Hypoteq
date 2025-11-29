import type { Metadata } from "next";
import Header from "../../components/layout/Header";
import "@/styles/globals.css";
import Hero from "../../components/Hero";
import MortgageCalculator from "@/components/MortgageCalculator";
import BestChoices from "@/components/BestChoices";
import Footer from "@/components/layout/Footer";
import MortgageGuide from "@/components/ui/MortgageGuide";
import HowItWorks from "@/components/HowItWorks";
import YourAdvantages from "@/components/YourAdvantages";
import Testimonials from "@/components/Testimonials";
import ConsultationBanner from "@/components/ConsultationBanner";
import { generateMetadata as generateSEOMetadata, SITE_CONFIG } from "@/lib/seo";

type Props = {
  params: { locale: "de" | "en" | "fr" | "it" };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = params;
  
  const titles = {
    de: "HYPOTEQ - Hypotheken in der Schweiz | Beste Konditionen & Beratung",
    en: "HYPOTEQ - Mortgages in Switzerland | Best Conditions & Advice",
    fr: "HYPOTEQ - Hypothèques en Suisse | Meilleures Conditions & Conseils",
    it: "HYPOTEQ - Mutui in Svizzera | Migliori Condizioni e Consulenza"
  };

  return generateSEOMetadata(locale, {
    title: titles[locale],
    description: SITE_CONFIG.description[locale],
    canonical: "",
  });
}

export default function Home() {
  return (
    <>
      <Header />
      <main id="main-content" className="overflow-visible">

      <Hero />
      <BestChoices />
      <MortgageCalculator />

      <HowItWorks />

      <YourAdvantages />
      <Testimonials />
      <ConsultationBanner />

      <div className="">
        <Footer />
      </div>
    </main>
    </>
  );
}
