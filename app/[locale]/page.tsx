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

export default function Home() {
  return (
    <main className="overflow-visible">
      <Header />

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
  );
}
